/**
 * Landing — Student home. Starbucks-inspired.
 * Deep green hero → warm canvas sections → deep green CTA banner → deep green footer.
 * All logic preserved: GSAP scroll reveals, particle canvas, typewriter, tour.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  BarChart2, Lightbulb, Calculator, TrendingUp,
  CheckCircle, Clock, Layers, ArrowRight,
  BookOpen, Monitor, ClipboardList, Users, Zap, Brain
} from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Step } from 'react-joyride'
import Header from '../components/Header'
import TourGuide from '../components/TourGuide'
import { useTour } from '../hooks/useTour'
import { useAuth } from '../context/AuthContext'

gsap.registerPlugin(ScrollTrigger)

// ── Particle canvas — Starbucks green palette ────────────────────────────────

function ParticleCanvas({ opacity = 0.55 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const particles: {
      x: number; y: number; vx: number; vy: number
      size: number; alpha: number; pulse: number
    }[] = []

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < 65; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        size:  Math.random() * 1.6 + 0.4,
        alpha: Math.random() * 0.45 + 0.12,
        pulse: Math.random() * Math.PI * 2,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d < 110) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(212,233,226,${0.18 * (1 - d / 110)})`
            ctx.lineWidth   = 0.65
            ctx.stroke()
          }
        }
      }
      particles.forEach(p => {
        p.pulse += 0.02
        const a = p.alpha * (0.7 + 0.3 * Math.sin(p.pulse))
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212,233,226,${a})`
        ctx.fill()
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > canvas.width)  p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
      })
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity }}
      aria-hidden="true"
    />
  )
}

// ── Animated blob (dark green tones) ─────────────────────────────────────────

function Blob({ className, delay = 0 }: { className: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      animate={{ scale: [1,1.2,0.95,1.12,1], x: [0,28,-18,14,0], y: [0,-18,22,-10,0], opacity: [0.10,0.20,0.13,0.18,0.10] }}
      transition={{ duration: 20, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

// ── Tour steps ────────────────────────────────────────────────────────────────

const TOUR_STEPS: Step[] = [
  { target: '#tour-nav',      title: '🧭 Tu menú de navegación', content: 'Tienes "Inicio" (esta página) y "Mi Progreso" para ver tus materias y predicción de riesgo.', placement: 'bottom' },
  { target: '#tour-variables', title: '📊 Variables del predictor', content: 'El modelo analiza 4 variables: nota corte 1, corte 2, corte final y nota total.', placement: 'top' },
  { target: '#tour-hero-cta', title: '🚀 ¡Inicia tu análisis!', content: 'Al hacer clic, la IA evalúa tus notas por cohorte en menos de 1 segundo y genera un reporte personalizado.', placement: 'top' },
]

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Landing() {
  const navigate       = useNavigate()
  const { user }       = useAuth()
  const { run, onTourEnd } = useTour('student-landing', user?.id)
  const containerRef   = useRef<HTMLDivElement>(null)
  const heroRef        = useRef<HTMLElement>(null)

  const firstName = (() => {
    const n = user?.name ?? ''
    if (!n) return 'Estudiante'
    if (n.includes('@')) {
      const local = n.split('@')[0]
      const part  = local.split('.')[0]
      return part.charAt(0).toUpperCase() + part.slice(1)
    }
    return n.split(' ')[0]
  })()

  const { scrollY } = useScroll()
  const blobY       = useTransform(scrollY, [0, 400], [0, -55])

  // GSAP scroll reveals
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-anim="feature-card"]', {
        y: 55, opacity: 0, duration: 0.75, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: '[data-anim="feature-card"]', start: 'top 85%', toggleActions: 'play none none none' },
      })
      gsap.from('[data-anim="process-step"]', {
        y: 48, opacity: 0, duration: 0.65, stagger: 0.18, ease: 'power3.out',
        scrollTrigger: { trigger: '[data-anim="process-step"]', start: 'top 85%', toggleActions: 'play none none none' },
      })
      gsap.from('[data-anim="var-card"]', {
        y: 32, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power2.out',
        scrollTrigger: { trigger: '[data-anim="var-card"]', start: 'top 85%', toggleActions: 'play none none none' },
      })
      gsap.from('[data-anim="stat-card"]', {
        scale: 0.88, opacity: 0, duration: 0.55, stagger: 0.09, ease: 'back.out(1.4)',
        scrollTrigger: { trigger: '[data-anim="stat-card"]', start: 'top 88%', toggleActions: 'play none none none' },
      })
    }, containerRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-warm)' }}>
      <TourGuide run={run} steps={TOUR_STEPS} onEnd={onTourEnd} />
      <Header />

      {/* ── HERO — deep green ── */}
      <section ref={heroRef} className="relative overflow-hidden" style={{ background: 'var(--green-deep)' }}>
        {/* Multi-layer gradient overlay */}
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'linear-gradient(135deg, var(--green-deep) 0%, var(--green-mid) 100%)' }} />

        {/* Dot grid */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.04 }} aria-hidden="true">
          <defs>
            <pattern id="hero-grid" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>

        <ParticleCanvas />

        {/* Animated blobs — green tones */}
        <motion.div style={{ y: blobY }} className="absolute inset-0 pointer-events-none">
          <Blob className="absolute top-[-12%] right-[-6%] w-[480px] h-[480px] rounded-full blur-[90px] [background:var(--green-mid)]" delay={0} />
          <Blob className="absolute bottom-[-18%] left-[-8%] w-[380px] h-[380px] rounded-full blur-[100px] bg-[#2b5148]/70" delay={5} />
        </motion.div>

        {/* Scanning beam */}
        <motion.div
          className="absolute left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,233,226,0.35), transparent)' }}
          animate={{ y: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear', times: [0, 0.05, 0.9, 1] }}
        />

        <div className="relative max-w-5xl mx-auto px-5 py-24 md:py-32 flex flex-col md:flex-row items-center gap-14">
          {/* Left content */}
          <div className="flex-1 text-center md:text-left">
            {/* Badge */}
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.05 }}>
              <span
                className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5"
                style={{ background: 'rgba(212,233,226,0.15)', border: '1px solid rgba(212,233,226,0.30)', color: 'var(--green-light)' }}
              >
                <Zap size={11} />
                Predictor Académico IA
              </span>
            </motion.div>

            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="text-white font-black leading-[1.07] mb-4"
              style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.5rem)', letterSpacing: '-0.03em' }}
            >
              Bienvenido,{' '}
              <span style={{ color: 'var(--green-light)' }}>{firstName}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.18 }}
              className="text-white/50 text-lg mb-9 max-w-lg leading-relaxed"
            >
              Analiza tus notas por cohorte y descubre tu probabilidad de éxito
              con inteligencia artificial. Recibe consejos personalizados al instante.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              className="flex flex-wrap gap-3 justify-center md:justify-start"
            >
              <motion.button
                id="tour-hero-cta"
                onClick={() => navigate('/prediccion')}
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.96 }}
                className="btn-primary btn-lg flex items-center gap-2"
              >
                Comenzar predicción
                <ArrowRight size={18} />
              </motion.button>
              <motion.button
                onClick={() => navigate('/mis-materias')}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.96 }}
                className="btn-ghost-dark btn-lg"
              >
                Ver mi progreso
              </motion.button>
            </motion.div>
          </div>

          {/* Right: floating stat cards */}
          <div className="flex-shrink-0 grid grid-cols-2 gap-3 w-full max-w-xs">
            {[
              { label: 'Precisión del modelo', value: '90%',    icon: Brain,    color: 'var(--green-light)' },
              { label: 'Tiempo de análisis',   value: '<1 min', icon: Clock,    color: 'var(--gold-light)'  },
              { label: 'Variables analizadas', value: '5',      icon: Layers,   color: 'var(--gold)'        },
              { label: 'Consejero IA',         value: '24/7',   icon: Zap,      color: 'var(--green-light)' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.82, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.22 + i * 0.07, duration: 0.4, type: 'spring', stiffness: 320 }}
                whileHover={{ scale: 1.06, y: -4 }}
                className="rounded-2xl p-4 text-center cursor-default"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(212,233,226,0.15)', backdropFilter: 'blur(8px)' }}
              >
                <s.icon size={17} style={{ color: s.color, margin: '0 auto 6px' }} />
                <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-white/40 text-[0.66rem] mt-0.5 leading-tight">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Wave divider — bleeds into canvas-warm */}
        <div className="absolute bottom-0 left-0 right-0 h-12 overflow-hidden pointer-events-none">
          <svg viewBox="0 0 1440 48" fill="none" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,24 C360,48 1080,0 1440,24 L1440,48 L0,48 Z" fill="#f2f0eb" />
          </svg>
        </div>
      </section>

      {/* ── STATS BAND — warm canvas ── */}
      <section className="py-12" style={{ background: 'var(--canvas-warm)' }}>
        <div className="max-w-4xl mx-auto px-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: '99K+',  label: 'Registros de entrenamiento', color: 'var(--green-accent)'  },
              { value: '90%',   label: 'Precisión del modelo',       color: 'var(--green-brand)'   },
              { value: '5',     label: 'Variables analizadas',       color: 'var(--gold)'           },
              { value: '< 1 s', label: 'Tiempo de predicción',       color: 'var(--green-accent)'  },
            ].map(s => (
              <div
                key={s.label}
                data-anim="stat-card"
                className="text-center bg-white rounded-2xl p-5 card-hover"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-3xl font-black mb-1"
                  style={{ color: s.color }}
                >
                  {s.value}
                </motion.p>
                <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="tour-features" className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-5">
          <motion.div
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <span className="text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: 'var(--green-accent)' }}>¿Qué obtienes?</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2" style={{ color: 'var(--text-dark)', letterSpacing: '-0.02em' }}>
              Todo lo que necesitas para mejorar
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: BarChart2,  title: 'Probabilidad de Riesgo', desc: 'Velocímetro visual con tu % de riesgo calculado con regresión logística.',          iconBg: 'rgba(0,117,74,0.09)',  iconColor: 'var(--green-accent)' },
              { icon: TrendingUp, title: 'Gráficas Detalladas',    desc: 'Compara tus métricas vs el promedio de estudiantes que aprobaron.',                  iconBg: 'rgba(0,98,65,0.07)',   iconColor: 'var(--green-brand)'  },
              { icon: Lightbulb,  title: 'Consejos IA',            desc: 'Análisis personalizado generado con IA basado en tu perfil académico.',              iconBg: 'var(--gold-lightest)', iconColor: 'var(--gold)'          },
              { icon: Calculator, title: 'Detalles Matemáticos',   desc: 'Explora la ecuación logit y probabilidad exacta de tu predicción.',                  iconBg: 'rgba(0,98,65,0.07)',   iconColor: 'var(--green-brand)'  },
            ].map(f => (
              <div key={f.title} data-anim="feature-card">
                <motion.div
                  whileHover={{ y: -7 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="rounded-2xl p-6 border h-full cursor-default card-hover"
                  style={{ background: 'var(--canvas-warm)', borderColor: 'rgba(0,0,0,0.08)' }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: f.iconBg }}>
                    <f.icon size={21} style={{ color: f.iconColor }} />
                  </div>
                  <h3 className="font-bold mb-1.5" style={{ color: 'var(--text-dark)' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROCESS ── */}
      <section className="py-20" style={{ background: 'var(--canvas-warm)' }}>
        <div className="max-w-4xl mx-auto px-5">
          <motion.div
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <span className="text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: 'var(--green-accent)' }}>Proceso</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2" style={{ color: 'var(--text-dark)', letterSpacing: '-0.02em' }}>
              Tres pasos simples
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '01', icon: ClipboardList, title: 'Ingresa tus datos',  desc: 'Notas de corte 1, corte 2 y corte final.', accent: 'var(--green-accent)' },
              { step: '02', icon: Brain,          title: 'Análisis IA',        desc: 'El modelo procesa tus 4 variables en menos de 1 segundo.', accent: 'var(--green-brand)' },
              { step: '03', icon: Lightbulb,      title: 'Recibe tu reporte', desc: 'Gráficas, nivel de riesgo y consejos personalizados.', accent: 'var(--gold)' },
            ].map((p, i) => (
              <div key={p.step} data-anim="process-step" className="relative text-center">
                {i < 2 && (
                  <motion.div
                    initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.4 + i * 0.2 }}
                    className="hidden md:block absolute top-6 left-[calc(100%-20px)] w-10 h-px origin-left z-10"
                    style={{ background: 'var(--green-light)' }}
                  />
                )}
                <div
                  className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white font-extrabold text-sm mb-4"
                  style={{ background: p.accent, boxShadow: `0 4px 16px ${p.accent}44` }}
                >
                  {p.step}
                </div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'rgba(0,117,74,0.08)', border: '1px solid rgba(0,117,74,0.15)' }}
                >
                  <p.icon size={19} style={{ color: 'var(--green-brand)' }} />
                </div>
                <h3 className="font-bold mb-1" style={{ color: 'var(--text-dark)' }}>{p.title}</h3>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VARIABLES ── */}
      <section id="tour-variables" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-5">
          <motion.div
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <span className="text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: 'var(--green-accent)' }}>Variables del modelo</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2" style={{ color: 'var(--text-dark)', letterSpacing: '-0.02em' }}>
              ¿Qué analiza el predictor?
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { icon: Users,         label: 'Asistencia a Clases',     desc: 'Porcentaje de clases a las que asistes',    bg: 'rgba(0,117,74,0.08)',  color: 'var(--green-accent)' },
              { icon: ClipboardList, label: 'Nivel de Seguimiento',    desc: 'Calificación promedio en seguimientos',      bg: 'rgba(0,98,65,0.07)',   color: 'var(--green-brand)'  },
              { icon: BookOpen,      label: 'Nota del Primer Parcial', desc: 'Tu calificación en el primer examen',        bg: 'var(--gold-lightest)', color: 'var(--gold)'          },
              { icon: Monitor,       label: 'Uso de Plataforma',       desc: 'Inicios de sesión en el sistema LMS',        bg: 'rgba(0,117,74,0.08)',  color: 'var(--green-accent)' },
              { icon: CheckCircle,   label: 'Nota total',              desc: 'Síntesis ponderada del rendimiento del curso.', bg: 'rgba(0,98,65,0.07)',   color: 'var(--green-brand)'  },
              { icon: Layers,        label: 'Modelo de Regresión',     desc: 'Logistic Regression · 99k registros',        bg: 'rgba(0,0,0,0.04)',     color: 'var(--text-muted)'   },
            ].map(v => (
              <div key={v.label} data-anim="var-card">
                <motion.div
                  whileHover={{ x: 4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="flex items-start gap-3 p-4 rounded-xl border cursor-default transition-all"
                  style={{ background: 'var(--canvas-warm)', borderColor: 'rgba(0,0,0,0.08)' }}
                >
                  <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: v.bg }}>
                    <v.icon size={15} style={{ color: v.color }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>{v.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{v.desc}</p>
                  </div>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER — deep green ── */}
      <section className="py-20 relative overflow-hidden" style={{ background: 'var(--green-deep)' }}>
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'linear-gradient(135deg, var(--green-deep) 0%, var(--green-mid) 100%)' }} />
        <ParticleCanvas opacity={0.4} />

        <div className="relative max-w-2xl mx-auto px-5 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
          >
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
              style={{ background: 'rgba(212,233,226,0.14)', border: '1px solid rgba(212,233,226,0.30)' }}
            >
              <Clock size={28} style={{ color: 'var(--green-light)' }} />
            </div>
            <h2 className="text-white font-black mb-3" style={{ fontSize: '2.2rem', letterSpacing: '-0.03em' }}>
              Menos de{' '}
              <span style={{ color: 'var(--green-light)' }}>1 minuto</span>
            </h2>
            <p className="text-white/50 mb-9 text-lg leading-relaxed">
              Conoce tu nivel de riesgo académico ahora mismo y actúa a tiempo.
            </p>
            <motion.button
              onClick={() => navigate('/prediccion')}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.97 }}
              className="btn-primary btn-lg inline-flex items-center gap-2"
            >
              Ir al predictor
              <ArrowRight size={18} />
            </motion.button>
          </motion.div>
        </div>
      </section>

    </div>
  )
}
