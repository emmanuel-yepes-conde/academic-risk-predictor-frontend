/**
 * JobsPanel — sección de admin para gestionar jobs y disparadores.
 * Muestra jobs cron (editables) y triggers de evento (informativos).
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, RefreshCw, Clock, Zap, Mail, MessageSquare, Bell, Pencil, Check, X, ChevronDown, ChevronUp, Loader2, FlaskConical, Phone } from 'lucide-react'
import { jobsService, type JobConfig } from '../services/jobsService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  whatsapp: { label: 'WhatsApp', color: '#25d366', icon: <MessageSquare size={11} /> },
  email:    { label: 'Email',    color: '#0078d4', icon: <Mail          size={11} /> },
  inapp:    { label: 'In-app',   color: '#7c3aed', icon: <Bell          size={11} /> },
}

function ChannelBadge({ channel }: { channel: string }) {
  const meta = CHANNEL_META[channel] ?? { label: channel, color: '#888', icon: null }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[0.6rem] font-bold"
      style={{ background: meta.color }}
    >
      {meta.icon}
      {meta.label}
    </span>
  )
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  })
}

// ─── JobCard ──────────────────────────────────────────────────────────────────

interface JobCardProps {
  job: JobConfig
  onUpdate: (updated: JobConfig) => void
  onToast: (msg: string, ok?: boolean) => void
}

function TestModal({ job, onClose, onToast }: { job: JobConfig; onClose: () => void; onToast: (msg: string, ok?: boolean) => void }) {
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!email.trim() && !phone.trim()) return
    setSending(true)
    try {
      const res = await jobsService.test(job.id, email.trim() || undefined, phone.trim() || undefined)
      onToast(res.message)
      onClose()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Error al enviar prueba', false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        style={{ border: '1px solid rgba(0,0,0,0.1)' }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-extrabold text-sm" style={{ color: 'var(--text-dark)' }}>
              Enviar prueba
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{job.name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-usb-faint hover:text-rose-500 transition-colors">
            <X size={15} />
          </button>
        </div>

        <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Ingresa al menos un canal. Se enviará una notificación de prueba real.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[0.68rem] font-bold uppercase tracking-wider mb-1 flex items-center gap-1"
              style={{ color: 'var(--text-faint)' }}>
              <Mail size={11} /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full px-3 py-2 text-xs border border-usb-border rounded-xl focus:outline-none focus:border-green-accent transition-colors"
            />
          </div>
          <div>
            <label className="text-[0.68rem] font-bold uppercase tracking-wider mb-1 flex items-center gap-1"
              style={{ color: 'var(--text-faint)' }}>
              <Phone size={11} /> WhatsApp (sin +57)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="3001234567"
              className="w-full px-3 py-2 text-xs border border-usb-border rounded-xl focus:outline-none focus:border-green-accent transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-usb-border text-usb-muted hover:bg-usb-canvas transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => void send()}
            disabled={sending || (!email.trim() && !phone.trim())}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-50"
            style={{ background: '#d97706' }}
          >
            {sending
              ? <Loader2 size={12} className="animate-spin" />
              : <FlaskConical size={12} />}
            Enviar prueba
          </button>
        </div>
      </motion.div>
    </div>
  )
}


function JobCard({ job, onUpdate, onToast }: JobCardProps) {
  const [editing, setEditing]         = useState(false)
  const [cronDraft, setCronDraft]     = useState(job.cron_expr ?? '')
  const [nameDraft, setNameDraft]     = useState(job.name)
  const [saving, setSaving]           = useState(false)
  const [triggering, setTriggering]   = useState(false)
  const [testing, setTesting]         = useState(false)
  const [showTest, setShowTest]       = useState(false)
  const [expanded, setExpanded]       = useState(false)
  const isCron = job.job_type === 'cron'

  const save = async () => {
    setSaving(true)
    try {
      const updated = await jobsService.update(job.id, {
        name:      nameDraft !== job.name ? nameDraft : undefined,
        cron_expr: cronDraft !== job.cron_expr ? cronDraft : undefined,
      })
      onUpdate(updated)
      setEditing(false)
      onToast('Configuración guardada')
    } catch {
      onToast('No se pudo guardar', false)
    } finally {
      setSaving(false)
    }
  }

  const toggle = async () => {
    setSaving(true)
    try {
      const updated = await jobsService.update(job.id, { enabled: !job.enabled })
      onUpdate(updated)
    } catch {
      onToast('No se pudo actualizar', false)
    } finally {
      setSaving(false)
    }
  }

  const triggerNow = async () => {
    if (!isCron) return
    setTriggering(true)
    try {
      const res = await jobsService.trigger(job.id)
      onToast(res.message)
      onUpdate({ ...job, last_run_at: new Date().toISOString() })
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Error al ejecutar', false)
    } finally {
      setTriggering(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-3">
        {/* Icono tipo */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: isCron ? 'rgba(0,117,74,0.1)' : 'rgba(124,58,237,0.1)' }}
        >
          {isCron
            ? <Clock size={17} style={{ color: 'var(--green-accent)' }} />
            : <Zap  size={17} style={{ color: '#7c3aed' }} />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Nombre */}
          {editing ? (
            <input
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              className="text-sm font-bold w-full border-b border-usb-border outline-none pb-0.5 mb-1"
              style={{ color: 'var(--text-dark)' }}
            />
          ) : (
            <p className="text-sm font-bold" style={{ color: 'var(--text-dark)' }}>{job.name}</p>
          )}

          {/* Cron expr o trigger event */}
          {isCron && (
            editing ? (
              <div className="flex items-center gap-1.5 mt-1">
                <code
                  className="text-xs flex-1 border rounded-lg px-2 py-1 font-mono outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={e => setCronDraft(e.currentTarget.textContent ?? '')}
                  style={{ borderColor: 'rgba(0,0,0,0.15)', color: 'var(--text-dark)' }}
                >
                  {cronDraft}
                </code>
              </div>
            ) : (
              <code
                className="text-[0.7rem] px-2 py-0.5 rounded-md font-mono mt-0.5 inline-block"
                style={{ background: 'var(--canvas-warm)', color: 'var(--text-muted)' }}
              >
                {job.cron_expr ?? '—'}
              </code>
            )
          )}
          {!isCron && (
            <code
              className="text-[0.7rem] px-2 py-0.5 rounded-md font-mono mt-0.5 inline-block"
              style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}
            >
              {job.trigger_event ?? '—'}
            </code>
          )}

          {/* Canales */}
          <div className="flex flex-wrap gap-1 mt-2">
            {job.channels.map(ch => <ChannelBadge key={ch} channel={ch} />)}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Toggle habilitado */}
          <button
            onClick={toggle}
            disabled={saving}
            className="w-8 h-4 rounded-full transition-colors relative flex-shrink-0"
            style={{ background: job.enabled ? 'var(--green-accent)' : '#d1d5db' }}
            title={job.enabled ? 'Deshabilitar' : 'Habilitar'}
          >
            <span
              className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm"
              style={{ left: '2px', transform: job.enabled ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </button>

          {/* Editar (solo cron) */}
          {isCron && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-faint)' }}
              title="Editar"
            >
              <Pencil size={13} />
            </button>
          )}
          {editing && (
            <>
              <button onClick={save} disabled={saving}
                className="p-1.5 rounded-lg"
                style={{ color: 'var(--green-accent)' }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              </button>
              <button onClick={() => { setEditing(false); setCronDraft(job.cron_expr ?? ''); setNameDraft(job.name) }}
                className="p-1.5 rounded-lg" style={{ color: '#ef4444' }}>
                <X size={13} />
              </button>
            </>
          )}

          {/* Ejecutar ahora (solo cron) */}
          {isCron && (
            <>
              <button
                onClick={triggerNow}
                disabled={triggering || !job.enabled}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity"
                style={{ background: job.enabled ? 'var(--green-accent)' : '#9ca3af', opacity: triggering ? 0.7 : 1 }}
                title="Ejecutar ahora"
              >
                {triggering
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Play size={11} />}
                Ejecutar
              </button>
              <button
                onClick={() => setShowTest(true)}
                disabled={testing}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity"
                style={{ background: '#d97706', opacity: testing ? 0.7 : 1 }}
                title="Enviar notificación de prueba"
              >
                <FlaskConical size={11} />
                Test
              </button>
            </>
          )}

          {/* Expandir descripción */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--text-faint)' }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Descripción expandible */}
      {expanded && (
        <div
          className="px-5 pb-4 pt-0 text-xs"
          style={{ color: 'var(--text-muted)', borderTop: '1px solid rgba(0,0,0,0.06)' }}
        >
          <p className="mt-3">{job.description}</p>
          {job.last_run_at && (
            <p className="mt-2 font-semibold" style={{ color: 'var(--text-faint)' }}>
              Última ejecución: {fmtDate(job.last_run_at)}
            </p>
          )}
        </div>
      )}

      {/* Modal de prueba */}
      <AnimatePresence>
        {showTest && (
          <TestModal
            job={job}
            onClose={() => setShowTest(false)}
            onToast={onToast}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Panel principal ──────────────────────────────────────────────────────────

interface Toast { msg: string; ok: boolean; id: number }

export default function JobsPanel() {
  const [jobs, setJobs]       = useState<JobConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [toasts, setToasts]   = useState<Toast[]>([])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setJobs(await jobsService.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const addToast = (msg: string, ok = true) => {
    const id = Date.now()
    setToasts(prev => [...prev, { msg, ok, id }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  const updateJob = (updated: JobConfig) =>
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))

  const cronJobs    = jobs.filter(j => j.job_type === 'cron')
  const triggerJobs = jobs.filter(j => j.job_type === 'trigger')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-extrabold" style={{ color: 'var(--text-dark)' }}>
            Automatizaciones
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Gestiona los jobs programados y los disparadores de eventos del sistema.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{ background: 'var(--canvas-warm)', color: 'var(--text-muted)', border: '1px solid rgba(0,0,0,0.08)' }}
        >
          <RefreshCw size={12} />
          Actualizar
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Jobs cron */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: 'var(--green-accent)' }} />
              <h4 className="text-xs font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                Jobs programados
              </h4>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,117,74,0.1)', color: 'var(--green-accent)' }}>
                {cronJobs.length}
              </span>
            </div>
            <div className="space-y-3">
              {cronJobs.map(j => (
                <JobCard key={j.id} job={j} onUpdate={updateJob} onToast={addToast} />
              ))}
            </div>
          </section>

          {/* Triggers */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} style={{ color: '#7c3aed' }} />
              <h4 className="text-xs font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                Disparadores de eventos
              </h4>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
                {triggerJobs.length}
              </span>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-faint)' }}>
              Se activan automáticamente al ocurrir un evento. No requieren configuración de horario.
            </p>
            <div className="space-y-3">
              {triggerJobs.map(j => (
                <JobCard key={j.id} job={j} onUpdate={updateJob} onToast={addToast} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 space-y-2 z-50">
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg"
            style={{ background: t.ok ? 'var(--green-accent)' : '#dc2626' }}
          >
            {t.msg}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
