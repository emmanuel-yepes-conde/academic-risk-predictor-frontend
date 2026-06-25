/**
 * GradesContext — no mock data.
 * All courses loaded from the real backend by professor ID.
 * Grades are stored locally (localStorage) until a grades API is built.
 */

import {
  createContext, useContext, useState, useEffect, useRef,
  useCallback, type ReactNode,
} from 'react'
import type { Course, Grade, GradeComponent, GradeCut, Student } from '../types'
import { courseService, type BackendCourse } from '../services/courseService'
import { enrollmentService } from '../services/enrollmentService'
import { programService } from '../services/programService'
import type { BackendUser } from '../services/authService'

interface GradesContextValue {
  courseList:                Course[]
  courseStudentsMap:          Record<string, Student[]>
  grades:                    Grade[]
  lastSaved:                 Date | null
  loadingCourses:            boolean
  selectedCourseId:          string | null
  setSelectedCourseId:       (id: string | null) => void
  updateGrade:               (studentId: string, componentId: string, value: number | null) => void
  updateComponents:          (courseId: string, components: Course['components']) => void
  updateCuts:                (courseId: string, cuts: GradeCut[]) => void
  refreshCourses:            (professorId: string) => Promise<void>
  loadCourseStudents:        (courseId: string, professorId: string) => Promise<void>
  clearCourses:              () => void
  removeStudentFromCourse:   (courseId: string, studentId: string) => Promise<void>
}

const GradesContext = createContext<GradesContextValue | null>(null)

// ─── Default cuts + components ────────────────────────────────────────────────
export function defaultCuts(courseId: string): GradeCut[] {
  return [
    { id: `${courseId}-cut1`, name: 'Corte 1',     percentage: 30 },
    { id: `${courseId}-cut2`, name: 'Corte 2',     percentage: 30 },
    { id: `${courseId}-cut3`, name: 'Corte Final', percentage: 40 },
  ]
}

export function defaultComponents(courseId: string): GradeComponent[] {
  return [
    { id: `${courseId}-p1`, cutId: `${courseId}-cut1`, name: 'Parcial 1', percentage: 30 },
    { id: `${courseId}-p2`, cutId: `${courseId}-cut2`, name: 'Parcial 2', percentage: 30 },
    { id: `${courseId}-pf`, cutId: `${courseId}-cut3`, name: 'Final',     percentage: 40 },
  ]
}

function fallbackCutName(index: number, total: number): string {
  if (index === total - 1) return 'Corte Final'
  return `Corte ${index + 1}`
}

function normalizePct(raw: unknown, max = 100): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, Math.round(n)))
}

function parseWeight(raw: unknown, max = 100): number {
  if (typeof raw === 'string') {
    return normalizePct(raw.replace('%', ''), max)
  }
  return normalizePct(raw, max)
}

function parseEvaluationConfig(
  courseId: string,
  evaluationConfig?: Record<string, unknown> | null,
): { cuts: GradeCut[]; components: GradeComponent[] } | null {
  const rawCuts = evaluationConfig?.cuts
  if (!Array.isArray(rawCuts) || rawCuts.length === 0) return null

  const cuts: GradeCut[] = []
  const components: GradeComponent[] = []

  rawCuts.forEach((rawCut, cutIndex) => {
    if (!rawCut || typeof rawCut !== 'object') return
    const cutObj = rawCut as Record<string, unknown>
    const cutId = typeof cutObj.id === 'string' && cutObj.id.trim().length > 0
      ? cutObj.id
      : `${courseId}-cut${cutIndex + 1}`
    const cutName = typeof cutObj.name === 'string' && cutObj.name.trim().length > 0
      ? cutObj.name
      : fallbackCutName(cutIndex, rawCuts.length)
    const cutPct = normalizePct(cutObj.percentage)

    cuts.push({
      id: cutId,
      name: cutName,
      percentage: cutPct,
    })

    const rawActivities = Array.isArray(cutObj.activities) ? cutObj.activities : []
    rawActivities.forEach((rawActivity, activityIndex) => {
      if (!rawActivity || typeof rawActivity !== 'object') return
      const activityObj = rawActivity as Record<string, unknown>
      const compId = typeof activityObj.id === 'string' && activityObj.id.trim().length > 0
        ? activityObj.id
        : `${cutId}-comp${activityIndex + 1}`
      const compName = typeof activityObj.name === 'string' && activityObj.name.trim().length > 0
        ? activityObj.name
        : `Actividad ${activityIndex + 1}`
      const compPct = normalizePct(activityObj.percentage, cutPct || 100)

      components.push({
        id: compId,
        cutId,
        name: compName,
        percentage: compPct,
      })
    })
  })

  if (cuts.length === 0) return null
  if (components.length === 0) {
    return {
      cuts,
      components: cuts.map((cut, idx) => ({
        id: `${cut.id}-default-${idx + 1}`,
        cutId: cut.id,
        name: `Parcial ${idx + 1}`,
        percentage: cut.percentage,
      })),
    }
  }
  return { cuts, components }
}

