import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, Bot, User, BookOpen, FileText } from 'lucide-react'
// react-markdown no disponible en registry interno — renderizador inline mínimo
function ReactMarkdown({ children }: { children: string; components?: unknown }) {
  const html = (children || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded text-xs font-mono bg-black/10">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="font-bold mt-2 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-base mt-2 mb-1">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc leading-snug">$1</li>')
    .replace(/\n/g, '<br/>')
  return <p className="leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
}
import { ragService, type RagEvidence } from '../services/ragService'

// Preprocesa el texto plano del RAG para convertirlo a markdown legible
function prepareMarkdown(text: string): string {
  // 1. Eliminar citas inline [archivo.pdf — pág. X]
  let result = text.replace(/\[([^\]]*?\.pdf[^\]]*?)\]/gi, '').trim()

  // 2. Salto de línea antes de cada ítem numerado que sigue a otro texto
  //    "presentaciones. 2. El verbo" → "presentaciones.\n2. El verbo"
  result = result.replace(/([.!?])\s+(\d{1,2}\.\s)/g, '$1\n$2')

  // 3. Salto de línea cuando un ítem numerado sigue a ":" o ","
  //    "siguientes: 1. Saludos" → "siguientes:\n1. Saludos"
  result = result.replace(/([,:]\s*)(\d{1,2}\.\s)/g, '$1\n$2')

  // 4. Salto de línea antes de guiones de lista "- texto"
  result = result.replace(/\s+-\s+/g, '\n- ')

  // 5. Eliminar espacios múltiples residuales (pero respetar los \n)
  result = result.replace(/[ \t]{2,}/g, ' ')

  return result
}

interface Message {
  role:      'user' | 'assistant'
  content:   string
  evidences?: RagEvidence[]
  error?:    boolean
}

interface PredictionContext {
  nivel_riesgo: 'BAJO' | 'MEDIO' | 'ALTO'
  porcentaje_riesgo: number
  analisis_ia?: string
}

interface Props {
  courseId:          string
  courseName:        string
  predictionContext?: PredictionContext
}

function EvidenceChip({ ev }: { ev: RagEvidence }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[0.65rem] font-semibold"
      style={{ background: 'rgba(0,117,74,0.08)', color: 'var(--green-accent)', border: '1px solid rgba(0,117,74,0.15)' }}
    >
      <FileText size={10} />
      {ev.file} · pág. {ev.page}
    </div>
  )
}

export default function CourseChat({ courseId, courseName, predictionContext }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage() {
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const queryText = predictionContext
        ? `[Contexto del análisis predictivo del estudiante: Nivel de riesgo ${predictionContext.nivel_riesgo} (${Math.round(predictionContext.porcentaje_riesgo)}%). ${predictionContext.analisis_ia ? 'Análisis IA: ' + predictionContext.analisis_ia.slice(0, 300) + '...' : ''}] ${question}`
        : question
      const res = await ragService.query(queryText, courseId)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: res.answer, evidences: res.evidences },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'No se pudo obtener una respuesta. Intenta de nuevo.',
          error: true,
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div
      className="bg-white rounded-2xl flex flex-col overflow-hidden"
      style={{
        boxShadow: 'var(--shadow-card)',
        border: '1px solid rgba(0,0,0,0.07)',
        minHeight: '420px',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0"
        style={{ background: 'var(--green-deep)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(212,233,226,0.18)', border: '1px solid rgba(212,233,226,0.25)' }}
        >
          <Bot size={15} style={{ color: 'var(--green-light)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-extrabold text-sm leading-tight">Risko IA</p>
          <p className="text-white/45 text-[0.68rem] truncate">{courseName}</p>
        </div>
        {/* Indicador de estado */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-white/40 text-[0.60rem] font-semibold">En línea</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center pb-4"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'rgba(0,117,74,0.07)', border: '1px solid rgba(0,117,74,0.12)' }}
            >
              <BookOpen size={22} style={{ color: 'var(--green-accent)' }} />
            </div>
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-dark)' }}>
              Pregúntale al asistente
            </p>
            {predictionContext ? (
              <div
                className="mt-2 px-3 py-2 rounded-xl text-xs font-semibold max-w-[260px] text-center"
                style={{ background: 'rgba(0,117,74,0.08)', color: 'var(--green-accent)', border: '1px solid rgba(0,117,74,0.15)' }}
              >
                Tengo tu análisis de riesgo listo — pregúntame sobre tu rendimiento y los documentos del curso
              </div>
            ) : (
              <p className="text-xs max-w-[240px]" style={{ color: 'var(--text-faint)' }}>
                Responde basado en los documentos que subió tu docente para esta materia.
              </p>
            )}
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: msg.role === 'user' ? 'var(--green-accent)' : 'rgba(0,117,74,0.10)',
                }}
              >
                {msg.role === 'user'
                  ? <User size={13} className="text-white" />
                  : <Bot size={13} style={{ color: 'var(--green-accent)' }} />}
              </div>

              {/* Bubble */}
              <div className={`flex flex-col gap-1.5 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className="px-3.5 py-2.5 text-sm leading-relaxed"
                  style={msg.role === 'user'
                    ? { background: 'var(--green-accent)', color: 'white', borderRadius: '18px 18px 4px 18px' }
                    : {
                        background: msg.error ? '#fff1f2' : 'var(--canvas-warm)',
                        color: msg.error ? '#b91c1c' : 'var(--text-dark)',
                        border: msg.error ? '1px solid #fecdd3' : '1px solid rgba(0,0,0,0.06)',
                        borderRadius: '18px 18px 18px 4px',
                      }}
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <ReactMarkdown>
                      {prepareMarkdown(msg.content)}
                    </ReactMarkdown>
                  )}
                </div>

                {/* Evidences */}
                {msg.evidences && msg.evidences.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {msg.evidences.map((ev, j) => (
                      <EvidenceChip key={j} ev={ev} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,117,74,0.10)' }}
            >
              <Bot size={13} style={{ color: 'var(--green-accent)' }} />
            </div>
            <div
              className="px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5"
              style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '18px 18px 18px 4px' }}
            >
              <Loader2 size={13} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>
                Consultando documentos…
              </span>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(0,0,0,0.07)', background: 'white' }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Escribe tu pregunta…"
          disabled={loading}
          className="flex-1 text-sm px-3.5 py-2 rounded-xl outline-none transition-all"
          style={{
            background: 'var(--canvas-warm)',
            border: '1px solid rgba(0,0,0,0.09)',
            color: 'var(--text-dark)',
          }}
          onFocus={e => (e.currentTarget.style.border = '1px solid rgba(0,117,74,0.40)')}
          onBlur={e => (e.currentTarget.style.border = '1px solid rgba(0,0,0,0.09)')}
        />
        <button
          onClick={() => { void sendMessage() }}
          disabled={!input.trim() || loading}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
          style={{
            background: !input.trim() || loading ? '#e5e7eb' : 'var(--green-accent)',
            color: !input.trim() || loading ? '#9ca3af' : 'white',
            boxShadow: input.trim() && !loading ? '0 2px 8px rgba(0,117,74,0.30)' : 'none',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
