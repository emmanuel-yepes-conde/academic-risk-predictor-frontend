import { motion } from 'framer-motion'
import { BookOpen, AlertTriangle, CheckCircle2, Minus } from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { useGrades } from '../context/GradesContext'
import { students } from '../data/mockData'
import { calcWeightedTotal, getRisk, gradeColor } from '../utils/gradeCalculator'

function GradeCell({ value }: { value: number | null }) {
  if (value === null) return (
    <span className="inline-flex items-center justify-center w-14 text-usb-faint font-mono text-xs">
      <Minus size={12} />
    </span>
  )
  return (
    <span className={`inline-block w-14 text-center font-mono font-bold text-sm ${gradeColor(value)}`}>
      {value.toFixed(1)}
    </span>
  )
}

export default function MisNotas() {
  const { user } = useAuth()
  const { courseList, grades } = useGrades()

  const studentId = user?.studentId ?? ''
  const student = students.find(s => s.id === studentId)

  // Courses the student is enrolled in
  const myCourses = courseList.filter(c => c.studentIds.includes(studentId))

  // Build grade map per course
  const getCourseGrades = (course: typeof courseList[0]) => {
    const gradeMap: Record<string, number | null> = {}
    for (const comp of course.components) {
      const g = grades.find(g => g.studentId === studentId && g.componentId === comp.id)
      gradeMap[comp.id] = g?.value ?? null
    }
    return gradeMap
  }

  return (
    <div className="min-h-screen bg-usb-canvas flex flex-col">
      <Header />

      {/* Page header */}
      <div className="bg-ar-navy border-b border-white/10 px-5 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={18} className="text-ar-cyan" />
            <h1 className="text-white font-extrabold text-xl">Mis Notas</h1>
          </div>
          <p className="text-white/50 text-sm">
            {student?.name} · {student?.program} · Semestre {student?.semester} · Corte 1 (40%)
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-8 space-y-6">
        {myCourses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-usb-border p-12 text-center">
            <BookOpen size={32} className="text-usb-faint mx-auto mb-3" />
            <p className="font-bold text-usb-text">No estás inscrito en ninguna materia</p>
          </div>
        ) : (
          myCourses.map((course, idx) => {
            const gradeMap = getCourseGrades(course)
            const total = calcWeightedTotal(gradeMap, course.components)
            const risk = getRisk(total)
            const totalPct = course.components.reduce((s, c) => s + c.percentage, 0)

            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                className="bg-white rounded-2xl border border-usb-border shadow-card overflow-hidden"
              >
                {/* Course header */}
                <div className="px-5 py-4 border-b border-usb-border flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-ar-cyan/10 text-ar-cyan text-[0.65rem] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                        {course.code} · {course.group}
                      </span>
                      <span className="bg-usb-canvas text-usb-muted text-[0.65rem] font-semibold px-2.5 py-1 rounded-full border border-usb-border">
                        2024-I
                      </span>
                    </div>
                    <h2 className="font-extrabold text-usb-text">{course.name}</h2>
                  </div>

                  {/* Total + risk */}
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      {total !== null ? (
                        <>
                          <p className={`text-2xl font-extrabold ${gradeColor(total)}`}>{total.toFixed(2)}</p>
                          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-usb-muted">Promedio {totalPct}%</p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl font-extrabold text-usb-faint">—</p>
                          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-usb-muted">Sin notas</p>
                        </>
                      )}
                    </div>
                    {risk && (
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${
                        risk === 'high' ? 'bg-risk-high-bg border-risk-high/20 text-risk-high'
                        : risk === 'medium' ? 'bg-risk-med-bg border-risk-med/20 text-risk-med'
                        : 'bg-risk-low-bg border-risk-low/20 text-risk-low'
                      }`}>
                        {risk === 'high' ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                        {risk === 'high' ? 'Riesgo alto' : risk === 'medium' ? 'Riesgo medio' : 'En buen estado'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Components table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-usb-canvas border-b border-usb-border">
                        <th className="text-left px-5 py-2.5 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Componente
                        </th>
                        <th className="text-center px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Peso
                        </th>
                        <th className="text-center px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Nota
                        </th>
                        <th className="text-center px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Aporte
                        </th>
                        <th className="px-5 py-2.5 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {course.components.map(comp => {
                        const val = gradeMap[comp.id]
                        const aporte = val !== null ? (val * comp.percentage) / 100 : null
                        const compRisk = val !== null ? (val < 3.0 ? 'high' : val < 3.8 ? 'medium' : 'low') : null
                        return (
                          <tr key={comp.id} className="border-b border-usb-border last:border-0 hover:bg-usb-canvas transition-colors">
                            <td className="px-5 py-3 font-medium text-usb-subtle">{comp.name}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-ar-cyan font-bold text-xs">{comp.percentage}%</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <GradeCell value={val} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              {aporte !== null ? (
                                <span className="font-mono text-xs text-usb-muted">{aporte.toFixed(3)}</span>
                              ) : (
                                <span className="text-usb-faint text-xs">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              {compRisk === null ? (
                                <span className="text-usb-faint text-xs">Sin registrar</span>
                              ) : compRisk === 'high' ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-risk-high">
                                  <AlertTriangle size={11} /> Por debajo del mínimo
                                </span>
                              ) : compRisk === 'medium' ? (
                                <span className="text-xs font-semibold text-risk-med">Puede mejorar</span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs font-semibold text-risk-low">
                                  <CheckCircle2 size={11} /> Aprobado
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-usb-canvas border-t-2 border-usb-border">
                        <td className="px-5 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted" colSpan={2}>
                          Total corte ({totalPct}%)
                        </td>
                        <td />
                        <td className="px-4 py-3 text-center">
                          {total !== null ? (
                            <span className={`font-mono font-extrabold text-sm ${gradeColor(total)}`}>{total.toFixed(2)}</span>
                          ) : (
                            <span className="text-usb-faint text-xs font-mono">—</span>
                          )}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </motion.div>
            )
          })
        )}
      </main>

    </div>
  )
}
