/**
 * MateriaDetalle — Course detail view for students.
 * Tabs: Predicción IA | Calificaciones | Asistencia
 * Right panel (desktop): sticky RAG chat with prediction context
 * Mobile: FAB → slide-up drawer
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, BookOpen, Hash, Calendar, Loader2, AlertCircle,
  GraduationCap, Award, ChevronDown, Sliders, QrCode,
  Target, CheckCircle2, XCircle, CalendarCheck, Clock, Bot,
  Calculator, X, Sparkles,
} from 'lucide-react'
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler,
} from 'chart.js'
import { Doughnut, Bar, Radar } from 'react-chartjs-2'
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler)

import Header from '../components/Header'
import CourseChat from '../components/CourseChat'
import TourGuide from '../components/TourGuide'
import { type Step } from 'react-joyride'
import { useTour } from '../hooks/useTour'
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

// ─── Tour ────────────────────────────────────────────────────────────────────

const TOUR_STEPS: Step[] = [
  { target: '#tour-materia-header', title: '📚 Tu materia',         content: 'Nombre, código, créditos y período del curso.',                                         placement: 'bottom' },
  { target: '#tour-materia-tabs',   title: '📋 Secciones del curso', content: 'Navega entre Predicción IA, tus notas y tu historial de asistencia.',                  placement: 'bottom' },
  { target: '#tour-materia-chat',   title: '🤖 Asistente Risko',    content: 'Pregúntale sobre tus notas, el contenido del curso o tu predicción de riesgo.',        placement: 'left'   },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type CohortKey = 'first_cohort' | 'second_cohort' | 'third_cohort'
type MainTab   = 'prediccion' | 'calificaciones' | 'asistencia'

interface PredictionResult {
  probabilidad_riesgo?: number
  porcentaje_riesgo: number
  nivel_riesgo: 'BAJO' | 'MEDIO' | 'ALTO'
  analisis_ia: string
  datos_radar: {
    labels: string[]
    estudiante: number[]
    promedio_aprobado: number[]
  }
  detalles_matematicos: {
    intercepto?: number
    coeficientes: number[] | Array<{ variable: string; coeficiente: number; valor: number; contribucion: number }>
    features_scaled?: number[]
    formula_logit: string
    formula_sigmoide?: string
    calculo_logit_texto?: string
    calculo_probabilidad_texto?: string
    valor_z?: number
  }
}

interface CohortAttendanceSummary {
  assist: number
  notAsist: number
  total: number
  percentage: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(value: number | null): string {
  if (value === null) return 'var(--text-faint)'
  if (value >= 4.0)   return '#16a34a'
  if (value >= 3.0)   return '#d97706'
  return '#dc2626'
}

function riskMeta(level: 'ALTO' | 'MEDIO' | 'BAJO') {
  if (level === 'ALTO') return { bg: '#fee2e2', text: '#dc2626', bar: '#dc2626', label: 'Alto riesgo' }
  if (level === 'MEDIO') return { bg: '#fef3c7', text: '#d97706', bar: '#d97706', label: 'Riesgo medio' }
  return { bg: '#dcfce7', text: '#15803d', bar: '#15803d', label: 'Riesgo bajo' }
}

function riskColor(nivel: string) {
  if (nivel === 'BAJO') return '#16a34a'
  if (nivel === 'ALTO') return '#dc2626'
  return '#d97706'
}

function riskBgClass(nivel: string) {
  if (nivel === 'BAJO') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (nivel === 'ALTO') return 'bg-red-50 border-red-200 text-red-700'
  return 'bg-amber-50 border-amber-200 text-amber-700'
}

function riskIcon(nivel: string) {
  if (nivel === 'BAJO') return <CheckCircle2 size={16} />
  if (nivel === 'ALTO') return <AlertCircle size={16} />
  return <AlertCircle size={16} />
}

function cohortLabel(key: CohortKey): string {
  if (key === 'first_cohort') return 'Corte 1'
  if (key === 'second_cohort') return 'Corte 2'
  return 'Corte 3'
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

function getCohortPredictionInput(grades: Record<string, unknown>, cohortKey: CohortKey) {
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
  return {
    nota_parcial: Math.round(parcialNote * 100) / 100,
    promedio_seguimiento: Math.round((weighted / weights) * 100) / 100,
    porcentaje_asistencia: Math.round(((assist / total) * 100) * 100) / 100,
  }
}

function normalizeRiskError(raw: string, scope: 'total' | 'cohort', cohort?: CohortKey | null): string {
  const msg = raw
    .replace(/first_cohort/g, 'Corte 1')
    .replace(/second_cohort/g, 'Corte 2')
    .replace(/third_cohort/g, 'Corte 3')
  if (scope === 'total') {
    if (msg.toLowerCase().includes('faltan notas por cohorte'))
      return 'Para calcular el riesgo total deben estar registradas las notas de los 3 cortes y la nota definitiva.'
    if (msg.toLowerCase().includes('consentimiento'))
      return 'Debes aceptar el consentimiento de uso del predictor para calcular tu riesgo.'
  }
  if (scope === 'cohort') {
    if (msg.toLowerCase().includes('no está registrada'))
      return `Aún faltan notas para calcular el riesgo de ${cohort ? cohortLabel(cohort) : 'este corte'}.`
    if (msg.toLowerCase().includes('no hay datos de asistencia'))
      return `No podemos calcular ${cohort ? cohortLabel(cohort) : 'este corte'} sin asistencia registrada.`
    if (msg.toLowerCase().includes('consentimiento'))
      return 'Debes aceptar el consentimiento de uso del predictor para calcular tu riesgo.'
  }
  return msg
}

// ─── "¿Cuánto necesito sacar?" ────────────────────────────────────────────────

interface NeededResult {
  label: string; needed: number; possible: boolean; done: boolean; grade: number | null
}

function calcNeeded(c1: number | null, c2: number | null, c3: number | null, target: number): NeededResult[] {
  const w = 1 / 3
  const grades = [c1, c2, c3]
  const labels = ['Corte 1', 'Corte 2', 'Corte 3']
  const earnedSum = grades.reduce<number>((s, g) => s + (g !== null ? g * w : 0), 0)
  const pendingIdx = grades.map((g, i) => ({ i, g })).filter(x => x.g === null)
  if (pendingIdx.length === 0) {
    return grades.map((g, i) => ({ label: labels[i], needed: 0, possible: true, done: true, grade: g }))
  }
  const remainWeight = pendingIdx.length * w
  const neededAvg = (target - earnedSum) / remainWeight
  return grades.map((g, i) => ({
    label: labels[i],
    needed: g !== null ? 0 : neededAvg,
    possible: g !== null ? true : neededAvg <= 5.0,
    done: g !== null,
    grade: g,
  }))
}

function GradoNecesario({ c1, c2, c3 }: { c1: number | null; c2: number | null; c3: number | null }) {
  const [target, setTarget] = useState(3.0)
  const results = calcNeeded(c1, c2, c3, target)
  const pending = results.filter(r => !r.done)
  const alreadyPassing = pending.length > 0 && pending.every(r => r.needed <= 0)
  const impossible = pending.length > 0 && pending.some(r => !r.possible)
  const allDone = pending.length === 0
  const currentEstimate = allDone
    ? (c1 !== null && c2 !== null && c3 !== null ? (c1 + c2 + c3) / 3 : null)
    : null
  const statusColor = allDone
    ? (currentEstimate !== null && currentEstimate >= target ? '#16a34a' : '#dc2626')
    : impossible ? '#dc2626' : alreadyPassing ? '#16a34a' : '#d97706'

  return (
    <div className="rounded-xl p-4 space-y-3"
         style={{ background: 'linear-gradient(135deg,rgba(0,117,74,0.04) 0%,rgba(0,117,74,0.02) 100%)', border: '1.5px solid rgba(0,117,74,0.12)' }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,117,74,0.10)', color: 'var(--green-accent)' }}>
            <Target size={14} />
          </div>
          <p className="font-bold text-sm" style={{ color: 'var(--text-dark)' }}>¿Cuánto necesito sacar?</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>Meta:</span>
          <input type="range" min={1.0} max={5.0} step={0.1} value={target}
                 onChange={e => setTarget(Number(e.target.value))} className="w-24 accent-green-600" />
          <span className="text-sm font-extrabold w-8 text-right" style={{ color: statusColor }}>{target.toFixed(1)}</span>
        </div>
      </div>
      {allDone && currentEstimate !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: currentEstimate >= target ? '#dcfce7' : '#fee2e2' }}>
          {currentEstimate >= target
            ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
            : <XCircle size={14} className="text-red-600 flex-shrink-0" />}
          <p className="text-xs font-semibold" style={{ color: currentEstimate >= target ? '#15803d' : '#b91c1c' }}>
            {currentEstimate >= target ? `¡Pasas la materia con ${currentEstimate.toFixed(2)}! 🎉` : `Nota final estimada: ${currentEstimate.toFixed(2)} — por debajo de ${target.toFixed(1)}`}
          </p>
        </div>
      )}
      {!allDone && alreadyPassing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#dcfce7' }}>
          <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-green-700">¡Ya tienes notas suficientes para pasar con {target.toFixed(1)}! Solo asegura asistir. 🎉</p>
        </div>
      )}
      {!allDone && impossible && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#fee2e2' }}>
          <XCircle size={14} className="text-red-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-red-700">Matemáticamente no es posible alcanzar {target.toFixed(1)} con los cortes restantes. Habla con tu docente.</p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {results.map(r => (
          <div key={r.label} className="rounded-lg p-2.5 text-center"
               style={{ background: r.done ? 'rgba(22,163,74,0.06)' : 'white', border: `1px solid ${r.done ? 'rgba(22,163,74,0.18)' : 'rgba(0,0,0,0.08)'}` }}>
            <p className="text-[0.58rem] font-extrabold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>{r.label}</p>
            {r.done ? (
              <>
                <p className="text-base font-extrabold" style={{ color: gradeColor(r.grade) }}>{r.grade != null ? Number(r.grade).toFixed(1) : '—'}</p>
                <p className="text-[0.58rem] text-green-600 font-bold mt-0.5 flex items-center justify-center gap-0.5"><CheckCircle2 size={9} /> Listo</p>
              </>
            ) : (
              <>
                <p className="text-base font-extrabold" style={{ color: !r.possible ? '#dc2626' : r.needed <= 2.5 ? '#16a34a' : r.needed <= 3.8 ? '#d97706' : '#dc2626' }}>
                  {!r.possible ? '> 5.0' : r.needed <= 0 ? '0.0' : r.needed.toFixed(1)}
                </p>
                <p className="text-[0.58rem] font-semibold mt-0.5" style={{ color: 'var(--text-faint)' }}>mínimo</p>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-[0.60rem]" style={{ color: 'var(--text-faint)' }}>
        <span className="font-bold">*</span> Calculado con peso igual (33.3%) por corte.
        {pending.length > 0 && !alreadyPassing && !impossible && (
          <span> Necesitas sacar <strong style={{ color: statusColor }}>{results.find(r => !r.done)?.needed.toFixed(1) ?? '—'}</strong> ó más en cada corte pendiente.</span>
        )}
      </p>
    </div>
  )
}

// ─── Chart components (copied from Prediccion.tsx) ────────────────────────────

function GaugeChart({ pct, nivel }: { pct: number; nivel: string }) {
  const color = riskColor(nivel)
  const display = Math.round(pct * 10) / 10
  return (
    <div className="relative">
      <Doughnut
        data={{
          datasets: [{
            data: [display, 100 - display],
            backgroundColor: [color, '#e5e7eb'],
            borderWidth: 0,
            circumference: 180,
            rotation: 270,
          }],
        }}
        options={{
          cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2,
        } as Parameters<typeof Doughnut>[0]['options']}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-2">
        <span className="text-4xl font-black tabular-nums" style={{ color }}>{display}%</span>
        <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-faint)' }}>de riesgo</span>
      </div>
    </div>
  )
}

function RadarChart({ datos }: { datos: PredictionResult['datos_radar'] }) {
  return (
    <Radar
      data={{
        labels: datos.labels,
        datasets: [
          {
            label: 'Tus datos',
            data: datos.estudiante,
            backgroundColor: 'rgba(0,180,216,0.15)',
            borderColor: 'rgba(0,180,216,0.85)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(0,180,216,0.85)',
            pointRadius: 4,
          },
          {
            label: 'Promedio aprobados',
            data: datos.promedio_aprobado,
            backgroundColor: 'rgba(22,163,74,0.10)',
            borderColor: 'rgba(22,163,74,0.65)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(22,163,74,0.65)',
            pointRadius: 3,
          },
        ],
      }}
      options={{
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12, usePointStyle: true } },
        },
        scales: {
          r: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, pointLabels: { font: { size: 10 } } },
        },
      } as Parameters<typeof Radar>[0]['options']}
    />
  )
}

function CompareBar({ labels, studentVals, avgVals }: { labels: string[]; studentVals: number[]; avgVals: number[] }) {
  return (
    <div style={{ height: '220px' }}>
      <Bar
        data={{
          labels,
          datasets: [
            { label: 'Tus datos',          data: studentVals, backgroundColor: 'rgba(0,180,216,0.85)', borderRadius: 8, borderSkipped: false },
            { label: 'Promedio aprobados', data: avgVals,     backgroundColor: 'rgba(22,163,74,0.75)',  borderRadius: 8, borderSkipped: false },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 8 } },
          },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          },
        } as Parameters<typeof Bar>[0]['options']}
      />
    </div>
  )
}

// ─── MathModal ────────────────────────────────────────────────────────────────

function MathModal({ result, onClose }: { result: PredictionResult; onClose: () => void }) {
  const d = result.detalles_matematicos
  const featureNames = ['Corte 1', 'Corte 2', 'Corte final', 'Total']
  const varColors = ['#00b4d8', '#16a34a', '#7c3aed', '#d97706']

  type NewCoef = { variable: string; coeficiente: number; valor: number; contribucion: number }
  const isNewFormat = d.coeficientes.length > 0 && typeof d.coeficientes[0] === 'object'
  const rows = featureNames.map((name, i) => {
    if (isNewFormat) {
      const coef = d.coeficientes[i] as NewCoef | undefined
      return { name: coef?.variable ?? name, scaled: coef?.valor ?? 0, coef: coef?.coeficiente ?? 0, impact: coef?.contribucion ?? 0, color: varColors[i] }
    }
    const scaled = (d.features_scaled ?? [])[i] ?? 0
    const coefNum = d.coeficientes[i] as number ?? 0
    return { name, scaled, coef: coefNum, impact: scaled * coefNum, color: varColors[i] }
  })
  const maxImpact = Math.max(...rows.map(r => Math.abs(r.impact)), 0.001)

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:rounded-2xl sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl"
        style={{ boxShadow: '0 -4px 60px rgba(0,0,0,0.20)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-usb-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-ar-cyan/10 flex items-center justify-center">
              <Calculator size={16} className="text-ar-cyan" />
            </div>
            <div>
              <h3 className="font-bold text-usb-text text-sm leading-tight">¿Cómo calculamos tu riesgo?</h3>
              <p className="text-[0.62rem] text-usb-faint">Regresión logística — paso a paso</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-usb-canvas hover:bg-usb-border flex items-center justify-center transition-colors">
            <X size={15} className="text-usb-muted" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-usb-faint mb-3">Impacto de cada variable</p>
            <div className="space-y-2.5">
              {rows.map(({ name, impact, coef, color }) => {
                const isProtective = impact < 0
                const barPct = Math.abs(impact) / maxImpact * 100
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-xs font-semibold text-usb-subtle">{name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[0.62rem] text-usb-faint font-mono">β={coef.toFixed(3)}</span>
                        <span className={`text-xs font-bold tabular-nums ${isProtective ? 'text-emerald-600' : 'text-red-500'}`}>
                          {isProtective ? '↓' : '↑'} {Math.abs(impact).toFixed(3)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-usb-border overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barPct}%` }}
                          transition={{ duration: 0.6, delay: rows.indexOf(rows.find(r => r.name === name)!) * 0.08 }}
                          className="h-full rounded-full"
                          style={{ background: isProtective ? '#16a34a' : '#ef4444' }}
                        />
                      </div>
                      <span className={`text-[0.6rem] font-semibold w-16 text-right ${isProtective ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isProtective ? 'reduce riesgo' : 'suma riesgo'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-usb-border">
              <span className="flex items-center gap-1 text-[0.62rem] text-emerald-600 font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Verde = reduce riesgo
              </span>
              <span className="flex items-center gap-1 text-[0.62rem] text-red-500 font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Rojo = suma riesgo
              </span>
            </div>
          </div>
          <div className="bg-usb-canvas rounded-xl p-4 border border-usb-border">
            <p className="text-[0.62rem] font-bold uppercase tracking-widest text-usb-faint mb-2.5">Fórmula logit</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-usb-muted font-mono">z =</span>
                <span className="text-xs font-mono text-usb-subtle">β₀ + β₁x₁ + β₂x₂ + β₃x₃ + β₄x₄</span>
              </div>
              {d.intercepto != null && d.valor_z != null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-usb-muted font-mono">z =</span>
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--green-accent)' }}>{d.valor_z.toFixed(4)}</span>
                  <span className="text-[0.62rem] text-usb-faint">(intercepto {d.intercepto.toFixed(4)})</span>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-xl p-4 border"
               style={{ background: `${riskColor(result.nivel_riesgo)}0D`, borderColor: `${riskColor(result.nivel_riesgo)}30` }}>
            <p className="text-[0.62rem] font-bold uppercase tracking-widest mb-2" style={{ color: riskColor(result.nivel_riesgo) }}>
              Probabilidad final
            </p>
            <div className="flex items-center gap-3">
              <div className="font-mono text-xs text-usb-muted">P = 1 / (1 + e<sup>−z</sup>) =</div>
              <span className="text-2xl font-black tabular-nums" style={{ color: riskColor(result.nivel_riesgo) }}>
                {result.porcentaje_riesgo.toFixed(1)}%
              </span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${riskBgClass(result.nivel_riesgo)}`}>
                {riskIcon(result.nivel_riesgo)} Riesgo {result.nivel_riesgo}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── AIAnalysis ───────────────────────────────────────────────────────────────

function AIAnalysis({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = text.split('\n').filter(l => l.trim())

  function renderText(str: string) {
    return str.split(/\*\*(.*?)\*\*/g).map((part, j) =>
      j % 2 === 1
        ? <strong key={j} className="font-semibold text-usb-text">{part}</strong>
        : <span key={j}>{part}</span>
    )
  }

  const hasMore = lines.length > 4
  return (
    <div className="rounded-2xl p-4 space-y-2"
         style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles size={12} style={{ color: 'var(--text-faint)' }} />
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Análisis de Risko</span>
      </div>
      <div className="space-y-1 text-sm text-usb-subtle leading-relaxed">
        {(expanded ? lines : lines.slice(0, 4)).map((line, i) => (
          <p key={i}>{renderText(line)}</p>
        ))}
      </div>
      {hasMore && (
        <button onClick={() => setExpanded(e => !e)}
                className="mt-2 flex items-center gap-1 text-xs font-bold hover:underline"
                style={{ color: 'var(--green-accent)' }}>
          {expanded ? <ChevronDown size={12} style={{ transform: 'rotate(180deg)' }} /> : <ChevronDown size={12} />}
          {expanded ? 'Ver menos' : 'Ver análisis completo'}
        </button>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MateriaDetalle() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { run, onTourEnd } = useTour('student-materia', user?.id)

  // Course
  const [course, setCourse]               = useState<BackendCourse | null>(null)
  const [loadingCourse, setLoadingCourse] = useState(true)
  const [courseError, setCourseError]     = useState<string | null>(null)

  // Grades
  const [gradesData, setGradesData]         = useState<BackendGradesRead | null>(null)
  const [loadingGrades, setLoadingGrades]   = useState(false)

  // Attendance
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryItem[]>([])
  const [loadingAttHist, setLoadingAttHist]         = useState(false)
  const [attPage, setAttPage]                       = useState(0)
  const ATT_PAGE_SIZE = 10

  // Tabs
  const [mainTab, setMainTab] = useState<MainTab>('prediccion')

  // Grades detail
  const [selectedCohort, setSelectedCohort] = useState<CohortKey | null>(null)

  // Risk
  const [enrollmentId, setEnrollmentId]         = useState<string | null>(null)
  const [totalRiskLoading, setTotalRiskLoading] = useState(false)
  const [cohortRiskLoading, setCohortRiskLoading] = useState(false)
  const [totalRiskError, setTotalRiskError]     = useState<string | null>(null)
  const [cohortRiskError, setCohortRiskError]   = useState<string | null>(null)
  const [totalRisk, setTotalRisk]               = useState<EnrollmentRiskRead | null>(null)
  const [cohortRisks, setCohortRisks]           = useState<Partial<Record<CohortKey, CohortRiskRead>>>({})

  // Prediccion tab
  const [showMathModal, setShowMathModal] = useState(false)

  // Chat drawer (mobile)
  const [chatOpen, setChatOpen] = useState(false)

  // Computed attendance
  const attendanceByCohort = useMemo(() => {
    const grades = (gradesData?.grades as Record<string, unknown> | null) ?? null
    return {
      first_cohort:  attendanceFromGrades(grades, 'first_cohort'),
      second_cohort: attendanceFromGrades(grades, 'second_cohort'),
      third_cohort:  attendanceFromGrades(grades, 'third_cohort'),
    }
  }, [gradesData?.grades])

  // ── Loaders ──────────────────────────────────────────────────────────────────

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
      setSelectedCohort(prev => prev ?? null)
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
      setCohortRisks(prev => ({ ...prev, [selectedCohort]: response }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo calcular el riesgo del corte seleccionado.'
      setCohortRiskError(normalizeRiskError(message, 'cohort', selectedCohort))
    } finally {
      setCohortRiskLoading(false)
    }
  }, [selectedCohort, gradesData])

  // ── Effects ───────────────────────────────────────────────────────────────────

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

  // Auto-run predictor when grades + enrollmentId are ready and totalRisk is null
  useEffect(() => {
    if (gradesData && enrollmentId && totalRisk === null && !totalRiskLoading && !totalRiskError) {
      void calculateTotalRisk()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradesData, enrollmentId])

  // ── Predicción tab content ────────────────────────────────────────────────────

  const predictionContext = totalRisk
    ? {
        nivel_riesgo: totalRisk.nivel_riesgo,
        porcentaje_riesgo: totalRisk.porcentaje_riesgo,
        analisis_ia: totalRisk.analisis_ia,
      }
    : undefined

  // Build a PredictionResult-like object from totalRisk for charts when available
  const predictionResult: PredictionResult | null = (totalRisk as unknown as PredictionResult | null) ?? null

  function PrediccionTab() {
    if (loadingGrades || totalRiskLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            {loadingGrades ? 'Cargando calificaciones…' : 'Calculando tu predicción de riesgo…'}
          </p>
        </div>
      )
    }

    if (!gradesData?.grades) {
      return (
        <div className="flex flex-col items-center justify-center py-14 rounded-xl gap-3"
             style={{ background: 'var(--canvas-warm)', border: '1.5px dashed rgba(0,0,0,0.10)' }}>
          <Award size={30} style={{ color: 'var(--text-faint)' }} />
          <p className="font-semibold text-sm" style={{ color: 'var(--text-subtle)' }}>Faltan notas por registrar</p>
          <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-faint)' }}>
            El predictor se activará cuando tu docente ingrese las calificaciones de los cortes.
          </p>
        </div>
      )
    }

    if (totalRiskError) {
      return (
        <div className="rounded-xl p-5 text-center" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
          <p className="font-semibold text-sm text-red-700">{totalRiskError}</p>
          <button
            onClick={() => { void calculateTotalRisk() }}
            className="mt-3 text-sm font-bold hover:underline"
            style={{ color: 'var(--green-accent)' }}
          >
            Reintentar
          </button>
        </div>
      )
    }

    if (!totalRisk || !predictionResult) {
      return (
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Calculando predicción…</p>
        </div>
      )
    }

    const meta = riskMeta(totalRisk.nivel_riesgo)

    return (
      <div className="space-y-4">
        {/* Gauge + badge integrados */}
        <div className="flex flex-col items-center">
          <div className="w-full max-w-[220px]">
            <GaugeChart pct={totalRisk.porcentaje_riesgo} nivel={totalRisk.nivel_riesgo} />
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs border mt-1"
            style={{ background: meta.bg, color: meta.text, borderColor: `${meta.text}30` }}
          >
            {totalRisk.nivel_riesgo === 'BAJO' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
            {meta.label}
          </span>
        </div>

        {/* Math modal button */}
        {predictionResult.detalles_matematicos && (
          <div className="flex justify-center">
            <button
              onClick={() => setShowMathModal(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(0,117,74,0.08)', color: 'var(--green-accent)', border: '1px solid rgba(0,117,74,0.15)' }}
            >
              <Calculator size={12} />
              ¿Cómo calculamos esto?
            </button>
          </div>
        )}

        {/* Radar */}
        {predictionResult.datos_radar && (
          <div className="bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>Comparación con promedio aprobados</p>
            <RadarChart datos={predictionResult.datos_radar} />
          </div>
        )}

        {/* Bar */}
        {predictionResult.datos_radar && (
          <div className="bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>Detalle por indicador</p>
            <CompareBar
              labels={predictionResult.datos_radar.labels}
              studentVals={predictionResult.datos_radar.estudiante}
              avgVals={predictionResult.datos_radar.promedio_aprobado}
            />
          </div>
        )}

        {/* AI Analysis */}
        {totalRisk.analisis_ia && <AIAnalysis text={totalRisk.analisis_ia} />}

        {/* Cohort risk mini-cards */}
        {Object.keys(cohortRisks).length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(cohortRisks) as [CohortKey, CohortRiskRead][]).map(([key, cr]) => {
              const m = riskMeta(cr.nivel_riesgo)
              return (
                <div key={key} className="rounded-xl p-3 text-center" style={{ background: m.bg, border: `1px solid ${m.text}22` }}>
                  <p className="text-[0.58rem] font-bold uppercase tracking-wider mb-1" style={{ color: m.text }}>{cohortLabel(key)}</p>
                  <p className="text-lg font-extrabold" style={{ color: m.text }}>{cr.porcentaje_riesgo.toFixed(0)}%</p>
                  <p className="text-[0.58rem] font-semibold" style={{ color: m.text }}>{m.label}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-usb-canvas flex flex-col">
      <Header />
      <TourGuide run={run} steps={TOUR_STEPS} onEnd={onTourEnd} />

      {/* Math modal */}
      <AnimatePresence>
        {showMathModal && predictionResult && (
          <MathModal result={predictionResult} onClose={() => setShowMathModal(false)} />
        )}
      </AnimatePresence>

      {/* Page header */}
      <div id="tour-materia-header" className="relative overflow-hidden"
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
                <h1 className="text-white font-extrabold text-xl leading-tight min-w-0 break-words" style={{ letterSpacing: '-0.02em' }}>
                  {course.name}
                </h1>
                <span className="text-[0.68rem] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: 'rgba(212,233,226,0.12)', color: 'rgba(212,233,226,0.80)' }}>
                  {course.code}
                </span>
                <span className="hidden sm:flex items-center gap-1 text-sm flex-shrink-0" style={{ color: 'rgba(212,233,226,0.55)' }}>
                  <Hash size={11} />{course.credits} créditos
                </span>
                <span className="hidden sm:flex items-center gap-1 text-sm flex-shrink-0" style={{ color: 'rgba(212,233,226,0.55)' }}>
                  <Calendar size={11} />{course.academic_period}
                </span>
                {/* QR button */}
                <button
                  onClick={() => navigate('/asistencia')}
                  className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex-shrink-0"
                  style={{ background: 'rgba(212,233,226,0.12)', color: '#d4e9e2', border: '1px solid rgba(212,233,226,0.20)' }}
                >
                  <QrCode size={12} />
                  <span className="hidden sm:inline">Registrar asistencia</span>
                </button>
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
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
            <AlertCircle size={30} className="text-rose-400 mx-auto mb-3" />
            <p className="font-bold mb-2" style={{ color: 'var(--text-dark)' }}>{courseError}</p>
            <button onClick={loadCourse} className="text-sm font-bold hover:underline" style={{ color: 'var(--green-accent)' }}>Reintentar</button>
          </div>
        )}

        {/* Content */}
        {!loadingCourse && !courseError && course && (
          <div className="flex flex-col lg:flex-row gap-4 items-start">

            {/* ── LEFT PANEL ── */}
            <div className="flex-1 min-w-0 space-y-3">

              {/* Tab switcher */}
              <motion.div
                id="tour-materia-tabs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-1 bg-white border rounded-2xl p-1 w-fit max-w-full overflow-x-auto"
                style={{ boxShadow: 'var(--shadow-card)', borderColor: 'rgba(0,0,0,0.07)' }}
              >
                {([
                  { key: 'prediccion' as const,      label: 'Predicción IA',   icon: <GraduationCap size={13} /> },
                  { key: 'calificaciones' as const,   label: 'Calificaciones',  icon: <Award size={13} /> },
                  { key: 'asistencia' as const,       label: 'Mi asistencia',   icon: <CalendarCheck size={13} />,
                    badge: attendanceHistory.length || undefined },
                ]).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setMainTab(t.key)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
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

              {/* ── Tab: Predicción IA ── */}
              {mainTab === 'prediccion' && (
                <motion.div key="prediccion-tab" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <GraduationCap size={16} style={{ color: 'var(--green-accent)' }} />
                    <h2 className="font-bold" style={{ color: 'var(--text-dark)' }}>Predicción de riesgo académico</h2>
                  </div>
                  <PrediccionTab />
                </motion.div>
              )}

              {/* ── Tab: Asistencia ── */}
              {mainTab === 'asistencia' && (() => {
                const totalPages = Math.ceil(attendanceHistory.length / ATT_PAGE_SIZE)
                const pageItems  = attendanceHistory.slice(attPage * ATT_PAGE_SIZE, (attPage + 1) * ATT_PAGE_SIZE)
                return (
                  <motion.div key="asistencia-tab" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                              className="bg-white rounded-2xl p-4"
                              style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <CalendarCheck size={16} style={{ color: 'var(--green-accent)' }} />
                        <h2 className="font-bold text-sm" style={{ color: 'var(--text-dark)' }}>Historial de asistencia</h2>
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
                                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{item.recorded_at_colombia}</p>
                                </div>
                              </div>
                              <span className="text-[0.62rem] font-bold px-2 py-0.5 rounded-full text-emerald-700 flex-shrink-0"
                                    style={{ background: '#dcfce7' }}>✓ Asistió</span>
                            </div>
                          ))}
                        </div>
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

              {/* ── Tab: Calificaciones ── */}
              {mainTab === 'calificaciones' && (
                <motion.div key="calificaciones-tab" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 }} className="bg-white rounded-2xl p-4"
                            style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Award size={16} style={{ color: 'var(--green-accent)' }} />
                      <h2 className="font-bold" style={{ color: 'var(--text-dark)' }}>Calificaciones</h2>
                    </div>
                    {/* Simulador */}
                    <Link
                      to={`/materia/${courseId}/simulador`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs flex-shrink-0 transition-all border"
                      style={{ background: 'white', color: 'var(--green-accent)', borderColor: 'var(--green-accent)' }}
                    >
                      <Sliders size={12} />
                      Simulador
                    </Link>
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
                          { label: 'Corte 1', key: 'first_cohort'  as const, value: gradesData.first_cohort_grade },
                          { label: 'Corte 2', key: 'second_cohort' as const, value: gradesData.second_cohort_grade },
                          { label: 'Corte 3', key: 'third_cohort'  as const, value: gradesData.third_cohort_grade },
                        ]).map(({ label, key, value }) => {
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
                                <p className="text-[0.58rem]" style={{ color: isOpen ? 'rgba(255,255,255,0.55)' : 'var(--text-faint)' }}>/ 5.00</p>
                                <ChevronDown size={11} style={{
                                  color: isOpen ? 'rgba(255,255,255,0.55)' : 'var(--text-faint)',
                                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                }} />
                              </div>
                            </button>
                          )
                        })}
                      </div>

                      {/* Expandable detail */}
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
                            <div className="rounded-xl p-4 space-y-2"
                                 style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
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
                                    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
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
                                    {parcial && (
                                      <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                                        <div>
                                          <p className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>Parcial</p>
                                          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Peso: {parcial.weight ?? '—'}</p>
                                        </div>
                                        <p className="text-lg font-extrabold" style={{ color: gradeColor(parcial.note ?? null) }}>
                                          {parcial.note !== undefined ? Number(parcial.note).toFixed(1) : '—'}
                                        </p>
                                      </div>
                                    )}
                                    {seguimiento && Object.entries(seguimiento).map(([actKey, act]) => (
                                      <div key={actKey} className="flex items-center justify-between py-2 border-b last:border-0"
                                           style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                                        <div>
                                          <p className="font-semibold text-sm capitalize" style={{ color: 'var(--text-dark)' }}>
                                            {act.name?.trim() || actKey.replace(/_/g, ' ').replace(/^comp-\d+$/i, 'Actividad')}
                                          </p>
                                          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Peso: {act.weight ?? '—'}</p>
                                        </div>
                                        <p className="text-lg font-extrabold" style={{ color: gradeColor(act.note ?? null) }}>
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

                      {/* Seguimiento indicators */}
                      {(() => {
                        const g = gradesData as BackendGradesRead & { _asistencia?: number|null }
                        const asistenciaVal = g._asistencia != null ? `${Number(g._asistencia).toFixed(1)} %` : '—'
                        return (
                          <div className="rounded-xl p-3" style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
                            <p className="text-[0.58rem] font-extrabold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-faint)' }}>
                              Asistencia global
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {[{ label: 'Asistencia', value: asistenciaVal, color: 'var(--green-accent)' }].map(({ label, value, color }) => (
                                <div key={label} className="bg-white rounded-lg p-2.5 text-center" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                                  <p className="text-[0.58rem] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>{label}</p>
                                  <p className="text-sm font-extrabold" style={{ color }}>{value}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Final grade */}
                      <div className="rounded-xl p-3 flex items-center justify-between"
                           style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <p className="font-bold text-[0.92rem]" style={{ color: 'var(--text-dark)' }}>Nota definitiva</p>
                        <p className="text-xl font-extrabold" style={{ color: gradeColor(gradesData.final_grade) }}>
                          {gradesData.final_grade != null ? Number(gradesData.final_grade).toFixed(1) : '—'}
                          <span className="text-xs font-medium ml-1" style={{ color: 'var(--text-faint)' }}>/ 5.00</span>
                        </p>
                      </div>

                      {/* GradoNecesario */}
                      <GradoNecesario
                        c1={gradesData.first_cohort_grade  != null ? Number(gradesData.first_cohort_grade)  : null}
                        c2={gradesData.second_cohort_grade != null ? Number(gradesData.second_cohort_grade) : null}
                        c3={gradesData.third_cohort_grade  != null ? Number(gradesData.third_cohort_grade)  : null}
                      />
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
              )}
            </div>

            {/* ── RIGHT PANEL — Desktop Chat ── */}
            <div
              id="tour-materia-chat"
              className="hidden lg:flex flex-col lg:w-80 xl:w-96 lg:sticky lg:top-24"
              style={{ alignSelf: 'flex-start' }}
            >
              <CourseChat
                courseId={courseId ?? ''}
                courseName={course.name}
                predictionContext={predictionContext}
              />
            </div>

          </div>
        )}
      </main>

      {/* ── MOBILE FAB ── */}
      {!loadingCourse && !courseError && course && (
        <>
          <button
            onClick={() => setChatOpen(true)}
            className="lg:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
            style={{ background: 'var(--green-accent)', boxShadow: '0 4px 16px rgba(0,117,74,0.35)' }}
          >
            <Bot size={22} className="text-white" />
          </button>

          {/* Slide-up drawer */}
          <AnimatePresence>
            {chatOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="lg:hidden fixed inset-0 bg-black/40 z-40"
                  onClick={() => setChatOpen(false)}
                />
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="lg:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden flex flex-col"
                  style={{ height: '70vh', background: 'white', boxShadow: '0 -4px 40px rgba(0,0,0,0.18)' }}
                >
                  <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                       style={{ background: 'var(--green-deep)' }}>
                    <div className="flex items-center gap-2">
                      <Bot size={16} className="text-white" />
                      <span className="text-white font-bold text-sm">Asistente Risko</span>
                    </div>
                    <button onClick={() => setChatOpen(false)}
                            className="w-7 h-7 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(255,255,255,0.15)' }}>
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <CourseChat
                      courseId={courseId ?? ''}
                      courseName={course.name}
                      predictionContext={predictionContext}
                    />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
