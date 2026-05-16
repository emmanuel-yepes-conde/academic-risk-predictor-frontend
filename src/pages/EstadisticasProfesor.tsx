/**
 * EstadisticasProfesor — Professor view showing student counts
 * per course and per program.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Users, BookOpen, Layers, Loader2, AlertCircle,
  BarChart2, Hash, Calendar, TrendingUp, Upload,
} from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { courseService, type BackendCourse } from '../services/courseService'
import { programService } from '../services/programService'
import type { BackendUser } from '../services/authService'
import DocumentUploadModal from '../components/DocumentUploadModal'

// ─── Enriched course with student list ────────────────────────────────────────
interface CourseWithStudents {
  course:      BackendCourse
  students:    BackendUser[]
  programName: string
}

// ─── Program group ────────────────────────────────────────────────────────────
interface ProgramStats {
  programId:       string
  programName:     string
  courses:         CourseWithStudents[]
  totalStudents:   number
  uniqueStudents:  number
}

export default function EstadisticasProfesor() {
  const { user } = useAuth()
  const professorId = user?.professorId ?? ''

  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [coursesData, setCoursesData]   = useState<CourseWithStudents[]>([])
  const [programStats, setProgramStats] = useState<ProgramStats[]>([])
  const [totalUnique, setTotalUnique]   = useState(0)
  const [uploadCourse, setUploadCourse] = useState<BackendCourse | null>(null)

  const fetchData = useCallback(async () => {
    if (!professorId) return
    setLoading(true)
    setError(null)
    try {
      // 1. Get professor's courses
      const courses = await courseService.listByProfessor(professorId)

      // 2. Resolve program names
      const programIds = [...new Set(courses.map(c => c.program_id).filter(Boolean))]
      const programNames: Record<string, string> = {}
      const nameResults = await Promise.allSettled(
        programIds.map(async (pid) => {
          const prog = await programService.getProgram(pid)
          return { pid, name: prog.program_name }
        }),
      )
      for (const r of nameResults) {
        if (r.status === 'fulfilled') {
          programNames[r.value.pid] = r.value.name
        } else {
          console.warn('[EstadisticasProfesor] Failed to resolve program name:', r.reason)
        }
      }

      // 3. For each course, get enrolled students
      const enriched: CourseWithStudents[] = await Promise.all(
        courses.map(async (course) => {
          try {
            const students = await courseService.listCourseStudents(course.id, professorId)
            return { course, students, programName: programNames[course.program_id] ?? course.program_id }
          } catch {
            return { course, students: [], programName: programNames[course.program_id] ?? course.program_id }
          }
        }),
      )

      setCoursesData(enriched)

      // 4. Calculate global unique students
      const allStudentIds = new Set(enriched.flatMap(c => c.students.map(s => s.id)))
      setTotalUnique(allStudentIds.size)

      // 5. Group by program_id
      const byProgram = enriched.reduce((acc, cws) => {
        const pid = cws.course.program_id ?? 'sin-programa'
        if (!acc[pid]) acc[pid] = []
        acc[pid].push(cws)
      return acc
      }, {} as Record<string, CourseWithStudents[]>)

      const stats: ProgramStats[] = Object.entries(byProgram).map(
        ([programId, courses]) => {
          const uniqueIds = new Set(courses.flatMap(c => c.students.map(s => s.id)))
          return {
            programId,
            programName: programNames[programId] ?? programId,
            courses,
            totalStudents: courses.reduce((sum, c) => sum + c.students.length, 0),
            uniqueStudents: uniqueIds.size,
          }
        },
      )

      setProgramStats(stats)
    } catch (err) {
      console.error('[EstadisticasProfesor] Error:', err)
      setError('No se pudieron cargar las estadísticas. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [professorId])

  useEffect(() => { void fetchData() }, [fetchData])

  return (
    <div className="min-h-screen bg-usb-canvas flex flex-col">
      <Header />

      {/* Page header */}
      <div className="border-b border-white/10 px-5 py-5" style={{ background: 'var(--green-deep)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 size={18} style={{ color: 'var(--green-light)' }} />
            <h1 className="text-white font-extrabold text-xl">Estadísticas</h1>
          </div>
          <p className="text-white/50 text-sm">
            Relación de estudiantes por materia y programa
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-5 py-8">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin mb-4" style={{ color: 'var(--green-accent)' }} />
            <p className="text-usb-muted text-sm font-medium">Cargando estadísticas…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center">
            <AlertCircle size={32} className="text-rose-400 mx-auto mb-3" />
            <p className="font-bold text-usb-text mb-2">{error}</p>
            <button
              onClick={fetchData}
              className="text-sm font-bold hover:underline" style={{ color: 'var(--green-accent)' }}
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Global stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { icon: BookOpen,   label: 'Materias',            value: coursesData.length,  iconColor: 'var(--green-accent)', iconBg: 'rgba(0,117,74,0.09)' },
                { icon: Users,      label: 'Estudiantes (total)', value: totalUnique,         iconColor: 'var(--green-brand)',  iconBg: 'rgba(0,98,65,0.07)'  },
                { icon: Layers,     label: 'Programas',           value: programStats.length, iconColor: 'var(--gold)',         iconBg: 'var(--gold-lightest)' },
                { icon: TrendingUp, label: 'Prom. por materia',   value: coursesData.length > 0 ? Math.round(coursesData.reduce((s, c) => s + c.students.length, 0) / coursesData.length) : 0, iconColor: 'var(--green-accent)', iconBg: 'rgba(0,117,74,0.09)' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-white rounded-2xl p-4 shadow-card border border-usb-border flex items-center gap-3"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: stat.iconBg }}
                  >
                    <stat.icon size={18} style={{ color: stat.iconColor }} />
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">{stat.label}</p>
                    <p className="text-lg font-extrabold text-usb-text leading-tight">{stat.value}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Per-program breakdown */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-usb-muted mb-4">
                Estudiantes por programa
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {programStats.map((ps, i) => {
                  const maxStudents = Math.max(...programStats.map(p => p.uniqueStudents), 1)
                  const barPct = Math.round((ps.uniqueStudents / maxStudents) * 100)
                  return (
                    <motion.div
                      key={ps.programId}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white rounded-2xl p-5 border border-usb-border shadow-card"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,117,74,0.09)' }}>
                          <Layers size={18} style={{ color: 'var(--green-accent)' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-usb-text text-sm truncate">
                            {ps.programName}
                          </h4>
                        </div>
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-xs">
                          <span className="text-usb-muted">Estudiantes únicos</span>
                          <span className="font-bold" style={{ color: 'var(--green-accent)' }}>{ps.uniqueStudents}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-usb-muted">Inscripciones totales</span>
                          <span className="font-bold text-usb-text">{ps.totalStudents}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-usb-muted">Materias</span>
                          <span className="font-bold" style={{ color: 'var(--green-brand)' }}>{ps.courses.length}</span>
                        </div>
                      </div>

                      {/* Visual bar */}
                      <div className="h-1.5 bg-usb-border rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barPct}%` }}
                          transition={{ duration: 0.6, delay: i * 0.05 + 0.2 }}
                          className="h-full rounded-full" style={{ background: 'var(--green-accent)' }}
                        />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* Per-course breakdown */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-usb-muted mb-4">
                Estudiantes por materia
              </h3>
              <div className="bg-white rounded-2xl border border-usb-border shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-usb-canvas border-b border-usb-border">
                        <th className="text-left px-5 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Materia
                        </th>
                        <th className="text-center px-4 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Código
                        </th>
                        <th className="text-left px-4 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Programa
                        </th>
                        <th className="text-center px-4 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Créditos
                        </th>
                        <th className="text-center px-4 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Período
                        </th>
                        <th className="text-center px-4 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Estudiantes
                        </th>
                        <th className="px-5 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Distribución
                        </th>
                        <th className="px-5 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Guía
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {coursesData
                        .sort((a, b) => b.students.length - a.students.length)
                        .map((cws, i) => {
                          const maxSt = Math.max(...coursesData.map(c => c.students.length), 1)
                          const pct = Math.round((cws.students.length / maxSt) * 100)
                          return (
                            <motion.tr
                              key={cws.course.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.03 }}
                              className="border-b border-usb-border last:border-0 hover:bg-usb-canvas transition-colors"
                            >
                              <td className="px-5 py-3">
                                <p className="font-semibold text-usb-text">{cws.course.name}</p>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-block text-[0.68rem] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,117,74,0.09)', color: 'var(--green-accent)' }}>
                                  {cws.course.code}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,98,65,0.07)', color: 'var(--green-brand)' }}>
                                  {cws.programName}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-usb-muted">
                                <div className="flex items-center justify-center gap-1">
                                  <Hash size={11} />
                                  {cws.course.credits}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-usb-muted">
                                <div className="flex items-center justify-center gap-1">
                                  <Calendar size={11} />
                                  {cws.course.academic_period}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center gap-1 font-bold" style={{ color: 'var(--green-accent)' }}>
                                  <Users size={13} />
                                  {cws.students.length}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <div className="w-full min-w-[80px]">
                                  <div className="h-1.5 bg-usb-border rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${pct}%` }}
                                      transition={{ duration: 0.5, delay: i * 0.03 + 0.3 }}
                                      className="h-full rounded-full" style={{ background: 'var(--green-accent)' }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <button
                                  onClick={() => setUploadCourse(cws.course)}
                                  className="inline-flex items-center gap-1.5 text-[0.72rem] font-bold px-3 py-1.5 rounded-lg transition-colors"
                                  style={{
                                    background: 'rgba(0,117,74,0.08)',
                                    color: 'var(--green-accent)',
                                    border: '1px solid rgba(0,117,74,0.18)',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,117,74,0.15)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,117,74,0.08)')}
                                >
                                  <Upload size={12} />
                                  Subir PDF
                                </button>
                              </td>
                            </motion.tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>

                {coursesData.length === 0 && (
                  <div className="p-10 text-center">
                    <BookOpen size={24} className="text-usb-faint mx-auto mb-2" />
                    <p className="text-usb-muted text-sm">No tienes materias asignadas</p>
                  </div>
                )}
              </div>
            </div>
          </>
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
