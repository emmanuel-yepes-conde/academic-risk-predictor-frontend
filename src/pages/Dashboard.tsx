/**
 * Dashboard — home del docente.
 * Carga los cursos del profesor desde la API y los muestra como tarjetas.
 * Al hacer clic en una tarjeta navega a /grades/:courseId.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import SubjectCard from '../components/SubjectCard'
import { useTour } from '../hooks/useTour'
import DocumentUploadModal from '../components/DocumentUploadModal'
import { courseService, type BackendCourse } from '../services/courseService'
import { enrollmentService, type BackendEnrollment } from '../services/enrollmentService'

// ── risk helpers ──────────────────────────────────────────────────────────────
// Risk per-enrollment is computed server-side; here we just aggregate counts.
function computeRisk(_e: BackendEnrollment): 'alto' | 'medio' | 'bajo' | null {
  return null
}

// ── Course card ───────────────────────────────────────────────────────────────

interface CourseCardProps {
  course:      BackendCourse
  index:       number
  onClick:     () => void
}

function CourseCard({ course, index, onClick }: CourseCardProps) {
  const [enrollments, setEnrollments] = useState<BackendEnrollment[]>([])
  const [loading,     setLoading]     = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.professorId) return
    courseService.listCourseStudents(course.id, user.professorId)
      .then(students => {
        // load enrollment data for each student to compute risk
        return Promise.allSettled(
          students.map(s => enrollmentService.listByStudent(s.id))
        ).then(results =>
          results.flatMap(r =>
            r.status === 'fulfilled'
              ? r.value.filter(e => e.course_id === course.id)
              : []
          )
        )
      })
      .then(setEnrollments)
      .catch(() => setEnrollments([]))
      .finally(() => setLoading(false))
  }, [course.id, user?.professorId])

  const total    = enrollments.length
  const atRisk   = enrollments.filter(e => computeRisk(e) === 'alto').length
  const withData = enrollments.filter(e => e.status === 'ACTIVE').length
  const pct = total > 0 ? Math.round((withData / total) * 100) : 0

  return (
    <SubjectCard
      course={{ code: course.code, name: course.name, group: course.section ?? '', components: [] }}
      studentCount={total}
      completionPct={pct}
      atRiskCount={atRisk}
      onClick={onClick}
      index={index}
    />
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user }            = useAuth()
  const navigate            = useNavigate()
  const { run, onTourEnd }  = useTour('professor-dashboard', user?.id)
  const [courses, setCourses] = useState<BackendCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [uploadCourse, setUploadCourse] = useState<BackendCourse | null>(null)

  const isEmail     = user?.name.includes('@')
  const displayName = isEmail ? user?.name.split('@')[0] : user?.name.split(' ')[0]

  const load = useCallback(async () => {
    if (!user?.professorId) return
    setLoading(true)
    setError(null)
    try {
      const list = await courseService.listByProfessor(user.professorId)
      setCourses(list)
    } catch {
      setError('No se pudieron cargar las materias. Verifica tu conexión.')
    } finally {
      setLoading(false)
    }
  }, [user?.professorId])

  useEffect(() => { void load() }, [load])

  const now  = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-warm)' }}>
      <Header />

      <main className="flex-1 px-5 py-8 max-w-5xl mx-auto w-full">

        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2
            className="font-extrabold capitalize"
            style={{ fontSize: '1.6rem', color: 'var(--text-dark)', letterSpacing: '-0.02em' }}
          >
            {greeting}, {displayName} 👋
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Docente · Academic Risk — aquí están tus materias del período activo.
          </p>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-10 h-10 rounded-full border-4 animate-spin"
              style={{ borderColor: 'var(--green-light)', borderTopColor: 'var(--green-accent)' }}
            />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="p-6 bg-white rounded-2xl border border-red-200 text-center">
            <p className="text-sm text-red-600 font-semibold mb-3">{error}</p>
            <button
              onClick={load}
              className="flex items-center gap-2 text-sm font-bold mx-auto px-4 py-2 rounded-xl text-white"
              style={{ background: 'var(--green-accent)' }}
            >
              <RefreshCw size={13} />
              Reintentar
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && courses.length === 0 && (
          <div
            className="p-12 bg-white rounded-2xl border-2 border-dashed text-center"
            style={{ borderColor: 'rgba(0,0,0,0.10)' }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.08)' }}
            >
              <BookOpen size={24} style={{ color: 'var(--text-faint)' }} />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--text-dark)' }}>
              Aún no tienes materias asignadas
            </h3>
            <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
              Tus materias aparecerán aquí automáticamente una vez que seas asignado
              a cursos en el período académico activo.
            </p>
          </div>
        )}

        {/* Course grid */}
        {!loading && !error && courses.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-5">
              <p
                className="text-xs font-extrabold uppercase tracking-[0.14em]"
                style={{ color: 'var(--text-faint)' }}
              >
                Tus Materias
              </p>
              <span className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
                {courses.length} materia{courses.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {courses.map((course, i) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  index={i}
                  onClick={() => navigate(`/grades/${course.id}`)}
                />
              ))}
            </div>
          </motion.div>
        )}

      </main>

      <DocumentUploadModal
        open={uploadCourse !== null}
        courseId={uploadCourse?.id ?? ''}
        courseName={uploadCourse?.name ?? ''}
        onClose={() => setUploadCourse(null)}
      />
    </div>
  )
}
