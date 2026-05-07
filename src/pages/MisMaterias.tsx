/**
 * MisMaterias — Student home. Shows profile hero + academic progress.
 *
 * Data flow:
 *  1. GET /students/{id}/enrollments → all statuses
 *  2. GET /courses/{id} for each enrollment → course details
 *  3. GET /programs/{id} → program name
 *  4. GET /programs/{id}/subjects → full pensum
 *  5. GET /students/{id}/profile → semester number
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpen, Loader2, AlertCircle,
  GraduationCap, Hash, TrendingUp,
  Layers, CheckSquare, ShieldAlert, CheckCircle2, BarChart2,
  Award, Clock, BookMarked,
} from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { enrollmentService, type BackendEnrollment } from '../services/enrollmentService'
import { courseService, type BackendCourse } from '../services/courseService'
import { programService, type BackendProgram } from '../services/programService'
import { subjectService, type BackendSubject } from '../services/subjectService'
import { api, ApiError } from '../services/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnrolledCourse {
  course:           BackendCourse
  enrollmentStatus: BackendEnrollment['status']
}

interface ProgramGroup {
  programId:        string
  program:          BackendProgram | null
  activeCourses:    EnrolledCourse[]
  completedCourses: EnrolledCourse[]
  pensumSubjects:   BackendSubject[]
  activeCredits:    number
  completedCredits: number
  totalCredits:     number
}

interface StudentProfile {
  semester:         number | null
  academic_year:    number | null
  enrolled_credits: number | null
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 22 }}
      className="rounded-full flex items-center justify-center font-black select-none flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: 'linear-gradient(135deg, rgba(212,233,226,0.30) 0%, rgba(0,117,74,0.35) 100%)',
        border: '2.5px solid rgba(212,233,226,0.45)',
        color: '#d4e9e2',
        letterSpacing: '-0.02em',
        boxShadow: '0 0 0 4px rgba(212,233,226,0.10)',
      }}
    >
      {initials}
    </motion.div>
  )
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 96 }: { pct: number; size?: number }) {
  const r    = (size - 14) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (pct / 100)

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(212,233,226,0.15)" strokeWidth={7} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--green-light, #d4e9e2)" strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-extrabold leading-none" style={{ color: '#d4e9e2', fontSize: size * 0.22 }}>{pct}%</p>
        <p className="leading-none mt-0.5" style={{ color: 'rgba(212,233,226,0.55)', fontSize: size * 0.10 }}>avance</p>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function MisMaterias() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const studentId = user?.studentId ?? user?.id ?? ''

  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [noAccess, setNoAccess]   = useState(false)
  const [groups, setGroups]       = useState<ProgramGroup[]>([])
  const [profile, setProfile]     = useState<StudentProfile | null>(null)

  const fetchData = useCallback(async () => {
    if (!studentId) {
      setError('No se encontró tu ID de estudiante. Intenta cerrar sesión y volver a ingresar.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setNoAccess(false)

    try {
      // Fetch student profile (for semester number) in parallel with enrollments
      const [enrollmentsResult, profileResult] = await Promise.allSettled([
        enrollmentService.listByStudent(studentId),
        api.get<StudentProfile>(`/students/${studentId}/profile`),
      ])

      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)

      let enrollments: BackendEnrollment[]
      if (enrollmentsResult.status === 'rejected') {
        const err = enrollmentsResult.reason
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          setNoAccess(true)
          setLoading(false)
          return
        }
        throw err
      } else {
        enrollments = enrollmentsResult.value
      }

      const relevant = enrollments.filter(
        e => e.status === 'ACTIVE' || e.status === 'COMPLETED',
      )

      if (relevant.length === 0) {
        setGroups([])
        setLoading(false)
        return
      }

      const settled = await Promise.allSettled(
        relevant.map(async (e) => {
          const course = await courseService.getById(e.course_id)
          return { course, enrollmentStatus: e.status } as EnrolledCourse
        }),
      )
      const allEnrolled = settled
        .filter((r): r is PromiseFulfilledResult<EnrolledCourse> => r.status === 'fulfilled')
        .map(r => r.value)

      const byProgram = allEnrolled.reduce((acc, ec) => {
        const pid = ec.course.program_id ?? 'sin-programa'
        if (!acc[pid]) acc[pid] = []
        acc[pid].push(ec)
        return acc
      }, {} as Record<string, EnrolledCourse[]>)

      const groupPromises = Object.entries(byProgram).map(
        async ([programId, courses]): Promise<ProgramGroup> => {
          let program: BackendProgram | null = null
          let pensumSubjects: BackendSubject[] = []

          if (programId !== 'sin-programa') {
            const [progRes, pensumRes] = await Promise.allSettled([
              programService.getProgram(programId),
              subjectService.listByProgram(programId),
            ])
            if (progRes.status === 'fulfilled') program = progRes.value
            if (pensumRes.status === 'fulfilled') pensumSubjects = pensumRes.value
          }

          const activeCourses    = courses.filter(c => c.enrollmentStatus === 'ACTIVE')
          const completedCourses = courses.filter(c => c.enrollmentStatus === 'COMPLETED')
          const activeCredits    = activeCourses.reduce((s, c) => s + c.course.credits, 0)
          const completedCredits = completedCourses.reduce((s, c) => s + c.course.credits, 0)
          const totalCredits     = pensumSubjects.length > 0
            ? pensumSubjects.reduce((s, subj) => s + subj.credits, 0)
            : activeCredits + completedCredits

          return { programId, program, activeCourses, completedCourses, pensumSubjects, activeCredits, completedCredits, totalCredits }
        },
      )

      const groupSettled = await Promise.allSettled(groupPromises)
      setGroups(
        groupSettled
          .filter((r): r is PromiseFulfilledResult<ProgramGroup> => r.status === 'fulfilled')
          .map(r => r.value),
      )
    } catch (err) {
      console.error('[MisMaterias] Error:', err)
      setError(err instanceof ApiError
        ? `Error del servidor (${err.status}): ${err.message}`
        : 'No se pudieron cargar tus materias. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => { void fetchData() }, [fetchData])

  // ── Derived totals ──────────────────────────────────────────────────────────
  const totalPensumCourses  = groups.reduce((s, g) => s + g.pensumSubjects.length, 0)
  const totalActive         = groups.reduce((s, g) => s + g.activeCourses.length, 0)
  const totalCompleted      = groups.reduce((s, g) => s + g.completedCourses.length, 0)
  const totalActiveCredits  = groups.reduce((s, g) => s + g.activeCredits, 0)
  const totalCompCredits    = groups.reduce((s, g) => s + g.completedCredits, 0)
  const totalCreditsProgram = groups.reduce((s, g) => s + g.totalCredits, 0)
  const totalCreditsRemain  = Math.max(0, totalCreditsProgram - totalActiveCredits - totalCompCredits)

  const mainProgram     = groups[0]?.program
  const advancedCredits = totalActiveCredits + totalCompCredits
  const globalProgressPct = totalCreditsProgram > 0
    ? Math.min(100, Math.round((advancedCredits / totalCreditsProgram) * 100))
    : 0

  const statCards = [
    { icon: Layers,      label: 'Materias del programa', value: totalPensumCourses,  color: 'var(--green-brand)'  },
    { icon: BookOpen,    label: 'Cursando',              value: totalActive,          color: 'var(--green-accent)' },
    { icon: TrendingUp,  label: 'Créditos activos',      value: totalActiveCredits,   color: 'var(--green-brand)'  },
    { icon: CheckSquare, label: 'Créditos aprobados',    value: totalCompCredits,     color: '#16a34a'             },
    { icon: Hash,        label: 'Créditos restantes',    value: totalCreditsRemain,   color: '#b45309'             },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-warm)' }}>
      <Header />

      {/* ── Profile Hero ──────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'var(--green-deep)', borderBottom: '1px solid rgba(0,0,0,0.25)' }}
      >
        {/* Decorative blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-[0.06]"
               style={{ background: 'radial-gradient(circle, #d4e9e2, transparent)' }} />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full opacity-[0.04]"
               style={{ background: 'radial-gradient(circle, #d4e9e2, transparent)' }} />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-5 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

            {/* Left: Avatar + info */}
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <Avatar name={user?.name ?? 'ES'} size={72} />

              <div className="min-w-0 flex-1">
                {/* Name */}
                <motion.h1
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-white font-extrabold text-xl leading-tight truncate"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {user?.name ?? 'Estudiante'}
                </motion.h1>

                {/* Program + degree type */}
                <motion.div
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.22 }}
                  className="flex flex-wrap items-center gap-2 mt-1.5"
                >
                  {!loading && mainProgram ? (
                    <>
                      <span className="flex items-center gap-1.5 text-white/75 text-sm font-semibold">
                        <GraduationCap size={13} className="flex-shrink-0" />
                        <span className="truncate max-w-[240px]">{mainProgram.program_name}</span>
                      </span>
                      {mainProgram.degree_type && (
                        <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(212,233,226,0.12)', color: 'rgba(212,233,226,0.75)' }}>
                          {mainProgram.degree_type}
                        </span>
                      )}
                    </>
                  ) : loading ? (
                    <span className="h-4 w-44 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.10)' }} />
                  ) : (
                    <span className="text-white/40 text-sm">Sin programa asignado</span>
                  )}
                </motion.div>

                {/* Semester chip only */}
                {profile?.semester != null && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.30 }}
                    className="mt-2"
                  >
                    <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold px-2.5 py-1 rounded-full"
                      style={{ background: 'rgba(212,233,226,0.13)', color: 'rgba(212,233,226,0.75)' }}>
                      <BookMarked size={10} />
                      Semestre {profile.semester}
                    </span>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Right: Progress ring only */}
            {!loading && !error && groups.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="flex-shrink-0"
              >
                <ProgressRing pct={globalProgressPct} size={96} />
              </motion.div>
            )}
          </div>

          {/* Progress bar (full width below) */}
          {!loading && !error && !noAccess && groups.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="mt-6"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white/40 text-xs font-medium">
                  {advancedCredits} de {totalCreditsProgram} créditos avanzados
                </span>
                <span className="text-xs font-extrabold" style={{ color: 'var(--green-light)' }}>
                  {totalCreditsRemain} restantes
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${globalProgressPct}%` }}
                  transition={{ duration: 1.1, ease: 'easeOut', delay: 0.5 }}
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, var(--green-light, #d4e9e2) 0%, rgba(212,233,226,0.60) 100%)' }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-white/30 text-[0.65rem] font-medium">
                  {totalActive + totalCompleted} de {totalPensumCourses} materias
                </span>
                <span className="text-white/30 text-[0.65rem] font-medium">
                  {totalCompleted} aprobadas · {totalActive} en curso
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 py-8">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={30} className="animate-spin mb-4" style={{ color: 'var(--green-accent)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Cargando tu progreso…</p>
          </div>
        )}

        {/* No access */}
        {noAccess && (
          <div className="bg-white rounded-2xl border border-amber-200 p-10 text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={24} className="text-amber-500" />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--text-dark)' }}>Acceso pendiente</h3>
            <p className="text-sm max-w-md mx-auto mb-4" style={{ color: 'var(--text-muted)' }}>
              Tu cuenta aún no tiene permisos para consultar tus inscripciones. Contacta al administrador.
            </p>
            <button onClick={fetchData} className="text-sm font-bold hover:underline" style={{ color: 'var(--green-accent)' }}>Reintentar</button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
            <AlertCircle size={30} className="text-rose-400 mx-auto mb-3" />
            <p className="font-bold mb-2" style={{ color: 'var(--text-dark)' }}>{error}</p>
            <button onClick={fetchData} className="text-sm font-bold hover:underline" style={{ color: 'var(--green-accent)' }}>Reintentar</button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && !noAccess && groups.length === 0 && (
          <div className="bg-white rounded-2xl border-2 border-dashed p-12 text-center" style={{ borderColor: 'rgba(0,0,0,0.10)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                 style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.08)' }}>
              <BookOpen size={24} style={{ color: 'var(--text-faint)' }} />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--text-dark)' }}>No tienes materias inscritas</h3>
            <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
              Tus materias aparecerán aquí una vez que estés inscrito en cursos del período académico actual.
            </p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && !noAccess && groups.length > 0 && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
              {statCards.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="bg-white rounded-2xl p-4 flex items-center gap-3"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: `${stat.color}14` }}>
                    <stat.icon size={17} style={{ color: stat.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.60rem] font-extrabold uppercase tracking-wider leading-tight" style={{ color: 'var(--text-faint)' }}>
                      {stat.label}
                    </p>
                    <p className="text-lg font-extrabold leading-tight" style={{ color: 'var(--text-dark)' }}>
                      {stat.value}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Course groups */}
            <div className="space-y-8">
              {groups.map((group, gi) => (
                <motion.div
                  key={group.programId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.1 }}
                >
                  {groups.length > 1 && (
                    <div className="mb-3 flex items-center gap-2">
                      <Layers size={14} style={{ color: 'var(--green-accent)' }} />
                      <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                        {group.program?.program_name ?? 'Programa'}
                      </h3>
                    </div>
                  )}

                  {/* Active */}
                  {group.activeCourses.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <Clock size={12} style={{ color: 'var(--text-faint)' }} />
                        <p className="text-[0.68rem] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                          Cursando actualmente
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 mb-6">
                        {group.activeCourses.map((ec, i) => (
                          <CourseCard key={ec.course.id} ec={ec} index={i} gi={gi} navigate={navigate} />
                        ))}
                      </div>
                    </>
                  )}

                  {/* Completed */}
                  {group.completedCourses.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <Award size={12} style={{ color: '#16a34a' }} />
                        <p className="text-[0.68rem] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                          Materias aprobadas
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.completedCourses.map((ec, i) => (
                          <CourseCard key={ec.course.id} ec={ec} index={i} gi={gi} navigate={navigate} />
                        ))}
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          </>
        )}
      </main>

    </div>
  )
}

// ─── Course card ─────────────────────────────────────────────────────────────

function CourseCard({ ec, index, gi, navigate }: {
  ec: EnrolledCourse; index: number; gi: number
  navigate: ReturnType<typeof useNavigate>
}) {
  const isCompleted = ec.enrollmentStatus === 'COMPLETED'
  const accentColor = isCompleted ? '#16a34a' : 'var(--green-accent)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: gi * 0.1 + index * 0.05 }}
      className="bg-white rounded-2xl p-5 flex flex-col gap-3 no-tap"
      style={{
        boxShadow: 'var(--shadow-card)',
        border: `1px solid ${isCompleted ? 'rgba(22,163,74,0.15)' : 'rgba(0,0,0,0.07)'}`,
      }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className="inline-block text-[0.65rem] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-2"
            style={{ background: isCompleted ? 'rgba(22,163,74,0.09)' : 'rgba(0,117,74,0.09)', color: accentColor }}
          >
            {ec.course.code}
          </span>
          <h3 className="font-bold text-[0.95rem] leading-snug" style={{ color: 'var(--text-dark)' }}>
            {ec.course.name}
          </h3>
        </div>
        {/* Status icon — static, no pulse */}
        <div className="flex-shrink-0 mt-0.5">
          {isCompleted ? (
            <CheckCircle2 size={18} className="text-emerald-500" />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full mt-1.5"
                 style={{ background: 'var(--green-accent)' }} />
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <div className="flex items-center gap-1">
          <Hash size={10} />
          <span>{ec.course.credits} créditos</span>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-1.5">
          {isCompleted ? (
            <span className="text-xs font-semibold text-emerald-600">Aprobada</span>
          ) : (
            <span className="text-xs font-semibold" style={{ color: 'var(--green-accent)' }}>En curso</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Predict button — only for active courses */}
          {!isCompleted && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => navigate(`/prediccion?courseId=${ec.course.id}`)}
              className="flex items-center gap-1.5 text-[0.72rem] font-bold px-2.5 py-1.5 rounded-lg transition-colors"
              style={{
                background: 'rgba(0,117,74,0.08)',
                color: 'var(--green-accent)',
                border: '1px solid rgba(0,117,74,0.15)',
              }}
            >
              <BarChart2 size={11} />
              Predecir riesgo
            </motion.button>
          )}

          {/* Detail button — shows course info and notes, no prediction */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate(`/materia/${ec.course.id}`)}
            className="flex items-center gap-1 text-[0.72rem] font-bold px-2.5 py-1.5 rounded-lg"
            style={{
              background: 'var(--canvas-warm)',
              color: 'var(--text-muted)',
              border: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            Ver notas
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
