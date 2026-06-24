/**
 * Prediccion — Student risk prediction page.
 *
 * Data flow:
 *  1. GET /students/{id}/enrollments → student's active enrollments (with grades)
 *  2. GET /courses/{id} for each → course details
 *  3. If enrollment has DB grades → auto-run POST /predict
 *  4. POST /chat  → AI counselor
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart2, Send, X, Bot, User, Calculator,
  AlertTriangle, CheckCircle2, Loader2,
  RotateCcw, Info, Sparkles, BookOpen,
  GraduationCap, ChevronDown, ChevronUp,
  Lightbulb, TrendingUp, TrendingDown, Minus as MinusIcon,
  Database, ChevronRight, ChevronLeft,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Chart as ChartJS,
  ArcElement, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler,
} from 'chart.js'
import { Doughnut, Bar, Radar } from 'react-chartjs-2'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { enrollmentService, type BackendEnrollment } from '../services/enrollmentService'
import { courseService, type BackendCourse } from '../services/courseService'
import { predictionService } from '../services/predictionService'
import { notificationService } from '../services/notificationService'
import { ApiError } from '../services/api'

ChartJS.register(
  ArcElement, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler,
)

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  nota_corte_1: number
  nota_corte_2: number
  nota_corte_3: number
  nota_total:   number
}

interface CohortRiskResult {
  cohort_key: 'first_cohort' | 'second_cohort' | 'third_cohort'
  cohort_name: string
  porcentaje_riesgo: number
  nivel_riesgo: 'BAJO' | 'MEDIO' | 'ALTO'
}

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

interface ChatMessage { role: 'bot' | 'user'; text: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  if (nivel === 'ALTO') return <AlertTriangle size={16} />
  return <Info size={16} />
}

function computeTotal(n1: number, n2: number, n3: number) {
  return Number(((n1 * 0.3) + (n2 * 0.3) + (n3 * 0.4)).toFixed(2))
}

// ─── Animated reveal wrapper ─────────────────────────────────────────────────

function RevealCard({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// ─── Gauge chart ─────────────────────────────────────────────────────────────

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
        } as any}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-2">
        <span className="text-4xl font-black tabular-nums" style={{ color }}>{display}%</span>
        <span className="text-xs text-usb-muted font-semibold tracking-wide">de riesgo</span>
      </div>
    </div>
  )
}

// ─── Radar chart ─────────────────────────────────────────────────────────────

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
            borderDash: [4, 4],
            pointBackgroundColor: 'rgba(22,163,74,0.65)',
            pointRadius: 3,
          },
        ],
      }}
      options={{
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, padding: 12, usePointStyle: true },
          },
        },
        scales: {
          r: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            pointLabels: { font: { size: 10 } },
          },
        },
      } as any}
    />
  )
}

// ─── Bar comparison ──────────────────────────────────────────────────────────

function CompareBar({ labels, studentVals, avgVals }: {
  labels: string[]; studentVals: number[]; avgVals: number[]
}) {
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
            legend: {
              position: 'top',
              labels: { font: { size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 8 },
            },
          },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          },
        } as any}
      />
    </div>
  )
}

// ─── Math modal — visual explainer ───────────────────────────────────────────

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
    const scaled  = (d.features_scaled ?? [])[i] ?? 0
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
        {/* Header */}
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
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-usb-canvas hover:bg-usb-border flex items-center justify-center transition-colors">
            <X size={15} className="text-usb-muted" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Step 1: Impact per variable */}
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-usb-faint mb-3">
              Impacto de cada variable
            </p>
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

          {/* Step 2: Formula */}
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
                  <span className="text-sm font-black font-mono" style={{ color: 'var(--green-accent)' }}>
                    {d.valor_z.toFixed(4)}
                  </span>
                  <span className="text-[0.62rem] text-usb-faint">(intercepto {d.intercepto.toFixed(4)})</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Probability */}
          <div className="rounded-xl p-4 border"
            style={{ background: `${riskColor(result.nivel_riesgo)}0D`, borderColor: `${riskColor(result.nivel_riesgo)}30` }}>
            <p className="text-[0.62rem] font-bold uppercase tracking-widest mb-2"
              style={{ color: riskColor(result.nivel_riesgo) }}>
              Probabilidad final
            </p>
            <div className="flex items-center gap-3">
              <div className="font-mono text-xs text-usb-muted">
                P = 1 / (1 + e<sup>−z</sup>) =
              </div>
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

// ─── Slider input ─────────────────────────────────────────────────────────────

