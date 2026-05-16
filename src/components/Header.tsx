/**
 * Header — Starbucks-inspired deep green top bar.
 * Features: brand mark, role-based nav, autosave indicator, user menu, CommandBar trigger.
 */
import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut, Cloud, Loader2,
  LayoutDashboard, GraduationCap, Settings, Command,
  ChevronDown, HelpCircle,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import CommandBar, { useCommandBar } from './CommandBar'
import Tooltip from './Tooltip'

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
  const { open, setOpen} = useCommandBar()

  const isStudent   = user?.role === 'student'
  const isProfessor = user?.role === 'professor'

  const handleLogout = () => { logout(); navigate('/login') }

  const timeStr = lastSaved
    ? lastSaved.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <>
      <CommandBar open={open} onClose={() => setOpen(false)} />

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

            {/* Cmd+K trigger */}
            <Tooltip content="Búsqueda rápida (⌘K)" placement="bottom">
              <button
                onClick={() => setOpen(true)}
                aria-label="Abrir barra de comandos (⌘K)"
                className="hidden sm:flex items-center gap-1.5 text-white/35 text-xs px-2.5 py-1.5 rounded-xl hover:bg-white/08 hover:text-white/70 transition-colors border border-white/10 no-tap"
              >
                <Command size={12} />
                <span className="font-semibold">⌘K</span>
              </button>
            </Tooltip>

            {/* Tour help */}
            <Tooltip content="Repetir tour" placement="bottom">
              <button
                onClick={() => window.dispatchEvent(new Event('ar:start-tour'))}
                aria-label="Repetir tour de bienvenida"
                className="p-2 text-white/30 hover:text-white/70 hover:bg-white/08 rounded-xl transition-colors no-tap"
              >
                <HelpCircle size={15} />
              </button>
            </Tooltip>

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
