import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Download, AlertTriangle, CheckCircle2, Upload, FileSpreadsheet, Save, Loader2, Check, X } from 'lucide-react'
import type { Course, Grade } from '../types'
import { useGradeCalculation } from '../hooks/useGradeCalculation'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useGrades } from '../context/GradesContext'
import { enrollmentService } from '../services/enrollmentService'
import { friendlyError } from '../services/errorMessages'
import Header from '../components/Header'
import GradeTable from '../components/GradeTable'
import ComponentsConfig from '../components/ComponentsConfig'
import ImportModal from '../components/ImportModal'

interface Props {
  course: Course
  grades: Grade[]
  lastSaved: Date | null
  onUpdateGrade: (studentId: string, componentId: string, value: number | null) => void
  onUpdateComponents: (courseId: string, components: Course['components']) => void
  onUpdateCuts: (courseId: string, cuts: Course['cuts']) => void
  onBack: () => void
  onLogout: () => void
}

type Tab = 'grades' | 'config' | 'attendance'
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
  const { atRiskCount, completionPct, courseStudents } = useGradeCalculation(course, grades, courseStudentsList)
  const toast = useToast()
  const selectedAttendanceCohort = COHORT_KEYS[Math.min(attendanceCutIndex, COHORT_KEYS.length - 1)]
  const attendanceCutLabel = useMemo(
    () => course.cuts?.[attendanceCutIndex]?.name ?? `Corte ${attendanceCutIndex + 1}`,
    [course.cuts, attendanceCutIndex],
  )

  const handleImport = (importedGrades: Grade[]) => {
    let count = 0
    for (const g of importedGrades) {
      if (g.value !== null) {
        onUpdateGrade(g.studentId, g.componentId, g.value)
        count++
      }
    }
    toast.success(
      `${count} notas importadas`,
      `Las calificaciones de ${course.name} fueron actualizadas correctamente.`
    )
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

  return (
    <div className="min-h-screen bg-usb-canvas flex flex-col">
      <Header
        lastSaved={lastSaved}
        subtitle={`${course.code} · ${course.name}`}
      />

      {/* Breadcrumb + actions */}
      <div className="bg-white border-b border-usb-border px-5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-usb-muted transition-colors font-medium"
            style={{ ['--tw-hover-color' as string]: 'var(--green-accent)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--green-accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = '')}
          >
            <ChevronLeft size={14} />
            <span className="text-xs">Mis materias</span>
          </button>
          <span className="text-usb-border">/</span>
          <span className="text-xs font-bold" style={{ color: 'var(--green-accent)' }}>{course.name}</span>
        </div>

        <div className="flex items-center gap-2">
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
              {tab.warn && (
                <span className={`w-2 h-2 rounded-full ${activeTab === tab.key ? 'bg-white' : 'bg-amber-400'}`} />
              )}
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
                        return (
                          <tr key={student.id} className="border-b border-usb-border last:border-b-0">
                            <td className="px-4 py-3 text-sm font-semibold text-usb-text">{student.name}</td>
                            <td className="px-4 py-3 text-sm text-usb-muted font-mono">{student.studentCode}</td>
                            <td className="px-4 py-3 text-sm font-bold text-emerald-700">{counters.assist}</td>
                            <td className="px-4 py-3 text-sm font-bold text-rose-700">{counters.not_asist}</td>
                            <td className="px-4 py-3">
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
