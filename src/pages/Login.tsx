/**
 * Login — Starbucks-inspired split-screen design.
 * Left: deep green brand panel with particle network + animated headline.
 * Right: warm canvas form panel with full-pill CTA.
 * Keeps all original logic: typewriter, welcome voice, teleport overlay.
 */
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, EyeOff, ArrowRight, AlertCircle,
  GraduationCap, BookOpen, BarChart2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { friendlyError } from '../services/errorMessages'

// ─── Typewriter hook ──────────────────────────────────────────────────────────

function useTypewriter(texts: string[], speed = 55, pause = 2400) {
  const [displayed, setDisplayed] = useState('')
  const [textIdx, setTextIdx]     = useState(0)
  const [charIdx, setCharIdx]     = useState(0)
  const [deleting, setDeleting]   = useState(false)

  useEffect(() => {
    const current = texts[textIdx]
    const delay   = deleting ? speed / 2 : speed
    const timer   = setTimeout(() => {
      if (!deleting) {
        setDisplayed(current.slice(0, charIdx + 1))
        if (charIdx + 1 === current.length) setTimeout(() => setDeleting(true), pause)
        else setCharIdx(c => c + 1)
      } else {
        setDisplayed(current.slice(0, charIdx - 1))
        if (charIdx - 1 === 0) {
          setDeleting(false)
          setCharIdx(0)
          setTextIdx(i => (i + 1) % texts.length)
        } else {
          setCharIdx(c => c - 1)
        }
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [charIdx, deleting, textIdx, texts, speed, pause])

  return displayed
}

// ─── Welcome voice ────────────────────────────────────────────────────────────

function playWelcomeVoice(name: string) {
  try {
    if (!('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    const doSpeak = () => {
      const voices   = synth.getVoices()
      const preferred = ['es-MX', 'es-CO', 'es-AR', 'es-CL', 'es-US', 'es-419']
      const voice    =
        voices.find(v => preferred.includes(v.lang)) ||
        voices.find(v => v.lang.startsWith('es-') && v.lang !== 'es-ES') ||
        voices.find(v => v.lang.startsWith('es'))
      const utter    = new SpeechSynthesisUtterance(
        `Bienvenido a Academic Risk, tu predictor de riesgo académico. Hola, ${name}.`
      )
      utter.lang   = voice?.lang ?? 'es-MX'
      utter.rate   = 0.82
      utter.pitch  = 1.0
      utter.volume = 1
      if (voice) utter.voice = voice
      synth.cancel()
      synth.speak(utter)
    }
    const voices = synth.getVoices()
    if (voices.length > 0) doSpeak()
    else synth.onvoiceschanged = () => { synth.onvoiceschanged = null; doSpeak() }
  } catch { /* browser doesn't support speech */ }
}

// ─── Teleport overlay ─────────────────────────────────────────────────────────

function TeleportOverlay({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--green-deep)' }}
    >
      {/* Expanding rings — green tones */}
      {[0,1,2,3,4,5,6,7].map(i => (
        <motion.div
          key={i}
          initial={{ scale: 0, opacity: 0.55 - i * 0.04 }}
          animate={{ scale: 5 + i * 1.8, opacity: 0 }}
          transition={{ duration: 1.6, delay: i * 0.08, ease: 'easeOut' }}
          className="absolute w-24 h-24 rounded-full"
          style={{ border: '1px solid rgba(212,233,226,0.35)' }}
        />
      ))}

      {/* Vertical beam */}
      <motion.div
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1, 1, 0], opacity: [0, 0.6, 0.6, 0] }}
        transition={{ duration: 1.8, times: [0, 0.25, 0.7, 1] }}
        style={{ transformOrigin: 'center', background: 'linear-gradient(to bottom, transparent, var(--green-light), transparent)' }}
        className="absolute inset-x-1/2 -translate-x-px w-[2px] h-full"
      />

      {/* Sparks */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={`spark-${i}`}
          initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale:   [0, 1, 0],
            x: [0, (i % 2 === 0 ? 1 : -1) * (20 + i * 15)],
            y: [0, (i < 3 ? -1 : 1) * (15 + i * 10)],
          }}
          transition={{ duration: 0.7, delay: 0.3 + i * 0.04, ease: 'easeOut' }}
          className="absolute w-2 h-2 rounded-full"
          style={{ background: 'var(--green-light)' }}
        />
      ))}

      {/* Center content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.7, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center gap-5"
      >
        {/* Glowing icon */}
        <div className="relative flex items-center justify-center">
          <motion.div
            className="absolute w-36 h-36 rounded-full blur-2xl"
            style={{ background: 'rgba(212,233,226,0.20)' }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="relative z-10 w-20 h-20 rounded-2xl overflow-hidden"
            style={{ background: 'rgba(212,233,226,0.15)', border: '1px solid rgba(212,233,226,0.35)' }}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
          >
            <img src="/assets/ar-icon.png" alt="Academic Risk" className="w-full h-full object-contain" />
          </motion.div>
        </div>

        {/* Text */}
        <div className="text-center space-y-2">
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="text-xs font-extrabold uppercase tracking-[0.4em]"
            style={{ color: 'var(--green-light)' }}
          >
            Academic Risk
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.58 }}
            className="text-white text-3xl font-extrabold font-display leading-tight"
          >
            ¡Bienvenido/a!
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.70 }}
            className="text-white/65 text-xl font-semibold"
          >
            {name}
          </motion.p>
        </div>

        {/* Underline */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: 200 }}
          transition={{ delay: 0.9, duration: 0.6, ease: 'easeOut' }}
          className="h-px"
          style={{ background: 'linear-gradient(90deg, transparent, var(--green-light), transparent)' }}
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="text-xs font-bold uppercase tracking-[0.3em]"
          style={{ color: 'var(--green-light)', opacity: 0.65 }}
        >
          Ingresando al sistema…
        </motion.p>
      </motion.div>
    </motion.div>
  )
}

