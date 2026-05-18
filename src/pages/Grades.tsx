import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Download, AlertTriangle, CheckCircle2, Upload, FileSpreadsheet, Save, Loader2, Check, X, QrCode, CalendarCheck, Users, ChevronDown, Clock, Sliders, TrendingDown, TrendingUp } from 'lucide-react'
import type { Course, Grade, GradeComponent, GradeCut } from '../types'
import { useGradeCalculation } from '../hooks/useGradeCalculation'
import { calcWeightedTotal, getRisk } from '../utils/gradeCalculator'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useGrades } from '../context/GradesContext'
import { enrollmentService, type BackendEnrollment } from '../services/enrollmentService'
import { attendanceService, type SessionHistoryItem } from '../services/attendanceService'
import { friendlyError } from '../services/errorMessages'
import Header from '../components/Header'
import GradeTable from '../components/GradeTable'
import ComponentsConfig from '../components/ComponentsConfig'
import ImportModal from '../components/ImportModal'

interface Props {
  course:            Course
  grades:            Grade[]
  lastSaved:         Date | null
  onUpdateGrade:     (studentId: string, componentId: string, value: number | null) => void
  onUpdateComponents:(courseId: string, components: GradeComponent[]) => void
  onUpdateCuts:      (courseId: string, cuts: GradeCut[]) => void
  onBack:            () => void
  onLogout?:         () => void
}

// ── Colores por umbral ────────────────────────────────────────────────────────
// Notas (0–5): ≥ 3.4 verde | 3.0–3.39 naranja | < 3.0 rojo
// Asistencia (0–100): ≥ 75 verde | 60–74 naranja | < 60 rojo

type Threshold = 'green' | 'orange' | 'red' | 'none'

function gradeThreshold(value: number | null): Threshold {
  if (value == null) return 'none'
  if (value >= 3.4) return 'green'
  if (value >= 3.0) return 'orange'
  return 'red'
}

type Tab = 'grades' | 'config' | 'attendance' | 'qr-history' | 'simulator'
type CohortKey = 'first_cohort' | 'second_cohort' | 'third_cohort'

const COHORT_KEYS: CohortKey[] = ['first_cohort', 'second_cohort', 'third_cohort']

interface AttendanceCounters {
  assist: number
  not_asist: number
}

interface AttendanceRowState {
  enrollmentId: string | null
  counters: Record<CohortKey, AttendanceCounters>
}

const emptyCounters = (): Record<CohortKey, AttendanceCounters> => ({
  first_cohort: { assist: 0, not_asist: 0 },
  second_cohort: { assist: 0, not_asist: 0 },
  third_cohort: { assist: 0, not_asist: 0 },
})

function parseAttendance(rawGrades: Record<string, unknown> | null): Record<CohortKey, AttendanceCounters> {
  const base = emptyCounters()
  if (!rawGrades) return base
  COHORT_KEYS.forEach((key) => {
    const cohort = rawGrades[key]
    if (!cohort || typeof cohort !== 'object') return
    const attendance = (cohort as Record<string, unknown>).attendance
    if (!attendance || typeof attendance !== 'object') return
    const attObj = attendance as Record<string, unknown>
    const assist = Number(attObj.assist ?? 0)
    const notAsist = Number(attObj.not_asist ?? 0)
    base[key] = {
      assist: Number.isFinite(assist) ? Math.max(0, Math.round(assist)) : 0,
      not_asist: Number.isFinite(notAsist) ? Math.max(0, Math.round(notAsist)) : 0,
    }
  })
  return base
}

function buildDefaultGradesStructure(course: Course): Record<string, unknown> {
  const result: Record<string, unknown> = {}
    ; (course.cuts ?? []).forEach((cut, idx) => {
      if (idx >= 3) return
      const key = COHORT_KEYS[idx]
      const comps = course.components.filter(c => c.cutId === cut.id)
      const [primary, ...rest] = comps
      const cohort: Record<string, unknown> = {
        weight: `${cut.percentage}%`,
        attendance: { assist: 0, not_asist: 0 },
      }
      if (primary) {
        cohort.parcial = {
          id: primary.id,
          name: primary.name,
          note: null,
          weight: `${primary.percentage}%`,
        }
      }
      if (rest.length > 0) {
        const seg: Record<string, unknown> = {}
        rest.forEach(c => {
          seg[c.id] = {
            id: c.id,
            name: c.name,
            note: null,
            weight: `${c.percentage}%`,
          }
        })
        cohort.seguimiento = seg
      }
      result[key] = cohort
    })
  return result
}

