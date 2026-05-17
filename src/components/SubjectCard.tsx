import { motion } from 'framer-motion'
import { Users, BookOpen, ChevronRight, AlertTriangle } from 'lucide-react'
import CircularProgress from './CircularProgress'

interface CourseDisplay {
  code:        string
  name:        string
  group:       string
  components?: { length?: number }[] | null
}

interface Props {
  course: CourseDisplay
  studentCount: number
  completionPct: number
  atRiskCount: number
  onClick: () => void
  index: number
}

export default function SubjectCard({ course, studentCount, completionPct, atRiskCount, onClick, index }: Props) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="w-full bg-white rounded-2xl shadow-card hover:shadow-card-hover border border-usb-border hover:border-ar-cyan/30 transition-all duration-200 text-left group"
    >
      <div className="p-5">
        {/* Top row */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="inline-block bg-ar-cyan/10 text-ar-cyan text-[0.68rem] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2">
              {course.code} · {course.group}
            </span>
            <h3 className="font-bold text-[0.95rem] text-usb-text leading-snug">{course.name}</h3>
          </div>
          <ChevronRight size={16} className="text-usb-faint group-hover:text-ar-cyan transition-colors mt-1 flex-shrink-0 ml-2" />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-usb-muted text-xs">
            <Users size={13} />
            <span>{studentCount} estudiantes</span>
          </div>
          <div className="flex items-center gap-1.5 text-usb-muted text-xs">
            <BookOpen size={13} />
            <span>{course.components?.length ?? 0} componentes</span>
          </div>
          {atRiskCount > 0 && (
            <div className="flex items-center gap-1 text-xs font-medium text-risk-high ml-auto">
              <AlertTriangle size={12} />
              <span>{atRiskCount} en riesgo actual</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-4 pt-4 border-t border-usb-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.68rem] font-semibold text-usb-muted uppercase tracking-wider">Avance Corte 1</span>
            <span className="text-[0.78rem] font-bold text-ar-cyan">{completionPct}%</span>
          </div>
          <div className="h-1.5 bg-usb-border rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionPct}%` }}
              transition={{ duration: 0.6, delay: index * 0.07 + 0.2, ease: 'easeOut' }}
              className="h-full bg-ar-cyan rounded-full"
            />
          </div>
        </div>
      </div>
    </motion.button>
  )
}
