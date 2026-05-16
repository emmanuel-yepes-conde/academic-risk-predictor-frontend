/**
 * Referrals — historial de auditoría de remisiones de un curso.
 * URL: /referrals/:courseId
 *
 * Vista de solo lectura. Las acciones (cambiar estado, asistió,
 * observaciones) se realizan desde la pestaña "Remisiones" en Grades.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronLeft, Send, Calendar, RefreshCw,
  Check, X, Clock, Filter, BookOpen,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import { courseService, type BackendCourse } from '../services/courseService'
import {
  referralService,
  type BackendReferral,
  type ReferralStatus,
  type AsistioValue,
} from '../services/referralService'
import { enrollmentService } from '../services/enrollmentService'
import type { BackendUser } from '../services/authService'

// ── Style maps ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<ReferralStatus, { label: string; bg: string; text: string; border: string }> = {
  PENDIENTE: { label: 'Pendiente', bg: 'rgba(234,88,12,0.08)',  text: '#c2410c',             border: 'rgba(234,88,12,0.22)'  },
  ATENDIDA:  { label: 'Atendida',  bg: 'rgba(0,117,74,0.09)',   text: 'var(--green-accent)', border: 'rgba(0,117,74,0.22)'   },
  CANCELADA: { label: 'Cancelada', bg: 'rgba(0,0,0,0.05)',      text: 'var(--text-faint)',   border: 'rgba(0,0,0,0.12)'      },
}

const ASISTIO_ICON: Record<AsistioValue, LucideIcon> = {
  'Sin confirmar': Clock,
  'Sí':            Check,
  'No':            X,
}
const ASISTIO_COLOR: Record<AsistioValue, string> = {
  'Sin confirmar': 'var(--text-faint)',
  'Sí':            'var(--green-accent)',
  'No':            '#dc2626',
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate     = useNavigate()
  const { user }     = useAuth()

  const [course,    setCourse]    = useState<BackendCourse | null>(null)
  const [referrals, setReferrals] = useState<BackendReferral[]>([])
  const [students,  setStudents]  = useState<Record<string, BackendUser>>({})
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [filter,    setFilter]    = useState<ReferralStatus | 'TODAS'>('TODAS')

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!courseId || !user?.professorId) return
    setLoading(true); setError(null)
    try {
      const [courseData, courseRefs, studentList] = await Promise.all([
        courseService.getById(courseId),
        referralService.listByCourse(courseId),
        courseService.listCourseStudents(courseId, user.professorId),
      ])
      setCourse(courseData)
      setReferrals(courseRefs)

      // Build enrollment_id → student map
      const enrollMap: Record<string, BackendUser> = {}
      await Promise.allSettled(
        studentList.map(async s => {
          const enrollments = await enrollmentService.listByStudent(s.id)
          const e = enrollments.find(en => en.course_id === courseId)
          if (e) enrollMap[e.id] = s
        })
      )
      setStudents(enrollMap)
    } catch {
      setError('No se pudieron cargar las remisiones.')
    } finally {
      setLoading(false)
    }
  }, [courseId, user?.professorId])

  useEffect(() => { void load() }, [load])

  const filtered = filter === 'TODAS' ? referrals : referrals.filter(r => r.status === filter)

  const counts: Record<ReferralStatus | 'TODAS', number> = {
    TODAS:     referrals.length,
    PENDIENTE: referrals.filter(r => r.status === 'PENDIENTE').length,
    ATENDIDA:  referrals.filter(r => r.status === 'ATENDIDA').length,
    CANCELADA: referrals.filter(r => r.status === 'CANCELADA').length,
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-warm)' }}>
      <Header />

      {/* Breadcrumb */}
      <div className="border-b px-5 py-2.5 flex items-center gap-2 text-sm"
        style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.08)' }}>

        {/* Mis materias */}
        <button
          onClick={() => navigate('/dashboard')}
          className="font-semibold transition-colors no-tap"
          style={{ color: 'var(--text-faint)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--green-accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = '')}
        >
          Mis materias
        </button>

        <ChevronLeft size={13} style={{ color: 'var(--text-faint)', transform: 'rotate(180deg)' }} />

        {/* Calificaciones (con tab=remisiones) */}
        <button
          onClick={() => navigate(`/grades/${courseId}?tab=remisiones`)}
          className="font-semibold transition-colors no-tap flex items-center gap-1"
          style={{ color: 'var(--text-faint)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--green-accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = '')}
        >
          <BookOpen size={12} />
          {course?.code ?? '...'} · Remisiones
        </button>

        <ChevronLeft size={13} style={{ color: 'var(--text-faint)', transform: 'rotate(180deg)' }} />

        {/* Página actual */}
        <span className="font-bold" style={{ color: 'var(--text-dark)' }}>Historial</span>
      </div>

      <main className="flex-1 px-5 py-6 max-w-4xl mx-auto w-full">

        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 rounded-full border-4 animate-spin"
              style={{ borderColor: 'var(--green-light)', borderTopColor: 'var(--green-accent)' }} />
          </div>
        )}

        {!loading && error && (
          <div className="p-6 bg-white rounded-2xl border border-red-200 text-center">
            <p className="text-sm text-red-600 font-semibold mb-3">{error}</p>
            <button onClick={load}
              className="flex items-center gap-2 text-sm font-bold mx-auto px-4 py-2 rounded-xl text-white"
              style={{ background: 'var(--green-accent)' }}>
              <RefreshCw size={13} /> Reintentar
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Page header */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(220,38,38,0.08)' }}>
                  <Send size={18} style={{ color: '#dc2626' }} />
                </div>
                <div>
                  <h2 className="font-extrabold text-xl" style={{ color: 'var(--text-dark)', letterSpacing: '-0.02em' }}>
                    Historial de remisiones
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {course?.name} — {course?.academic_period}
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[0.6rem] font-bold uppercase tracking-wider"
                      style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-faint)' }}>
                      Solo lectura
                    </span>
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Filter chips */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {(['TODAS', 'PENDIENTE', 'ATENDIDA', 'CANCELADA'] as const).map(s => {
                const sc = s === 'TODAS' ? null : STATUS_STYLE[s]
                return (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={filter === s
                      ? { background: sc ? sc.bg : 'rgba(0,117,74,0.09)', color: sc ? sc.text : 'var(--green-accent)', border: `1px solid ${sc ? sc.border : 'rgba(0,117,74,0.22)'}` }
                      : { background: '#fff', color: 'var(--text-muted)', border: '1px solid rgba(0,0,0,0.10)' }
                    }
                  >
                    <Filter size={10} />
                    {s === 'TODAS' ? 'Todas' : STATUS_STYLE[s].label}
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[0.58rem] font-extrabold"
                      style={{ background: 'rgba(0,0,0,0.08)' }}>
                      {counts[s]}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Empty */}
            {filtered.length === 0 && (
              <div className="p-12 bg-white rounded-2xl text-center" style={{ border: '2px dashed rgba(0,0,0,0.10)' }}>
                <Send size={24} className="mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
                <p className="font-bold" style={{ color: 'var(--text-dark)' }}>
                  {filter === 'TODAS' ? 'No hay remisiones en este curso' : `No hay remisiones ${STATUS_STYLE[filter].label.toLowerCase()}s`}
                </p>
              </div>
            )}

            {/* Read-only cards */}
            <div className="space-y-3">
              {filtered.map((ref, i) => {
                const student      = students[ref.enrollment_id]
                const sc           = STATUS_STYLE[ref.status]
                const AsistioIcon  = ASISTIO_ICON[ref.asistio]

                return (
                  <motion.div
                    key={ref.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-white rounded-2xl p-5"
                    style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    {/* Header row */}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                          style={{ background: 'rgba(0,117,74,0.10)', color: 'var(--green-accent)' }}>
                          {student
                            ? student.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                            : '?'}
                        </div>
                        <div>
                          <p className="font-extrabold text-sm leading-tight" style={{ color: 'var(--text-dark)' }}>
                            {student?.full_name ?? 'Estudiante'}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {ref.tipo_remision === 'Otros' ? ref.tipo_remision_otro : ref.tipo_remision}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Calendar size={10} style={{ color: 'var(--text-faint)' }} />
                            <span className="text-[0.65rem]" style={{ color: 'var(--text-faint)' }}>{ref.fecha_remision}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status + asistió (read-only badges) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[0.65rem] font-bold px-2.5 py-1 rounded-full"
                          style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                          {sc.label}
                        </span>
                        <span className="flex items-center gap-1 text-[0.65rem] font-semibold"
                          style={{ color: ASISTIO_COLOR[ref.asistio] }}>
                          <AsistioIcon size={11} />
                          {ref.asistio}
                        </span>
                      </div>
                    </div>

                    {/* Observaciones del docente */}
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                      <p className="text-[0.62rem] font-extrabold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
                        Observaciones del docente
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{ref.observaciones}</p>
                    </div>

                    {/* Observaciones de consejería */}
                    {ref.observaciones_remision && (
                      <div className="mt-3">
                        <p className="text-[0.62rem] font-extrabold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
                          Observaciones de consejería
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{ref.observaciones_remision}</p>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="mt-3 pt-2 border-t flex gap-4 flex-wrap" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                      <span className="text-[0.6rem]" style={{ color: 'var(--text-faint)' }}>
                        Creada: {new Date(ref.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      {ref.updated_at !== ref.created_at && (
                        <span className="text-[0.6rem]" style={{ color: 'var(--text-faint)' }}>
                          Actualizada: {new Date(ref.updated_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
