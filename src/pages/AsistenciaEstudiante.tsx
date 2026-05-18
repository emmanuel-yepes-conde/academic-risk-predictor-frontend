/**
 * AsistenciaEstudiante — el estudiante escanea el QR y registra asistencia.
 * Route: /asistencia/:sessionId/:token  (viene del deep-link del QR)
 *   ó    /asistencia/registrar          (abre la cámara manualmente)
 *
 * La URL embebida en el QR tiene formato:
 *   academic-risk://attend/{sessionId}/{token}
 *
 * Cuando el celular abre la app web se redirige a:
 *   /asistencia/{sessionId}/{token}
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, Loader2, QrCode, ArrowLeft } from 'lucide-react'
import Header from '../components/Header'
import { attendanceService } from '../services/attendanceService'
import { useAuth } from '../context/AuthContext'

export default function AsistenciaEstudiante() {
  const { sessionId, token } = useParams<{ sessionId: string; token: string }>()
  const navigate = useNavigate()
  const { user }  = useAuth()

  const [status, setStatus]   = useState<'loading' | 'success' | 'error' | 'idle'>('idle')
  const [message, setMessage] = useState('')
  const [sessionLabel, setSessionLabel] = useState('')
  const [isTokenExpired, setIsTokenExpired] = useState(false)

  // Evita que el useEffect dispare el registro dos veces si `user` cambia (ej. refresh del JWT)
  const registrationAttempted = useRef(false)

  // Si llega con sessionId y token en la URL (deep-link del QR) → registrar automáticamente
  useEffect(() => {
    if (!sessionId || !token) return
    if (!user) {
      // No autenticado: redirigir a login y volver aquí
      navigate(`/login?redirect=/asistencia/${sessionId}/${token}`)
      return
    }
    if (registrationAttempted.current) return
    registrationAttempted.current = true
    register(sessionId, token)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token, user])

  const register = async (sid: string, tok: string) => {
    setStatus('loading')
    setIsTokenExpired(false)
    try {
      const res = await attendanceService.registerAttendance(sid, tok)
      setMessage(res.message)
      setSessionLabel(res.session_label ?? '')
      setStatus('success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      // 409 "Ya registraste" → el objetivo está cumplido, mostrar éxito
      if (msg.toLowerCase().includes('ya registraste') || msg.toLowerCase().includes('ya registr')) {
        setMessage('Tu asistencia ya estaba registrada en esta sesión.')
        setSessionLabel('')
        setStatus('success')
        return
      }
      // Token expirado → no tiene sentido reintentar con el mismo token
      if (msg.toLowerCase().includes('expir') || msg.toLowerCase().includes('inválido')) {
        setIsTokenExpired(true)
      }
      setMessage(msg)
      setStatus('error')
    }
  }

  // ─── Vista: procesando ────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-usb-canvas flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 size={36} className="animate-spin mx-auto" style={{ color: 'var(--green-accent)' }} />
            <p className="font-semibold" style={{ color: 'var(--text-muted)' }}>Registrando asistencia…</p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Vista: éxito ─────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-usb-canvas flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-5">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-4"
            style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.15 }}
            >
              <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
            </motion.div>
            <h2 className="text-xl font-extrabold" style={{ color: 'var(--text-dark)' }}>
              ¡Asistencia registrada!
            </h2>
            {sessionLabel && (
              <p className="text-sm font-medium rounded-lg px-3 py-1.5 mx-auto inline-block"
                style={{ background: '#f0fdf4', color: '#15803d' }}>
                {sessionLabel}
              </p>
            )}
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 rounded-xl font-bold text-white mt-2"
              style={{ background: 'var(--green-accent)' }}
            >
              Ir al inicio
            </button>
          </motion.div>
        </div>
      </div>
    )
  }

  // ─── Vista: error ─────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-usb-canvas flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-5">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-4"
            style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <XCircle size={56} className="mx-auto text-red-500" />
            <h2 className="text-xl font-extrabold" style={{ color: 'var(--text-dark)' }}>
              No se pudo registrar
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
            {isTokenExpired && (
              <p className="text-xs font-semibold rounded-lg px-3 py-2"
                style={{ background: '#fef3c7', color: '#92400e' }}>
                El código QR expiró. Pide al profesor que muestre el QR actualizado y escanéalo de nuevo.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => navigate(-1)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm"
                style={{ background: 'var(--canvas-warm)', color: 'var(--text-dark)' }}
              >
                <ArrowLeft size={13} /> Volver
              </button>
              {sessionId && token && !isTokenExpired && (
                <button
                  onClick={() => {
                    registrationAttempted.current = false
                    register(sessionId, token)
                  }}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: 'var(--green-accent)' }}
                >
                  Reintentar
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // ─── Vista: idle (acceso directo sin parámetros) ───────────────────────────
  return (
    <div className="min-h-screen bg-usb-canvas flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-5">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-5"
          style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>

          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(0,117,74,0.08)' }}>
            <QrCode size={28} style={{ color: 'var(--green-accent)' }} />
          </div>

          <div className="space-y-1.5">
            <h2 className="font-extrabold text-lg" style={{ color: 'var(--text-dark)' }}>
              Registrar asistencia
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Para registrar tu asistencia, escanea el código QR
              que tu profesor está mostrando en clase.
            </p>
          </div>

          {/* Instrucciones paso a paso */}
          <div className="text-left space-y-2.5 rounded-xl p-4"
            style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
            {[
              { n: '1', text: 'Tu profesor abre la pantalla de asistencias en el computador' },
              { n: '2', text: 'Escanea el QR con la cámara de tu celular' },
              { n: '3', text: 'El enlace te trae aquí y registra tu asistencia automáticamente' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[0.65rem] font-extrabold text-white mt-0.5"
                  style={{ background: 'var(--green-accent)' }}>{n}</span>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{text}</p>
              </div>
            ))}
          </div>

          <button onClick={() => navigate('/')} className="w-full py-2.5 rounded-xl font-bold text-sm"
            style={{ background: 'var(--canvas-warm)', color: 'var(--text-dark)' }}>
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  )
}
