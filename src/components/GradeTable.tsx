import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { enrollmentService } from '../services/enrollmentService'
import { X, Send, History, AlertCircle, CheckCircle2, Clock, ClipboardList } from 'lucide-react'
import type { Course, Grade, GradeComponent, GradeCut, Referral, ReferralType, ReferralAttendance, RiskLevel, Student } from '../types'
import { calcWeightedTotal, gradeColor, getRisk } from '../utils/gradeCalculator'
import { useGradeCalculation } from '../hooks/useGradeCalculation'
import { useAuth } from '../context/AuthContext'
import RiskBadge from './RiskBadge'

// ─── Risk bar ─────────────────────────────────────────────────────────────────

function riskPercent(grade: number | null): number | null {
  if (grade === null) return null
  return Math.max(0, Math.min(100, Math.round((1 - grade / 5) * 100)))
}

function RiskBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-usb-border text-xs font-mono">—</span>
  const color     = pct >= 60 ? 'bg-risk-high' : pct >= 35 ? 'bg-risk-med' : 'bg-risk-low'
  const textColor = pct >= 60 ? 'text-risk-high' : pct >= 35 ? 'text-risk-med' : 'text-risk-low'
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[64px]">
      <span className={`text-[0.75rem] font-extrabold ${textColor}`}>{pct}%</span>
      <div className="w-full h-1.5 bg-usb-canvas rounded-full overflow-hidden border border-usb-border">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  )
}

function blendedRiskPct(
  currentPct: number | null,
  totalPct: number | null,
  coveragePct: number,
): number | null {
  if (currentPct === null && totalPct === null) return null
  if (currentPct === null) return totalPct
  if (totalPct === null) return currentPct

  // En cortes tempranos priorizamos el riesgo actual.
  // A medida que avanza el curso, aumenta gradualmente el peso de la proyección total.
  const progress = Math.max(0, Math.min(1, coveragePct / 100))
  const totalWeight = 0.10 + (0.40 * progress) // 10% → 50%
  const currentWeight = 1 - totalWeight

  return Math.round((currentPct * currentWeight) + (totalPct * totalWeight))
}

function riskLevelFromPct(pct: number | null): RiskLevel {
  if (pct === null) return null
  if (pct >= 60) return 'high'
  if (pct >= 35) return 'medium'
  return 'low'
}

function weightedCoveragePct(
  gradeMap: Record<string, number | null>,
  components: GradeComponent[],
): number {
  const totalWeight = components.reduce((s, c) => s + c.percentage, 0)
  if (totalWeight === 0) return 0
  const coveredWeight = components.reduce((s, c) => {
    const g = gradeMap[c.id]
    return g === null || g === undefined ? s : s + c.percentage
  }, 0)
  return Math.round((coveredWeight / totalWeight) * 100)
}

function weightedProgressGrade(
  gradeMap: Record<string, number | null>,
  components: GradeComponent[],
): number | null {
  let weighted = 0
  let coveredWeight = 0
  components.forEach((c) => {
    const g = gradeMap[c.id]
    if (g === null || g === undefined) return
    weighted += g * c.percentage
    coveredWeight += c.percentage
  })
  if (coveredWeight === 0) return null
  return Math.round((weighted / coveredWeight) * 10) / 10
}

function sanitizeGradeDraft(raw: string): string {
  let clean = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
  const firstDot = clean.indexOf('.')
  if (firstDot !== -1) {
    clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '')
    clean = clean.slice(0, firstDot + 2) // max 1 decimal digit
  }
  return clean
}

function parseGradeDraft(raw: string): number | null {
  if (!raw.trim()) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10))
}

function formatGradeDraft(value: number | null): string {
  if (value === null || value === undefined) return ''
  return value % 1 === 0 ? String(value) : value.toFixed(1)
}

// ─── Referral constants ───────────────────────────────────────────────────────

const REFERRAL_TYPE_LABELS: Record<ReferralType, string> = {
  bajo_rendimiento:   'Bajo rendimiento académico',
  riesgo_desercion:   'Riesgo de deserción',
  inasistencia:       'Inasistencia reiterada',
  problemas_personales: 'Problemas personales',
  otro:               'Otro',
}

const ATTENDANCE_LABELS: Record<ReferralAttendance, string> = {
  si:             'Sí asistió',
  no:             'No asistió',
  sin_confirmar:  'Sin confirmar',
}

