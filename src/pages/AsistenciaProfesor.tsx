/**
 * AsistenciaProfesor — el profesor abre una sesión y muestra el QR rotativo.
 * Route: /materia/:courseId/asistencia
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, QrCode, Users, Clock, CheckCircle2,
  Loader2, StopCircle, Play, RefreshCw, Timer,
} from 'lucide-react'
import Header from '../components/Header'
import QRCode from '../components/QRCode'
import { attendanceService, computeQrToken, type ClassSession, type AttendanceRecord } from '../services/attendanceService'
import { courseService, type BackendCourse } from '../services/courseService'
import { useAuth } from '../context/AuthContext'

const WINDOW_OPTIONS = [
  { label: '30 seg',  value: 30 },
  { label: '1 min',   value: 60 },
  { label: '2 min',   value: 120 },
  { label: '5 min',   value: 300 },
]

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s.toString().padStart(2,'0')}s` : `${s}s`
}

export default function AsistenciaProfesor() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [course, setCourse]           = useState<BackendCourse | null>(null)
  const [session, setSession]         = useState<ClassSession | null>(null)
  const [attendees, setAttendees]     = useState<AttendanceRecord[]>([])
  const [currentToken, setCurrentToken] = useState('')
  const [timeLeft, setTimeLeft]       = useState(0)
  const [label, setLabel]             = useState('')
  const [windowSecs, setWindowSecs]   = useState(60)
  const [loading, setLoading]         = useState(false)
  const [closing, setClosing]         = useState(false)
  const [loadingCourse, setLoadingCourse] = useState(true)

  const tickRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const attendeesRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cargar curso
  useEffect(() => {
    if (!courseId) return
    courseService.getById(courseId)
      .then(c => setCourse(c))
      .finally(() => setLoadingCourse(false))
  }, [courseId])

  // Rotación del token QR en cliente
  const refreshToken = useCallback(async () => {
    if (!session) return
    const token = await computeQrToken(session.qr_seed, session.window_seconds)
    setCurrentToken(token)
    // Calcular tiempo restante en la ventana actual
    const epoch = Math.floor(Date.now() / 1000)
    const windowIndex = Math.floor(epoch / session.window_seconds)
    const windowEnd = (windowIndex + 1) * session.window_seconds
    setTimeLeft(windowEnd - epoch)
  }, [session])

  // Ticker: recalcula el token cada segundo
  useEffect(() => {
    if (!session?.is_active) return
    refreshToken()
    tickRef.current = setInterval(refreshToken, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [session, refreshToken])

  // Polling de asistentes cada 5 segundos
  useEffect(() => {
    if (!session?.is_active) return
    const poll = async () => {
      try {
        const list = await attendanceService.getAttendances(session.id)
        setAttendees(list)
      } catch { /* silencioso */ }
    }
    poll()
    attendeesRef.current = setInterval(poll, 5000)
    return () => { if (attendeesRef.current) clearInterval(attendeesRef.current) }
  }, [session])

  const startSession = async () => {
    if (!courseId) return
    setLoading(true)
    try {
      const s = await attendanceService.createSession(courseId, windowSecs, label || undefined)
      setSession(s)
      setCurrentToken(s.current_token)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear sesión')
    } finally {
      setLoading(false)
    }
  }

  const closeSession = async () => {
    if (!session) return
    setClosing(true)
    try {
      await attendanceService.closeSession(session.id)
      setSession(prev => prev ? { ...prev, is_active: false } : prev)
      if (tickRef.current) clearInterval(tickRef.current)
      if (attendeesRef.current) clearInterval(attendeesRef.current)
    } catch { /* silencioso */ }
    finally { setClosing(false) }
  }

  if (loadingCourse) {
    return (
      <div className="min-h-screen bg-usb-canvas flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-usb-canvas flex flex-col">
      <Header />

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: 'var(--green-deep)', borderBottom: '1px solid rgba(0,0,0,0.25)' }}>
        <div className="max-w-4xl mx-auto w-full px-5 py-6">
          <button
            onClick={() => navigate(`/materia/${courseId}`)}
            className="flex items-center gap-2 text-sm font-bold mb-4 transition-colors"
            style={{ color: 'rgba(212,233,226,0.55)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#d4e9e2')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(212,233,226,0.55)')}
          >
            <ArrowLeft size={15} />
            Volver a {course?.name ?? 'la materia'}
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,233,226,0.12)' }}>
              <QrCode size={20} style={{ color: '#d4e9e2' }} />
            </div>
            <div>
              <h1 className="text-white font-extrabold text-xl leading-tight" style={{ letterSpacing: '-0.02em' }}>
                Control de asistencias
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(212,233,226,0.60)' }}>
                {course?.name} · Genera el QR y compártelo con la clase
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-6">
        <AnimatePresence mode="wait">

          {/* Estado: sin sesión activa */}
          {!session && (
            <motion.div key="setup" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="bg-white rounded-2xl p-6 space-y-5" style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>
                <div>
                  <h2 className="font-bold text-lg" style={{ color: 'var(--text-dark)' }}>Nueva sesión de clase</h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Configura el QR antes de mostrarlo a los estudiantes
                  </p>
                </div>

                {/* Etiqueta */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                    Etiqueta (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Clase 5 — Derivadas"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{ border: '1.5px solid rgba(0,0,0,0.12)', color: 'var(--text-dark)', background: 'var(--canvas-warm)' }}
                  />
                </div>

                {/* Tiempo de rotación */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                    El QR cambia cada…
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {WINDOW_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setWindowSecs(opt.value)}
                        className="py-2.5 rounded-xl font-bold text-sm transition-all"
                        style={{
                          background: windowSecs === opt.value ? 'var(--green-accent)' : 'var(--canvas-warm)',
                          color:      windowSecs === opt.value ? 'white' : 'var(--text-dark)',
                          border:     `1.5px solid ${windowSecs === opt.value ? 'var(--green-accent)' : 'rgba(0,0,0,0.08)'}`,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[0.68rem]" style={{ color: 'var(--text-faint)' }}>
                    Con {fmtTime(windowSecs)} de ventana, el código expira antes de que se pueda compartir por WhatsApp.
                  </p>
                </div>

                <button
                  onClick={startSession}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all"
                  style={{ background: 'var(--green-accent)', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Iniciar sesión y mostrar QR
                </button>
              </div>
            </motion.div>
          )}

          {/* Estado: sesión activa */}
          {session && (
            <motion.div key="active" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid gap-4 lg:grid-cols-[auto_1fr]">

                {/* QR Panel */}
                <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-4" style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>
                  {session.is_active ? (
                    <>
                      <QRCode value={`${window.location.origin}/asistencia/${session.id}/${currentToken}`} size={220} />

                      {/* Countdown bar */}
                      <div className="w-full space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 font-bold" style={{ color: 'var(--green-accent)' }}>
                            <Timer size={11} /> QR activo
                          </span>
                          <span className="font-mono font-bold tabular-nums" style={{ color: timeLeft <= 10 ? '#dc2626' : 'var(--text-muted)' }}>
                            {fmtTime(timeLeft)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                          <motion.div
                            className="h-full rounded-full"
                            animate={{ width: `${(timeLeft / windowSecs) * 100}%` }}
                            transition={{ duration: 0.9, ease: 'linear' }}
                            style={{ background: timeLeft <= 10 ? '#dc2626' : 'var(--green-accent)' }}
                          />
                        </div>
                        <p className="text-[0.6rem] text-center" style={{ color: 'var(--text-faint)' }}>
                          Se renueva cada {fmtTime(windowSecs)}
                        </p>
                      </div>

                      <button
                        onClick={closeSession}
                        disabled={closing}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all"
                        style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                      >
                        {closing ? <Loader2 size={13} className="animate-spin" /> : <StopCircle size={13} />}
                        Cerrar sesión
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                      <CheckCircle2 size={40} className="text-emerald-500" />
                      <p className="font-bold" style={{ color: 'var(--text-dark)' }}>Sesión cerrada</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {attendees.length} estudiantes registraron asistencia
                      </p>
                      <button
                        onClick={() => { setSession(null); setAttendees([]) }}
                        className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg"
                        style={{ background: 'var(--canvas-warm)', color: 'var(--green-accent)' }}
                      >
                        <RefreshCw size={11} /> Nueva sesión
                      </button>
                    </div>
                  )}
                </div>

                {/* Lista de asistentes */}
                <div className="bg-white rounded-2xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.07)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users size={16} style={{ color: 'var(--green-accent)' }} />
                      <h2 className="font-bold" style={{ color: 'var(--text-dark)' }}>
                        Asistentes
                      </h2>
                    </div>
                    <span className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--green-accent)' }}>
                      {attendees.length}
                    </span>
                  </div>

                  {session.label && (
                    <p className="text-xs font-medium rounded-lg px-3 py-1.5" style={{ background: 'var(--canvas-warm)', color: 'var(--text-muted)' }}>
                      {session.label}
                    </p>
                  )}

                  {attendees.length === 0 ? (
                    <div className="flex flex-col items-center py-10 rounded-xl" style={{ background: 'var(--canvas-warm)', border: '1.5px dashed rgba(0,0,0,0.10)' }}>
                      <Clock size={22} className="mb-2" style={{ color: 'var(--text-faint)' }} />
                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                        Esperando que los estudiantes escaneen el QR…
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                      <AnimatePresence>
                        {attendees.map((a, i) => (
                          <motion.div
                            key={a.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="flex items-center justify-between rounded-xl px-3 py-2.5"
                            style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[0.6rem] font-bold text-white flex-shrink-0"
                                style={{ background: 'var(--green-accent)' }}>
                                {i + 1}
                              </div>
                              <span className="text-sm font-semibold" style={{ color: 'var(--text-dark)' }}>{a.student_name}</span>
                            </div>
                            <span className="text-[0.62rem] font-mono" style={{ color: 'var(--text-faint)' }}>
                              {new Date(a.recorded_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Bogota' })}
                            </span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
