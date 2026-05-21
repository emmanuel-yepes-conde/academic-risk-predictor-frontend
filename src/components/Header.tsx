/**
 * Header — Starbucks-inspired deep green top bar.
 * Features: brand mark, role-based nav, autosave indicator, user menu.
 */
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut, Cloud, Loader2,
  LayoutDashboard, GraduationCap, Settings,
  ChevronDown, HelpCircle, Download, Bell, BellOff,
  User, CheckCheck, Trash2, AlertTriangle, CalendarCheck,
  BookOpen, Megaphone, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Tooltip from './Tooltip'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { inAppService, type InAppNotification } from '../services/notificationService'

interface Props {
  lastSaved?: Date | null
  subtitle?:  string
}

// ─── Nav link helper ──────────────────────────────────────────────────────────

function NavLink({
  to,
  icon: Icon,
  label,
  exact = false,
}: {
  to:      string
  icon:    LucideIcon
  label:   string
  exact?:  boolean
}) {
  const location = useLocation()
  const active   = exact
    ? location.pathname === to
    : location.pathname.startsWith(to)

  return (
    <Link
      to={to}
      className={`nav-link relative ${active ? 'active' : ''}`}
    >
      <Icon size={14} />
      {label}
    </Link>
  )
}

// ─── Notification icon map ────────────────────────────────────────────────────

function notifIcon(type: string) {
  switch (type) {
    case 'RISK_ALTO':     return <AlertTriangle size={14} className="text-red-500" />
    case 'RISK_RECOVERED': return <CalendarCheck size={14} className="text-emerald-500" />
    case 'ATTENDANCE':    return <CalendarCheck size={14} className="text-emerald-500" />
    case 'GRADE_UPDATE':  return <BookOpen size={14} className="text-blue-500" />
    case 'CLASS_CRISIS':  return <AlertTriangle size={14} className="text-amber-500" />
    default:              return <Megaphone size={14} className="text-usb-muted" />
  }
}

function fmtNotifTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffM = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffM < 1)  return 'Ahora'
  if (diffM < 60) return `Hace ${diffM} min`
  const diffH = Math.floor(diffM / 60)
  if (diffH < 24) return `Hace ${diffH} h`
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
}

// ─── Notification Bell ────────────────────────────────────────────────────────

