/**
 * Dashboard — Professor home. Starbucks-inspired design.
 * Keeps all logic: program gallery → course drill-down, stats, tour.
 */
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Users, BookOpen, ArrowLeft, Layers, ArrowRight, Upload } from 'lucide-react'
import type { Step } from 'react-joyride'
import type { Course, Grade } from '../types'
import { students } from '../data/mockData'
import { useGradeCalculation } from '../hooks/useGradeCalculation'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import SubjectCard from '../components/SubjectCard'
import TourGuide from '../components/TourGuide'
import { useTour } from '../hooks/useTour'
import DocumentUploadModal from '../components/DocumentUploadModal'

interface Props {
  courses:        Course[]
  grades:         Grade[]
  onSelectCourse: (c: Course) => void
  onLogout:       () => void
}

const TOUR_STEPS: Step[] = [
  {
    target:    '#tour-prof-nav',
    title:     '🧭 Navegación del docente',
    content:   'Accede al Dashboard con el resumen de tus cursos, o al portal de Calificaciones para gestionar las notas de cada estudiante.',
    placement: 'bottom',
  },
  {
    target:    '#tour-stats',
    title:     '📈 Resumen del período',
    content:   'Aquí ves de un vistazo cuántas materias tienes asignadas, el total de estudiantes y el corte académico activo.',
    placement: 'bottom',
  },
  {
    target:    '#tour-programs',
    title:     '📚 Tus programas',
    content:   'Haz clic en cualquier programa para ver sus materias. Desde ahí podrás ingresar calificaciones y ver el indicador de riesgo de cada estudiante.',
    placement: 'top',
  },
]

// ── Course row ────────────────────────────────────────────────────────────────

