/**
 * Enrollment service.
 * Wraps /api/v1/enrollments and /api/v1/students/{id}/enrollments endpoints.
 */

import { api } from './api'

// ─── Backend DTOs ─────────────────────────────────────────────────────────────

export type EnrollmentStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export interface BackendEnrollment {
  id:              string
  student_id:      string
  course_id:       string
  status:          EnrollmentStatus
  enrollment_date: string
  updated_at:      string
}

export interface BackendGradesRead {
  id:                  string
  student_id:          string
  course_id:           string
  grades:              Record<string, unknown> | null
  first_cohort_grade:  number | null
  second_cohort_grade: number | null
  third_cohort_grade:  number | null
  final_grade:         number | null
}

export interface CourseGradesStructureRead {
  course_id: string
  grades: Record<string, unknown> | null
}

export interface CohortRiskRead {
  cohort_key: 'first_cohort' | 'second_cohort' | 'third_cohort'
  cohort_name: string
  probabilidad_riesgo: number
  porcentaje_riesgo: number
  nivel_riesgo: 'ALTO' | 'MEDIO' | 'BAJO'
  datos_cohorte: {
    nota_parcial: number
    promedio_seguimiento: number
    porcentaje_asistencia: number
  }
  detalles_modelo: Record<string, number>
}

export interface EnrollmentRiskRead {
  probabilidad_riesgo: number
  porcentaje_riesgo: number
  nivel_riesgo: 'ALTO' | 'MEDIO' | 'BAJO'
  analisis_ia: string
  datos_radar: {
    labels: string[]
    estudiante: number[]
    promedio_aprobado: number[]
  }
  is_partial?: boolean
  cortes_disponibles?: number
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const enrollmentService = {
  /**
   * List enrollments for a student.
   * STUDENT can access their own; PROFESSOR/ADMIN can access any.
   * @param status — optional filter: PENDING, ACTIVE, COMPLETED, CANCELLED.
   *                 Omit to get all statuses.
   */
  async listByStudent(
    studentId: string,
    status?: EnrollmentStatus,
  ): Promise<BackendEnrollment[]> {
    const qs = status ? `?status=${status}` : ''
    return api.get<BackendEnrollment[]>(`/students/${studentId}/enrollments${qs}`)
  },

  /**
   * Get a single enrollment by ID.
   */
  async getById(enrollmentId: string): Promise<BackendEnrollment> {
    return api.get<BackendEnrollment>(`/enrollments/${enrollmentId}`)
  },

  /**
   * Get grades for a specific enrollment.
   * STUDENT can only access their own; PROFESSOR/ADMIN can access any.
   */
  async getGrades(enrollmentId: string): Promise<BackendGradesRead> {
    return api.get<BackendGradesRead>(`/enrollments/${enrollmentId}/grades`)
  },

  /** Enroll a student in a course (requires ADMIN role). */
  async create(body: { student_id: string; course_id: string }): Promise<BackendEnrollment> {
    return api.post<BackendEnrollment>('/enrollments', body)
  },

  /** Update enrollment status (requires ADMIN or PROFESSOR role). */
  async updateStatus(enrollmentId: string, status: EnrollmentStatus): Promise<BackendEnrollment> {
    return api.patch<BackendEnrollment>(`/enrollments/${enrollmentId}/status`, { status })
  },

  /** Find the active enrollment for a student in a specific course. */
  async findByCourse(studentId: string, courseId: string): Promise<BackendEnrollment | null> {
    try {
      const enrollments = await enrollmentService.listByStudent(studentId, 'ACTIVE')
      return enrollments.find(e => e.course_id === courseId) ?? null
    } catch {
      return null
    }
  },

  /** Save grades for an enrollment (PUT /enrollments/{id}/grades). */
  async saveGrades(enrollmentId: string, grades: Record<string, unknown>): Promise<BackendGradesRead> {
    return api.put<BackendGradesRead>(`/enrollments/${enrollmentId}/grades`, { grades })
  },

  /** Get the saved grade-structure JSON for a course (from enrollments table). */
  async getCourseGradesStructure(courseId: string): Promise<CourseGradesStructureRead> {
    return api.get<CourseGradesStructureRead>(`/courses/${courseId}/grades-structure`)
  },

  /** Save grade-structure JSON for all enrollments of a course. */
  async saveCourseGradesStructure(courseId: string, grades: Record<string, unknown>): Promise<CourseGradesStructureRead> {
    return api.put<CourseGradesStructureRead>(`/courses/${courseId}/grades-structure`, { grades })
  },

  async getCohortRisk(
    enrollmentId: string,
    cohortKey: 'first_cohort' | 'second_cohort' | 'third_cohort',
  ): Promise<CohortRiskRead> {
    return api.post<CohortRiskRead>(`/enrollments/${enrollmentId}/risk/cohort?cohort_key=${cohortKey}`, {})
  },

  async getTotalRisk(enrollmentId: string, notify = false): Promise<EnrollmentRiskRead> {
    const qs = notify ? '?notify=true' : ''
    return api.post<EnrollmentRiskRead>(`/enrollments/${enrollmentId}/risk${qs}`, {})
  },
}
