/**
 * Toast — Starbucks-style notification system.
 * - Auto-dismiss with animated progress bar
 * - Spring entrance from right edge
 * - Deep green info, red error, gold warning, accent success
 * - Accessible: role="alert", aria-live
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id:        string
  type:      ToastType
  title:     string
  message?:  string
  duration?: number
}

interface ToastContextValue {
  toast:   (opts: Omit<Toast, 'id'>) => void
  success: (title: string, message?: string) => void
  error:   (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info:    (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

// ─── Design tokens per toast type ────────────────────────────────────────────

const CONFIG = {
  success: {
    bar:  'bg-green-accent',
    icon: <CheckCircle2 size={17} className="text-green-accent" />,
    iconBg: 'bg-green-light/60',
  },
  error: {
    bar:  'bg-red-500',
    icon: <XCircle size={17} className="text-red-500" />,
    iconBg: 'bg-red-50',
  },
  warning: {
    bar:  'bg-gold',
    icon: <AlertTriangle size={17} className="text-gold" />,
    iconBg: 'bg-gold-lightest',
  },
  info: {
    bar:  'bg-green-deep',
    icon: <Info size={17} className="text-green-deep" />,
    iconBg: 'bg-green-light/40',
  },
} as const

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ duration, barClass }: { duration: number; barClass: string }) {
  return (
    <motion.div
      className={`absolute bottom-0 left-0 h-[2px] rounded-b-2xl ${barClass}`}
      initial={{ scaleX: 1, transformOrigin: 'left' }}
      animate={{ scaleX: 0, transformOrigin: 'left' }}
      transition={{ duration: duration / 1000, ease: 'linear' }}
    />
  )
}

// ─── Single toast item ────────────────────────────────────────────────────────

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const cfg      = CONFIG[toast.type]
  const duration = toast.duration ?? 4500
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Start dismiss timer
  useEffect(() => {
    timerRef.current = setTimeout(() => onRemove(toast.id), duration)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [toast.id, duration, onRemove])

  // Pause on hover
  const pause  = () => { if (timerRef.current) clearTimeout(timerRef.current) }
  const resume = () => {
    timerRef.current = setTimeout(() => onRemove(toast.id), 800) // shorter resume
  }

  return (
    <motion.div
      role="alert"
      aria-live="polite"
      onMouseEnter={pause}
      onMouseLeave={resume}
      initial={{ opacity: 0, x: 80, scale: 0.94 }}
      animate={{ opacity: 1, x: 0,  scale: 1 }}
      exit={{   opacity: 0, x: 80,  scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="relative flex items-start gap-3 w-full max-w-[22rem] bg-white rounded-2xl overflow-hidden pr-4 pl-3.5 py-3.5"
      style={{ boxShadow: 'var(--shadow-modal)' }}
    >
      {/* Left color accent */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${cfg.bar}`} />

      {/* Icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 ml-0.5 ${cfg.iconBg}`}>
        {cfg.icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-bold text-[0.83rem] text-usb-text leading-tight">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-usb-muted mt-1 leading-relaxed">{toast.message}</p>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Cerrar notificación"
        className="flex-shrink-0 mt-0.5 text-usb-faint hover:text-usb-muted transition-colors"
      >
        <X size={14} />
      </button>

      {/* Progress bar */}
      <ProgressBar duration={duration} barClass={cfg.bar} />
    </motion.div>
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const add = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev.slice(-4), { ...opts, id }])
  }, [])

  const ctx: ToastContextValue = {
    toast:   add,
    success: (title, message) => add({ type: 'success', title, message }),
    error:   (title, message) => add({ type: 'error',   title, message }),
    warning: (title, message) => add({ type: 'warning', title, message }),
    info:    (title, message) => add({ type: 'info',    title, message }),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed top-4 right-4 left-4 sm:left-auto z-[500] flex flex-col gap-2 pointer-events-none items-end"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onRemove={remove} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
