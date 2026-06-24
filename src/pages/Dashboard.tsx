/**
 * Dashboard — home del docente.
 * Carga los cursos del profesor desde la API y los muestra como tarjetas.
 * Al hacer clic en una tarjeta navega a /grades/:courseId.
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Upload, Search, X, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import type { Step } from 'react-joyride'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import SubjectCard from '../components/SubjectCard'
import TourGuide from '../components/TourGuide'
import { useTour } from '../hooks/useTour'
import DocumentUploadModal from '../components/DocumentUploadModal'
import { courseService, type BackendCourse } from '../services/courseService'

const TOUR_STEPS: Step[] = [
  {
    target: '#tour-dashboard-greeting',
    title: '👋 Tu panel de docente',
    content: 'Aquí verás todas las materias que tienes asignadas en el período activo.',
    placement: 'bottom',
  },
  {
    target: '#tour-dashboard-courses',
    title: '📚 Tus materias',
    content: 'Haz clic en cualquier tarjeta para abrir el libro de notas, registrar asistencia y ver el riesgo de cada estudiante.',
    placement: 'top',
  },
  {
    target: '#tour-header-help',
    title: '❓ ¿Necesitas ayuda?',
    content: 'Puedes repetir este recorrido en cualquier momento desde el botón "?" del encabezado.',
    placement: 'bottom',
  },
]

const PAGE_SIZE = 15

type SortMode = 'default' | 'alpha' | 'students'

// ── Course card ───────────────────────────────────────────────────────────────

interface CourseCardProps {
  course:      BackendCourse
  index:       number
  onClick:     () => void
  onUpload:    () => void
  studentCount: number
}

function CourseCard({ course, index, onClick, onUpload, studentCount }: CourseCardProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <SubjectCard
        course={{ code: course.code, name: course.name, group: course.section ?? '', period: course.academic_period, components: [] }}
        studentCount={studentCount}
        completionPct={0}
        atRiskCount={0}
        onClick={onClick}
        index={index}
      />
      <button
        onClick={onUpload}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors"
        style={{
          background: 'rgba(0,117,74,0.07)',
          color: 'var(--green-accent)',
          border: '1px solid rgba(0,117,74,0.15)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,117,74,0.14)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,117,74,0.07)')}
      >
        <Upload size={12} />
        Subir guía de materia
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user }           = useAuth()
  const navigate           = useNavigate()
  const { run, onTourEnd } = useTour('professor-dashboard', user?.id)

  const [courses, setCourses]             = useState<BackendCourse[]>([])
  const [loading, setLoading]             = useState(false)
  const [total, setTotal]                 = useState(0)
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({})
  const [uploadCourse, setUploadCourse]   = useState<BackendCourse | null>(null)

  const [search, setSearch]             = useState('')   // valor del input (no dispara fetch)
  const [committedSearch, setCommitted] = useState('')   // lo que se envió al back (Enter / X)
  const [sort, setSort]                 = useState<SortMode>('default')
  const [page, setPage]                 = useState(1)

  const professorId = user?.professorId ?? (user?.role === 'professor' ? user?.id : undefined)

  const commitSearch = (value: string) => {
    setSearch(value)
    setCommitted(value)
    setPage(1)
  }

  // Fetch cuando cambia página, búsqueda confirmada o profesor
  useEffect(() => {
    if (!professorId) return
    let cancelled = false
    setLoading(true)
    const skip = (page - 1) * PAGE_SIZE
    courseService.listByProfessorPaginated(professorId, skip, PAGE_SIZE, committedSearch)
      .then(({ courses: data, total: t }) => {
        if (cancelled) return
        setCourses(data)
        setTotal(t)
      })
      .catch(() => { if (!cancelled) setCourses([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [professorId, page, committedSearch])

  // Fetch student counts once via summary endpoint (1 call for all courses)
  useEffect(() => {
    if (!professorId) return
    courseService.getProfessorCoursesSummary(professorId)
      .then(setStudentCounts)
      .catch(() => {})
  }, [professorId])

  // Reset page when sort changes
  useEffect(() => { setPage(1) }, [sort])

  // Client-side sort only (search is now server-side)
  const filteredAndSorted = useMemo(() => {
    const result = [...courses]
    if (sort === 'alpha') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    } else if (sort === 'students') {
      result.sort((a, b) => (studentCounts[b.id] ?? 0) - (studentCounts[a.id] ?? 0))
    }
    return result
  }, [courses, sort, studentCounts])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const isEmail     = user?.name.includes('@')
  const displayName = isEmail ? user?.name.split('@')[0] : user?.name.split(' ')[0]

  const now      = new Date()
  const hour     = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  const SortButton = ({ mode, label }: { mode: SortMode; label: string }) => (
    <button
      onClick={() => setSort(prev => prev === mode ? 'default' : mode)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
      style={sort === mode
        ? { background: 'var(--green-accent)', color: 'white' }
        : { background: 'rgba(0,117,74,0.07)', color: 'var(--green-accent)', border: '1px solid rgba(0,117,74,0.15)' }
      }
    >
      <ArrowUpDown size={11} />
      {label}
    </button>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-warm)' }}>
      <Header />

      <main className="flex-1 px-5 py-8 max-w-5xl mx-auto w-full">

        {/* Welcome */}
        <motion.div
          id="tour-dashboard-greeting"
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

        {/* Toolbar — siempre visible una vez que hay datos o búsqueda activa */}
        {(courses.length > 0 || committedSearch) && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-faint)' }}
              />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitSearch(search) }}
                placeholder="Buscar por nombre o código… (Enter para buscar)"
                className="w-full pl-9 pr-9 py-2 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'white', border: '1px solid rgba(0,0,0,0.09)', color: 'var(--text-dark)' }}
                onFocus={e => (e.currentTarget.style.border = '1px solid rgba(0,117,74,0.40)')}
                onBlur={e  => (e.currentTarget.style.border = '1px solid rgba(0,0,0,0.09)')}
              />
              {search && (
                <button
                  onClick={() => commitSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-faint)' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <SortButton mode="alpha"    label="A → Z" />
              <SortButton mode="students" label="Más estudiantes" />
            </div>
            <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
              {total} materia{total !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Spinner — carga inicial o cambio de página/búsqueda */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-10 h-10 rounded-full border-4 animate-spin"
              style={{ borderColor: 'var(--green-light)', borderTopColor: 'var(--green-accent)' }}
            />
          </div>
        )}

        {/* Sin cursos asignados (nunca ha tenido, no hay búsqueda activa) */}
        {!loading && courses.length === 0 && !committedSearch && (
          <div className="p-12 bg-white rounded-2xl border-2 border-dashed text-center" style={{ borderColor: 'rgba(0,0,0,0.10)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                 style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.08)' }}>
              <BookOpen size={24} style={{ color: 'var(--text-faint)' }} />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--text-dark)' }}>Aún no tienes materias asignadas</h3>
            <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
              Tus materias aparecerán aquí automáticamente una vez que seas asignado a cursos en el período académico activo.
            </p>
          </div>
        )}

        {/* Sin resultados para la búsqueda */}
        {!loading && courses.length === 0 && committedSearch && (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-faint)' }}>
              No se encontraron materias para «{committedSearch}»
            </p>
            <button
              onClick={() => commitSearch('')}
              className="mt-3 text-xs font-bold hover:underline"
              style={{ color: 'var(--green-accent)' }}
            >
              Limpiar búsqueda
            </button>
          </div>
        )}

        {/* Course grid */}
        {!loading && courses.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

            {/* Grid */}
            {filteredAndSorted.length > 0 && (
              <>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${search}-${sort}-${page}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    id="tour-dashboard-courses"
                    className="grid gap-4 sm:grid-cols-2 md:grid-cols-3"
                  >
                    {filteredAndSorted.map((course, i) => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        index={i}
                        onClick={() => navigate(`/grades/${course.id}`)}
                        onUpload={() => setUploadCourse(course)}
                        studentCount={studentCounts[course.id] ?? 0}
                      />
                    ))}
                  </motion.div>
                </AnimatePresence>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                      style={{ background: 'white', border: '1px solid rgba(0,0,0,0.09)' }}
                    >
                      <ChevronLeft size={15} style={{ color: 'var(--text-dark)' }} />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                      .reduce<(number | '…')[]>((acc, n, idx, arr) => {
                        if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push('…')
                        acc.push(n)
                        return acc
                      }, [])
                      .map((item, idx) =>
                        item === '…' ? (
                          <span key={`dots-${idx}`} className="text-xs px-1" style={{ color: 'var(--text-faint)' }}>…</span>
                        ) : (
                          <button
                            key={item}
                            onClick={() => setPage(item as number)}
                            className="w-8 h-8 rounded-xl text-xs font-bold transition-all"
                            style={page === item
                              ? { background: 'var(--green-accent)', color: 'white' }
                              : { background: 'white', border: '1px solid rgba(0,0,0,0.09)', color: 'var(--text-dark)' }
                            }
                          >
                            {item}
                          </button>
                        )
                      )
                    }

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                      style={{ background: 'white', border: '1px solid rgba(0,0,0,0.09)' }}
                    >
                      <ChevronRight size={15} style={{ color: 'var(--text-dark)' }} />
                    </button>

                    <span className="text-xs ml-2" style={{ color: 'var(--text-faint)' }}>
                      Página {page} de {totalPages}
                    </span>
                  </div>
                )}
              </>
            )}

          </motion.div>
        )}

      </main>

      <DocumentUploadModal
        open={uploadCourse !== null}
        courseId={uploadCourse?.id ?? ''}
        courseName={uploadCourse?.name ?? ''}
        onClose={() => setUploadCourse(null)}
      />

      <TourGuide run={run} steps={TOUR_STEPS} onEnd={onTourEnd} />
    </div>
  )
}
