import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Upload, FileText, CheckCircle2, AlertCircle, Loader2, FileX, Trash2,
} from 'lucide-react'
import { ragService, type RagDocument } from '../services/ragService'

interface Props {
  open:       boolean
  courseId:   string
  courseName: string
  onClose:    () => void
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

function formatBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function DocumentUploadModal({ open, courseId, courseName, onClose }: Props) {
  const inputRef                        = useRef<HTMLInputElement>(null)
  const [file, setFile]                 = useState<File | null>(null)
  const [dragging, setDragging]         = useState(false)
  const [uploadState, setUploadState]   = useState<UploadState>('idle')
  const [errorMsg, setErrorMsg]         = useState('')

  const [docs, setDocs]               = useState<RagDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)

  const fetchDocs = useCallback(async () => {
    if (!courseId) return
    setLoadingDocs(true)
    try {
      const list = await ragService.listDocuments(courseId)
      setDocs(list)
    } catch {
      // silently fail — list is non-critical
    } finally {
      setLoadingDocs(false)
    }
  }, [courseId])

  useEffect(() => {
    if (open) {
      void fetchDocs()
      setFile(null)
      setUploadState('idle')
      setErrorMsg('')
      setDeletingFile(null)
    }
  }, [open, fetchDocs])

  async function handleDelete(filename: string) {
    setDeletingFile(filename)
    try {
      await ragService.deleteDocument(courseId, filename)
      await fetchDocs()
    } catch {
      // silently fail — list will stay unchanged
    } finally {
      setDeletingFile(null)
    }
  }

  function handleClose() {
    setFile(null)
    setUploadState('idle')
    setErrorMsg('')
    onClose()
  }

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (f.type !== 'application/pdf') {
      setErrorMsg('Solo se aceptan archivos PDF.')
      return
    }
    setErrorMsg('')
    setUploadState('idle')
    setFile(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files[0])
  }

  async function handleUpload() {
    if (!file) return
    setUploadState('uploading')
    setErrorMsg('')
    try {
      await ragService.uploadDocument(file, courseId)
      setUploadState('success')
      setFile(null)
      await fetchDocs()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo subir el archivo.')
      setUploadState('error')
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
            style={{ border: '1px solid rgba(0,0,0,0.08)' }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 rounded-t-2xl flex-shrink-0"
              style={{ background: 'var(--green-deep)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}
            >
              <div className="flex items-center gap-2">
                <FileText size={16} style={{ color: 'var(--green-light)' }} />
                <div>
                  <p className="text-white font-extrabold text-sm leading-tight">Guías de materia</p>
                  <p className="text-white/50 text-xs truncate max-w-[240px]">{courseName}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.20)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
              >
                <X size={14} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">

              {/* ── Documentos cargados ── */}
              <div>
                <p className="text-[0.65rem] font-extrabold uppercase tracking-wider mb-2"
                   style={{ color: 'var(--text-faint)' }}>
                  Documentos cargados
                </p>

                {loadingDocs ? (
                  <div className="flex items-center justify-center py-5 rounded-xl"
                       style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <Loader2 size={16} className="animate-spin" style={{ color: 'var(--green-accent)' }} />
                  </div>
                ) : docs.length === 0 ? (
                  <div className="flex flex-col items-center py-5 rounded-xl"
                       style={{ background: 'var(--canvas-warm)', border: '1.5px dashed rgba(0,0,0,0.10)' }}>
                    <FileX size={20} className="mb-1.5" style={{ color: 'var(--text-faint)' }} />
                    <p className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>
                      Aún no hay documentos para esta materia
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {docs.map((doc, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: 'var(--canvas-warm)', border: '1px solid rgba(0,0,0,0.06)' }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                             style={{ background: 'rgba(0,117,74,0.10)' }}>
                          <FileText size={15} style={{ color: 'var(--green-accent)' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-dark)' }}>
                            {doc.filename}
                          </p>
                          <p className="text-[0.65rem]" style={{ color: 'var(--text-faint)' }}>
                            {formatDate(doc.uploaded_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => { void handleDelete(doc.filename) }}
                          disabled={deletingFile === doc.filename}
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                          style={{
                            background: deletingFile === doc.filename ? 'rgba(220,38,38,0.06)' : 'transparent',
                            color: '#dc2626',
                            border: '1px solid rgba(220,38,38,0.15)',
                          }}
                          onMouseEnter={e => { if (deletingFile !== doc.filename) e.currentTarget.style.background = 'rgba(220,38,38,0.08)' }}
                          onMouseLeave={e => { if (deletingFile !== doc.filename) e.currentTarget.style.background = 'transparent' }}
                          title="Eliminar documento"
                        >
                          {deletingFile === doc.filename
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Subir nuevo documento ── */}
              <div>
                <p className="text-[0.65rem] font-extrabold uppercase tracking-wider mb-2"
                   style={{ color: 'var(--text-faint)' }}>
                  Subir nuevo documento
                </p>

                {uploadState === 'success' ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
                    style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.20)' }}
                  >
                    <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-emerald-700">
                        Documento subido correctamente
                      </p>
                      <p className="text-xs mt-0.5 text-emerald-600/80">
                        En aproximadamente 10 minutos estará disponible para consultas de los estudiantes mientras se completa la indexación.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <>
                    {/* Drop zone */}
                    <div
                      onClick={() => inputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      className="rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all"
                      style={{
                        border: `2px dashed ${dragging ? 'var(--green-accent)' : file ? 'rgba(0,117,74,0.40)' : 'rgba(0,0,0,0.15)'}`,
                        background: dragging ? 'rgba(0,117,74,0.04)' : file ? 'rgba(0,117,74,0.02)' : 'var(--canvas-warm)',
                      }}
                    >
                      <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => pickFile(e.target.files?.[0])}
                      />
                      {file ? (
                        <>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
                               style={{ background: 'rgba(0,117,74,0.10)' }}>
                            <FileText size={18} style={{ color: 'var(--green-accent)' }} />
                          </div>
                          <p className="font-bold text-sm text-center truncate max-w-full"
                             style={{ color: 'var(--text-dark)' }}>
                            {file.name}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            {formatBytes(file.size)} · Haz clic para cambiar
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
                               style={{ background: 'rgba(0,0,0,0.05)' }}>
                            <Upload size={18} style={{ color: 'var(--text-faint)' }} />
                          </div>
                          <p className="font-bold text-sm" style={{ color: 'var(--text-dark)' }}>
                            Arrastra el PDF aquí
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            o haz clic para seleccionar
                          </p>
                        </>
                      )}
                    </div>

                    {/* Error */}
                    {errorMsg && (
                      <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mt-2 bg-rose-50 border border-rose-200">
                        <AlertCircle size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs font-medium text-rose-700">{errorMsg}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex gap-2 px-6 py-4 border-t flex-shrink-0"
                 style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm border transition-colors"
                style={{ borderColor: 'rgba(0,0,0,0.12)', color: 'var(--text-muted)', background: 'white' }}
              >
                Cerrar
              </button>
              {uploadState !== 'success' && (
                <button
                  onClick={() => { void handleUpload() }}
                  disabled={!file || uploadState === 'uploading'}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: !file || uploadState === 'uploading' ? '#9ca3af' : 'var(--green-accent)',
                    cursor: !file || uploadState === 'uploading' ? 'not-allowed' : 'pointer',
                    boxShadow: file && uploadState !== 'uploading' ? '0 2px 8px rgba(0,117,74,0.25)' : 'none',
                  }}
                >
                  {uploadState === 'uploading'
                    ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</>
                    : <><Upload size={14} /> Subir PDF</>}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
