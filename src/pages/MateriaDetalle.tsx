/**
 * MateriaDetalle — Course detail view for students.
 * Shows course info and notes (grades). No prediction here.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, BookOpen, Hash, Calendar, Loader2, AlertCircle,
  GraduationCap, BarChart2, User, Award, ChevronDown, Sliders, QrCode,
  Target, CheckCircle2, XCircle, CalendarCheck, Clock,
} from 'lucide-react'
import Header from '../components/Header'
import RiskoAnalysis from '../components/RiskoAnalysis'
import CourseChat from '../components/CourseChat'
import { courseService, type BackendCourse } from '../services/courseService'
import { predictionService } from '../services/predictionService'
import {
  enrollmentService,
  type BackendGradesRead,
  type CohortRiskRead,
  type EnrollmentRiskRead,
} from '../services/enrollmentService'
import { attendanceService, type AttendanceHistoryItem } from '../services/attendanceService'
import { useAuth } from '../context/AuthContext'

// ─── Main page ───────────────────────────────────────────────────────────────

function gradeColor(value: number | null): string {
  if (value === null) return 'var(--text-faint)'
  if (value >= 4.0)   return '#16a34a'  // alta  — verde
  if (value >= 3.0)   return '#d97706'  // media — amarillo
  return '#dc2626'                       // bajo  — rojo
}

type CohortKey = 'first_cohort' | 'second_cohort' | 'third_cohort'

function riskMeta(level: 'ALTO' | 'MEDIO' | 'BAJO') {
  if (level === 'ALTO') return { bg: '#fee2e2', text: '#dc2626', bar: '#dc2626', label: 'Alto riesgo' }
  if (level === 'MEDIO') return { bg: '#fef3c7', text: '#d97706', bar: '#d97706', label: 'Riesgo medio' }
  return { bg: '#dcfce7', text: '#15803d', bar: '#15803d', label: 'Riesgo bajo' }
}

function cohortLabel(key: CohortKey): string {
  if (key === 'first_cohort') return 'Corte 1'
  if (key === 'second_cohort') return 'Corte 2'
  return 'Corte 3'
}

interface CohortAttendanceSummary {
  assist: number
  notAsist: number
  total: number
  percentage: number | null
}

function attendanceFromGrades(grades: Record<string, unknown> | null, key: CohortKey): CohortAttendanceSummary {
  const cohort = ((grades ?? {})[key] as Record<string, unknown> | undefined) ?? {}
  const attendance = (cohort.attendance as Record<string, unknown> | undefined) ?? {}
  const assist = Math.max(0, Number(attendance.assist ?? 0))
  const notAsist = Math.max(0, Number(attendance.not_asist ?? 0))
  const total = assist + notAsist
  return {
    assist,
    notAsist,
    total,
    percentage: total > 0 ? Math.round((assist / total) * 100) : null,
  }
}

function parseWeight(value: unknown): number {
  if (typeof value === 'number') return value > 1 ? value / 100 : value
  if (typeof value === 'string') {
    const n = Number(value.replace('%', '').trim())
    if (Number.isFinite(n)) return n > 1 ? n / 100 : n
  }
  return 0
}

function getCohortPredictionInput(grades: Record<string, unknown>, cohortKey: CohortKey): {
  nota_parcial: number
  promedio_seguimiento: number
  porcentaje_asistencia: number
} {
  const cohort = (grades[cohortKey] as Record<string, unknown> | undefined) ?? {}

  const parcial = (cohort.parcial as Record<string, unknown> | undefined) ?? {}
  const parcialNote = Number(parcial.note)
  if (!Number.isFinite(parcialNote)) {
    throw new Error(`La nota parcial de ${cohortLabel(cohortKey)} no está registrada`)
  }

  const seguimiento = (cohort.seguimiento as Record<string, unknown> | undefined) ?? {}
  let weighted = 0
  let weights = 0
  Object.values(seguimiento).forEach((value) => {
    if (!value || typeof value !== 'object') return
    const activity = value as Record<string, unknown>
    const note = Number(activity.note)
    if (!Number.isFinite(note)) return
    const w = parseWeight(activity.weight)
    if (w <= 0) return
    weighted += note * w
    weights += w
  })
  if (weights <= 0) {
    throw new Error(`No hay actividades de seguimiento con nota en ${cohortLabel(cohortKey)}`)
  }

  const attendance = (cohort.attendance as Record<string, unknown> | undefined) ?? {}
  const assist = Number(attendance.assist ?? 0)
  const notAsist = Number(attendance.not_asist ?? 0)
  const total = assist + notAsist
  if (total <= 0) {
    throw new Error(`No hay datos de asistencia para ${cohortLabel(cohortKey)}`)
  }
  const attendancePct = (assist / total) * 100

  return {
    nota_parcial: Math.round(parcialNote * 100) / 100,
    promedio_seguimiento: Math.round((weighted / weights) * 100) / 100,
    porcentaje_asistencia: Math.round(attendancePct * 100) / 100,
  }
}

function normalizeRiskError(raw: string, scope: 'total' | 'cohort', cohort?: CohortKey | null): string {
  const msg = raw
    .replace(/first_cohort/g, 'Corte 1')
    .replace(/second_cohort/g, 'Corte 2')
    .replace(/third_cohort/g, 'Corte 3')

  if (scope === 'total') {
    if (msg.toLowerCase().includes('faltan notas por cohorte')) {
      return 'Para calcular el riesgo total deben estar registradas las notas de los 3 cortes y la nota definitiva.'
    }
    if (msg.toLowerCase().includes('consentimiento')) {
      return 'Debes aceptar el consentimiento de uso del predictor para calcular tu riesgo.'
    }
  }

  if (scope === 'cohort') {
    if (msg.toLowerCase().includes('no está registrada')) {
      return `Aún faltan notas para calcular el riesgo de ${cohort ? cohortLabel(cohort) : 'este corte'}.`
    }
    if (msg.toLowerCase().includes('no hay datos de asistencia')) {
      return `No podemos calcular ${cohort ? cohortLabel(cohort) : 'este corte'} sin asistencia registrada.`
    }
    if (msg.toLowerCase().includes('consentimiento')) {
      return 'Debes aceptar el consentimiento de uso del predictor para calcular tu riesgo.'
    }
  }

  return msg
}

// ─── "¿Cuánto necesito sacar?" Calculator ────────────────────────────────────

interface NeededResult {
  label:    string
  needed:   number
  possible: boolean
  done:     boolean
  grade:    number | null
}

function calcNeeded(
  c1: number | null,
  c2: number | null,
  c3: number | null,
  target: number,
): NeededResult[] {
  const w = 1 / 3
  const grades   = [c1, c2, c3]
  const labels   = ['Corte 1', 'Corte 2', 'Corte 3']
  const earnedSum = grades.reduce<number>((s, g) => s + (g !== null ? g * w : 0), 0)
  const pendingIdx = grades.map((g, i) => ({ i, g })).filter(x => x.g === null)

  if (pendingIdx.length === 0) {
    return grades.map((g, i) => ({ label: labels[i], needed: 0, possible: true, done: true, grade: g }))
  }

  const remainWeight  = pendingIdx.length * w
  const neededAvg     = (target - earnedSum) / remainWeight

  return grades.map((g, i) => ({
    label:    labels[i],
    needed:   g !== null ? 0 : neededAvg,
    possible: g !== null ? true : neededAvg <= 5.0,
    done:     g !== null,
    grade:    g,
  }))
}

function GradoNecesario({
  c1, c2, c3,
}: { c1: number | null; c2: number | null; c3: number | null }) {
  const [target, setTarget] = useState(3.0)
  const results = calcNeeded(c1, c2, c3, target)
  const pending = results.filter(r => !r.done)
  const alreadyPassing = pending.length > 0 && pending.every(r => r.needed <= 0)
  const impossible     = pending.length > 0 && pending.some(r => !r.possible)
  const allDone        = pending.length === 0
  const currentEstimate = allDone
    ? (c1 !== null && c2 !== null && c3 !== null ? (c1 + c2 + c3) / 3 : null)
    : null

  const statusColor = allDone
    ? (currentEstimate !== null && currentEstimate >= target ? '#16a34a' : '#dc2626')
    : impossible
      ? '#dc2626'
      : alreadyPassing
        ? '#16a34a'
        : '#d97706'

  return (
    <div className="rounded-xl p-4 space-y-3"
         style={{ background: 'linear-gradient(135deg,rgba(0,117,74,0.04) 0%,rgba(0,117,74,0.02) 100%)',
                  border: '1.5px solid rgba(0,117,74,0.12)' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
               style={{ background: 'rgba(0,117,74,0.10)', color: 'var(--green-accent)' }}>
            <Target size={14} />
          </div>
          <p className="font-bold text-sm" style={{ color: 'var(--text-dark)' }}>
            ¿Cuánto necesito sacar?
          </p>
        </div>
        {/* Target grade slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>Meta:</span>
          <input
            type="range" min={1.0} max={5.0} step={0.1}
            value={target}
            onChange={e => setTarget(Number(e.target.value))}
            className="w-24 accent-green-600"
          />
          <span
            className="text-sm font-extrabold w-8 text-right"
            style={{ color: statusColor }}
          >
            {target.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Status banner */}
      {allDone && currentEstimate !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
             style={{ background: currentEstimate >= target ? '#dcfce7' : '#fee2e2' }}>
          {currentEstimate >= target
            ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
            : <XCircle size={14} className="text-red-600 flex-shrink-0" />}
          <p className="text-xs font-semibold"
             style={{ color: currentEstimate >= target ? '#15803d' : '#b91c1c' }}>
            {currentEstimate >= target
              ? `¡Pasas la materia con ${currentEstimate.toFixed(2)}! 🎉`
              : `Nota final estimada: ${currentEstimate.toFixed(2)} — por debajo de ${target.toFixed(1)}`}
          </p>
        </div>
      )}

      {!allDone && alreadyPassing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#dcfce7' }}>
          <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-green-700">
            ¡Ya tienes notas suficientes para pasar con {target.toFixed(1)}! Solo asegura asistir. 🎉
          </p>
        </div>
      )}

      {!allDone && impossible && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#fee2e2' }}>
          <XCircle size={14} className="text-red-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-red-700">
            Matemáticamente no es posible alcanzar {target.toFixed(1)} con los cortes restantes. Habla con tu docente.
          </p>
        </div>
      )}

      {/* Corte breakdown */}
      <div className="grid grid-cols-3 gap-2">
        {results.map(r => (
          <div key={r.label}
               className="rounded-lg p-2.5 text-center"
               style={{
                 background: r.done ? 'rgba(22,163,74,0.06)' : 'white',
                 border: `1px solid ${r.done ? 'rgba(22,163,74,0.18)' : 'rgba(0,0,0,0.08)'}`,
               }}>
            <p className="text-[0.58rem] font-extrabold uppercase tracking-wider mb-1"
               style={{ color: 'var(--text-faint)' }}>{r.label}</p>
            {r.done ? (
              <>
                <p className="text-base font-extrabold" style={{ color: gradeColor(r.grade) }}>
                  {r.grade != null ? Number(r.grade).toFixed(1) : '—'}
                </p>
                <p className="text-[0.58rem] text-green-600 font-bold mt-0.5 flex items-center justify-center gap-0.5">
                  <CheckCircle2 size={9} /> Listo
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-extrabold"
                   style={{ color: !r.possible ? '#dc2626' : r.needed <= 2.5 ? '#16a34a' : r.needed <= 3.8 ? '#d97706' : '#dc2626' }}>
                  {!r.possible ? '> 5.0' : r.needed <= 0 ? '0.0' : r.needed.toFixed(1)}
                </p>
                <p className="text-[0.58rem] font-semibold mt-0.5"
                   style={{ color: 'var(--text-faint)' }}>mínimo</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-[0.60rem]" style={{ color: 'var(--text-faint)' }}>
        <span className="font-bold">*</span> Calculado con peso igual (33.3%) por corte.
        {pending.length > 0 && !alreadyPassing && !impossible && (
          <span> Necesitas sacar <strong style={{ color: statusColor }}>
            {results.find(r => !r.done)?.needed.toFixed(1) ?? '—'}
          </strong> ó más en cada corte pendiente.</span>
        )}
      </p>
    </div>
  )
}

export default function MateriaDetalle() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate     = useNavigate()
  const { user }     = useAuth()

  const [course, setCourse]               = useState<BackendCourse | null>(null)
  const [loadingCourse, setLoadingCourse] = useState(true)
  const [courseError, setCourseError]     = useState<string | null>(null)

  const [gradesData, setGradesData]       = useState<BackendGradesRead | null>(null)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryItem[]>([])
  const [loadingAttHist, setLoadingAttHist] = useState(false)
  const [mainTab, setMainTab] = useState<'calificaciones' | 'asistencia'>('calificaciones')
  const [attPage, setAttPage] = useState(0)
  const ATT_PAGE_SIZE = 10
  const [selectedCohort, setSelectedCohort] = useState<'first_cohort' | 'second_cohort' | 'third_cohort' | null>(null)
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null)
  const [totalRiskLoading, setTotalRiskLoading] = useState(false)
  const [cohortRiskLoading, setCohortRiskLoading] = useState(false)
  const [totalRiskError, setTotalRiskError] = useState<string | null>(null)
  const [cohortRiskError, setCohortRiskError] = useState<string | null>(null)
  const [totalRisk, setTotalRisk] = useState<EnrollmentRiskRead | null>(null)
  const [cohortRisks, setCohortRisks] = useState<Partial<Record<CohortKey, CohortRiskRead>>>({})
  const attendanceByCohort = useMemo(() => {
    const grades = (gradesData?.grades as Record<string, unknown> | null) ?? null
    return {
      first_cohort: attendanceFromGrades(grades, 'first_cohort'),
      second_cohort: attendanceFromGrades(grades, 'second_cohort'),
      third_cohort: attendanceFromGrades(grades, 'third_cohort'),
    }
  }, [gradesData?.grades])

  const loadCourse = useCallback(async () => {
    if (!courseId) return
    setLoadingCourse(true)
    setCourseError(null)
    try {
      const c = await courseService.getById(courseId)
      setCourse(c)
    } catch {
      setCourseError('No se pudo cargar la información del curso.')
    } finally {
      setLoadingCourse(false)
    }
  }, [courseId])

  const loadGrades = useCallback(async () => {
    if (!user?.studentId || !courseId) return
    setLoadingGrades(true)
    setTotalRiskError(null)
    setCohortRiskError(null)
    setTotalRisk(null)
    setCohortRisks({})
    try {
      const enrollments = await enrollmentService.listByStudent(user.studentId)
      const enrollment  = enrollments.find(e => e.course_id === courseId)
      if (!enrollment) {
        setEnrollmentId(null)
        setGradesData(null)
        return
      }
      setEnrollmentId(enrollment.id)
      const grades = await enrollmentService.getGrades(enrollment.id)
      setGradesData(grades)
      setSelectedCohort((prev) => prev ?? null)
    } catch {
      // Silently fail — placeholder is shown instead
    } finally {
      setLoadingGrades(false)
    }
  }, [user?.studentId, courseId])

  const calculateTotalRisk = useCallback(async () => {
    if (!enrollmentId) return
    setTotalRiskLoading(true)
    setTotalRiskError(null)
    try {
      const total = await enrollmentService.getTotalRisk(enrollmentId)
      setTotalRisk(total)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo calcular el riesgo en este momento.'
      setTotalRiskError(normalizeRiskError(message, 'total'))
    } finally {
      setTotalRiskLoading(false)
    }
  }, [enrollmentId])

  const calculateCohortRisk = useCallback(async () => {
    if (!selectedCohort || !gradesData?.grades || !gradesData.student_id) return
    setCohortRiskLoading(true)
    setCohortRiskError(null)
    try {
      const payload = getCohortPredictionInput(gradesData.grades, selectedCohort)
      const response = await predictionService.predictCohort(
        {
          cohort_key: selectedCohort,
          nota_parcial: payload.nota_parcial,
          promedio_seguimiento: payload.promedio_seguimiento,
          porcentaje_asistencia: payload.porcentaje_asistencia,
        },
        gradesData.student_id,
      )
      setCohortRisks((prev) => ({ ...prev, [selectedCohort]: response }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo calcular el riesgo del corte seleccionado.'
      setCohortRiskError(normalizeRiskError(message, 'cohort', selectedCohort))
    } finally {
      setCohortRiskLoading(false)
    }
  }, [selectedCohort, gradesData])

  useEffect(() => { void loadCourse() }, [loadCourse])
  useEffect(() => { void loadGrades() }, [loadGrades])
  useEffect(() => {
    if (!courseId) return
    setLoadingAttHist(true)
    void attendanceService.getMyHistoryByCourse(courseId).then(data => {
      setAttendanceHistory(data)
      setLoadingAttHist(false)
    })
  }, [courseId])

  return (
    <div className="min-h-screen bg-usb-canvas flex flex-col">
      <Header />

      {/* Page header */}
      <div className="relative overflow-hidden"
           style={{ background: 'var(--green-deep)', borderBottom: '1px solid rgba(0,0,0,0.25)' }}>
        <div className="max-w-7xl mx-auto w-full px-5 py-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-bold mb-4 transition-colors"
            style={{ color: 'rgba(212,233,226,0.55)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#d4e9e2')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(212,233,226,0.55)')}
          >
            <ArrowLeft size={15} />
            Volver a Mi Progreso
          </button>
          {course && (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
                <BookOpen size={18} className="flex-shrink-0" style={{ color: 'var(--green-light, #d4e9e2)' }} />
                <h1
                  className="text-white font-extrabold text-xl leading-tight min-w-0 break-words"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {course.name}
                </h1>
                <span
                  className="text-[0.68rem] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(212,233,226,0.12)', color: 'rgba(212,233,226,0.80)' }}
                >
                  {course.code}
                </span>
                <span className="hidden sm:flex items-center gap-1 text-sm flex-shrink-0" style={{ color: 'rgba(212,233,226,0.55)' }}>
                  <Hash size={11} />{course.credits} créditos
                </span>
                <span className="hidden sm:flex items-center gap-1 text-sm flex-shrink-0" style={{ color: 'rgba(212,233,226,0.55)' }}>
                  <Calendar size={11} />{course.academic_period}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-5 py-5">

        {/* Loading */}
        {loadingCourse && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={30} className="animate-spin mb-4" style={{ color: 'var(--green-accent)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Cargando curso…</p>
          </div>
        )}

        {/* Error */}
        {courseError && (
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center"
               style={{ boxShadow: 'var(--shadow-card)' }}>
            <AlertCircle size={30} className="text-rose-400 mx-auto mb-3" />
            <p className="font-bold mb-2" style={{ color: 'var(--text-dark)' }}>{courseError}</p>
            <button onClick={loadCourse} className="text-sm font-bold hover:underline"
                    style={{ color: 'var(--green-accent)' }}>Reintentar</button>
          </div>
        )}

        {/* Content */}
        {!loadingCourse && !courseError && course && (
          <div className="grid gap-3 xl:grid-cols-[320px,minmax(0,1fr)] items-start">
            <motion.aside
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="xl:sticky xl:top-24"
            >
              <div
                className="bg-white rounded-2xl p-4 space-y-3"
                style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}
              >
                {[
                  { icon: <Hash size={15} />, label: 'Créditos', value: `${course.credits} créditos`, color: '#7c3aed' },
                  { icon: <Calendar size={15} />, label: 'Período', value: course.academic_period, color: '#d97706' },
                  { icon: <User size={15} />, label: 'Docente', value: 'Asignado — Carlos Mendoza', color: '#00b4d8' },
                ].map(({ icon, label, value, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}12`, color }}
                    >
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-[0.58rem] font-extrabold uppercase tracking-wider"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        {label}
                      </p>
                      <p className="font-bold text-sm truncate" style={{ color: 'var(--text-dark)' }}>
                        {value}
                      </p>
                    </div>
                  </div>
                ))}

                <div
                  className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(22,163,74,0.10)', color: '#16a34a' }}
                  >
                    <GraduationCap size={15} />
                  </div>
                  <div>
                    <p className="text-[0.58rem] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                      Estado de inscripción
                    </p>
                    <span className="inline-flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="font-bold text-sm text-emerald-700">Activo</span>
                    </span>
                  </div>
                </div>

                {/* Botón registrar asistencia QR */}
                <button
                  onClick={() => navigate(`/asistencia`)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: 'var(--green-accent)',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(0,117,74,0.20)',
                  }}
                >
                  <QrCode size={15} />
                  Registrar asistencia
                </button>
              </div>
            </motion.aside>

            <div className="space-y-3">
              {/* Chat de materia */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.10 }}
              >
                <CourseChat courseId={courseId ?? ''} courseName={course.name} />
              </motion.div>

              {/* Tab switcher */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.13 }}
                className="flex gap-1 bg-white border rounded-2xl p-1 w-fit max-w-full overflow-x-auto"
                style={{ boxShadow: 'var(--shadow-card)', borderColor: 'rgba(0,0,0,0.07)' }}
              >
                {([
                  { key: 'calificaciones', label: 'Calificaciones',  icon: <Award size={13} /> },
                  { key: 'asistencia',     label: 'Mi asistencia',   icon: <CalendarCheck size={13} />,
                    badge: attendanceHistory.length || undefined },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setMainTab(t.key)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                    style={mainTab === t.key
                      ? { background: 'var(--green-accent)', color: 'white' }
                      : { color: 'var(--text-muted)' }}
                  >
                    {t.icon}
                    {t.label}
                    {'badge' in t && t.badge ? (
                      <span className="text-[0.60rem] font-extrabold px-1.5 py-0.5 rounded-full"
                            style={mainTab === t.key
                              ? { background: 'rgba(255,255,255,0.25)', color: 'white' }
                              : { background: 'rgba(0,117,74,0.10)', color: 'var(--green-accent)' }}>
                        {t.badge}
                      </span>
                    ) : null}
                  </button>
                ))}
              </motion.div>

              {/* ── Pestaña: Asistencia ── */}
              {mainTab === 'asistencia' && (() => {
                const totalPages = Math.ceil(attendanceHistory.length / ATT_PAGE_SIZE)
                const pageItems  = attendanceHistory.slice(attPage * ATT_PAGE_SIZE, (attPage + 1) * ATT_PAGE_SIZE)
                return (
                  <motion.div
                    key="asistencia-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-4"
                    style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <CalendarCheck size={16} style={{ color: 'var(--green-accent)' }} />
                        <h2 className="font-bold text-sm" style={{ color: 'var(--text-dark)' }}>
                          Historial de asistencia
                        </h2>
                      </div>
                      {attendanceHistory.length > 0 && (
                        <span className="text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(0,117,74,0.10)', color: 'var(--green-accent)' }}>
                          {attendanceHistory.length} {attendanceHistory.length === 1 ? 'clase' : 'clases'}
                        </span>
                      )}
                    </div>

                    {loadingAttHist ? (
                      <div className="flex justify-center py-8">
                        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
                      </div>
                    ) : attendanceHistory.length === 0 ? (
                      <div className="flex flex-col items-center py-10 gap-2 rounded-xl"
                           style={{ background: 'var(--canvas-warm)', border: '1.5px dashed rgba(0,0,0,0.08)' }}>
                        <CalendarCheck size={26} style={{ color: 'var(--text-faint)' }} />
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-subtle)' }}>Sin asistencias registradas</p>
                        <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-faint)' }}>
                          Escanea el QR del profesor para registrar tu asistencia
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          {pageItems.map((item, idx) => (
                            <div key={`${item.session_id}-${idx}`}
                                 className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                                 style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                   style={{ background: 'rgba(22,163,74,0.10)' }}>
                                <CheckCircle2 size={14} className="text-emerald-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text-dark)' }}>
                                  {item.session_label ?? 'Clase sin nombre'}
                                </p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Clock size={10} style={{ color: 'var(--text-faint)' }} />
                                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                                    {item.recorded_at_colombia}
                                  </p>
                                </div>
                              </div>
                              <span className="text-[0.62rem] font-bold px-2 py-0.5 rounded-full text-emerald-700 flex-shrink-0"
                                    style={{ background: '#dcfce7' }}>✓ Asistió</span>
                            </div>
                          ))}
                        </div>

                        {/* Paginación */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-3 pt-3"
                               style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                            <button
                              onClick={() => setAttPage(p => Math.max(0, p - 1))}
                              disabled={attPage === 0}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                              style={{ border: '1px solid rgba(0,0,0,0.10)', color: 'var(--text-muted)' }}
                            >
                              <ChevronDown size={12} style={{ transform: 'rotate(90deg)' }} />
                              Anterior
                            </button>
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
                              {attPage + 1} / {totalPages}
                            </span>
                            <button
                              onClick={() => setAttPage(p => Math.min(totalPages - 1, p + 1))}
                              disabled={attPage >= totalPages - 1}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                              style={{ border: '1px solid rgba(0,0,0,0.10)', color: 'var(--text-muted)' }}
                            >
                              Siguiente
                              <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )
              })()}

              {/* ── Pestaña: Calificaciones ── */}
              {mainTab === 'calificaciones' && (
              <>{/* Calificaciones */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="bg-white rounded-2xl p-4"
              style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Award size={16} style={{ color: 'var(--green-accent)' }} />
                  <h2 className="font-bold" style={{ color: 'var(--text-dark)' }}>Calificaciones</h2>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Simulador */}
                  <Link
                    to={`/materia/${courseId}/simulador`}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs flex-shrink-0 transition-all border"
                    style={{ background: 'white', color: 'var(--green-accent)', borderColor: 'var(--green-accent)' }}
                  >
                    <Sliders size={12} />
                    Simulador
                  </Link>
                  <button
                    onClick={() => { void calculateTotalRisk() }}
                    disabled={totalRiskLoading || !gradesData?.grades || !enrollmentId}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm flex-shrink-0 transition-all"
                    style={{
                      background: totalRiskLoading || !gradesData?.grades || !enrollmentId ? '#9ca3af' : 'var(--green-accent)',
                      color: 'white',
                      boxShadow: '0 2px 8px rgba(0,117,74,0.25)',
                      cursor: totalRiskLoading || !gradesData?.grades || !enrollmentId ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {totalRiskLoading ? <Loader2 size={15} className="animate-spin" /> : <BarChart2 size={15} />}
                    {totalRiskLoading ? 'Calculando total…' : 'Calcular total'}
                  </button>
                  <button
                    onClick={() => { void calculateCohortRisk() }}
                    disabled={cohortRiskLoading || !selectedCohort || !gradesData?.grades || !enrollmentId}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm flex-shrink-0 transition-all border"
                    style={{
                      background: 'white',
                      color: cohortRiskLoading || !selectedCohort || !gradesData?.grades || !enrollmentId ? '#9ca3af' : 'var(--green-accent)',
                      borderColor: cohortRiskLoading || !selectedCohort || !gradesData?.grades || !enrollmentId ? '#d1d5db' : 'var(--green-accent)',
                      cursor: cohortRiskLoading || !selectedCohort || !gradesData?.grades || !enrollmentId ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {cohortRiskLoading ? <Loader2 size={15} className="animate-spin" /> : <BarChart2 size={15} />}
                    {cohortRiskLoading
                      ? `Calculando ${selectedCohort ? cohortLabel(selectedCohort) : 'cohorte'}…`
                      : `Calcular ${selectedCohort ? cohortLabel(selectedCohort) : 'cohorte'}`}
                  </button>
                </div>
              </div>

              {loadingGrades ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={22} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
                </div>
              ) : gradesData?.grades !== null && gradesData !== null ? (
                <div className="space-y-2">
                  {/* Cohort cards — clickable */}
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { label: 'Corte 1', key: 'first_cohort',  value: gradesData.first_cohort_grade },
                      { label: 'Corte 2', key: 'second_cohort', value: gradesData.second_cohort_grade },
                      { label: 'Corte 3', key: 'third_cohort',  value: gradesData.third_cohort_grade },
                    ] as const).map(({ label, key, value }) => {
                      const isOpen = selectedCohort === key
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedCohort(isOpen ? null : key)}
                          className="rounded-xl p-3 text-center transition-all"
                          style={{
                            background: isOpen ? 'var(--green-accent)' : 'var(--canvas-warm)',
                            border: isOpen ? '1px solid var(--green-accent)' : '1px solid rgba(0,0,0,0.06)',
                          }}
                        >
                          <p className="text-[0.62rem] font-extrabold uppercase tracking-wider mb-1"
                             style={{ color: isOpen ? 'rgba(255,255,255,0.7)' : 'var(--text-faint)' }}>{label}</p>
                          <p className="text-xl font-extrabold leading-none"
                             style={{ color: isOpen ? 'white' : gradeColor(value) }}>
                            {value !== null ? Number(value).toFixed(1) : '—'}
                          </p>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <p className="text-[0.58rem]" style={{ color: isOpen ? 'rgba(255,255,255,0.55)' : 'var(--text-faint)' }}>
                              / 5.00
                            </p>
                            <ChevronDown
                              size={11}
                              style={{
                                color: isOpen ? 'rgba(255,255,255,0.55)' : 'var(--text-faint)',
                                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s',
                              }}
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Expandable detail panel */}
                  <AnimatePresence>
                    {selectedCohort && gradesData.grades && (
                      <motion.div
                        key={selectedCohort}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div
                          className="rounded-xl p-4 space-y-2"
                          style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}
                        >
                          {/* Parcial */}
                          {(() => {
                            const cohort = (gradesData.grades as Record<string, unknown>)[selectedCohort] as Record<string, unknown> | undefined
                            if (!cohort) return null
                            const parcial = cohort.parcial as { note?: number; weight?: string } | undefined
                            const seguimiento = cohort.seguimiento as Record<string, { name?: string; note?: number; weight?: string }> | undefined
                            const attendanceInfo = attendanceByCohort[selectedCohort]

                            return (
                              <>
                                <p className="text-[0.62rem] font-extrabold uppercase tracking-wider mb-2"
                                   style={{ color: 'var(--text-faint)' }}>
                                  Detalle — {selectedCohort === 'first_cohort' ? 'Corte 1' : selectedCohort === 'second_cohort' ? 'Corte 2' : 'Corte 3'}
                                </p>

                                {/* Attendance row */}
                                <div className="flex items-center justify-between py-2 border-b"
                                     style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                                  <div>
                                    <p className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>Asistencia</p>
                                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                                      {attendanceInfo.assist} asistencias · {attendanceInfo.notAsist} inasistencias
                                    </p>
                                  </div>
                                  <p className="text-lg font-extrabold"
                                     style={{ color: attendanceInfo.percentage !== null ? 'var(--green-accent)' : 'var(--text-faint)' }}>
                                    {attendanceInfo.percentage !== null ? `${attendanceInfo.percentage}%` : 'Sin registro'}
                                  </p>
                                </div>

                                {/* Parcial row */}
                                {parcial && (
                                  <div className="flex items-center justify-between py-2 border-b"
                                       style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                                    <div>
                                      <p className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>Parcial</p>
                                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Peso: {parcial.weight ?? '—'}</p>
                                    </div>
                                    <p className="text-lg font-extrabold"
                                       style={{ color: gradeColor(parcial.note ?? null) }}>
                                      {parcial.note !== undefined ? Number(parcial.note).toFixed(1) : '—'}
                                    </p>
                                  </div>
                                )}

                                {/* Seguimiento rows */}
                                {seguimiento && Object.entries(seguimiento).map(([actKey, act]) => (
                                  <div key={actKey}
                                       className="flex items-center justify-between py-2 border-b last:border-0"
                                       style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                                    <div>
                                      <p className="font-semibold text-sm capitalize" style={{ color: 'var(--text-dark)' }}>
                                        {act.name?.trim() || actKey.replace(/_/g, ' ').replace(/^comp-\d+$/i, 'Actividad')}
                                      </p>
                                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Peso: {act.weight ?? '—'}</p>
                                    </div>
                                    <p className="text-lg font-extrabold"
                                       style={{ color: gradeColor(act.note ?? null) }}>
                                      {act.note !== undefined ? Number(act.note).toFixed(1) : '—'}
                                    </p>
                                  </div>
                                ))}
                              </>
                            )
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Indicadores de seguimiento */}
                  {(() => {
                    const g = gradesData as BackendGradesRead & { _asistencia?: number|null; _logins?: number|null; _uso_tutorias?: boolean|null }
                    const indicators = [
                      { label: 'Asistencia',   value: g._asistencia   != null ? `${Number(g._asistencia).toFixed(1)} %`  : '—', color: 'var(--green-accent)' },
                      { label: 'Sesiones LMS', value: g._logins       != null ? String(g._logins)                         : '—', color: '#d97706' },
                      { label: 'Tutorías',     value: g._uso_tutorias != null ? (g._uso_tutorias ? '✅ Sí' : '❌ No')     : '—', color: g._uso_tutorias ? '#16a34a' : 'var(--text-muted)' },
                    ]
                    return (
                      <div className="rounded-xl p-3" style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <p className="text-[0.58rem] font-extrabold uppercase tracking-wider mb-2.5"
                           style={{ color: 'var(--text-faint)' }}>Indicadores de seguimiento</p>
                        <div className="grid grid-cols-3 gap-2">
                          {indicators.map(({ label, value, color }) => (
                            <div key={label} className="bg-white rounded-lg p-2.5 text-center"
                                 style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                              <p className="text-[0.58rem] font-bold uppercase tracking-wider mb-1"
                                 style={{ color: 'var(--text-faint)' }}>{label}</p>
                              <p className="text-sm font-extrabold" style={{ color }}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Final grade */}
                  <div
                    className="rounded-xl p-3 flex items-center justify-between"
                    style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <p className="font-bold text-[0.92rem]" style={{ color: 'var(--text-dark)' }}>Nota definitiva</p>
                    <p className="text-xl font-extrabold"
                       style={{ color: gradeColor(gradesData.final_grade) }}>
                      {gradesData.final_grade != null ? Number(gradesData.final_grade).toFixed(1) : '—'}
                      <span className="text-xs font-medium ml-1" style={{ color: 'var(--text-faint)' }}>/ 5.00</span>
                    </p>
                  </div>

                  {/* ¿Cuánto necesito sacar? */}
                  <GradoNecesario
                    c1={gradesData.first_cohort_grade  != null ? Number(gradesData.first_cohort_grade)  : null}
                    c2={gradesData.second_cohort_grade != null ? Number(gradesData.second_cohort_grade) : null}
                    c3={gradesData.third_cohort_grade  != null ? Number(gradesData.third_cohort_grade)  : null}
                  />

                  {(totalRiskError || cohortRiskError || totalRisk || (selectedCohort ? cohortRisks[selectedCohort] : null)) && (
                    <div
                      className="rounded-xl p-3 space-y-2"
                      style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)' }}
                    >
                      <p className="font-bold text-sm" style={{ color: 'var(--text-dark)' }}>
                        Resultado de riesgo
                      </p>

                      <div className="grid md:grid-cols-2 gap-2">
                        <div className="rounded-lg p-2.5" style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                              Riesgo total del curso
                            </span>
                            {totalRisk && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold"
                                style={{ background: riskMeta(totalRisk.nivel_riesgo).bg, color: riskMeta(totalRisk.nivel_riesgo).text }}
                              >
                                {riskMeta(totalRisk.nivel_riesgo).label}
                              </span>
                            )}
                          </div>

                          {totalRisk ? (
                            <>
                              <p className="text-xl font-extrabold mt-0.5" style={{ color: riskMeta(totalRisk.nivel_riesgo).text }}>
                                {totalRisk.porcentaje_riesgo.toFixed(0)}%
                              </p>
                              <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, totalRisk.porcentaje_riesgo))}%`,
                                    background: riskMeta(totalRisk.nivel_riesgo).bar,
                                  }}
                                />
                              </div>
                            </>
                          ) : (
                            <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
                              Presiona "Calcular total".
                            </p>
                          )}

                          {totalRiskError && (
                            <p className="text-xs font-medium mt-2" style={{ color: '#b91c1c' }}>
                              {totalRiskError}
                            </p>
                          )}
                        </div>

                        {totalRisk?.analisis_ia && (
                          <RiskoAnalysis
                            analisis={totalRisk.analisis_ia}
                            nivel={totalRisk.nivel_riesgo}
                          />
                        )}

                        <div className="rounded-lg p-2.5" style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                              Riesgo del cohorte seleccionado
                            </span>
                            <span className="text-xs font-bold" style={{ color: 'var(--text-subtle)' }}>
                              {selectedCohort ? cohortLabel(selectedCohort) : 'Selecciona un cohorte'}
                            </span>
                          </div>

                          {selectedCohort && cohortRisks[selectedCohort] ? (
                            <>
                              <p className="text-xl font-extrabold mt-0.5" style={{ color: riskMeta(cohortRisks[selectedCohort]!.nivel_riesgo).text }}>
                                {cohortRisks[selectedCohort]!.porcentaje_riesgo.toFixed(0)}%
                              </p>
                              <p className="text-xs font-semibold mt-1" style={{ color: riskMeta(cohortRisks[selectedCohort]!.nivel_riesgo).text }}>
                                {riskMeta(cohortRisks[selectedCohort]!.nivel_riesgo).label}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
                              Selecciona un corte y presiona "Calcular {selectedCohort ? cohortLabel(selectedCohort) : 'cohorte'}".
                            </p>
                          )}

                          {cohortRiskError && (
                            <p className="text-xs font-medium mt-2" style={{ color: '#b91c1c' }}>
                              {cohortRiskError}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 rounded-xl"
                     style={{ background: 'var(--canvas-warm)', border: '1.5px dashed rgba(0,0,0,0.10)' }}>
                  <Award size={28} className="mb-3" style={{ color: 'var(--text-faint)' }} />
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-subtle)' }}>
                    Las calificaciones las registra tu docente
                  </p>
                  <p className="text-xs mt-1 max-w-xs text-center" style={{ color: 'var(--text-faint)' }}>
                    Aparecerán aquí una vez que el profesor las ingrese en el sistema.
                  </p>
                </div>
              )}
            </motion.div>
            </>
            )}
            </div>
          </div>
        )}
      </main>

    </div>
  )
}