function Slider({
  label, value, onChange, min, max, step, unit, color = '#00b4d8',
}: {
  label: string; value: number; onChange: (v: number) => void
  min: number; max: number; step: number; unit: string; color?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold text-usb-subtle">{label}</label>
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-usb-canvas border border-usb-border text-usb-text tabular-nums">
          {step < 1 ? value.toFixed(1) : value}{unit}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-usb-border">
        <div className="absolute h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-2"
        />
        <div
          className="absolute w-4 h-4 rounded-full shadow-sm -translate-y-1 -translate-x-2 bg-white border-2 pointer-events-none transition-all"
          style={{ left: `${pct}%`, borderColor: color }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[0.62rem] text-usb-faint">{min}{unit}</span>
        <span className="text-[0.62rem] text-usb-faint">{max}{unit}</span>
      </div>
    </div>
  )
}

// ─── Inline ChatBot ───────────────────────────────────────────────────────────

function InlineChatBot({ result, formData }: { result: PredictionResult | null; formData: FormData }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: result
        ? `¡Hola! Tu riesgo académico es ${result.nivel_riesgo} (${Math.round(result.porcentaje_riesgo)}%). Cuéntame qué quieres mejorar y te ayudo con recomendaciones personalizadas 🎓`
        : '¡Hola! Soy tu consejero académico virtual. Calcula primero tu predicción y luego podré darte recomendaciones personalizadas.',
    },
  ])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)

    try {
      const data = await predictionService.chat({
        pregunta: text,
        datos_estudiante: {
          nota_corte_1: formData.nota_corte_1,
          nota_corte_2: formData.nota_corte_2,
          nota_corte_final: formData.nota_corte_3,
          nota_total: formData.nota_total,
        },
        prediccion_actual: {
          nivel_riesgo: result?.nivel_riesgo,
          porcentaje_riesgo: result?.porcentaje_riesgo,
        }
      })
      setMessages(prev => [...prev, { role: 'bot', text: data.respuesta }])
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Lo siento, no pude conectarme al servidor. Intenta de nuevo.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-usb-border overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center gap-3 border-b border-usb-border"
           style={{ background: 'var(--green-deep)' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
             style={{ background: 'rgba(212,233,226,0.18)', border: '1px solid rgba(212,233,226,0.30)' }}>
          <Bot size={16} style={{ color: '#d4e9e2' }} />
        </div>
        <div>
          <p className="text-white text-sm font-bold leading-tight">Consejero Académico IA</p>
          <p className="text-white/45 text-[0.65rem]">Pregúntame sobre tu rendimiento</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-3 p-4 max-h-80 overflow-y-auto bg-usb-canvas">
        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              m.role === 'bot' ? 'bg-ar-cyan/15 border border-ar-cyan/25' : 'bg-ar-navy'
            }`}>
              {m.role === 'bot'
                ? <Bot size={13} className="text-ar-cyan" />
                : <User size={13} className="text-white" />}
            </div>
            <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[0.78rem] leading-relaxed ${
              m.role === 'bot'
                ? 'bg-white border border-usb-border text-usb-subtle rounded-bl-none'
                : 'bg-ar-navy text-white rounded-br-none'
            }`}>
              {m.text.split(/\*\*(.*?)\*\*/g).map((part, j) =>
                j % 2 === 1
                  ? <strong key={j} className="font-semibold">{part}</strong>
                  : <span key={j} className="whitespace-pre-wrap">{part}</span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-ar-cyan/15 border border-ar-cyan/25 flex items-center justify-center">
              <Bot size={13} className="text-ar-cyan" />
            </div>
            <div className="bg-white border border-usb-border rounded-2xl rounded-bl-none px-4 py-3">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-usb-faint animate-bounce"
                       style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-usb-border p-3 flex gap-2 bg-white">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void send()}
          placeholder="Escribe tu pregunta…"
          className="flex-1 bg-usb-canvas border border-usb-border rounded-full px-4 py-2 text-xs text-usb-text placeholder-usb-faint focus:outline-none focus:border-ar-cyan focus:ring-1 focus:ring-ar-cyan/30 transition-all"
        />
        <button
          onClick={() => void send()}
          disabled={!input.trim() || loading}
          className="w-9 h-9 rounded-full bg-ar-cyan hover:bg-ar-cyan-dark disabled:opacity-40 flex items-center justify-center transition-all"
        >
          <Send size={14} className="text-white" />
        </button>
      </div>
    </div>
  )
}

// ─── AI Analysis card ─────────────────────────────────────────────────────────

function AIAnalysis({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = text.split('\n').filter(l => l.trim())
  const preview = lines.slice(0, 4).join('\n')
  const hasMore = lines.length > 4

  function renderText(str: string) {
    return str.split(/\*\*(.*?)\*\*/g).map((part, j) =>
      j % 2 === 1
        ? <strong key={j} className="font-semibold text-usb-text">{part}</strong>
        : <span key={j}>{part}</span>
    )
  }

  return (
    <div>
      <div className="space-y-1 text-sm text-usb-subtle leading-relaxed">
        {(expanded ? lines : lines.slice(0, 4)).map((line, i) => (
          <p key={i}>{renderText(line)}</p>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 flex items-center gap-1 text-xs font-bold hover:underline"
          style={{ color: 'var(--green-accent)' }}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Ver menos' : 'Ver análisis completo'}
        </button>
      )}
    </div>
  )
}

// ─── Recommendations ─────────────────────────────────────────────────────────

function Recommendations({ form, nivel }: { form: FormData; nivel: string }) {
  const recs: { icon: React.ReactNode; title: string; text: string; good: boolean }[] = []

  if (form.nota_total < 3.0)
    recs.push({ icon: <TrendingDown size={14} />, title: 'Sube tu nota total', text: `Tu total está en ${form.nota_total.toFixed(1)}/5.0. Prioriza recuperación en el corte más bajo.`, good: false })
  else
    recs.push({ icon: <CheckCircle2 size={14} />, title: 'Buen avance general', text: `Tu total (${form.nota_total.toFixed(1)}/5.0) va en buena dirección.`, good: true })

  if (form.nota_corte_1 < 3.0)
    recs.push({ icon: <MinusIcon size={14} />, title: 'Refuerza fundamentos (Corte 1)', text: `Corte 1 en ${form.nota_corte_1.toFixed(1)}. Recupera temas base para no arrastrarlos.`, good: false })

  if (form.nota_corte_2 < 3.0)
    recs.push({ icon: <TrendingUp size={14} />, title: 'Mejora desempeño en Corte 2', text: `Corte 2 en ${form.nota_corte_2.toFixed(1)}. Sube participación y práctica guiada.`, good: false })

  if (form.nota_corte_3 < 3.0)
    recs.push({ icon: <Lightbulb size={14} />, title: 'Prioriza el cohorte final', text: `Corte final en ${form.nota_corte_3.toFixed(1)}. Es el más crítico por su complejidad y peso.`, good: false })

  if (recs.length === 0)
    recs.push({ icon: <CheckCircle2 size={14} />, title: '¡Excelente desempeño!', text: 'Todos tus indicadores son positivos. Mantén el ritmo y sigue así hasta el final del período.', good: true })

  return (
    <div className="space-y-2.5">
      {recs.map((rec, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className={`flex items-start gap-3 p-3.5 rounded-xl border ${
            rec.good ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <span className={`mt-0.5 flex-shrink-0 ${rec.good ? 'text-emerald-600' : 'text-amber-600'}`}>
            {rec.icon}
          </span>
          <div>
            <p className={`text-sm font-bold ${rec.good ? 'text-emerald-700' : 'text-amber-700'}`}>{rec.title}</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: rec.good ? '#166534' : '#92400e' }}>{rec.text}</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Shared result cards (used in both direct and explorer modes) ─────────────

// ─── Results carousel ─────────────────────────────────────────────────────────

function ResultCards({
  result, selectedCourse, finalForm,
}: {
  result: PredictionResult | null
  selectedCourse: BackendCourse | null
  finalForm: FormData
}) {
  const [active, setActive] = useState(0)
  const [dir,    setDir]    = useState(1)

  if (!result) return null

  type Slide = { id: string; label: string; icon: React.ElementType; accent: string }
  const slides: Slide[] = [
    { id: 'resultado',      label: 'Resultado',       icon: BarChart2,  accent: '#00b4d8' },
    { id: 'comparativa',    label: 'Comparativa',     icon: TrendingUp, accent: '#16a34a' },
    { id: 'radar',          label: 'Perfil',          icon: Sparkles,   accent: '#7c3aed' },
    { id: 'analisis',       label: 'Análisis IA',     icon: Bot,        accent: '#00b4d8' },
    { id: 'recomendaciones',label: 'Recomendaciones', icon: Lightbulb,  accent: '#d97706' },
  ]

  const goTo = (i: number) => { setDir(i > active ? 1 : -1); setActive(i) }
  const prev = () => { if (active > 0) goTo(active - 1) }
  const next = () => { if (active < slides.length - 1) goTo(active + 1) }

  // Drag-to-swipe support
  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x < -50 && active < slides.length - 1) next()
    if (info.offset.x >  50 && active > 0)               prev()
  }

  const slideContent: Record<string, React.ReactNode> = {
    resultado: (
      <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
        <div className="w-48 flex-shrink-0">
          <GaugeChart pct={result.porcentaje_riesgo} nivel={result.nivel_riesgo} />
        </div>
        <div className="flex-1 space-y-3 text-center sm:text-left">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-bold text-sm ${riskBgClass(result.nivel_riesgo)}`}>
            {riskIcon(result.nivel_riesgo)} Riesgo {result.nivel_riesgo}
          </div>
          {selectedCourse && (
            <p className="text-xs text-usb-faint">{selectedCourse.name}</p>
          )}
          <p className="text-sm text-usb-muted leading-relaxed">
            {result.nivel_riesgo === 'BAJO' && '¡Vas muy bien! Mantén tu ritmo actual y terminarás el período con éxito.'}
            {result.nivel_riesgo === 'MEDIO' && 'Zona de riesgo moderado. Pequeñas mejoras en tus cortes más débiles marcan la diferencia.'}
            {result.nivel_riesgo === 'ALTO' && 'Riesgo elevado. Actúa ahora: habla con tu profesor y usa todos los recursos disponibles.'}
          </p>
        </div>
      </div>
    ),
    comparativa: (
      <div>
        <p className="text-xs text-usb-muted mb-4 leading-relaxed">
          Compara tus notas por cohorte contra el promedio histórico de quienes aprobaron la materia.
          <span className="text-ar-cyan font-semibold"> Azul</span> = tus datos ·
          <span className="text-emerald-600 font-semibold"> Verde</span> = referencia de éxito.
        </p>
        <CompareBar
          labels={result.datos_radar.labels}
          studentVals={result.datos_radar.estudiante}
          avgVals={result.datos_radar.promedio_aprobado}
        />
      </div>
    ),
    radar: (
      <div>
        <p className="text-xs text-usb-muted mb-4 leading-relaxed">
          Radar de tus 4 variables del curso. Cuanto más cerca de la línea verde, mejor posicionado estás para aprobar.
        </p>
        <div className="max-w-sm mx-auto">
          <RadarChart datos={result.datos_radar} />
        </div>
      </div>
    ),
    analisis: (
      <div>
        <AIAnalysis text={result.analisis_ia} />
      </div>
    ),
    recomendaciones: (
      <div>
        <Recommendations form={finalForm} nivel={result.nivel_riesgo} />
      </div>
    ),
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-card border border-usb-border overflow-hidden"
    >
      {/* Tab bar — scrollable on mobile */}
      <div className="flex border-b border-usb-border overflow-x-auto scrollbar-hide">
        {slides.map((s, i) => {
          const Icon = s.icon
          const isActive = i === active
          return (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all border-b-2 ${
                isActive
                  ? 'border-ar-cyan text-ar-navy bg-ar-cyan/5'
                  : 'border-transparent text-usb-muted hover:text-usb-text hover:bg-usb-canvas'
              }`}
            >
              <Icon size={13} style={{ color: isActive ? s.accent : undefined }} />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Slide area — draggable on mobile */}
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={active}
            custom={dir}
            variants={{
              enter:  (d: number) => ({ opacity: 0, x: d * 48 }),
              center: { opacity: 1, x: 0 },
              exit:   (d: number) => ({ opacity: 0, x: d * -48 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="p-5 sm:p-6 min-h-[320px] cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'pan-y' }}
          >
            {slideContent[slides[active].id]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav: arrows + dots */}
      <div className="flex items-center justify-between px-5 pb-4 pt-1">
        <button
          onClick={prev}
          disabled={active === 0}
          className="w-8 h-8 rounded-full border border-usb-border flex items-center justify-center text-usb-muted hover:text-usb-text hover:border-usb-faint disabled:opacity-30 transition-all"
        >
          <ChevronLeft size={15} />
        </button>

        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-200 ${
                i === active ? 'w-5 h-2 bg-ar-cyan' : 'w-2 h-2 bg-usb-border hover:bg-usb-faint'
              }`}
            />
          ))}
        </div>

        <button
          onClick={next}
          disabled={active === slides.length - 1}
          className="w-8 h-8 rounded-full border border-usb-border flex items-center justify-center text-usb-muted hover:text-usb-text hover:border-usb-faint disabled:opacity-30 transition-all"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </motion.div>
  )
}

function CohortRiskSummary({ risks }: { risks: CohortRiskResult[] }) {
  if (risks.length === 0) return null
  return (
    <div className="bg-white rounded-2xl shadow-card border border-usb-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={14} className="text-ar-cyan" />
        <h3 className="text-sm font-bold text-usb-text">Riesgo por cohorte</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {risks.map((risk) => (
          <div key={risk.cohort_key} className="rounded-xl border border-usb-border bg-usb-canvas p-3">
            <p className="text-[0.7rem] font-semibold text-usb-faint uppercase tracking-wide">{risk.cohort_name}</p>
            <p className="text-xl font-black mt-1" style={{ color: riskColor(risk.nivel_riesgo) }}>
              {risk.porcentaje_riesgo.toFixed(0)}%
            </p>
            <p className={`inline-flex mt-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full border ${riskBgClass(risk.nivel_riesgo)}`}>
              {risk.nivel_riesgo}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Floating chat bubble ─────────────────────────────────────────────────────

function FloatingChat({ result, formData }: { result: PredictionResult | null; formData: FormData }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="w-80 sm:w-96 rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}
          >
            <InlineChatBot result={result} formData={formData} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle bubble */}
      <motion.button
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-colors"
        style={{ background: open ? '#1a2e35' : 'var(--green-deep)', border: '2px solid rgba(212,233,226,0.25)' }}
        aria-label="Consejero académico IA"
      >
        <AnimatePresence mode="wait">
          {open
            ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <X size={22} style={{ color: '#d4e9e2' }} />
              </motion.span>
            : <motion.span key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <Bot size={22} style={{ color: '#d4e9e2' }} />
              </motion.span>
          }
        </AnimatePresence>
      </motion.button>
    </div>
  )
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ courseName }: { courseName?: string }) {
  const crumbs = [
    { label: 'Mi Progreso', to: '/' },
    ...(courseName ? [{ label: courseName }] : [{ label: 'Predicción' }]),
  ]

  return (
    <nav aria-label="breadcrumb" className="max-w-5xl mx-auto w-full px-5 pt-4 pb-1">
      <ol className="flex items-center gap-1 flex-wrap">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-usb-faint flex-shrink-0" />}
              {'to' in crumb && !isLast ? (
                <Link
                  to={crumb.to!}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--green-accent)' }}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={`text-xs font-medium ${isLast ? 'text-usb-text' : 'text-usb-muted'}`}>
                  {crumb.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ─── DB grade read-only display ───────────────────────────────────────────────

function GradeCard({
  label, value, unit, color = '#00b4d8',
}: {
  label: string; value: number | string; unit?: string; color?: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-usb-border bg-white">
      <span className="text-xs font-semibold text-usb-subtle">{label}</span>
      <span
        className="text-sm font-black tabular-nums px-2 py-0.5 rounded-lg"
        style={{ color, background: `${color}18` }}
      >
        {value}{unit}
      </span>
    </div>
  )
}

// ─── Corte section card ───────────────────────────────────────────────────────

function CorteSection({
  number, hasData, accentColor, children,
}: {
  number: number
  hasData: boolean
  accentColor: string
  children?: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        background: hasData ? `${accentColor}08` : 'var(--canvas-warm)',
        border: hasData
          ? `1px solid ${accentColor}35`
          : '1px dashed #cbd5e1',
      }}
    >
      {/* Corte header */}
      <div className="flex items-center gap-1.5">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-[0.6rem] font-black flex-shrink-0"
          style={{ background: `${accentColor}20`, color: accentColor }}
        >
          {number}
        </span>
        <span className="text-xs font-bold" style={{ color: accentColor }}>
          Corte {number}
        </span>
        <span
          className="ml-auto text-[0.58rem] font-semibold px-1.5 py-0.5 rounded-full"
          style={{
            background: hasData ? `${accentColor}18` : '#f1f5f9',
            color:      hasData ? accentColor : '#94a3b8',
          }}
        >
          {hasData ? 'Registrado' : 'Pendiente'}
        </span>
      </div>

      {/* Content */}
      {hasData ? (
        <div className="space-y-1.5">{children}</div>
      ) : (
        <div className="flex items-center justify-center min-h-[56px]">
          <span className="text-[0.7rem] font-medium" style={{ color: '#94a3b8' }}>
            — Sin registrar —
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Grades organised by corte ────────────────────────────────────────────────

function GradesByCorte({ grades, compact = false }: { grades: FormData; compact?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Database size={13} className="text-emerald-600" />
        <h3 className="font-semibold text-usb-text text-sm">Notas registradas en el sistema</h3>
      </div>

      <div className={`grid gap-2.5 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
        <CorteSection number={1} hasData accentColor="#059669">
          <GradeCard label="Nota cohorte" value={grades.nota_corte_1.toFixed(2)} unit="/5" color="#059669" />
        </CorteSection>

        <CorteSection number={2} hasData accentColor="#0369a1">
          <GradeCard label="Nota cohorte" value={grades.nota_corte_2.toFixed(2)} unit="/5" color="#0369a1" />
        </CorteSection>

        <CorteSection number={3} hasData accentColor="#7c3aed">
          <GradeCard label="Nota cohorte" value={grades.nota_corte_3.toFixed(2)} unit="/5" color="#7c3aed" />
        </CorteSection>
      </div>

      <div className="mt-2.5">
        <div className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-usb-border bg-white">
          <span className="text-xs font-semibold text-usb-subtle">Nota total</span>
          <span className="text-sm font-black text-usb-text">{grades.nota_total.toFixed(2)}/5</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Prediccion() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const urlCourseId = searchParams.get('courseId') ?? ''

  // ── Load enrolled courses + enrollments (with grades) from backend ──────────
  const studentId = user?.studentId ?? user?.id ?? ''
  const [enrolledCourses, setEnrolledCourses]       = useState<BackendCourse[]>([])
  const [enrollmentMap,   setEnrollmentMap]          = useState<Map<string, BackendEnrollment>>(new Map())
  const [coursesLoading,  setCoursesLoading]         = useState(true)

  useEffect(() => {
    if (!studentId) { setCoursesLoading(false); return }
    void (async () => {
      try {
        const enrollments = await enrollmentService.listByStudent(studentId)
        const active = enrollments.filter(e => e.status === 'ACTIVE')

        // Build course_id → enrollment map for grade lookup
        const map = new Map<string, BackendEnrollment>()
        active.forEach(e => map.set(e.course_id, e))
        setEnrollmentMap(map)

        // Fetch course details sequentially to avoid overwhelming the backend
        const enrolledCourses: BackendCourse[] = []
        for (const e of active) {
          try {
            const course = await courseService.getById(e.course_id)
            enrolledCourses.push(course)
          } catch { /* ignore individual failures */ }
        }
        setEnrolledCourses(enrolledCourses)
      } catch { /* ignore */ } finally {
        setCoursesLoading(false)
      }
    })()
  }, [studentId])

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedCourseId, setSelectedCourseId] = useState<string>(urlCourseId)
  const [result, setResult]     = useState<PredictionResult | null>(null)
  const [cohortRisks, setCohortRisks] = useState<CohortRiskResult[]>([])
  const [predLoading, setPredLoading] = useState(false)
  const [error, setError]       = useState('')
  const [showMath, setShowMath] = useState(false)
  const [dbGrades, setDbGrades] = useState<FormData | null>(null)

  // Manual fallback inputs (when DB grades are not available yet)
  const [notaCorte1, setNotaCorte1] = useState(3.2)
  const [notaCorte2, setNotaCorte2] = useState(3.2)
  const [notaCorte3, setNotaCorte3] = useState(3.2)

  const resultsRef = useRef<HTMLDivElement>(null)

  const selectedCourse     = enrolledCourses.find(c => c.id === selectedCourseId) ?? null
  const selectedEnrollment = selectedCourseId ? enrollmentMap.get(selectedCourseId) ?? null : null

  const finalForm: FormData = dbGrades ?? {
    nota_corte_1: notaCorte1,
    nota_corte_2: notaCorte2,
    nota_corte_3: notaCorte3,
    nota_total: computeTotal(notaCorte1, notaCorte2, notaCorte3),
  }

  useEffect(() => {
    if (!selectedEnrollment?.id) {
      setDbGrades(null)
      return
    }
    void (async () => {
      try {
        const grades = await enrollmentService.getGrades(selectedEnrollment.id)
        const c1 = grades.first_cohort_grade
        const c2 = grades.second_cohort_grade
        const c3 = grades.third_cohort_grade
        const total = grades.final_grade

        if (c1 != null && c2 != null && c3 != null) {
          const computedTotal = total ?? computeTotal(c1, c2, c3)
          setDbGrades({
            nota_corte_1: Number(c1),
            nota_corte_2: Number(c2),
            nota_corte_3: Number(c3),
            nota_total: Number(computedTotal),
          })
        } else {
          setDbGrades(null)
        }

      } catch {
        setDbGrades(null)
      }
    })()
  }, [selectedEnrollment?.id])

  // Pre-select from URL param or first course
  useEffect(() => {
    if (enrolledCourses.length === 0) return
    if (urlCourseId && enrolledCourses.find(c => c.id === urlCourseId)) {
      setSelectedCourseId(urlCourseId)
    } else if (!selectedCourseId) {
      setSelectedCourseId(enrolledCourses[0].id)
    }
  }, [enrolledCourses, urlCourseId, selectedCourseId])

  // ── Core predict function ──────────────────────────────────────────────────
  const runPrediction = useCallback(async (form: FormData, course: BackendCourse) => {
    setPredLoading(true)
    setError('')
    setResult(null)
    setCohortRisks([])

    try {
      const data = await predictionService.predict({
        nota_corte_1: form.nota_corte_1,
        nota_corte_2: form.nota_corte_2,
        nota_corte_final: form.nota_corte_3,
        nota_total: form.nota_total,
      }, user?.studentId)

      setResult(data as unknown as PredictionResult)

      if (selectedEnrollment?.id) {
        const cohortKeys: Array<'first_cohort' | 'second_cohort' | 'third_cohort'> = [
          'first_cohort',
          'second_cohort',
          'third_cohort',
        ]
        const risks = await Promise.all(
          cohortKeys.map(async (cohortKey) => {
            const r = await enrollmentService.getCohortRisk(selectedEnrollment.id, cohortKey)
            return {
              cohort_key: r.cohort_key,
              cohort_name: r.cohort_name,
              porcentaje_riesgo: r.porcentaje_riesgo,
              nivel_riesgo: r.nivel_riesgo,
            } as CohortRiskResult
          }),
        )
        setCohortRisks(risks)
      }
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)

      // Notify professor for HIGH risk
      if ((data as unknown as PredictionResult).nivel_riesgo === 'ALTO') {
        void (async () => {
          try {
            const professor = await courseService.getCourseProf(course.id)
            await notificationService.sendRiskAlert({
              student_name:    user?.name ?? 'Estudiante',
              student_email:   user?.email ?? '',
              professor_email: professor.email,
              professor_name:  professor.full_name,
              risk_level:      'ALTO',
              course_name:     course.name,
            })
          } catch { /* non-critical */ }
        })()
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('La petición tardó demasiado. El servidor puede estar iniciando. Intenta de nuevo.')
        } else if (err.message.toLowerCase().includes('consentimiento') || err.message.includes('403')) {
          setError('Necesitas aceptar los términos de uso del predictor antes de continuar.')
        } else {
          setError(`Error: ${err.message}`)
        }
      } else {
        setError('No se pudo conectar con el servidor. Verifica tu conexión.')
      }
    } finally {
      setPredLoading(false)
    }
  }, [selectedEnrollment?.id, user])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCourse) return
    await runPrediction(finalForm, selectedCourse)
  }, [finalForm, selectedCourse, runPrediction])

  const reset = () => { setResult(null); setError(''); setCohortRisks([]) }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-usb-canvas flex flex-col">
      <Header />

      {/* Profile strip */}
      <div className="relative overflow-hidden"
           style={{ background: 'var(--green-deep)', borderBottom: '1px solid rgba(0,0,0,0.25)' }}>
        <div className="max-w-5xl mx-auto px-5 py-5 flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(212,233,226,0.25) 0%, rgba(0,117,74,0.30) 100%)',
              border: '2px solid rgba(212,233,226,0.35)',
              color: '#d4e9e2',
            }}
          >
            {(user?.name ?? 'ES').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white font-extrabold text-base leading-tight truncate" style={{ letterSpacing: '-0.01em' }}>
              {user?.name ?? 'Estudiante'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <GraduationCap size={11} style={{ color: 'rgba(212,233,226,0.55)' }} />
              <p className="text-xs truncate" style={{ color: 'rgba(212,233,226,0.55)' }}>
                {selectedCourse ? `Analizando: ${selectedCourse.name}` : 'Predicción de riesgo académico con IA'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <Breadcrumb courseName={selectedCourse?.name} />

      {/* ═══════════════════════════════════════════════════════════════════
          DIRECT MODE — arrived via ?courseId=xxx from a course card
          Single focused layout: course info + grades + Calcular + results
          ═══════════════════════════════════════════════════════════════════ */}
      {urlCourseId ? (
        <main className="flex-1 max-w-2xl mx-auto w-full px-5 pt-4 pb-8 space-y-4">

          {/* Course info banner */}
          {coursesLoading ? (
            <div className="bg-white rounded-2xl shadow-card border border-usb-border p-8 flex justify-center">
              <Loader2 size={28} className="animate-spin text-ar-cyan" />
            </div>
          ) : selectedCourse ? (
            <div className="bg-white rounded-2xl shadow-card border border-usb-border p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-ar-cyan/10 flex items-center justify-center flex-shrink-0">
                <BookOpen size={22} className="text-ar-cyan" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-usb-text text-base leading-tight">{selectedCourse.name}</h2>
                <p className="text-xs text-usb-faint mt-0.5">{selectedCourse.code} · {selectedCourse.credits} créditos</p>
              </div>
            </div>
          ) : null}

          {/* Grades by corte (read-only, from DB) */}
          {dbGrades && selectedCourse && (
            <div className="bg-white rounded-2xl shadow-card border border-usb-border p-5">
              <GradesByCorte grades={dbGrades} />
            </div>
          )}

          {/* Calcular button — only before results */}
          {selectedCourse && !predLoading && !result && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => void runPrediction(finalForm, selectedCourse)}
              className="w-full flex items-center justify-center gap-2.5 bg-ar-cyan hover:bg-ar-cyan-dark text-white font-bold py-4 rounded-2xl transition-all shadow-glow hover:shadow-lg text-base"
            >
              <Sparkles size={18} />
              Calcular predicción
            </motion.button>
          )}

          {/* Recalculate after results */}
          {result && !predLoading && selectedCourse && (
            <button
              onClick={() => { reset(); void runPrediction(finalForm, selectedCourse) }}
              className="w-full flex items-center justify-center gap-2 border border-usb-border text-usb-muted hover:text-usb-text hover:border-ar-cyan/40 font-medium py-2.5 rounded-xl transition-all text-sm"
            >
              <RotateCcw size={13} />
              Recalcular
            </button>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
              >
                <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-600 text-sm leading-relaxed">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading */}
          {predLoading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-white rounded-2xl shadow-card border border-usb-border p-12 flex flex-col items-center"
            >
              <div className="relative mb-6">
                <Loader2 size={44} className="text-ar-cyan animate-spin" />
                <div className="absolute inset-0 rounded-full blur-xl opacity-30 bg-ar-cyan animate-pulse" />
              </div>
              <p className="font-bold text-usb-text text-lg mb-1">Analizando tu perfil…</p>
              <p className="text-usb-muted text-sm">El modelo de IA está procesando tus datos</p>
            </motion.div>
          )}

          {/* Results — reuse the same cards as explorer mode */}
          <div ref={resultsRef} className="space-y-4">
            <ResultCards result={result} selectedCourse={selectedCourse ?? null} finalForm={finalForm} />
            <CohortRiskSummary risks={cohortRisks} />
          </div>
        </main>

      ) : (
        /* ═══════════════════════════════════════════════════════════════════
           EXPLORER MODE — direct /prediccion navigation (no courseId)
           Two-column layout: course selector + results
           ═══════════════════════════════════════════════════════════════════ */
        <main className="flex-1 max-w-5xl mx-auto w-full px-5 pt-4 pb-8">
          <div className="grid lg:grid-cols-5 gap-6">

            {/* ── Form column ─────────────────────────────────────────────── */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-card border border-usb-border p-6 sticky top-20">

                {/* Course selector */}
                <div className="mb-6">
                  <h2 className="font-bold text-usb-text mb-3 flex items-center gap-2 text-sm">
                    <span className="w-6 h-6 rounded-full bg-ar-cyan text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                    Selecciona tu materia
                  </h2>

                  {coursesLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={20} className="animate-spin text-ar-cyan" />
                    </div>
                  ) : enrolledCourses.length === 0 ? (
                    <div className="bg-usb-canvas rounded-xl border border-usb-border p-4 text-center">
                      <BookOpen size={20} className="text-usb-faint mx-auto mb-2" />
                      <p className="text-usb-muted text-xs">No tienes materias activas inscritas</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {enrolledCourses.map(course => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => { setSelectedCourseId(course.id); setResult(null) }}
                          className={`w-full text-left px-3.5 py-3 rounded-xl border-2 transition-all flex items-center justify-between gap-2 ${
                            selectedCourseId === course.id
                              ? 'border-ar-cyan bg-ar-cyan/5 shadow-sm'
                              : 'border-usb-border bg-usb-canvas hover:border-ar-cyan/40'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold leading-tight truncate ${selectedCourseId === course.id ? 'text-ar-navy' : 'text-usb-subtle'}`}>
                              {course.name}
                            </p>
                            <p className="text-[0.65rem] text-usb-faint mt-0.5">{course.code} · {course.credits} créditos</p>
                          </div>
                          {selectedCourseId === course.id && (
                            <div className="w-2 h-2 rounded-full bg-ar-cyan flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Indicators */}
                {selectedCourse && (
                  <form onSubmit={e => void handleSubmit(e)}>
                    <h2 className="font-bold text-usb-text mb-3 flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-ar-cyan/20 text-ar-cyan flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                      Notas por cohorte
                    </h2>

                    {dbGrades ? (
                      <div className="space-y-3 mb-5">
                        <GradesByCorte grades={dbGrades} compact />
                        <button type="submit" disabled={predLoading}
                          className="w-full flex items-center justify-center gap-2 bg-ar-cyan hover:bg-ar-cyan-dark disabled:opacity-60 text-white font-bold py-3.5 rounded-full transition-all shadow-glow"
                        >
                          {predLoading ? <><Loader2 size={15} className="animate-spin" /> Calculando…</> : <><Sparkles size={15} /> Calcular predicción</>}
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-[0.68rem] text-usb-faint mb-3 flex items-center gap-1">
                          <Info size={10} /> Sin notas consolidadas en el sistema. Introduce valores manualmente.
                        </p>
                        <Slider label="Nota Corte 1" value={notaCorte1} onChange={setNotaCorte1} min={0} max={5} step={0.1} unit="/5" color="#059669" />
                        <Slider label="Nota Corte 2" value={notaCorte2} onChange={setNotaCorte2} min={0} max={5} step={0.1} unit="/5" color="#0369a1" />
                        <Slider label="Nota Corte Final" value={notaCorte3} onChange={setNotaCorte3} min={0} max={5} step={0.1} unit="/5" color="#7c3aed" />
                        <div className="mb-5 flex items-center justify-between px-4 py-3 rounded-xl border border-usb-border bg-usb-canvas">
                          <span className="text-sm font-semibold text-usb-subtle">Nota total calculada</span>
                          <span className="text-sm font-black text-usb-text tabular-nums">
                            {computeTotal(notaCorte1, notaCorte2, notaCorte3).toFixed(2)}/5
                          </span>
                        </div>
                        <button type="submit" disabled={predLoading}
                          className="w-full flex items-center justify-center gap-2 bg-ar-cyan hover:bg-ar-cyan-dark disabled:opacity-60 text-white font-bold py-3.5 rounded-full transition-all shadow-glow hover:shadow-lg"
                        >
                          {predLoading ? <><Loader2 size={16} className="animate-spin" /> Calculando…</> : <><Sparkles size={16} /> Calcular mi riesgo</>}
                        </button>
                      </>
                    )}

                    <AnimatePresence>
                      {error && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
                        >
                          <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                          <p className="text-red-600 text-xs leading-relaxed">{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {result && (
                      <button type="button" onClick={reset}
                        className="w-full flex items-center justify-center gap-1.5 text-usb-muted hover:text-usb-text text-xs font-medium mt-2 py-2 transition-colors"
                      >
                        <RotateCcw size={12} /> Reiniciar
                      </button>
                    )}
                  </form>
                )}
              </div>
            </div>

            {/* ── Results column ──────────────────────────────────────────── */}
            <div className="lg:col-span-3 space-y-5" ref={resultsRef}>
              {!result && !predLoading && !selectedCourseId && (
                <div className="bg-white rounded-2xl shadow-card border border-usb-border p-12 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-usb-canvas border border-usb-border flex items-center justify-center mb-4">
                    <BarChart2 size={28} className="text-usb-faint" />
                  </div>
                  <p className="font-bold text-usb-text mb-1">Selecciona una materia</p>
                  <p className="text-usb-muted text-sm">Elige la materia que quieres analizar</p>
                </div>
              )}
              {!result && !predLoading && !!selectedCourseId && !dbGrades && (
                <div className="bg-white rounded-2xl shadow-card border border-usb-border p-12 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-usb-canvas border border-usb-border flex items-center justify-center mb-4">
                    <BarChart2 size={28} className="text-usb-faint" />
                  </div>
                  <p className="font-bold text-usb-text mb-1">Ajusta tus notas por cohorte</p>
                  <p className="text-usb-muted text-sm">Mueve los controles y presiona "Calcular mi riesgo"</p>
                </div>
              )}

            {/* Loading */}
            {predLoading && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white rounded-2xl shadow-card border border-usb-border p-12 flex flex-col items-center"
              >
                <div className="relative mb-6">
                  <Loader2 size={44} className="text-ar-cyan animate-spin" />
                  <div className="absolute inset-0 rounded-full blur-xl opacity-30 bg-ar-cyan animate-pulse" />
                </div>
                <p className="font-bold text-usb-text text-lg mb-1">Analizando tu perfil…</p>
                <p className="text-usb-muted text-sm">El modelo de IA está procesando tus datos</p>
              </motion.div>
            )}

            {/* Results */}
            <div className="space-y-4">
              <ResultCards result={result} selectedCourse={selectedCourse} finalForm={finalForm} />
              <CohortRiskSummary risks={cohortRisks} />
            </div>
          </div>
        </div>
        </main>
      )}

      {/* ── Floating: math model button (bottom-left) ─────────────────── */}
      <AnimatePresence>
        {result && (
          <motion.button
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onClick={() => setShowMath(true)}
            className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-white border border-usb-border shadow-lg px-3.5 py-2.5 rounded-full text-xs font-semibold text-usb-subtle hover:border-ar-cyan/50 hover:text-usb-text transition-all"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
          >
            <Calculator size={14} className="text-ar-cyan flex-shrink-0" />
            <span className="hidden sm:inline">¿Cómo calculamos esto?</span>
            <span className="sm:hidden">Modelo</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Floating: chat bubble (bottom-right) ──────────────────────── */}
      <FloatingChat result={result} formData={finalForm} />

      {/* Math modal */}
      <AnimatePresence>
        {showMath && result && (
          <MathModal result={result} onClose={() => setShowMath(false)} />
        )}
      </AnimatePresence>

    </div>
  )
}