const ATTENDANCE_COLORS: Record<ReferralAttendance, string> = {
  si:            'bg-emerald-50 text-emerald-700',
  no:            'bg-rose-50 text-rose-600',
  sin_confirmar: 'bg-amber-50 text-amber-700',
}

// ─── Create referral modal ────────────────────────────────────────────────────

function ReferralModal({
  studentName, courseId, professorId, onClose, onSave,
}: {
  studentName: string
  courseId:    string
  professorId: string
  onClose:     () => void
  onSave:      (r: Omit<Referral, 'id' | 'studentId' | 'createdAt'>) => void
}) {
  const [type,         setType]         = useState<ReferralType>('bajo_rendimiento')
  const [obs,          setObs]          = useState('')
  const [referralObs,  setReferralObs]  = useState('')
  const [date,         setDate]         = useState(() => new Date().toISOString().split('T')[0])
  const [saving,       setSaving]       = useState(false)

  const canSave = obs.trim().length > 0

  const handleSubmit = () => {
    if (!canSave) return
    setSaving(true)
    setTimeout(() => {
      onSave({ type, observations: obs.trim(), referralObservations: referralObs.trim(), date, attended: 'sin_confirmar', courseId, professorId })
      setSaving(false)
      onClose()
    }, 400)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit={{   opacity: 0, y: 20,  scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-modal w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{ background: 'var(--green-deep)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,233,226,0.18)', border: '1px solid rgba(212,233,226,0.30)' }}>
              <Send size={16} style={{ color: 'var(--green-light)' }} />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm leading-tight">Remitir a Permanencia</h2>
              <p className="text-white/50 text-xs">{studentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-usb-muted mb-1.5">
              Tipo de remisión <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={type}
                onChange={e => setType(e.target.value as ReferralType)}
                className="w-full bg-usb-canvas border border-usb-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-accent focus:ring-2 focus:ring-green-accent/20 transition-all appearance-none"
              >
                {(Object.keys(REFERRAL_TYPE_LABELS) as ReferralType[]).map(k => (
                  <option key={k} value={k}>{REFERRAL_TYPE_LABELS[k]}</option>
                ))}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-usb-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-usb-muted mb-1.5">
              Observaciones <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={3}
              placeholder="Describe el motivo de la remisión…"
              className="w-full bg-usb-canvas border border-usb-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-accent focus:ring-2 focus:ring-green-accent/20 transition-all resize-none"
            />
            {obs.trim().length === 0 && (
              <p className="flex items-center gap-1.5 text-rose-500 text-xs mt-1">
                <AlertCircle size={12} /> Campo requerido.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-usb-muted mb-1.5">
              Observaciones de remisión <span className="text-usb-faint font-normal normal-case">(opcional)</span>
            </label>
            <textarea
              value={referralObs}
              onChange={e => setReferralObs(e.target.value)}
              rows={2}
              placeholder="Instrucciones o contexto para el área de permanencia…"
              className="w-full bg-usb-canvas border border-usb-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-accent focus:ring-2 focus:ring-green-accent/20 transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-usb-muted mb-1.5">
              Fecha de remisión
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-usb-canvas border border-usb-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-accent focus:ring-2 focus:ring-green-accent/20 transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-usb-border bg-white flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border border-usb-border text-usb-muted hover:text-usb-text font-semibold text-sm transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={canSave ? handleSubmit : undefined}
            style={{ background: canSave ? '#00754A' : '#d1d5db', cursor: canSave ? 'pointer' : 'not-allowed' }}
            className="flex-1 py-3 rounded-full text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Send size={13} />
            }
            Remitir
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Referral history modal ───────────────────────────────────────────────────

function ReferralHistoryModal({
  studentName, referrals, onClose, onUpdateAttendance,
}: {
  studentName:        string
  referrals:          Referral[]
  onClose:            () => void
  onUpdateAttendance: (id: string, attended: ReferralAttendance) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit={{   opacity: 0, y: 20,  scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-modal w-full max-w-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{ background: 'var(--green-deep)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,233,226,0.18)', border: '1px solid rgba(212,233,226,0.30)' }}>
              <History size={16} style={{ color: 'var(--green-light)' }} />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm leading-tight">Historial de remisiones</h2>
              <p className="text-white/50 text-xs">{studentName} · {referrals.length} remisión{referrals.length !== 1 ? 'es' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-3">
          {referrals.map(r => (
            <div key={r.id} className="bg-usb-canvas rounded-2xl border border-usb-border p-4 space-y-3">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[0.68rem] font-bold" style={{ background: 'rgba(0,117,74,0.1)', color: 'var(--green-accent)' }}>
                    {REFERRAL_TYPE_LABELS[r.type]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-usb-faint text-xs whitespace-nowrap">
                  <Clock size={11} />
                  {new Date(r.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>

              {/* Observations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[0.62rem] font-bold uppercase tracking-wider text-usb-muted mb-0.5">Observaciones</p>
                  <p className="text-sm text-usb-text">{r.observations || '—'}</p>
                </div>
                {r.referralObservations && (
                  <div>
                    <p className="text-[0.62rem] font-bold uppercase tracking-wider text-usb-muted mb-0.5">Obs. de remisión</p>
                    <p className="text-sm text-usb-text">{r.referralObservations}</p>
                  </div>
                )}
              </div>

              {/* Attendance */}
              <div className="flex items-center gap-2 pt-1 border-t border-usb-border">
                <p className="text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">¿Asistió?</p>
                <div className="flex gap-1.5 ml-1">
                  {(['si', 'no', 'sin_confirmar'] as ReferralAttendance[]).map(att => (
                    <button
                      key={att}
                      onClick={() => onUpdateAttendance(r.id, att)}
                      className={`px-2.5 py-1 rounded-full text-[0.65rem] font-bold transition-all border ${
                        r.attended === att
                          ? ATTENDANCE_COLORS[att] + ' border-transparent'
                          : 'border-usb-border text-usb-muted hover:text-usb-text'
                      }`}
                    >
                      {ATTENDANCE_LABELS[att]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-usb-border bg-white">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-full border border-usb-border text-usb-muted hover:text-usb-text font-semibold text-sm transition-all"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Student grades modal ────────────────────────────────────────────────────

function toBackendGrades(course: Course, grades: Record<string, number | null>): Record<string, unknown> {
  const cohortKeys = ['first_cohort', 'second_cohort', 'third_cohort'] as const
  const result: Record<string, unknown> = {}
  ;(course.cuts ?? []).forEach((cut, idx) => {
    if (idx >= 3) return
    const comps = course.components.filter(c => c.cutId === cut.id)
    const cohort: Record<string, unknown> = { weight: `${cut.percentage}%` }
    const [primary, ...rest] = comps
    if (primary) {
      cohort.parcial = {
        id: primary.id,
        name: primary.name,
        note: grades[primary.id] ?? null,
        weight: `${primary.percentage}%`,
      }
    }
    if (rest.length > 0) {
      const seg: Record<string, unknown> = {}
      rest.forEach(c => {
        seg[c.id] = {
          id: c.id,
          name: c.name,
          note: grades[c.id] ?? null,
          weight: `${c.percentage}%`,
        }
      })
      cohort.seguimiento = seg
    }
    result[cohortKeys[idx]] = cohort
  })
  return result
}

function StudentGradesModal({
  student, course, initialGrades, onSave, onClose,
}: {
  student:       Student
  course:        Course
  initialGrades: Record<string, number | null>
  onSave:        (updates: Record<string, number | null>) => void
  onClose:       () => void
}) {
  const [local,   setLocal]   = useState<Record<string, number | null>>(initialGrades)
  const [drafts,  setDrafts]  = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initialGrades).map(([compId, value]) => [compId, formatGradeDraft(value)]),
    ),
  )
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const commitGrade = (compId: string) => {
    const parsed = parseGradeDraft(drafts[compId] ?? '')
    const normalized = formatGradeDraft(parsed)
    setLocal(prev => ({ ...prev, [compId]: parsed }))
    setDrafts(prev => ({ ...prev, [compId]: normalized }))
  }

  const total = calcWeightedTotal(local, course.components)
  const totalRisk = getRisk(total)
  const coveragePct = weightedCoveragePct(local, course.components)
  const progressGrade = weightedProgressGrade(local, course.components)
  const progressRisk = getRisk(progressGrade)

  const cutGroups: { cut: GradeCut; components: GradeComponent[] }[] = (course.cuts ?? []).map(cut => ({
    cut,
    components: course.components.filter(c => c.cutId === cut.id),
  }))
  const orphans = course.components.filter(c => !c.cutId)

  const handleSave = async () => {
    const committedLocal: Record<string, number | null> = {}
    course.components.forEach(comp => {
      committedLocal[comp.id] = parseGradeDraft(drafts[comp.id] ?? '')
    })
    setLocal(committedLocal)

    setSaving(true)
    setSaveErr(null)
    try {
      const enrollment = await enrollmentService.findByCourse(student.id, course.id)
      if (enrollment) {
        await enrollmentService.saveGrades(enrollment.id, toBackendGrades(course, committedLocal))
      } else {
        setSaveErr('Inscripción no encontrada.')
        setSaving(false)
        return
      }
    } catch {
      setSaveErr('Error al guardar en el servidor.')
      setSaving(false)
      return
    }
    onSave(committedLocal)
    onClose()
  }

  const progressRiskColor = progressRisk === 'high' ? 'text-risk-high' : progressRisk === 'medium' ? 'text-risk-med' : 'text-risk-low'
  const progressRiskLabel = progressRisk === 'high' ? 'Alto' : progressRisk === 'medium' ? 'Medio' : 'Bajo'
  const totalRiskColor = totalRisk === 'high' ? 'text-risk-high' : totalRisk === 'medium' ? 'text-risk-med' : 'text-risk-low'
  const totalRiskLabel = totalRisk === 'high' ? 'Alto' : totalRisk === 'medium' ? 'Medio' : 'Bajo'

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1 }}
        exit={{   opacity: 0, y: 20,  scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-modal w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{ background: 'var(--green-deep)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,233,226,0.18)', border: '1px solid rgba(212,233,226,0.30)' }}>
              <ClipboardList size={16} style={{ color: 'var(--green-light)' }} />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm leading-tight">{student.name}</h2>
              <p className="text-white/50 text-xs font-mono">{student.studentCode}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {cutGroups.map(({ cut, components }) => (
            <div key={cut.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-usb-muted">
                  {cut.name}
                </span>
                <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,117,74,0.09)', color: 'var(--green-accent)' }}>
                  {cut.percentage}%
                </span>
              </div>
              <div className="space-y-2">
                {components.map(comp => (
                  <div key={comp.id} className="flex items-center justify-between gap-3 bg-usb-canvas rounded-xl px-4 py-2.5 border border-usb-border">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-usb-text truncate">{comp.name}</p>
                      <p className="text-[0.65rem] text-usb-muted">{comp.percentage}%</p>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={drafts[comp.id] ?? ''}
                      onChange={e => {
                        const clean = sanitizeGradeDraft(e.target.value)
                        setDrafts(prev => ({ ...prev, [comp.id]: clean }))
                      }}
                      onBlur={() => commitGrade(comp.id)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      placeholder="—"
                      className={`input-grade w-16 text-center ${local[comp.id] !== null && local[comp.id] !== undefined ? gradeColor(local[comp.id]) : ''}`}
                      maxLength={4}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {orphans.length > 0 && (
            <div>
              <p className="text-[0.68rem] font-extrabold uppercase tracking-wider text-usb-muted mb-2">Actividades</p>
              <div className="space-y-2">
                {orphans.map(comp => (
                  <div key={comp.id} className="flex items-center justify-between gap-3 bg-usb-canvas rounded-xl px-4 py-2.5 border border-usb-border">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-usb-text truncate">{comp.name}</p>
                      <p className="text-[0.65rem] text-usb-muted">{comp.percentage}%</p>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={drafts[comp.id] ?? ''}
                      onChange={e => {
                        const clean = sanitizeGradeDraft(e.target.value)
                        setDrafts(prev => ({ ...prev, [comp.id]: clean }))
                      }}
                      onBlur={() => commitGrade(comp.id)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      placeholder="—"
                      className={`input-grade w-16 text-center ${local[comp.id] !== null && local[comp.id] !== undefined ? gradeColor(local[comp.id]) : ''}`}
                      maxLength={4}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — total + actions */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-usb-border bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-usb-muted">Promedio evaluado</span>
            <div className="flex items-center gap-2">
              {progressGrade !== null ? (
                <span className={`text-xl font-extrabold ${gradeColor(progressGrade)}`}>{progressGrade.toFixed(1)}</span>
              ) : (
                <span className="text-usb-border font-mono text-sm">Sin notas</span>
              )}
              {progressRisk !== null && progressGrade !== null && (
                <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full border ${progressRiskColor}`}
                  style={{ borderColor: 'currentColor', opacity: 0.8 }}>
                  Riesgo {progressRiskLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-usb-border">
            <span className="text-xs font-bold uppercase tracking-wider text-usb-muted">Acumulado del curso</span>
            <div className="flex items-center gap-2">
              {total !== null ? (
                <span className={`text-base font-extrabold ${gradeColor(total)}`}>{total.toFixed(1)}</span>
              ) : (
                <span className="text-usb-border font-mono text-sm">—</span>
              )}
              {totalRisk !== null && total !== null && (
                <span className={`text-[0.62rem] font-bold px-2 py-0.5 rounded-full border ${totalRiskColor}`}
                  style={{ borderColor: 'currentColor', opacity: 0.8 }}>
                  Proyección {totalRiskLabel}
                </span>
              )}
            </div>
          </div>
          {coveragePct < 100 && (
            <p className="text-[0.68rem] text-usb-faint text-center">
              Evaluado: {coveragePct}%. La proyección total asume los cortes faltantes como pendientes.
            </p>
          )}
          {saveErr && (
            <p className="text-xs text-rose-500 text-center">{saveErr}</p>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving}
              className="flex-1 py-3 rounded-full border border-usb-border text-usb-muted hover:text-usb-text font-semibold text-sm transition-all disabled:opacity-40">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-full text-white text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'var(--green-accent)' }}
              onMouseEnter={e => { if (!saving) (e.currentTarget.style.background = 'var(--green-brand)') }}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--green-accent)')}>
              {saving
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : 'Guardar notas'
              }
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main GradeTable ──────────────────────────────────────────────────────────

interface Props {
  course:         Course
  grades:         Grade[]
  students:       Student[]
  onUpdateGrade:  (studentId: string, componentId: string, value: number | null) => void
}

export default function GradeTable({ course, grades, students, onUpdateGrade }: Props) {
  const { user }   = useAuth()
  const { courseStudents, gradeMap, totals } = useGradeCalculation(course, grades, students)
  const cohortColumns = course.cuts ?? []

  const getCohortGrade = (studentId: string, cutId: string): number | null => {
    const cutComponents = course.components.filter(c => c.cutId === cutId)
    if (cutComponents.length === 0) return null
    const studentGrades = gradeMap[studentId] ?? {}
    let weighted = 0
    let weightTotal = 0
    cutComponents.forEach(comp => {
      const value = studentGrades[comp.id]
      if (value === null || value === undefined) return
      weighted += value * comp.percentage
      weightTotal += comp.percentage
    })
    if (weightTotal === 0) return null
    return Math.round((weighted / weightTotal) * 10) / 10
  }

  const cohortGroupAverage = (cutId: string): number | null => {
    const values = courseStudents
      .map(student => getCohortGrade(student.id, cutId))
      .filter((v): v is number => v !== null)
    if (values.length === 0) return null
    const avg = values.reduce((s, n) => s + n, 0) / values.length
    return Math.round(avg * 10) / 10
  }

  const getCurrentCohortGrade = (studentId: string): number | null => {
    let current: number | null = null
    cohortColumns.forEach(cut => {
      const cohortGrade = getCohortGrade(studentId, cut.id)
      if (cohortGrade !== null) current = cohortGrade
    })
    return current
  }

  const getRequiredFinalGradeForPass = (studentId: string): number | null => {
    if (cohortColumns.length < 3) return null

    const [cut1, cut2, cut3] = cohortColumns
    const grade1 = getCohortGrade(studentId, cut1.id)
    const grade2 = getCohortGrade(studentId, cut2.id)
    const grade3 = getCohortGrade(studentId, cut3.id)

    // Solo aplica cuando ya hay notas en corte 1 y 2, y corte final aún no existe.
    if (grade1 === null || grade2 === null || grade3 !== null) return null

    const w1 = cut1.percentage / 100
    const w2 = cut2.percentage / 100
    const w3 = cut3.percentage / 100
    if (w3 <= 0) return null

    const needed = (3.0 - (grade1 * w1) - (grade2 * w2)) / w3
    return Math.round(needed * 10) / 10
  }

  // Referral state (local — ready for backend integration)
  const [referrals,       setReferrals]       = useState<Referral[]>([])
  const [referralTarget,  setReferralTarget]  = useState<{ studentId: string; name: string } | null>(null)
  const [historyTarget,   setHistoryTarget]   = useState<{ studentId: string; name: string } | null>(null)
  const [gradesTarget,    setGradesTarget]    = useState<Student | null>(null)

  const handleCreateReferral = (
    studentId: string,
    data: Omit<Referral, 'id' | 'studentId' | 'createdAt'>
  ) => {
    const newRef: Referral = {
      ...data,
      id:        crypto.randomUUID(),
      studentId,
      createdAt: new Date().toISOString(),
    }
    setReferrals(prev => [...prev, newRef])
  }

  const handleUpdateAttendance = (id: string, attended: ReferralAttendance) => {
    setReferrals(prev => prev.map(r => r.id === id ? { ...r, attended } : r))
  }

  const studentReferrals = (studentId: string) =>
    referrals.filter(r => r.studentId === studentId && r.courseId === course.id)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-usb-border bg-usb-canvas">
              <th className="text-left px-4 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted w-28">Código</th>
              <th className="text-left px-4 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">Estudiante</th>
              {cohortColumns.map(cut => (
                <th key={cut.id} className="text-center px-3 py-3 min-w-[110px]">
                  <span className="block text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">{cut.name}</span>
                  <span className="block text-[0.7rem] font-bold mt-0.5" style={{ color: 'var(--green-accent)' }}>{cut.percentage}%</span>
                </th>
              ))}
              <th className="text-center px-3 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted min-w-[70px]">
                <span className="block">Total</span>
                <span className="block text-[0.58rem] font-normal text-usb-faint normal-case">Acumulado</span>
              </th>
              <th className="text-center px-3 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted min-w-[80px]">
                <span className="block">% Riesgo</span>
                <span className="block text-[0.58rem] font-normal text-usb-faint normal-case">Actual y proyección</span>
              </th>
              <th className="text-center px-3 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted min-w-[90px]">Estado</th>
              <th className="text-center px-3 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted min-w-[140px]">Permanencia</th>
            </tr>
          </thead>

          <tbody>
            {courseStudents.map((student, idx) => {
              const total     = totals[student.id]
              const currentCohortGrade = getCurrentCohortGrade(student.id)
              const requiredFinalForPass = getRequiredFinalGradeForPass(student.id)
              const coveragePct = weightedCoveragePct(gradeMap[student.id] ?? {}, course.components)
              const currentRiskPct = riskPercent(currentCohortGrade)
              const totalRiskPct   = riskPercent(total)
              const mergedRiskPct  = blendedRiskPct(currentRiskPct, totalRiskPct, coveragePct)
              const failedCourse   = coveragePct === 100 && total !== null && total < 3.0
              const riskPct        = failedCourse ? Math.max(mergedRiskPct ?? 0, 60) : mergedRiskPct
              const risk           = failedCourse ? 'high' : riskLevelFromPct(riskPct)
              const refs      = studentReferrals(student.id)
              const hasRef    = refs.length > 0

              return (
                <motion.tr
                  key={student.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`border-b border-usb-border transition-colors ${
                    risk === 'high' ? 'bg-risk-high-bg/40 hover:bg-risk-high-bg/60' : 'hover:bg-usb-canvas'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[0.7rem] text-usb-muted">{student.studentCode}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-[0.82rem] text-usb-subtle whitespace-nowrap">{student.name}</span>
                  </td>
                  {cohortColumns.map((cut, cutIdx) => {
                    const cohortGrade = getCohortGrade(student.id, cut.id)
                    return (
                      <td key={cut.id} className="px-3 py-2.5 text-center">
                        {cohortGrade !== null ? (
                          <span className={`grade-cell font-semibold ${gradeColor(cohortGrade)}`}>
                            {cohortGrade.toFixed(1)}
                          </span>
                        ) : (cutIdx === 2 && requiredFinalForPass !== null) ? (
                          <div className="inline-flex flex-col items-center">
                            {requiredFinalForPass <= 5 ? (
                              <>
                                <span className={`grade-cell font-semibold ${requiredFinalForPass <= 3 ? 'text-risk-low' : requiredFinalForPass <= 4 ? 'text-amber-600' : 'text-risk-high'}`}>
                                  {requiredFinalForPass.toFixed(1)}
                                </span>
                                <span className="text-[0.56rem] text-usb-faint uppercase tracking-wide">Necesita</span>
                              </>
                            ) : (
                              <>
                                <span className="grade-cell font-semibold text-risk-high">5.0+</span>
                                <span className="text-[0.56rem] text-risk-high uppercase tracking-wide">Muy difícil</span>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-usb-border text-xs font-mono">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-center">
                    {total !== null ? (
                      <span className={`grade-cell font-bold text-[0.88rem] ${gradeColor(total)}`}>{total.toFixed(1)}</span>
                    ) : (
                      <span className="text-usb-border font-mono text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <RiskBar pct={riskPct} />
                      <span className="text-[0.58rem] text-usb-faint font-mono">
                        A:{currentRiskPct !== null ? `${currentRiskPct}%` : '—'} T:{totalRiskPct !== null ? `${totalRiskPct}%` : '—'} E:{coveragePct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <RiskBadge level={risk} />
                  </td>

                  {/* Permanencia column */}
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      {hasRef && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] font-bold"
                          style={{ background: 'rgba(0,117,74,0.10)', color: 'var(--green-accent)' }}>
                          <CheckCircle2 size={9} />
                          Remitido ({refs.length})
                        </span>
                      )}
                      {hasRef && (
                        <button
                          onClick={() => setHistoryTarget({ studentId: student.id, name: student.name })}
                          className="text-[0.68rem] font-semibold underline underline-offset-2 transition-colors"
                          style={{ color: 'var(--green-accent)' }}
                        >
                          Ver remisiones
                        </button>
                      )}
                      {/* Ver notas button */}
                      <button
                        onClick={() => setGradesTarget(student)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[0.68rem] font-bold transition-all"
                        style={{ borderColor: 'var(--green-accent)', color: 'var(--green-accent)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#00754A'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--green-accent)' }}
                      >
                        <ClipboardList size={10} />
                        Ver notas
                      </button>
                      <button
                        onClick={() => setReferralTarget({ studentId: student.id, name: student.name })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[0.68rem] font-bold transition-all"
                        style={{ borderColor: '#dc2626', color: '#dc2626' }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'
                          ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                          ;(e.currentTarget as HTMLButtonElement).style.color = '#dc2626'
                        }}
                      >
                        <Send size={10} />
                        {hasRef ? 'Nueva remisión' : 'Remitir'}
                      </button>
                    </div>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>

          <tfoot>
            <tr className="bg-usb-canvas border-t-2 border-usb-border">
              <td colSpan={2} className="px-4 py-3 text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">
                Promedio grupo
              </td>
              {cohortColumns.map(cut => {
                const avg = cohortGroupAverage(cut.id)
                return (
                  <td key={cut.id} className="px-3 py-2.5 text-center">
                    {avg !== null ? (
                      <span className={`grade-cell font-semibold ${gradeColor(avg)}`}>
                        {avg.toFixed(1)}
                      </span>
                    ) : <span className="text-usb-border text-xs font-mono">—</span>}
                  </td>
                )
              })}
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Referral modals */}
      <AnimatePresence>
        {referralTarget && (
          <ReferralModal
            studentName={referralTarget.name}
            courseId={course.id}
            professorId={user?.id ?? ''}
            onClose={() => setReferralTarget(null)}
            onSave={data => handleCreateReferral(referralTarget.studentId, data)}
          />
        )}
        {historyTarget && (
          <ReferralHistoryModal
            studentName={historyTarget.name}
            referrals={studentReferrals(historyTarget.studentId)}
            onClose={() => setHistoryTarget(null)}
            onUpdateAttendance={handleUpdateAttendance}
          />
        )}
        {gradesTarget && (
          <StudentGradesModal
            student={gradesTarget}
            course={course}
            initialGrades={gradeMap[gradesTarget.id] ?? {}}
            onSave={updates => {
              for (const [compId, val] of Object.entries(updates)) {
                onUpdateGrade(gradesTarget.id, compId, val)
              }
            }}
            onClose={() => setGradesTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