export default function GradesPage({
  course, grades, lastSaved,
  onUpdateGrade, onUpdateComponents, onUpdateCuts, onBack,
}: Props) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('grades')
  const [showImport, setShowImport] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savedConfigAt, setSavedConfigAt] = useState<Date | null>(null)
  const [saveConfigErr, setSaveConfigErr] = useState<string | null>(null)
  const [attendanceCutIndex, setAttendanceCutIndex] = useState(0)
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceError, setAttendanceError] = useState<string | null>(null)
  const [attendanceRows, setAttendanceRows] = useState<Record<string, AttendanceRowState>>({})
  const [attendanceSavingStudentId, setAttendanceSavingStudentId] = useState<string | null>(null)
  const [attendanceLoadedCourseId, setAttendanceLoadedCourseId] = useState<string | null>(null)
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([])
  const [sessionHistoryLoading, setSessionHistoryLoading] = useState(false)
  const [sessionHistoryError, setSessionHistoryError] = useState(false)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [simBonus, setSimBonus] = useState(0)
  const [simStudentId, setSimStudentId] = useState<string>('all')
  const { user } = useAuth()
  const { courseStudentsMap } = useGrades()
  const courseStudentsList = courseStudentsMap[course.id] ?? []
  const totalPct = course.components.reduce((s, c) => s + c.percentage, 0)
  const cutsTotal = (course.cuts ?? []).reduce((s, c) => s + c.percentage, 0)
  const normalizedNames = course.components.map(c => c.name.trim().toLowerCase())
  const hasInvalidNames =
    normalizedNames.some(n => n.length === 0)
    || new Set(normalizedNames).size !== normalizedNames.length
  const allValid = totalPct === 100 && cutsTotal === 100 && !hasInvalidNames
  const { atRiskCount, completionPct, courseStudents, totals, gradeMap } = useGradeCalculation(course, grades, courseStudentsList)
  const toast = useToast()
  const selectedAttendanceCohort = COHORT_KEYS[Math.min(attendanceCutIndex, COHORT_KEYS.length - 1)]
  const attendanceCutLabel = useMemo(
    () => course.cuts?.[attendanceCutIndex]?.name ?? `Corte ${attendanceCutIndex + 1}`,
    [course.cuts, attendanceCutIndex],
  )

  const handleImport = (imported: Grade[]) => {
    imported.forEach(g => {
      onUpdateGrade(g.studentId, g.componentId, g.value)
    })
    setShowImport(false)
    toast.success('Notas importadas', `${imported.length} nota(s) importadas correctamente.`)
  }

  const handleSaveConfig = async () => {
    if (savingConfig) return
    if (!allValid) {
      toast.warning('Distribución incompleta', 'Revisa porcentajes y nombres: no se permiten nombres vacíos o repetidos por corte.')
      return
    }

    setSavingConfig(true)
    setSaveConfigErr(null)
    try {
      const cohortKeys = ['first_cohort', 'second_cohort', 'third_cohort'] as const
      const gradesStructure: Record<string, unknown> = {}
        ; (course.cuts ?? []).forEach((cut, idx) => {
          if (idx >= 3) return
          const comps = course.components.filter(c => c.cutId === cut.id)
          const [primary, ...rest] = comps
          const cohort: Record<string, unknown> = { weight: `${cut.percentage}%` }
          cohort.attendance = { assist: 0, not_asist: 0 }
          if (primary) {
            cohort.parcial = {
              id: primary.id,
              name: primary.name,
              note: null,
              weight: `${primary.percentage}%`,
            }
          }
          if (rest.length > 0) {
            const seg: Record<string, unknown> = {}
            rest.forEach(c => {
              seg[c.id] = {
                id: c.id,
                name: c.name,
                note: null,
                weight: `${c.percentage}%`,
              }
            })
            cohort.seguimiento = seg
          }
          gradesStructure[cohortKeys[idx]] = cohort
        })

      await enrollmentService.saveCourseGradesStructure(course.id, gradesStructure)
      const now = new Date()
      setSavedConfigAt(now)
      toast.success('Distribución guardada', 'La distribución de notas se guardó correctamente.')
    } catch (err) {
      const message = friendlyError(err)
      setSaveConfigErr(message)
      toast.error('No se pudo guardar', message)
    } finally {
      setSavingConfig(false)
    }
  }

  const loadAttendance = useCallback(async () => {
    if (!courseStudentsList.length) {
      setAttendanceRows({})
      setAttendanceLoadedCourseId(course.id)
      return
    }
    setAttendanceLoading(true)
    setAttendanceError(null)
    try {
      const entries = await Promise.all(
        courseStudentsList.map(async (student) => {
          const enrollment = await enrollmentService.findByCourse(student.id, course.id)
          if (!enrollment) {
            return [student.id, { enrollmentId: null, counters: emptyCounters() }] as const
          }
          const gradeRead = await enrollmentService.getGrades(enrollment.id)
          const parsed = parseAttendance(gradeRead.grades)
          return [student.id, { enrollmentId: enrollment.id, counters: parsed }] as const
        }),
      )
      setAttendanceRows(Object.fromEntries(entries))
      setAttendanceLoadedCourseId(course.id)
    } catch (err) {
      setAttendanceError(friendlyError(err))
    } finally {
      setAttendanceLoading(false)
    }
  }, [course.id, courseStudentsList])

  const registerAttendance = useCallback(async (studentId: string, present: boolean) => {
    const row = attendanceRows[studentId]
    if (!row?.enrollmentId) {
      toast.warning('Sin inscripción', 'No encontramos la inscripción activa para este estudiante.')
      return
    }

    setAttendanceSavingStudentId(studentId)
    setAttendanceError(null)
    try {
      const current = await enrollmentService.getGrades(row.enrollmentId)
      const currentGrades = current.grades ?? buildDefaultGradesStructure(course)
      const nextGrades: Record<string, unknown> = { ...currentGrades }
      const cohortObj = ((nextGrades[selectedAttendanceCohort] as Record<string, unknown> | undefined) ?? {})
      const attendance = ((cohortObj.attendance as Record<string, unknown> | undefined) ?? { assist: 0, not_asist: 0 })
      const assist = Math.max(0, Number(attendance.assist ?? 0))
      const notAsist = Math.max(0, Number(attendance.not_asist ?? 0))
      cohortObj.attendance = {
        assist: present ? assist + 1 : assist,
        not_asist: present ? notAsist : notAsist + 1,
      }
      nextGrades[selectedAttendanceCohort] = cohortObj

      await enrollmentService.saveGrades(row.enrollmentId, nextGrades)

      setAttendanceRows(prev => {
        const previous = prev[studentId] ?? { enrollmentId: row.enrollmentId, counters: emptyCounters() }
        const selected = previous.counters[selectedAttendanceCohort] ?? { assist: 0, not_asist: 0 }
        return {
          ...prev,
          [studentId]: {
            ...previous,
            counters: {
              ...previous.counters,
              [selectedAttendanceCohort]: {
                assist: present ? selected.assist + 1 : selected.assist,
                not_asist: present ? selected.not_asist : selected.not_asist + 1,
              },
            },
          },
        }
      })
    } catch (err) {
      setAttendanceError(friendlyError(err))
      toast.error('No se pudo guardar asistencia', friendlyError(err))
    } finally {
      setAttendanceSavingStudentId(null)
    }
  }, [attendanceRows, course, selectedAttendanceCohort, toast])

  useEffect(() => {
    if (activeTab === 'attendance' && attendanceLoadedCourseId !== course.id && !attendanceLoading) {
      void loadAttendance()
    }
  }, [activeTab, attendanceLoadedCourseId, course.id, attendanceLoading, loadAttendance])

  useEffect(() => {
    const needsHistory = activeTab === 'qr-history' || activeTab === 'attendance'
    if (needsHistory && sessionHistory.length === 0 && !sessionHistoryLoading && !sessionHistoryError) {
      setSessionHistoryLoading(true)
      setSessionHistoryError(false)
      void attendanceService.getCourseSessionHistory(course.id)
        .then(data => { setSessionHistory(data) })
        .catch(() => { setSessionHistoryError(true) })
        .finally(() => { setSessionHistoryLoading(false) })
    }
  }, [activeTab, course.id, sessionHistory.length, sessionHistoryLoading, sessionHistoryError])

  // Estudiantes que ya registraron asistencia vía QR hoy → deshabilitar registro manual
  const qrRegisteredToday = useMemo(() => {
    const todayCol = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const ids = new Set<string>()
    sessionHistory.forEach(sess => {
      const sessDateCol = new Date(sess.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      if (sessDateCol === todayCol) {
        sess.attendees.forEach(att => ids.add(String(att.student_id)))
      }
    })
    return ids
  }, [sessionHistory])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-warm)' }}>
      <Header />

      <div className="flex items-center gap-2 px-5 pt-5 max-w-7xl mx-auto w-full">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-usb-muted hover:text-usb-text transition-colors"
        >
          <ChevronLeft size={14} />
          Volver
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => navigate(`/materia/${course.id}/asistencia`)}
            className="flex items-center gap-1.5 text-xs font-bold text-white px-3.5 py-1.5 rounded-full transition-all shadow-sm"
            style={{ background: 'var(--green-deep)' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <QrCode size={12} />
            Asistencia QR
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-white px-3.5 py-1.5 rounded-full transition-all shadow-sm"
            style={{ background: 'var(--green-accent)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--green-brand)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--green-accent)')}
          >
            <Upload size={12} />
            Importar notas
          </button>
          <button
            onClick={() => toast.info('Exportación', 'Disponible en versión con backend conectado.')}
            className="flex items-center gap-1.5 text-xs font-semibold text-usb-muted border border-usb-border rounded-full px-3 py-1.5 transition-all"
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--green-accent)'; e.currentTarget.style.borderColor = 'var(--green-accent)' }}
            onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.borderColor = '' }}
          >
            <Download size={12} />
            Exportar
          </button>
        </div>
      </div>

      <main className="flex-1 px-5 py-6 max-w-7xl mx-auto w-full">
        {/* Course info + risk summary */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-card border border-usb-border p-5 mb-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,117,74,0.10)', color: 'var(--green-accent)' }}>
                  <FileSpreadsheet size={10} />
                  {course.code} · {course.group}
                </span>
                <span className="inline-flex items-center bg-usb-canvas text-usb-muted text-[0.65rem] font-semibold px-2.5 py-1 rounded-full border border-usb-border">
                  2024-I
                </span>
                <span className="inline-flex items-center bg-green-50 text-green-700 text-[0.65rem] font-semibold px-2.5 py-1 rounded-full border border-green-200">
                  Corte 1 · 40%
                </span>
              </div>
              <h2 className="font-extrabold text-lg text-usb-text leading-tight">{course.name}</h2>
              <p className="text-xs text-usb-muted mt-0.5">{user?.name}</p>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-center">
                <p className="text-xl font-extrabold text-usb-text">{courseStudents.length}</p>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-usb-muted">Estudiantes</p>
              </div>
              <div className="w-px h-8 bg-usb-border" />
              <div className="text-center">
                <p className="text-xl font-extrabold" style={{ color: 'var(--green-accent)' }}>{completionPct}%</p>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-usb-muted">Avance</p>
              </div>
              <div className="w-px h-8 bg-usb-border" />
              {atRiskCount > 0 ? (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2">
                  <AlertTriangle size={14} />
                  <div>
                    <p className="font-bold text-xs">{atRiskCount} en riesgo alto actual</p>
                    <p className="text-[0.62rem] opacity-75">Según cohorte en curso</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-3 py-2">
                  <CheckCircle2 size={14} />
                  <div>
                    <p className="font-bold text-xs">Sin riesgo alto actual</p>
                    <p className="text-[0.62rem] opacity-75">Cohorte en curso estable</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 pt-4 border-t border-usb-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">Progreso de ingreso</span>
              <span className="text-[0.75rem] font-extrabold" style={{ color: 'var(--green-accent)' }}>{completionPct}%</span>
            </div>
            <div className="h-2 bg-usb-canvas rounded-full overflow-hidden border border-usb-border">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${completionPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ background: 'var(--green-accent)' }}
              />
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-usb-border rounded-2xl p-1 w-fit mb-4">
          {[
            { key: 'grades', label: 'Calificaciones' },
            { key: 'config', label: `Distribución de notas`, warn: !allValid },
            { key: 'attendance', label: 'Asistencia' },
            { key: 'qr-history', label: 'Historial QR' },
            { key: 'simulator', label: 'Simulador' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as Tab)}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.key
                  ? 'text-white shadow-sm'
                  : 'text-usb-muted hover:text-usb-text'
                }`}
              style={activeTab === tab.key ? { background: 'var(--green-accent)' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-card border border-usb-border overflow-hidden"
        >
          {activeTab === 'grades' && (
            <GradeTable course={course} grades={grades} students={courseStudentsList} onUpdateGrade={onUpdateGrade} />
          )}
          {activeTab === 'config' && (
            <div className="p-5">
              <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-start md:justify-between">
                <p className="text-sm text-usb-muted md:pr-4">
                  Define los cortes y sus actividades. Cada corte tiene un peso porcentual y sus actividades
                  deben sumar exactamente ese porcentaje. El total de los tres cortes debe ser <span className="font-bold" style={{ color: 'var(--green-accent)' }}>100%</span>.
                </p>

                <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
                  <button
                    onClick={handleSaveConfig}
                    disabled={savingConfig || !allValid}
                    className="inline-flex items-center gap-2 text-xs font-bold text-white px-3.5 py-2 rounded-full transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'var(--green-accent)' }}
                    onMouseEnter={e => {
                      if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--green-brand)'
                    }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--green-accent)' }}
                  >
                    {savingConfig ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {savingConfig ? 'Guardando...' : 'Guardar distribución'}
                  </button>

                  {savedConfigAt && !saveConfigErr && (
                    <p className="text-[0.68rem] text-usb-faint">
                      Guardado {savedConfigAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  {saveConfigErr && (
                    <p className="text-[0.68rem] text-rose-600">{saveConfigErr}</p>
                  )}
                </div>
              </div>
              <ComponentsConfig
                cuts={course.cuts ?? []}
                components={course.components}
                onChangeCuts={cuts => onUpdateCuts(course.id, cuts)}
                onChange={comps => onUpdateComponents(course.id, comps)}
              />
            </div>
          )}
          {activeTab === 'attendance' && (
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-usb-muted">
                  Registra asistencia del cohorte actual por estudiante.
                </p>
                <div className="inline-flex items-center gap-1 bg-usb-canvas border border-usb-border rounded-xl p-1">
                  {(course.cuts ?? []).slice(0, 3).map((cut, idx) => (
                    <button
                      key={cut.id}
                      onClick={() => setAttendanceCutIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${idx === attendanceCutIndex ? 'text-white' : 'text-usb-muted hover:text-usb-text'
                        }`}
                      style={idx === attendanceCutIndex ? { background: 'var(--green-accent)' } : {}}
                    >
                      {cut.name}
                    </button>
                  ))}
                </div>
              </div>

              {attendanceError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {attendanceError}
                </div>
              )}

              {attendanceLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
                </div>
              ) : (
                <div className="overflow-x-auto border border-usb-border rounded-xl">
                  <table className="min-w-full">
                    <thead className="bg-usb-canvas border-b border-usb-border">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-usb-muted">Estudiante</th>
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-usb-muted">Código</th>
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-usb-muted">Asistencias</th>
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-usb-muted">Inasistencias</th>
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-usb-muted">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courseStudentsList.map((student) => {
                        const row = attendanceRows[student.id]
                        const counters = row?.counters[selectedAttendanceCohort] ?? { assist: 0, not_asist: 0 }
                        const isSaving = attendanceSavingStudentId === student.id
                        const alreadyQR = qrRegisteredToday.has(student.id)
                        return (
                          <tr key={student.id} className="border-b border-usb-border last:border-b-0">
                            <td className="px-4 py-3 text-sm font-semibold text-usb-text">{student.name}</td>
                            <td className="px-4 py-3 text-sm text-usb-muted font-mono">{student.studentCode}</td>
                            <td className="px-4 py-3 text-sm font-bold text-emerald-700">{counters.assist}</td>
                            <td className="px-4 py-3 text-sm font-bold text-rose-700">{counters.not_asist}</td>
                            <td className="px-4 py-3">
                              {alreadyQR ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                                  style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
                                  <Check size={12} /> Registrado vía QR hoy
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => { void registerAttendance(student.id, true) }}
                                    disabled={isSaving || !row?.enrollmentId}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ borderColor: '#10b981', color: '#047857', background: '#ecfdf5' }}
                                  >
                                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                    Registrar asistencia
                                  </button>
                                  <button
                                    onClick={() => { void registerAttendance(student.id, false) }}
                                    disabled={isSaving || !row?.enrollmentId}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ borderColor: '#ef4444', color: '#b91c1c', background: '#fef2f2' }}
                                  >
                                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                                    Registrar inasistencia
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-usb-faint">
                Cohorte activo: <span className="font-bold text-usb-muted">{attendanceCutLabel}</span>.
              </p>
            </div>
          )}

          {/* ─── Scenario Simulator ─── */}
          {activeTab === 'simulator' && (() => {
            // Compute per-student current vs simulated risk
            const riskLabel = (r: ReturnType<typeof getRisk>) =>
              r === 'high' ? 'ALTO' : r === 'medium' ? 'MEDIO' : r === 'low' ? 'BAJO' : '—'
            const riskColor2 = (r: ReturnType<typeof getRisk>) =>
              r === 'high' ? '#dc2626' : r === 'medium' ? '#d97706' : '#16a34a'
            const riskBg2 = (r: ReturnType<typeof getRisk>) =>
              r === 'high' ? '#fee2e2' : r === 'medium' ? '#fef3c7' : '#dcfce7'

            const allRows = courseStudents.map(s => {
              const baseGrade = totals[s.id]
              const simGrade  = baseGrade !== null ? Math.min(5.0, baseGrade + simBonus) : null
              const baseRisk  = getRisk(baseGrade)
              const simRisk   = getRisk(simGrade)
              const improved  = baseRisk !== simRisk && simRisk !== null && (
                (baseRisk === 'high' && (simRisk === 'medium' || simRisk === 'low')) ||
                (baseRisk === 'medium' && simRisk === 'low')
              )
              return { s, baseGrade, simGrade, baseRisk, simRisk, improved }
            })

            // Filas filtradas por estudiante seleccionado (para distribución y tabla)
            const studentRows = simStudentId === 'all'
              ? allRows
              : allRows.filter(r => r.s.id === simStudentId)

            const baseCounts = {
              high:   studentRows.filter(r => r.baseRisk === 'high').length,
              medium: studentRows.filter(r => r.baseRisk === 'medium').length,
              low:    studentRows.filter(r => r.baseRisk === 'low').length,
              none:   studentRows.filter(r => r.baseRisk === null).length,
            }
            const simCounts = {
              high:   studentRows.filter(r => r.simRisk === 'high').length,
              medium: studentRows.filter(r => r.simRisk === 'medium').length,
              low:    studentRows.filter(r => r.simRisk === 'low').length,
              none:   studentRows.filter(r => r.simRisk === null).length,
            }
            const improvedCount = studentRows.filter(r => r.improved).length
            const total = studentRows.length

            return (
              <div className="p-5 space-y-5">
                {/* Header */}
                <div>
                  <p className="text-sm font-bold text-usb-text">Simulador de escenarios</p>
                  <p className="text-xs text-usb-muted">
                    Aplica una bonificación hipotética y visualiza cómo cambia la distribución de riesgo del grupo.
                  </p>
                </div>

                {/* Student selector */}
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-xs font-bold uppercase tracking-wider text-usb-muted flex-shrink-0">
                    Estudiante:
                  </label>
                  <select
                    value={simStudentId}
                    onChange={e => { setSimStudentId(e.target.value) }}
                    className="text-sm font-semibold rounded-xl px-3 py-1.5 border border-usb-border bg-white text-usb-text outline-none cursor-pointer"
                    style={{ minWidth: '200px' }}
                  >
                    <option value="all">Todos los estudiantes ({courseStudents.length})</option>
                    {courseStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {simStudentId !== 'all' && (
                    <button
                      onClick={() => setSimStudentId('all')}
                      className="text-xs text-usb-muted hover:text-usb-text underline underline-offset-2"
                    >
                      Ver todos
                    </button>
                  )}
                </div>

                {/* Bonus slider */}
                <div
                  className="rounded-2xl p-4 space-y-3"
                  style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.07)' }}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ background: 'rgba(0,117,74,0.10)', color: 'var(--green-accent)' }}>
                      <Sliders size={15} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm text-usb-text">Bonificación aplicada</p>
                      <p className="text-xs text-usb-muted">Puntos extra sumados a la nota final de cada estudiante</p>
                    </div>
                    <span
                      className="text-2xl font-extrabold w-16 text-right"
                      style={{ color: simBonus > 0 ? 'var(--green-accent)' : 'var(--text-faint)' }}
                    >
                      +{simBonus.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={2} step={0.1}
                    value={simBonus}
                    onChange={e => setSimBonus(Number(e.target.value))}
                    className="w-full accent-green-600"
                  />
                  <div className="flex justify-between text-xs text-usb-faint font-semibold">
                    <span>0.0 (sin cambio)</span>
                    <span>+1.0</span>
                    <span>+2.0 (máx)</span>
                  </div>
                </div>

                {/* Distribution comparison */}
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Before */}
                  <div className="rounded-xl p-4 space-y-2.5"
                       style={{ background: 'white', border: '1px solid rgba(0,0,0,0.07)' }}>
                    <p className="text-xs font-extrabold uppercase tracking-wider text-usb-muted">Situación actual</p>
                    {([
                      { label: 'ALTO riesgo',  count: baseCounts.high,   color: '#dc2626', bg: '#fee2e2' },
                      { label: 'MEDIO riesgo', count: baseCounts.medium, color: '#d97706', bg: '#fef3c7' },
                      { label: 'BAJO riesgo',  count: baseCounts.low,    color: '#16a34a', bg: '#dcfce7' },
                      { label: 'Sin evaluar',  count: baseCounts.none,   color: '#9ca3af', bg: '#f3f4f6' },
                    ] as const).filter(x => x.count > 0).map(({ label, count, color, bg }) => (
                      <div key={label} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold" style={{ color }}>{label}</span>
                            <span className="text-xs font-bold" style={{ color }}>{count} / {total}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                            <div className="h-full rounded-full" style={{ width: `${total > 0 ? (count/total)*100 : 0}%`, background: color }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* After */}
                  <div className="rounded-xl p-4 space-y-2.5"
                       style={{ background: simBonus > 0 ? 'rgba(0,117,74,0.03)' : 'white', border: `1px solid ${simBonus > 0 ? 'rgba(0,117,74,0.15)' : 'rgba(0,0,0,0.07)'}` }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-usb-muted">Con bonificación +{simBonus.toFixed(1)}</p>
                      {improvedCount > 0 && (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <TrendingUp size={11} /> {improvedCount} mejoran
                        </span>
                      )}
                    </div>
                    {([
                      { label: 'ALTO riesgo',  count: simCounts.high,   baseCount: baseCounts.high,   color: '#dc2626', bg: '#fee2e2' },
                      { label: 'MEDIO riesgo', count: simCounts.medium, baseCount: baseCounts.medium, color: '#d97706', bg: '#fef3c7' },
                      { label: 'BAJO riesgo',  count: simCounts.low,    baseCount: baseCounts.low,    color: '#16a34a', bg: '#dcfce7' },
                      { label: 'Sin evaluar',  count: simCounts.none,   baseCount: baseCounts.none,   color: '#9ca3af', bg: '#f3f4f6' },
                    ] as const).filter(x => x.count > 0 || x.baseCount > 0).map(({ label, count, baseCount, color, bg }) => {
                      const delta = count - baseCount
                      return (
                        <div key={label} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-semibold" style={{ color }}>{label}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold" style={{ color }}>{count} / {total}</span>
                                {delta !== 0 && (
                                  <span className="text-[0.60rem] font-bold"
                                        style={{ color: delta < 0 && color === '#dc2626' ? '#16a34a' : delta > 0 && color === '#16a34a' ? '#16a34a' : '#d97706' }}>
                                    {delta > 0 ? `+${delta}` : delta}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${total > 0 ? (count/total)*100 : 0}%`, background: color }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Per-student table */}
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-usb-muted mb-2">Detalle por estudiante</p>
                  <div className="overflow-x-auto border border-usb-border rounded-xl">
                    <table className="min-w-full">
                      <thead className="bg-usb-canvas border-b border-usb-border">
                        <tr className="text-left">
                          <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-usb-muted">Estudiante</th>
                          <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-usb-muted">Nota actual</th>
                          <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-usb-muted">Riesgo actual</th>
                          <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-usb-muted">Nota +bono</th>
                          <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-usb-muted">Riesgo +bono</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentRows.map(({ s, baseGrade, simGrade, baseRisk, simRisk, improved }) => (
                          <tr key={s.id} className={`border-t border-usb-border ${improved ? 'bg-emerald-50/50' : ''}`}>
                            <td className="px-4 py-2.5 text-sm font-semibold text-usb-text">{s.name}</td>
                            <td className="px-4 py-2.5 text-sm font-bold"
                                style={{ color: baseGrade !== null ? (baseGrade >= 3.0 ? '#16a34a' : '#dc2626') : 'var(--text-faint)' }}>
                              {baseGrade !== null ? baseGrade.toFixed(2) : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              {baseRisk && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                      style={{ background: riskBg2(baseRisk), color: riskColor2(baseRisk) }}>
                                  {riskLabel(baseRisk)}
                                </span>
                              )}
                              {!baseRisk && <span className="text-xs text-usb-faint">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-bold"
                                style={{ color: simGrade !== null ? (simGrade >= 3.0 ? '#16a34a' : '#dc2626') : 'var(--text-faint)' }}>
                              {simGrade !== null ? simGrade.toFixed(2) : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {simRisk && (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                        style={{ background: riskBg2(simRisk), color: riskColor2(simRisk) }}>
                                    {riskLabel(simRisk)}
                                  </span>
                                )}
                                {improved && (
                                  <TrendingUp size={12} className="text-emerald-600 flex-shrink-0" />
                                )}
                                {!simRisk && <span className="text-xs text-usb-faint">—</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ─── QR Session History ─── */}
          {activeTab === 'qr-history' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-usb-text">Sesiones de asistencia QR</p>
                  <p className="text-xs text-usb-muted">Historial de todas las sesiones QR abiertas para este curso.</p>
                </div>
                <button
                  onClick={() => {
                    setSessionHistory([])
                    setSessionHistoryError(false)
                    setSessionHistoryLoading(true)
                    void attendanceService.getCourseSessionHistory(course.id)
                      .then(data => { setSessionHistory(data) })
                      .catch(() => { setSessionHistoryError(true) })
                      .finally(() => { setSessionHistoryLoading(false) })
                  }}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl border border-usb-border hover:bg-usb-canvas transition-colors"
                  style={{ color: 'var(--green-accent)' }}
                >
                  Actualizar
                </button>
              </div>

              {sessionHistoryLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={22} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
                </div>
              ) : sessionHistoryError ? (
                <div className="flex flex-col items-center py-12 gap-2 rounded-xl"
                     style={{ background: 'var(--canvas-warm)', border: '1.5px dashed rgba(220,38,38,0.20)' }}>
                  <QrCode size={28} className="text-rose-300" />
                  <p className="font-semibold text-sm text-usb-muted">No se pudieron cargar las sesiones</p>
                  <p className="text-xs text-usb-faint">Verifica tu conexión e intenta de nuevo.</p>
                </div>
              ) : sessionHistory.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-2 rounded-xl"
                     style={{ background: 'var(--canvas-warm)', border: '1.5px dashed rgba(0,0,0,0.10)' }}>
                  <QrCode size={28} style={{ color: 'var(--text-faint)' }} />
                  <p className="font-semibold text-sm text-usb-muted">Sin sesiones QR aún</p>
                  <p className="text-xs text-usb-faint">Las sesiones de asistencia con QR aparecerán aquí.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessionHistory.map(session => {
                    const isExpanded = expandedSessionId === session.id
                    const startDate = new Date(session.created_at).toLocaleString('es-CO', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      timeZone: 'America/Bogota',
                    })
                    return (
                      <div key={session.id}
                           className="rounded-xl overflow-hidden"
                           style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                        {/* Session header row */}
                        <button
                          onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                          style={{ background: 'var(--canvas-warm)' }}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                               style={{ background: session.is_active ? 'rgba(0,117,74,0.10)' : 'rgba(0,0,0,0.05)' }}>
                            <CalendarCheck size={15} style={{ color: session.is_active ? 'var(--green-accent)' : 'var(--text-faint)' }} />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-bold text-sm text-usb-text">
                              {session.label ?? 'Sesión sin nombre'}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="flex items-center gap-1 text-xs text-usb-muted">
                                <Clock size={10} /> {startDate}
                              </span>
                              <span className="flex items-center gap-1 text-xs font-semibold"
                                    style={{ color: 'var(--green-accent)' }}>
                                <Users size={10} /> {session.total_attendees} asistentes
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {session.is_active ? (
                              <span className="text-[0.62rem] font-bold px-2 py-0.5 rounded-full text-emerald-700"
                                    style={{ background: '#dcfce7' }}>● Activa</span>
                            ) : (
                              <span className="text-[0.62rem] font-bold px-2 py-0.5 rounded-full text-gray-500"
                                    style={{ background: '#f3f4f6' }}>Cerrada</span>
                            )}
                            <ChevronDown
                              size={14}
                              className="text-usb-muted transition-transform duration-200"
                              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            />
                          </div>
                        </button>

                        {/* Attendees list */}
                        {isExpanded && (
                          <div className="border-t border-usb-border">
                            {session.attendees.length === 0 ? (
                              <p className="text-xs text-usb-faint text-center py-4">Sin registros de asistencia aún.</p>
                            ) : (
                              <table className="min-w-full">
                                <thead className="bg-usb-canvas">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-usb-muted">Estudiante</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-usb-muted">Hora registrada</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {session.attendees.map((att, i) => {
                                    const t = new Date(att.recorded_at).toLocaleTimeString('es-CO', {
                                      hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
                                    })
                                    return (
                                      <tr key={`${att.student_id}-${i}`}
                                          className="border-t border-usb-border last:border-b-0">
                                        <td className="px-4 py-2.5 text-sm font-semibold text-usb-text">{att.student_name}</td>
                                        <td className="px-4 py-2.5 text-sm text-usb-muted flex items-center gap-1.5">
                                          <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                                          {t}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </main>

      {showImport && (
        <ImportModal
          course={course}
          students={courseStudentsList}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
