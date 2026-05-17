/**
 * RiskoAnalysis — Renders AI-generated risk analysis text as structured visual sections.
 * Parses the `analisis_ia` multi-paragraph string and displays each paragraph
 * with an appropriate icon and style based on its content.
 */

import { Sparkles, BarChart2, TrendingUp, TrendingDown, Target, Lightbulb } from 'lucide-react'

// ─── Inline markdown renderer ─────────────────────────────────────────────────
// Parses **bold**, *italic*, and `code` spans without a full markdown library.

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1 rounded text-[0.7em] font-mono" style={{ background: 'rgba(0,0,0,0.07)' }}>
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  analisis: string
  nivel: 'ALTO' | 'MEDIO' | 'BAJO'
  compact?: boolean
}

type SectionKind =
  | 'summary'
  | 'grades'
  | 'trend'
  | 'gap'
  | 'recommendation'
  | 'generic'

interface ParsedSection {
  kind: SectionKind
  text: string
  trendPositive?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<'ALTO' | 'MEDIO' | 'BAJO', { text: string; tint: string; dot: string }> = {
  ALTO:  { text: '#dc2626', tint: 'rgba(220,38,38,0.07)',   dot: '#dc2626' },
  MEDIO: { text: '#d97706', tint: 'rgba(217,119,6,0.07)',   dot: '#d97706' },
  BAJO:  { text: '#16a34a', tint: 'rgba(22,163,74,0.07)',   dot: '#16a34a' },
}

function detectKind(text: string): SectionKind {
  const t = text.toLowerCase()
  if (/^(tu riesgo|vas bien)/.test(t)) return 'summary'
  if (t.includes('corte') && t.includes('punto')) return 'grades'
  if (t.includes('tendencia')) return 'trend'
  if (t.includes('para aprobar') || t.includes('necesitas') || t.includes('garantizada')) return 'gap'
  if (t.includes('consulta') || t.includes('dedica') || t.includes('refuerza') || t.includes('sigue así')) return 'recommendation'
  return 'generic'
}

function isTrendPositive(text: string): boolean {
  const t = text.toLowerCase()
  return t.includes('positiva') || t.includes('alza')
}

function parseSections(analisis: string): ParsedSection[] {
  return analisis
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(text => {
      const kind = detectKind(text)
      return {
        kind,
        text,
        trendPositive: kind === 'trend' ? isTrendPositive(text) : undefined,
      }
    })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummarySection({ text }: { text: string }) {
  return (
    <div
      className="rounded-full px-3 py-1.5 text-xs font-semibold text-center"
      style={{
        background: 'var(--green-accent)',
        color: '#fff',
        letterSpacing: '0.01em',
      }}
    >
      {renderInlineMarkdown(text)}
    </div>
  )
}

function GradeLines({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return (
    <div className="flex flex-col gap-1 w-full">
      {lines.map((line, i) => {
        const t = line.toLowerCase()
        const isAbove = t.includes('por encima')
        const isBelow = t.includes('por debajo')
        const dotColor = isAbove ? '#16a34a' : isBelow ? '#dc2626' : 'var(--text-faint)'
        return (
          <div key={i} className="flex items-start gap-2">
            <span
              className="mt-1.5 flex-shrink-0 rounded-full"
              style={{ width: 6, height: 6, background: dotColor, marginTop: 5 }}
            />
            <span className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
              {renderInlineMarkdown(line)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function GenericText({ text }: { text: string }) {
  return (
    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
      {renderInlineMarkdown(text)}
    </p>
  )
}

// ─── Section row ──────────────────────────────────────────────────────────────

function Section({ section, nivel }: { section: ParsedSection; nivel: 'ALTO' | 'MEDIO' | 'BAJO' }) {
  const rc = RISK_COLORS[nivel]

  if (section.kind === 'summary') {
    return <SummarySection text={section.text} />
  }

  const iconProps = { size: 14, style: { color: 'var(--text-faint)', flexShrink: 0, marginTop: 1 } as React.CSSProperties }

  let icon: React.ReactNode = null
  let body: React.ReactNode = null

  switch (section.kind) {
    case 'grades':
      icon = <BarChart2 {...iconProps} />
      body = <GradeLines text={section.text} />
      break

    case 'trend':
      icon = section.trendPositive
        ? <TrendingUp  {...iconProps} style={{ ...iconProps.style, color: '#16a34a' }} />
        : <TrendingDown {...iconProps} style={{ ...iconProps.style, color: '#dc2626' }} />
      body = <GenericText text={section.text} />
      break

    case 'gap':
      icon = <Target {...iconProps} />
      body = <GenericText text={section.text} />
      break

    case 'recommendation':
      icon = <Lightbulb {...iconProps} style={{ ...iconProps.style, color: rc.text }} />
      body = (
        <div
          className="rounded-lg px-2.5 py-2 w-full"
          style={{ background: rc.tint }}
        >
          <GenericText text={section.text} />
        </div>
      )
      break

    default:
      icon = null
      body = <GenericText text={section.text} />
  }

  return (
    <div className="flex items-start gap-2 w-full">
      {icon && <span style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>}
      <div className="flex-1 min-w-0">{body}</div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RiskoAnalysis({ analisis, nivel, compact = false }: Props) {
  const sections = parseSections(analisis)
  const visible = compact ? sections.slice(0, 2) : sections

  if (!analisis || sections.length === 0) return null

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3 w-full"
      style={{
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {/* Title row */}
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} style={{ color: 'var(--text-faint)' }} />
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
          Análisis de Risko
        </span>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-2.5 w-full">
        {visible.map((section, i) => (
          <Section key={i} section={section} nivel={nivel} />
        ))}
      </div>

      {compact && sections.length > 2 && (
        <p className="text-[0.6rem] text-center" style={{ color: 'var(--text-faint)' }}>
          + {sections.length - 2} sección{sections.length - 2 !== 1 ? 'es' : ''} más
        </p>
      )}
    </div>
  )
}
