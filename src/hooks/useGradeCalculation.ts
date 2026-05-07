import { useMemo } from 'react'
import type { Course, Grade, Student } from '../types'
import { calcWeightedTotal, getRisk } from '../utils/gradeCalculator'

export function useGradeCalculation(course: Course, grades: Grade[], students: Student[]) {
  const courseStudents = useMemo(
    () => students.filter(s => course.studentIds.includes(s.id)),
    [students, course.studentIds]
  )

  const gradeMap = useMemo(() => {
    const map: Record<string, Record<string, number | null>> = {}
    for (const s of courseStudents) {
      map[s.id] = {}
      for (const c of course.components) {
        const g = grades.find(g => g.studentId === s.id && g.componentId === c.id)
        map[s.id][c.id] = g?.value ?? null
      }
    }
    return map
  }, [grades, courseStudents, course.components])

  const totals = useMemo(() => {
    const t: Record<string, number | null> = {}
    for (const s of courseStudents) {
      t[s.id] = calcWeightedTotal(gradeMap[s.id] ?? {}, course.components)
    }
    return t
  }, [gradeMap, courseStudents, course.components])

  const currentCohortGrades = useMemo(() => {
    const byStudent: Record<string, number | null> = {}
    const cutOrder = course.cuts ?? []

    const getCutGrade = (studentId: string, cutId: string): number | null => {
      const cutComponents = course.components.filter(c => c.cutId === cutId)
      if (cutComponents.length === 0) return null

      let weighted = 0
      let coveredWeight = 0
      cutComponents.forEach(comp => {
        const value = gradeMap[studentId]?.[comp.id]
        if (value === null || value === undefined) return
        weighted += value * comp.percentage
        coveredWeight += comp.percentage
      })

      if (coveredWeight === 0) return null
      return Math.round((weighted / coveredWeight) * 10) / 10
    }

    for (const s of courseStudents) {
      let current: number | null = null
      cutOrder.forEach(cut => {
        const grade = getCutGrade(s.id, cut.id)
        if (grade !== null) current = grade
      })
      byStudent[s.id] = current
    }

    return byStudent
  }, [course.cuts, course.components, courseStudents, gradeMap])

  const atRiskCount = useMemo(
    () => courseStudents.filter(s => getRisk(currentCohortGrades[s.id]) === 'high').length,
    [currentCohortGrades, courseStudents]
  )

  const completionPct = useMemo(() => {
    const total = courseStudents.length * course.components.length
    if (total === 0) return 0
    const filled = courseStudents.reduce((sum, s) =>
      sum + course.components.filter(c => gradeMap[s.id]?.[c.id] !== null && gradeMap[s.id]?.[c.id] !== undefined).length
    , 0)
    return Math.round((filled / total) * 100)
  }, [gradeMap, courseStudents, course.components])

  const componentAvg = useMemo(() => {
    const avgs: Record<string, number | null> = {}
    for (const c of course.components) {
      const vals = courseStudents.map(s => gradeMap[s.id]?.[c.id]).filter((v): v is number => v !== null && v !== undefined)
      avgs[c.id] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null
    }
    return avgs
  }, [gradeMap, courseStudents, course.components])

  return { courseStudents, gradeMap, totals, currentCohortGrades, atRiskCount, completionPct, componentAvg }
}