function parseGradesStructure(
  courseId: string,
  grades: Record<string, unknown> | null | undefined,
): { cuts: GradeCut[]; components: GradeComponent[] } | null {
  if (!grades || typeof grades !== 'object') return null

  const cohortKeys = ['first_cohort', 'second_cohort', 'third_cohort'] as const
  const cuts: GradeCut[] = []
  const components: GradeComponent[] = []

  cohortKeys.forEach((cohortKey, cutIndex) => {
    const cohort = grades[cohortKey]
    if (!cohort || typeof cohort !== 'object') return
    const cohortObj = cohort as Record<string, unknown>
    const cutId = `${courseId}-${cohortKey}`
    const cutName = fallbackCutName(cutIndex, cohortKeys.length)
    const cutPct = parseWeight(cohortObj.weight)
    cuts.push({ id: cutId, name: cutName, percentage: cutPct })

    const parcial = cohortObj.parcial
    if (parcial && typeof parcial === 'object') {
      const parcialObj = parcial as Record<string, unknown>
      components.push({
        id: typeof parcialObj.id === 'string' ? parcialObj.id : `${cutId}-parcial`,
        cutId,
        name: typeof parcialObj.name === 'string' && parcialObj.name.trim().length > 0
          ? parcialObj.name
          : 'Parcial',
        percentage: parseWeight(parcialObj.weight, cutPct || 100),
      })
    }

    const seguimiento = cohortObj.seguimiento
    if (seguimiento && typeof seguimiento === 'object') {
      Object.entries(seguimiento as Record<string, unknown>).forEach(([activityKey, raw], idx) => {
        if (!raw || typeof raw !== 'object') return
        const activityObj = raw as Record<string, unknown>
        components.push({
          id: typeof activityObj.id === 'string' ? activityObj.id : activityKey,
          cutId,
          name: typeof activityObj.name === 'string' && activityObj.name.trim().length > 0
            ? activityObj.name
            : `Actividad ${idx + 1}`,
          percentage: parseWeight(activityObj.weight, cutPct || 100),
        })
      })
    }
  })

  if (cuts.length === 0 || components.length === 0) return null
  return { cuts, components }
}

