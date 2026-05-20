/**
 * Perfil — Student (and professor) profile editing page.
 * Allows users to update their phone number and notification preferences.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, User, Bell, Mail, MessageCircle,
  Save, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react'
import Header from '../components/Header'
import { profileService, type UserProfile } from '../services/notificationService'

export default function Perfil() {
  const navigate = useNavigate()

  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [saved, setSaved]       = useState(false)

  // Editable fields
  const [fullName, setFullName]               = useState('')
  const [phone, setPhone]                     = useState('')   // solo 10 dígitos, sin +57
  const [whatsappEnabled, setWhatsappEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled]       = useState(true)

  /** Extrae los 10 dígitos colombianos de un número almacenado (+573XXXXXXXXX o 573XXXXXXXXX) */
  function extractLocalDigits(raw: string): string {
    const clean = raw.replace(/\D/g, '') // solo dígitos
    if (clean.startsWith('57') && clean.length === 12) return clean.slice(2) // quitar 57
    if (clean.length === 10) return clean
    return clean // si tiene otro formato, devolver limpio
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const p = await profileService.get()
        setProfile(p)
        setFullName(p.full_name ?? '')
        setPhone(p.phone ? extractLocalDigits(p.phone) : '')
        setWhatsappEnabled(p.whatsapp_enabled)
        setEmailEnabled(p.email_enabled)
      } catch {
        setError('No se pudo cargar el perfil. Intenta de nuevo.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    // Construir número completo: +57 + 10 dígitos
    const digits = phone.replace(/\D/g, '').slice(0, 10)
    const fullPhone = digits.length === 10 ? `+57${digits}` : digits.length > 0 ? `+57${digits}` : null
    try {
      const updated = await profileService.update({
        full_name: fullName.trim() || undefined,
        phone: fullPhone,
        whatsapp_enabled: whatsappEnabled,
        email_enabled: emailEnabled,
      })
      setProfile(updated)
      // Actualizar campo phone con los dígitos limpios del número guardado
      if (updated.phone) setPhone(extractLocalDigits(updated.phone))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('No se pudo guardar. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const initials = (fullName || profile?.full_name || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const roleLabel = profile?.role === 'student' ? 'Estudiante' : profile?.role === 'admin' ? 'Admin' : 'Docente'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-warm)' }}>
      <Header />

      {/* Page hero */}
      <div style={{ background: 'var(--green-deep)', borderBottom: '1px solid rgba(0,0,0,0.25)' }}>
        <div className="max-w-2xl mx-auto w-full px-5 py-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-bold mb-4 transition-colors"
            style={{ color: 'rgba(212,233,226,0.55)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#d4e9e2')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(212,233,226,0.55)')}
          >
            <ArrowLeft size={15} /> Volver
          </button>
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-lg flex-shrink-0 border-2"
              style={{ background: 'rgba(212,233,226,0.18)', borderColor: 'rgba(212,233,226,0.35)', color: '#d4e9e2' }}
            >
              {initials}
            </div>
            <div>
              <h1 className="text-white font-extrabold text-xl" style={{ letterSpacing: '-0.02em' }}>
                Mi Perfil
              </h1>
              {profile && (
                <p className="text-sm" style={{ color: 'rgba(212,233,226,0.55)' }}>
                  {roleLabel} · {profile.email}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-6 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={30} className="animate-spin mb-4" style={{ color: 'var(--green-accent)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Cargando perfil…</p>
          </div>
        ) : (
          <>
            {/* Basic info card */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-5 space-y-4"
              style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <User size={15} style={{ color: 'var(--green-accent)' }} />
                <h2 className="font-bold text-sm" style={{ color: 'var(--text-dark)' }}>Información personal</h2>
              </div>

              {/* Full name */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider"
                       style={{ color: 'var(--text-faint)' }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Tu nombre completo"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none transition-all"
                  style={{
                    background: 'var(--canvas-warm)',
                    border: '1.5px solid rgba(0,0,0,0.10)',
                    color: 'var(--text-dark)',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--green-accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)')}
                />
              </div>

              {/* Email (read-only) */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider"
                       style={{ color: 'var(--text-faint)' }}>
                  Correo electrónico
                </label>
                <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
                     style={{ background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.07)' }}>
                  <Mail size={14} style={{ color: 'var(--text-faint)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{profile?.email}</span>
                  <span className="ml-auto text-[0.62rem] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-faint)' }}>
                    No editable
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Contact & notifications card */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="bg-white rounded-2xl p-5 space-y-4"
              style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Bell size={15} style={{ color: 'var(--green-accent)' }} />
                <h2 className="font-bold text-sm" style={{ color: 'var(--text-dark)' }}>Contacto y notificaciones</h2>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider"
                       style={{ color: 'var(--text-faint)' }}>
                  Número de WhatsApp
                </label>
                <div
                  className="flex items-center rounded-xl overflow-hidden transition-all"
                  style={{ border: '1.5px solid rgba(0,0,0,0.10)', background: 'var(--canvas-warm)' }}
                  onFocus={() => {}}
                >
                  {/* Prefijo fijo +57 */}
                  <div
                    className="flex items-center gap-1.5 px-3 py-2.5 flex-shrink-0 select-none"
                    style={{ background: 'rgba(0,0,0,0.05)', borderRight: '1.5px solid rgba(0,0,0,0.08)' }}
                  >
                    <MessageCircle size={13} style={{ color: '#25d366' }} />
                    <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>+57</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => {
                      // Solo dígitos, máximo 10
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                      setPhone(digits)
                    }}
                    placeholder="300 000 0000"
                    maxLength={10}
                    className="flex-1 bg-transparent text-sm font-medium outline-none px-3 py-2.5"
                    style={{ color: 'var(--text-dark)' }}
                  />
                  {phone.length === 10 && (
                    <div className="pr-3 flex-shrink-0">
                      <CheckCircle2 size={15} className="text-green-500" />
                    </div>
                  )}
                </div>
                <p className="text-[0.65rem]" style={{ color: 'var(--text-faint)' }}>
                  Solo el número colombiano (10 dígitos), sin código de país. Ej: 3126226684
                </p>
              </div>

              {/* Notification toggles */}
              <div className="space-y-2">
                <p className="text-xs font-extrabold uppercase tracking-wider"
                   style={{ color: 'var(--text-faint)' }}>
                  Recibir alertas de riesgo por:
                </p>

                {/* WhatsApp toggle */}
                <label className="flex items-center justify-between gap-4 rounded-xl px-3.5 py-3 cursor-pointer transition-colors hover:bg-gray-50"
                       style={{ border: '1px solid rgba(0,0,0,0.07)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ background: '#25d36615', color: '#25d366' }}>
                      <MessageCircle size={15} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>WhatsApp</p>
                      <p className="text-[0.65rem]" style={{ color: 'var(--text-faint)' }}>
                        Mensajes directos sobre tu riesgo académico
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch checked={whatsappEnabled} onChange={setWhatsappEnabled} color="#25d366" />
                </label>

                {/* Email toggle */}
                <label className="flex items-center justify-between gap-4 rounded-xl px-3.5 py-3 cursor-pointer transition-colors hover:bg-gray-50"
                       style={{ border: '1px solid rgba(0,0,0,0.07)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ background: 'rgba(59,130,246,0.10)', color: '#3b82f6' }}>
                      <Mail size={15} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>Correo electrónico</p>
                      <p className="text-[0.65rem]" style={{ color: 'var(--text-faint)' }}>
                        Reportes y resúmenes a tu correo institucional
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch checked={emailEnabled} onChange={setEmailEnabled} color="#3b82f6" />
                </label>
              </div>
            </motion.div>

            {/* Errors */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}
              >
                <AlertCircle size={15} className="text-red-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-red-700">{error}</p>
              </motion.div>
            )}

            {/* Save success */}
            {saved && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: '#dcfce7', border: '1px solid #86efac' }}
              >
                <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-green-700">¡Perfil actualizado correctamente!</p>
              </motion.div>
            )}

            {/* Save button */}
            <motion.button
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              onClick={() => void handleSave()}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-white transition-all"
              style={{
                background: saving ? '#9ca3af' : 'var(--green-accent)',
                boxShadow: saving ? 'none' : '0 4px 12px rgba(0,117,74,0.30)',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving
                ? <><Loader2 size={16} className="animate-spin" /> Guardando…</>
                : <><Save size={16} /> Guardar cambios</>
              }
            </motion.button>
          </>
        )}
      </main>
    </div>
  )
}

// ─── Toggle switch component ──────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  color = 'var(--green-accent)',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  color?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none"
      style={{ background: checked ? color : '#d1d5db' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0px)' }}
      />
    </button>
  )
}