function NotificationBell() {
  const { user }    = useAuth()
  const isStudent   = user?.role === 'student'
  const { supported: pushSupported, permission, subscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications()

  const [open, setOpen]           = useState(false)
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [unread, setUnread]       = useState(0)
  const [loading, setLoading]     = useState(false)
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    const data = await inAppService.getUnread()
    setNotifications(data)
    setUnread(data.filter(n => !n.read).length)
  }

  useEffect(() => {
    void load()
    pollRef.current = setInterval(load, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleOpen = async () => {
    setOpen(v => !v)
    if (!open) {
      setLoading(true)
      const all = await inAppService.getAll(20)
      setNotifications(all)
      setUnread(all.filter(n => !n.read).length)
      setLoading(false)
    }
  }

  const handleMarkRead = async (id: string) => {
    await inAppService.markRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }

  const handleMarkAll = async () => {
    await inAppService.markAllRead()
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  const handleDelete = async (id: string) => {
    await inAppService.deleteOne(id)
    const removed = notifications.find(n => n.id === id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (removed && !removed.read) setUnread(prev => Math.max(0, prev - 1))
  }

  return (
    <div className="relative">
      <Tooltip content="Notificaciones" placement="bottom">
        <button
          onClick={handleOpen}
          className="relative p-2 rounded-xl transition-colors no-tap"
          style={{ color: open ? 'var(--green-light)' : 'rgba(255,255,255,0.45)', background: open ? 'rgba(212,233,226,0.12)' : 'transparent' }}
          onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.80)' }}
          onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)' }}
        >
          <Bell size={16} />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[0.58rem] font-extrabold text-white px-1"
              style={{ background: '#ef4444' }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </Tooltip>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[40]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: -6 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{   opacity: 0, scale: 0.94, y: -6 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] bg-white rounded-2xl overflow-hidden z-[50]"
              style={{ boxShadow: 'var(--shadow-modal)', maxHeight: '480px' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-usb-border"
                   style={{ background: 'var(--canvas-warm)' }}>
                <p className="font-bold text-sm text-usb-text">Notificaciones</p>
                {unread > 0 && (
                  <button
                    onClick={handleMarkAll}
                    className="flex items-center gap-1 text-xs font-semibold hover:underline"
                    style={{ color: 'var(--green-accent)' }}
                  >
                    <CheckCheck size={12} />
                    Marcar todas leídas
                  </button>
                )}
              </div>

              {/* List */}
              <div className="overflow-y-auto" style={{ maxHeight: '340px' }}>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-usb-muted" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-2">
                    <Bell size={24} className="text-usb-faint" />
                    <p className="text-sm text-usb-faint">Sin notificaciones</p>
                  </div>
                ) : (
                  <div className="divide-y divide-usb-border">
                    {notifications.map(n => (
                      <div
                        key={n.id}
                        className="flex items-start gap-3 px-4 py-3 group transition-colors cursor-pointer"
                        style={{ background: n.read ? 'white' : 'rgba(0,117,74,0.04)' }}
                        onClick={() => { if (!n.read) void handleMarkRead(n.id) }}
                      >
                        <div className="flex-shrink-0 mt-0.5">{notifIcon(n.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-tight ${n.read ? 'font-medium text-usb-text' : 'font-bold text-usb-text'}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-usb-muted mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                          <p className="text-[0.62rem] text-usb-faint mt-1">{fmtNotifTime(n.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {!n.read && (
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--green-accent)' }} />
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); void handleDelete(n.id) }}
                            className="p-1 rounded-lg hover:bg-red-50 text-usb-faint hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer: push toggle (solo estudiantes) */}
              {isStudent && (
                <div className="border-t border-usb-border px-4 py-2.5 flex items-center justify-between gap-3"
                     style={{ background: 'var(--canvas-warm)' }}>
                  {!pushSupported ? (
                    <p className="text-xs text-usb-faint">
                      Tu navegador no soporta alertas push
                    </p>
                  ) : permission === 'denied' ? (
                    <p className="text-xs text-usb-faint">
                      Alertas bloqueadas — actívalas en ajustes del navegador
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        {pushLoading
                          ? <Loader2 size={13} className="animate-spin text-usb-muted flex-shrink-0" />
                          : subscribed
                            ? <Bell size={13} style={{ color: 'var(--green-accent)' }} className="flex-shrink-0" />
                            : <BellOff size={13} className="text-usb-faint flex-shrink-0" />
                        }
                        <span className="text-xs font-semibold text-usb-muted truncate">
                          {pushLoading ? 'Configurando…' : subscribed ? 'Alertas push activas' : 'Alertas push desactivadas'}
                        </span>
                      </div>
                      <button
                        onClick={() => void (subscribed ? unsubscribe() : subscribe())}
                        disabled={pushLoading}
                        className="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-50"
                        style={{ background: subscribed ? 'var(--green-accent)' : '#d1d5db' }}
                      >
                        <span
                          className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                          style={{ transform: subscribed ? 'translateX(16px)' : 'translateX(0px)' }}
                        />
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── User chip ────────────────────────────────────────────────────────────────

function UserChip({ onLogout }: { onLogout: () => void }) {
  const { user }  = useAuth()
  const [open, setOpen] = useState(false)

  if (!user) return null

  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const roleLabel = user.role === 'student' ? 'Estudiante' : user.role === 'admin' ? 'Admin' : 'Docente'

  return (
    <div className="relative">
      <button
        id="tour-user-avatar"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 transition-colors group"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs flex-shrink-0 border-2"
          style={{
            background: 'rgba(212,233,226,0.25)',
            borderColor: 'rgba(212,233,226,0.45)',
            color: '#d4e9e2',
          }}
        >
          {initials}
        </div>

        {/* Name + role */}
        <div className="hidden sm:block text-left">
          <p className="text-white text-[0.78rem] font-bold leading-tight">{user.name}</p>
          <p className="text-white/40 text-[0.65rem]">{roleLabel}</p>
        </div>

        <ChevronDown
          size={13}
          className={`text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[40]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: -6 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{   opacity: 0, scale: 0.94, y: -6  }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl overflow-hidden z-[50]"
              style={{ boxShadow: 'var(--shadow-modal)' }}
            >
              {/* Profile header */}
              <div className="px-4 py-3.5 border-b border-usb-border"
                   style={{ background: 'var(--canvas-warm)' }}>
                <p className="font-bold text-sm text-usb-text truncate">{user.name}</p>
                <p className="text-xs text-usb-faint truncate">{roleLabel}</p>
              </div>

              {/* Actions */}
              <div className="py-1.5">
                <Link
                  to="/perfil"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-usb-text hover:bg-gray-50 transition-colors font-medium"
                >
                  <User size={14} className="text-usb-muted" />
                  Mi Perfil
                </Link>
                <div className="mx-3 my-1 h-px bg-usb-border" />
                <button
                  onClick={() => { setOpen(false); onLogout() }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-semibold"
                >
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Header ──────────────────────────────────────────────────────────────

export default function Header({ lastSaved, subtitle }: Props) {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()
  const { canInstall, install } = usePWAInstall()

  const isStudent   = user?.role === 'student'
  const isProfessor = user?.role === 'professor'

  const handleLogout = () => { logout(); navigate('/login') }

  const timeStr = lastSaved
    ? lastSaved.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <>
      <header
        className="sticky top-0 z-40"
        style={{ background: 'var(--green-deep)', boxShadow: 'var(--shadow-nav)' }}
      >
        <div className="flex items-center justify-between px-5 py-0 max-w-7xl mx-auto h-14">

          {/* ── Left: brand + nav ── */}
          <div className="flex items-center gap-1.5">
            {/* Brand mark */}
            <Link
              to={isStudent ? '/' : '/dashboard'}
              className="flex items-center gap-2.5 group mr-3 no-tap"
            >
              {/* Logomark: AR icon PNG */}
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-105 overflow-hidden"
                style={{ background: 'rgba(212,233,226,0.18)', border: '1px solid rgba(212,233,226,0.35)' }}
              >
                <img
                  src="/assets/ar-icon.png"
                  alt="Academic Risk"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="leading-none">
                <span
                  className="text-white font-extrabold text-sm block"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  Academic Risk
                </span>
                {subtitle && (
                  <span className="text-white/35 text-[0.62rem]">{subtitle}</span>
                )}
              </div>
            </Link>

            {/* Section divider */}
            <div className="w-px h-5 bg-white/10 mr-1" />

            {/* Student nav */}
            {isStudent && (
              <nav id="tour-nav" className="hidden md:flex items-center gap-0.5">
                <NavLink to="/" icon={GraduationCap} label="Mi Progreso" exact />
              </nav>
            )}

            {/* Professor nav */}
            {isProfessor && (
              <nav id="tour-prof-nav" className="hidden md:flex items-center gap-0.5">
                <NavLink to="/dashboard" icon={LayoutDashboard} label="Mis Materias" exact />
              </nav>
            )}

            {/* Admin nav */}
            {user?.role === 'admin' && (
              <nav className="hidden md:flex items-center gap-0.5">
                <NavLink to="/admin" icon={Settings} label="Administración" exact />
              </nav>
            )}
          </div>

          {/* ── Right: actions ── */}
          <div className="flex items-center gap-2">

            {/* Autosave (professors) */}
            {isProfessor && lastSaved !== undefined && (
              <div
                className="hidden sm:flex items-center gap-1.5 text-white/40 text-xs px-3 py-1.5 rounded-full"
                style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)' }}
              >
                {timeStr ? (
                  <>
                    <Cloud size={11} style={{ color: 'var(--green-light)' }} />
                    <span className="font-semibold">Guardado · {timeStr}</span>
                  </>
                ) : (
                  <>
                    <Loader2 size={11} className="animate-spin" style={{ color: 'var(--green-light)' }} />
                    <span className="font-semibold">Guardando…</span>
                  </>
                )}
              </div>
            )}

            {/* Instalar PWA */}
            {canInstall && (
              <Tooltip content="Instalar Academic Risk en tu celular" placement="bottom">
                <button
                  onClick={() => void install()}
                  aria-label="Instalar app"
                  className="hidden sm:flex items-center gap-1.5 text-white/60 text-xs px-2.5 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-colors border border-white/15 no-tap"
                >
                  <Download size={12} />
                  <span className="font-semibold">Instalar</span>
                </button>
              </Tooltip>
            )}

            {/* Tour help */}
            <Tooltip content="Repetir tour" placement="bottom">
              <button
                id="tour-header-help"
                onClick={() => window.dispatchEvent(new Event('ar:start-tour'))}
                aria-label="Repetir tour de bienvenida"
                className="p-2 text-white/30 hover:text-white/70 hover:bg-white/08 rounded-xl transition-colors no-tap"
              >
                <HelpCircle size={15} />
              </button>
            </Tooltip>

            {/* In-app notification bell */}
            <NotificationBell />

            {/* Divider */}
            <div className="w-px h-5 bg-white/10" />

            {/* User chip */}
            <UserChip onLogout={handleLogout} />
          </div>
        </div>
      </header>
    </>
  )
}
