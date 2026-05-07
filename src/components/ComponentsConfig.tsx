import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react'
import type { GradeComponent, GradeCut } from '../types'

// Percentage input with its own draft state so the user can clear and retype freely
function PctInput({
  value, max, className, onCommit,
}: { value: number; max: number; className: string; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value))

  // Keep draft in sync when parent resets the value externally
  useEffect(() => { setDraft(String(value)) }, [value])

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      className={className}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9]/g, '')
        setDraft(raw)
        if (raw !== '') onCommit(Math.max(0, Math.min(max, parseInt(raw, 10))))
      }}
      onBlur={() => {
        const n = parseInt(draft, 10)
        const clamped = isNaN(n) ? 0 : Math.max(0, Math.min(max, n))
        setDraft(String(clamped))
        onCommit(clamped)
      }}
    />
  )
}

interface Props {
  cuts: GradeCut[]
  components: GradeComponent[]
  onChangeCuts: (cuts: GradeCut[]) => void
  onChange: (components: GradeComponent[]) => void
}

function normName(name: string): string {
  return name.trim().toLowerCase()
}

export default function ComponentsConfig({ cuts, components, onChangeCuts, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(cuts.map(c => c.id)))

  const cutsTotal = cuts.reduce((s, c) => s + c.percentage, 0)
  const cutsValid = cutsTotal === 100
  const duplicateCompIds = new Set<string>()
  let hasEmptyNames = false
  const names = new Map<string, string[]>()
  components.forEach(comp => {
    const normalized = normName(comp.name)
    if (!normalized) {
      hasEmptyNames = true
      return
    }
    const ids = names.get(normalized) ?? []
    ids.push(comp.id)
    names.set(normalized, ids)
  })
  names.forEach(ids => {
    if (ids.length > 1) ids.forEach(id => duplicateCompIds.add(id))
  })

  const hasDuplicateNames = duplicateCompIds.size > 0
  const namesValid = !hasEmptyNames && !hasDuplicateNames
  const allValid  = cutsValid && cuts.every(cut => {
    const sum = components.filter(c => c.cutId === cut.id).reduce((s, c) => s + c.percentage, 0)
    return sum === cut.percentage
  }) && namesValid

  const toggleCut = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const updateCutPct = (id: string, n: number) =>
    onChangeCuts(cuts.map(c => c.id === id ? { ...c, percentage: n } : c))

  const updateCompPct  = (id: string, n: number) =>
    onChange(components.map(c => c.id === id ? { ...c, percentage: n } : c))

  const updateCompName = (id: string, name: string) =>
    onChange(components.map(c => c.id === id ? { ...c, name } : c))

  const removeComp = (id: string) => onChange(components.filter(c => c.id !== id))

  const addComp = (cutId: string, cut: GradeCut) => {
    const cutTotal = components.filter(c => c.cutId === cutId).reduce((s, c) => s + c.percentage, 0)
    onChange([...components, {
      id:         `comp-${Date.now()}`,
      cutId,
      name:       '',
      percentage: Math.max(0, cut.percentage - cutTotal),
    }])
  }

  return (
    <div className="space-y-3">
      {/* Overall status */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border ${
        allValid
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}>
        {allValid ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
        {allValid
          ? 'Distribución válida — todos los cortes están completos'
          : !cutsValid
            ? `Los cortes suman ${cutsTotal}% — deben sumar 100%`
            : hasDuplicateNames
              ? 'No se permiten actividades con el mismo nombre'
              : hasEmptyNames
                ? 'Todas las actividades deben tener nombre'
            : 'Completa la distribución interna de cada corte'}
      </div>

      {/* Cuts summary row */}
      <div className="grid grid-cols-3 gap-2">
        {cuts.map(cut => {
          const cutTotal = components.filter(c => c.cutId === cut.id).reduce((s, c) => s + c.percentage, 0)
          const valid    = cutTotal === cut.percentage
          const over     = cutTotal > cut.percentage
          return (
            <div
              key={cut.id}
              className={`rounded-xl px-3 py-2 border text-center ${
                valid ? 'bg-emerald-50 border-emerald-200' :
                over  ? 'bg-rose-50 border-rose-200' :
                'bg-amber-50 border-amber-200'
              }`}
            >
              <p className="text-[0.68rem] font-bold uppercase tracking-wider text-usb-muted">{cut.name}</p>
              <p className={`text-lg font-extrabold ${valid ? 'text-emerald-700' : over ? 'text-rose-600' : 'text-amber-700'}`}>
                {cut.percentage}%
              </p>
              <p className="text-[0.65rem] text-usb-faint">{cutTotal}/{cut.percentage} asignado</p>
            </div>
          )
        })}
      </div>

      {/* Cut sections */}
      {cuts.map((cut, ci) => {
        const cutComps = components.filter(c => c.cutId === cut.id)
        const cutTotal = cutComps.reduce((s, c) => s + c.percentage, 0)
        const cutValid = cutTotal === cut.percentage
        const cutOver  = cutTotal > cut.percentage
        const fillPct  = cut.percentage > 0 ? Math.min(100, (cutTotal / cut.percentage) * 100) : 0
        const isOpen   = expanded.has(cut.id)

        return (
          <div key={cut.id} className="border border-usb-border rounded-2xl overflow-hidden bg-white">
            {/* Header */}
            <button
              onClick={() => toggleCut(cut.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-usb-canvas/60 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold flex-shrink-0 ${
                  cutValid ? 'bg-emerald-100 text-emerald-700' :
                  cutOver  ? 'bg-rose-100 text-rose-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {ci + 1 === cuts.length ? 'F' : ci + 1}
                </div>
                <div>
                  <p className="font-extrabold text-sm text-usb-text">{cut.name}</p>
                  <p className="text-[0.7rem] text-usb-muted">{cutComps.length} actividad{cutComps.length !== 1 ? 'es' : ''}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Editable cut weight */}
                <div
                  className="flex items-center gap-1"
                  onClick={e => e.stopPropagation()}
                >
                  <PctInput
                    value={cut.percentage}
                    max={100}
                    onCommit={n => updateCutPct(cut.id, n)}
                    className="w-14 text-center font-mono font-bold text-sm border border-usb-border rounded-lg py-1 bg-usb-canvas focus:outline-none focus:border-green-accent focus:ring-2 focus:ring-green-accent/20"
                  />
                  <span className="text-usb-muted text-xs font-semibold">%</span>
                </div>

                {/* Per-cut fill bar */}
                <div className="hidden sm:flex items-center gap-1.5 w-28">
                  <div className="flex-1 h-1.5 bg-usb-canvas rounded-full overflow-hidden border border-usb-border">
                    <motion.div
                      animate={{ width: `${fillPct}%` }}
                      transition={{ duration: 0.4 }}
                      className={`h-full rounded-full ${cutValid ? 'bg-emerald-500' : cutOver ? 'bg-rose-500' : 'bg-amber-400'}`}
                    />
                  </div>
                  <span className={`text-[0.68rem] font-bold font-mono w-12 text-right ${
                    cutValid ? 'text-emerald-600' : cutOver ? 'text-rose-600' : 'text-amber-600'
                  }`}>
                    {cutTotal}/{cut.percentage}
                  </span>
                </div>

                <ChevronDown
                  size={15}
                  className={`text-usb-faint transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {/* Body */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden border-t border-usb-border"
                >
                  <div className="p-4 space-y-2" style={{ background: 'var(--canvas-warm, #f9f6f1)' }}>
                    <AnimatePresence>
                      {cutComps.map(comp => (
                        <motion.div
                          key={comp.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-usb-border"
                        >
                          <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: 'var(--green-accent, #00754A)', opacity: 0.4 }} />
                          <div className="flex-1">
                            <input
                              type="text"
                              value={comp.name}
                              onChange={e => updateCompName(comp.id, e.target.value)}
                              placeholder="Nombre de la actividad"
                              className={`w-full bg-transparent text-[0.85rem] font-medium focus:outline-none ${
                                duplicateCompIds.has(comp.id) || comp.name.trim().length === 0
                                  ? 'text-rose-600'
                                  : 'text-usb-subtle'
                              }`}
                            />
                            {comp.name.trim().length === 0 && (
                              <p className="text-[0.65rem] text-rose-500 mt-0.5">Nombre requerido</p>
                            )}
                            {comp.name.trim().length > 0 && duplicateCompIds.has(comp.id) && (
                              <p className="text-[0.65rem] text-rose-500 mt-0.5">Nombre repetido</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <PctInput
                              value={comp.percentage}
                              max={cut.percentage}
                              onCommit={n => updateCompPct(comp.id, n)}
                              className="w-14 text-center font-mono font-bold text-[0.85rem] border border-usb-border rounded-lg py-1 bg-white focus:outline-none focus:border-green-accent focus:ring-2 focus:ring-green-accent/20"
                            />
                            <span className="text-usb-muted text-xs font-semibold">%</span>
                          </div>
                          <button
                            onClick={() => removeComp(comp.id)}
                            className="p-1.5 text-usb-faint hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {cutComps.length === 0 && (
                      <p className="text-center text-xs text-usb-faint py-2">
                        Sin actividades — agrega al menos una
                      </p>
                    )}

                    <button
                      onClick={() => addComp(cut.id, cut)}
                      disabled={cutTotal >= cut.percentage}
                      className="flex items-center gap-2 text-sm font-semibold border-2 border-dashed rounded-xl px-4 py-2.5 w-full justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        color:       cutTotal >= cut.percentage ? 'var(--text-faint)' : 'var(--green-accent, #00754A)',
                        borderColor: cutTotal >= cut.percentage ? 'rgba(0,0,0,0.12)' : 'rgba(0,117,74,0.35)',
                      }}
                    >
                      <Plus size={14} />
                      {cutTotal >= cut.percentage
                        ? `${cut.name} completo (${cut.percentage}%)`
                        : `Agregar actividad · quedan ${cut.percentage - cutTotal}%`}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
