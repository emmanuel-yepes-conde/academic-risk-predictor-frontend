/**
 * ConsentModal — popup bloqueante que solicita aceptación de los términos
 * y condiciones de uso del aplicativo (consentimiento ML).
 *
 * Se muestra cuando el estudiante autenticado aún no ha aceptado la versión
 * vigente de los términos. Hasta aceptar, no puede usar el resto de la UI.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, AlertTriangle } from 'lucide-react'

interface ConsentModalProps {
  open:          boolean
  termsVersion?: string
  onAccept:      () => Promise<void> | void
  onLogout:      () => void
}

export default function ConsentModal({ open, termsVersion, onAccept, onLogout }: ConsentModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)

  const handleAccept = async () => {
    if (!agree || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onAccept()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el consentimiento.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          aria-modal="true"
          role="dialog"
          aria-labelledby="consent-title"
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

          <motion.div
            className="relative bg-white border border-usb-border rounded-3xl shadow-modal w-full max-w-lg p-8 space-y-5"
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <h2 id="consent-title" className="text-xl font-extrabold text-usb-text">
                  Términos y condiciones
                </h2>
                <p className="text-sm text-usb-muted">
                  Para usar el aplicativo debes aceptar el uso de tus datos académicos
                  por parte del modelo predictivo (ML).
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-usb-canvas border border-usb-border p-4 text-sm text-usb-text leading-relaxed max-h-56 overflow-y-auto">
              <p className="mb-2">
                Al aceptar, autorizas el procesamiento de tu información académica
                (notas, asistencia, inscripciones) con fines exclusivos de:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Calcular tu riesgo académico mediante un modelo predictivo.</li>
                <li>Mostrarte alertas y recomendaciones de acompañamiento.</li>
                <li>Permitir a tus docentes priorizar apoyo cuando aplique.</li>
              </ul>
              <p className="mt-2">
                Tus datos no se comparten con terceros y puedes revocar el
                consentimiento solicitándolo a la administración.
              </p>
              {termsVersion && (
                <p className="mt-2 text-xs text-usb-faint">
                  Versión de los términos: <span className="font-mono">{termsVersion}</span>
                </p>
              )}
            </div>

            <label className="flex items-start gap-3 text-sm text-usb-text cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-emerald-700"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                disabled={submitting}
              />
              <span>
                He leído y acepto los términos y condiciones de uso del aplicativo.
              </span>
            </label>

            {error && (
              <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onLogout}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-usb-muted hover:text-usb-text disabled:opacity-50"
              >
                Salir
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!agree || submitting}
                className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Guardando…' : 'Aceptar y continuar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