function CourseRow({ course, grades, onClick, onUpload, index }: {
  course: Course; grades: Grade[]; onClick: () => void; onUpload: () => void; index: number
}) {
  const { atRiskCount, completionPct } = useGradeCalculation(course, grades, students)
  return (
    <div className="flex flex-col gap-1.5">
      <SubjectCard
        course={course}
        studentCount={course.studentIds.length}
        completionPct={completionPct}
        atRiskCount={atRiskCount}
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

export default function Dashboard({ courses, grades, onSelectCourse }: Props) {
  const { user }            = useAuth()
  const { run, onTourEnd }  = useTour('professor-dashboard', user?.id)
  const totalStudents       = new Set(courses.flatMap(c => c.studentIds)).size
  const [uploadCourse, setUploadCourse] = useState<Course | null>(null)

  const isEmail      = user?.name.includes('@')
  const displayName  = isEmail ? user?.name.split('@')[0] : user?.name.split(' ')[0]

  const coursesByProgram = courses.reduce<Record<string, Course[]>>((acc, course) => {
    const prog = course.program || 'Otras materias'
    if (!acc[prog]) acc[prog] = []
    acc[prog].push(course)
    return acc
  }, {})

  const programs = Object.keys(coursesByProgram)
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null)

  useEffect(() => {
    if (selectedProgram && !programs.includes(selectedProgram)) setSelectedProgram(null)
  }, [programs, selectedProgram])

  const visibleCourses = selectedProgram ? (coursesByProgram[selectedProgram] || []) : []

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-warm)' }}>
      <TourGuide run={run} steps={TOUR_STEPS} onEnd={onTourEnd} />
      <Header />

      {/* ── Period ribbon ── */}
      <div
        className="border-b px-5 py-2.5 flex items-center justify-between"
        style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.08)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[0.67rem] font-extrabold uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>
            Período 2024-I
          </span>
          <span style={{ color: 'rgba(0,0,0,0.15)' }}>·</span>
          <span className="text-[0.67rem] font-extrabold uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>
            Semestre Activo
          </span>
        </div>
        <div className="flex items-center gap-5">
          {[
            { label: 'Corte 1', pct: '40%', active: true  },
            { label: 'Corte 2', pct: '30%', active: false },
            { label: 'Corte 3', pct: '30%', active: false },
          ].map(c => (
            <div
              key={c.label}
              className="flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: c.active ? 'var(--green-accent)' : 'var(--text-faint)' }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: c.active ? 'var(--green-accent)' : 'rgba(0,0,0,0.18)' }}
              />
              {c.label} · {c.pct}
            </div>
          ))}
        </div>
      </div>

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
            Buenos días, {displayName} 👋
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Docente · Academic Risk
          </p>
        </motion.div>

        {/* Stats row */}
        <div id="tour-stats" className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: BookOpen,   label: 'Materias',     value: courses.length,                  iconBg: 'rgba(0,117,74,0.09)', iconColor: 'var(--green-accent)' },
            { icon: Users,      label: 'Estudiantes',  value: totalStudents,                   iconBg: 'rgba(0,98,65,0.07)',  iconColor: 'var(--green-brand)'  },
            { icon: TrendingUp, label: 'Corte activo', value: 'Corte 1 · 40%',                iconBg: 'var(--gold-lightest)',iconColor: 'var(--gold)'          },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white rounded-2xl p-4 flex items-center gap-3"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: stat.iconBg }}
              >
                <stat.icon size={18} style={{ color: stat.iconColor }} />
              </div>
              <div>
                <p
                  className="text-[0.67rem] font-extrabold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--text-faint)' }}
                >
                  {stat.label}
                </p>
                <p className="text-lg font-extrabold leading-tight" style={{ color: 'var(--text-dark)' }}>
                  {stat.value}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Main content */}
        {programs.length === 0 ? (
          /* Empty state */
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
              Tus áreas y materias aparecerán aquí automáticamente una vez que seas asignado
              a uno o más cursos en el período académico actual.
            </p>
          </div>

        ) : !selectedProgram ? (
          /* Programs gallery */
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-5 flex items-center justify-between">
              <p
                className="text-xs font-extrabold uppercase tracking-[0.14em]"
                style={{ color: 'var(--text-faint)' }}
              >
                Tus Programas
              </p>
              <span className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
                {programs.length} programa{programs.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div id="tour-programs" className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {programs.map((prog, i) => (
                <motion.button
                  key={prog}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ y: -3 }}
                  onClick={() => setSelectedProgram(prog)}
                  className="bg-white rounded-2xl p-6 text-left transition-all duration-200 group flex flex-col h-full no-tap"
                  style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.06)' }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                    style={{ background: 'rgba(0,117,74,0.09)' }}
                  >
                    <Layers size={21} style={{ color: 'var(--green-accent)' }} />
                  </div>
                  <h4
                    className="font-extrabold text-lg leading-tight mb-2 transition-colors group-hover:text-green-accent"
                    style={{ color: 'var(--text-dark)', letterSpacing: '-0.01em' }}
                  >
                    {prog}
                  </h4>
                  <div className="mt-auto flex items-center justify-between">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                      {coursesByProgram[prog].length} materia{coursesByProgram[prog].length !== 1 ? 's' : ''}
                    </p>
                    <ArrowRight
                      size={15}
                      className="transition-transform group-hover:translate-x-1"
                      style={{ color: 'var(--green-accent)' }}
                    />
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

        ) : (
          /* Course drill-down */
          <motion.div initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}>
            {/* Back */}
            <button
              onClick={() => setSelectedProgram(null)}
              className="flex items-center gap-2 text-sm font-bold mb-6 group no-tap transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <div
                className="p-1.5 rounded-full bg-white transition-all"
                style={{ border: '1px solid rgba(0,0,0,0.10)', boxShadow: 'var(--shadow-card)' }}
              >
                <ArrowLeft size={15} style={{ color: 'var(--text-muted)' }} />
              </div>
              Volver a programas
            </button>

            {/* Breadcrumb + count */}
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p
                  className="text-xs font-extrabold uppercase tracking-[0.14em] mb-0.5"
                  style={{ color: 'var(--green-accent)' }}
                >
                  Materias del programa
                </p>
                <h2
                  className="text-xl font-extrabold"
                  style={{ color: 'var(--text-dark)', letterSpacing: '-0.01em' }}
                >
                  {selectedProgram}
                </h2>
              </div>
              <span
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white"
                style={{ color: 'var(--text-faint)', border: '1px solid rgba(0,0,0,0.08)' }}
              >
                {visibleCourses.length} curso{visibleCourses.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div id="tour-courses" className="grid gap-3 sm:grid-cols-2">
              {visibleCourses.map((course, i) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  grades={grades}
                  onClick={() => onSelectCourse(course)}
                  onUpload={() => setUploadCourse(course)}
                  index={i}
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