// ─── Particle network (canvas) ────────────────────────────────────────────────

function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    interface Particle { x: number; y: number; vx: number; vy: number; r: number }
    const COUNT = 55, MAX_D = 110
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r:  Math.random() * 1.4 + 0.5,
    }))

    let animId: number
    const tick = () => {
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(212,233,226,0.65)'
        ctx.fill()
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d < MAX_D) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(212,233,226,${(1 - d / MAX_D) * 0.28})`
            ctx.lineWidth   = 0.7
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(animId); ro.disconnect() }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.55 }}
      aria-hidden="true"
    />
  )
}

// ─── Feature pill ─────────────────────────────────────────────────────────────

const features = [
  { label: 'Predicción IA',    icon: BarChart2,     delay: 0.7  },
  { label: 'Portal de notas',  icon: BookOpen,      delay: 0.85 },
  { label: 'Consejero virtual',icon: GraduationCap, delay: 1.0  },
]

// ─── Stats strip ─────────────────────────────────────────────────────────────

const stats = [
  { value: '90%',    label: 'Precisión' },
  { value: '<1 min', label: 'Análisis'  },
  { value: '5',      label: 'Variables' },
]

// ─── Login page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [teleporting, setTeleporting] = useState(false)
  const [userName, setUserName]       = useState('')

  const typewritten = useTypewriter([
    'Predice tu riesgo académico',
    'Visualiza tu rendimiento',
    'Obtén consejos personalizados',
    'Toma el control de tu futuro',
  ])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Ingresa tu correo y contraseña.')
      return
    }
    setLoading(true)
    setError('')

    const result = await login(email.trim(), password)

    if (!result.success) {
      setError(result.error ?? 'No se pudo iniciar sesión.')
      setLoading(false)
      return
    }

    // firstName and userId come directly from login() — no localStorage timing race.
    const firstName  = result.firstName ?? email.split('@')[0]
    const userId     = result.userId

    // Show welcome overlay + voice only on the very first login ever.
    const welcomeKey   = userId ? `ar-welcomed-${userId}` : null
    const isFirstLogin = welcomeKey ? !localStorage.getItem(welcomeKey) : true

    setLoading(false)

    if (isFirstLogin) {
      if (welcomeKey) localStorage.setItem(welcomeKey, '1')
      setUserName(firstName)
      setTeleporting(true)
      playWelcomeVoice(firstName)
    }
    // On return visits the auth state change triggers the router redirect automatically.
  }

  return (
    <>
      <AnimatePresence>{teleporting && <TeleportOverlay name={userName} />}</AnimatePresence>

      <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden">

        {/* ── Left brand panel — deep green ── */}
        <motion.div
          initial={{ x: -80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="hidden lg:flex lg:w-[55%] xl:w-1/2 relative overflow-hidden flex-col justify-between p-12"
          style={{ background: 'var(--green-deep)' }}
        >
          {/* Gradient overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, var(--green-deep) 0%, var(--green-mid) 100%)' }}
          />

          {/* Subtle dot grid */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.04 }} aria-hidden="true">
            <defs>
              <pattern id="login-dots" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#login-dots)" />
          </svg>

          {/* Particle network */}
          <ParticleNetwork />

          {/* Scanning beam */}
          <motion.div
            className="absolute left-0 right-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(212,233,226,0.40), transparent)' }}
            animate={{ y: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'linear', times: [0, 0.05, 0.9, 1] }}
          />

          {/* Top — logo mark */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="relative z-10 flex items-center gap-3.5"
          >
            {/* Logo PNG */}
            <div
              className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0"
              style={{ background: 'rgba(212,233,226,0.18)', border: '1px solid rgba(212,233,226,0.40)' }}
            >
              <img src="/assets/ar-icon.png" alt="Academic Risk" className="w-full h-full object-contain" />
            </div>
            <div>
              <p
                className="text-white font-extrabold text-lg leading-none"
                style={{ letterSpacing: '-0.02em' }}
              >
                Academic Risk
              </p>
              <p className="text-white/35 text-[0.68rem] mt-0.5 font-medium">
                Plataforma académica inteligente
              </p>
            </div>
          </motion.div>

          {/* Middle — hero */}
          <div className="relative z-10 space-y-8">
            {/* Typewriter headline */}
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.7 }}
            >
              <h1
                className="font-sans font-black text-white leading-[1.1] mb-5"
                style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)', letterSpacing: '-0.03em', minHeight: '3.8em' }}
              >
                {typewritten}
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.55 }}
                  className="inline-block w-[3px] h-10 align-middle rounded-sm ml-1.5"
                  style={{ background: 'var(--green-light)' }}
                />
              </h1>
              <p className="text-white/45 text-lg leading-relaxed max-w-md">
                Tu predictor de riesgo académico impulsado por inteligencia artificial.
                Analiza, anticipa y mejora tu rendimiento.
              </p>
            </motion.div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2.5">
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 16, scale: 0.85 }}
                  animate={{ opacity: 1, y: [0, -5, 0], scale: 1 }}
                  transition={{
                    opacity: { delay: f.delay, duration: 0.4 },
                    scale:   { delay: f.delay, duration: 0.4 },
                    y: { delay: f.delay + 0.5, duration: 2.8 + i * 0.4, repeat: Infinity, ease: 'easeInOut' },
                  }}
                  className="flex items-center gap-2 text-white/70 text-sm font-semibold px-4 py-2 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <f.icon size={13} style={{ color: 'var(--green-light)' }} />
                  {f.label}
                </motion.div>
              ))}
            </div>

          </div>

          {/* Bottom — copyright */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3 }}
            className="text-white/50 text-xs relative z-10 font-medium"
          >
            © 2026 Academic Risk · Todos los derechos reservados
          </motion.p>
        </motion.div>

        {/* ── Right form panel — warm canvas ── */}
        <motion.div
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="flex-1 flex flex-col"
          style={{ background: 'var(--canvas-warm)' }}
        >
          {/* Mobile brand header */}
          <div
            className="lg:hidden px-6 py-8 flex flex-col items-center text-center relative overflow-hidden"
            style={{ background: 'var(--green-deep)' }}
          >
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div
                className="absolute top-0 right-0 w-48 h-48 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"
                style={{ background: 'var(--green-light)' }}
              />
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="relative z-10 flex flex-col items-center gap-3"
            >
              <div
                className="w-14 h-14 rounded-2xl overflow-hidden"
                style={{ background: 'rgba(212,233,226,0.18)', border: '1px solid rgba(212,233,226,0.40)' }}
              >
                <img src="/assets/ar-icon.png" alt="Academic Risk" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="text-white font-black text-xl" style={{ letterSpacing: '-0.02em' }}>
                  Academic Risk
                </p>
                <p className="text-white/45 text-sm mt-0.5">Tu predictor de riesgo académico</p>
              </div>
            </motion.div>
          </div>

          {/* Form area */}
          <div className="flex-1 flex items-center justify-center px-6 py-12 sm:py-16">
            <div className="w-full max-w-sm">

              {/* Heading */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="mb-9"
              >
                {/* Small brand text — visible on desktop only when left panel is hidden */}
                <p
                  className="lg:hidden text-xs font-extrabold uppercase tracking-[0.18em] mb-3"
                  style={{ color: 'var(--green-accent)' }}
                >
                  Academic Risk
                </p>
                <h1
                  className="font-sans font-black mb-2"
                  style={{ fontSize: '1.9rem', color: 'var(--text-dark)', letterSpacing: '-0.03em' }}
                >
                  Iniciar sesión
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Ingresa con tus credenciales institucionales para continuar
                </p>
              </motion.div>

              {/* Form */}
              <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.5 }}
                onSubmit={handleSubmit}
                className="space-y-4"
                noValidate
              >
                {/* Email */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-extrabold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    Correo electrónico
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value.replace(/\s/g, '').toLowerCase()); setError('') }}
                    placeholder="correo@ejemplo.edu"
                    className="field"
                    autoFocus
                    autoComplete="email"
                    required
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-extrabold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      placeholder="Contraseña"
                      className="field pr-11"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Error message */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      role="alert"
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{   opacity: 0, scale: 0.97 }}
                      className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3"
                    >
                      <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                      <span className="text-red-600 text-xs font-semibold">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit — full-pill primary CTA */}
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: loading ? 1 : 1.02 }}
                  whileTap={{ scale: loading ? 1 : 0.96 }}
                  className="relative w-full flex items-center justify-center gap-2.5 overflow-hidden"
                  style={{
                    height: '52px',
                    borderRadius: 'var(--btn-radius)',
                    background: loading ? 'var(--green-brand)' : 'var(--green-accent)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.925rem',
                    letterSpacing: '-0.01em',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.75 : 1,
                    transition: 'background 0.2s ease',
                  }}
                >
                  {/* Shimmer */}
                  {!loading && (
                    <motion.div
                      className="absolute inset-0 -skew-x-12 pointer-events-none"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)' }}
                      initial={{ x: '-100%' }}
                      animate={{ x: '200%' }}
                      transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.8, ease: 'easeInOut' }}
                    />
                  )}

                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Ingresar
                      <ArrowRight size={16} />
                    </>
                  )}
                </motion.button>
              </motion.form>

              {/* Footer note */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.65 }}
                className="mt-7 text-center text-xs border-t pt-6"
                style={{ color: 'var(--text-faint)', borderColor: 'rgba(0,0,0,0.08)' }}
              >
                Usa las credenciales asignadas por tu institución.
                <br />
                <span style={{ color: 'var(--green-accent)' }}>
                  ¿Problemas para ingresar?
                </span>{' '}
                Contacta a soporte.
              </motion.p>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  )
}