// ─── Convert backend course → frontend Course ─────────────────────────────────
function backendToFrontend(
  bc: BackendCourse,
  professorId: string,
  studentIds: string[] = [],
  programName?: string,
  persistedGrades?: Record<string, unknown> | null,
): Course {
  const configFromEnrollments = parseGradesStructure(bc.id, persistedGrades)
  const configFromCourse = parseEvaluationConfig(bc.id, bc.evaluation_config)
  const config = configFromEnrollments ?? configFromCourse

  return {
    id:         bc.id,
    code:       bc.code,
    name:       bc.name,
    group:      bc.section,
    professorId,
    semester:   bc.academic_period ?? '2025-I',
    studentIds,
    cuts:       config?.cuts ?? defaultCuts(bc.id),
    components: config?.components ?? defaultComponents(bc.id),
    program:    programName ?? bc.program_id,
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GradesProvider({ children }: { children: ReactNode }) {
  const [courseList, setCourseList] = useState<Course[]>([])
  const [courseStudentsMap, setCourseStudentsMap] = useState<Record<string, Student[]>>({})
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [grades, setGrades] = useState<Grade[]>(() => {
    try {
      const s = localStorage.getItem('ar-grades')
      if (s) return JSON.parse(s) as Grade[]
    } catch { /* ignore */ }
    return []
  })
  const [lastSaved, setLastSaved]    = useState<Date | null>(null)
  const [loadingCourses, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist grades to localStorage
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      localStorage.setItem('ar-grades', JSON.stringify(grades))
      setLastSaved(new Date())
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [grades])

  // ── Fetch professor's courses from backend ─────────────────────────────────
  const refreshCourses = useCallback(async (professorId: string) => {
    setLoading(true)
    try {
      const backendCourses = await courseService.listByProfessor(professorId)

      // Resolve program names sequentially (typically 3-5 unique programs — fast)
      const programIds = [...new Set(backendCourses.map(bc => bc.program_id).filter(Boolean))]
      const programNames: Record<string, string> = {}
      for (const pid of programIds) {
        try {
          const prog = await programService.getProgram(pid)
          programNames[pid] = prog.program_name
        } catch {
          console.warn('[GradesContext] Could not resolve program name for:', pid)
        }
      }

      // Load course list only — students are loaded on-demand per course
      const initialCourses = backendCourses.map(bc =>
        backendToFrontend(bc, professorId, [], programNames[bc.program_id] ?? bc.program_id, null),
      )
      setCourseList(initialCourses)
    } catch (err) {
      console.error('[GradesContext] Failed to load courses:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const clearCourses = useCallback(() => { setCourseList([]); setCourseStudentsMap({}) }, [])

  const loadCourseStudents = useCallback(async (courseId: string, professorId: string) => {
    try {
      const backendStudents = await courseService.listCourseStudents(courseId, professorId)
      const students: Student[] = backendStudents.map((s: BackendUser) => ({
        id:          s.id,
        studentCode: s.student_institutional_id ?? s.institutional_email ?? s.email,
        name:        s.full_name,
        program:     '',
        semester:    0,
      }))
      setCourseStudentsMap(prev => ({ ...prev, [courseId]: students }))
      // Update studentIds on the course entry
      setCourseList(prev => prev.map(c =>
        c.id === courseId ? { ...c, studentIds: students.map(s => s.id) } : c,
      ))
    } catch { /* silently ignore */ }
  }, [])

  // ── Grade mutations ────────────────────────────────────────────────────────
  const updateGrade = (studentId: string, componentId: string, value: number | null) => {
    setGrades(prev => {
      const idx = prev.findIndex(
        g => g.studentId === studentId && g.componentId === componentId,
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], value }
        return next
      }
      return [...prev, { studentId, componentId, value }]
    })
  }

  const updateComponents = (courseId: string, components: Course['components']) => {
    setCourseList(prev =>
      prev.map(c => c.id === courseId ? { ...c, components } : c),
    )
  }

  const updateCuts = (courseId: string, cuts: GradeCut[]) => {
    setCourseList(prev =>
      prev.map(c => c.id === courseId ? { ...c, cuts } : c),
    )
  }

  const removeStudentFromCourse = useCallback(async (courseId: string, studentId: string) => {
    await courseService.unenrollStudent(courseId, studentId)
    // Update local state immediately
    setCourseStudentsMap(prev => ({
      ...prev,
      [courseId]: (prev[courseId] ?? []).filter(s => s.id !== studentId),
    }))
    setCourseList(prev =>
      prev.map(c =>
        c.id === courseId
          ? { ...c, studentIds: c.studentIds.filter(id => id !== studentId) }
          : c,
      ),
    )
    // Remove grades for this student
    setGrades(prev => prev.filter(g => g.studentId !== studentId))
  }, [])

  return (
    <GradesContext.Provider
      value={{
        courseList,
        courseStudentsMap,
        grades,
        lastSaved,
        loadingCourses,
        selectedCourseId,
        setSelectedCourseId,
        updateGrade,
        updateComponents,
        updateCuts,
        refreshCourses,
        loadCourseStudents,
        clearCourses,
        removeStudentFromCourse,
      }}
    >
      {children}
    </GradesContext.Provider>
  )
}

export function useGrades() {
  const ctx = useContext(GradesContext)
  if (!ctx) throw new Error('useGrades must be used within GradesProvider')
  return ctx
}
