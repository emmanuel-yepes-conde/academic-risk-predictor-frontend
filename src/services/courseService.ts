/**
 * Course service — secciones/grupos de una materia.
 * Wraps /api/v1/courses and /api/v1/programs/{id}/courses.
 */

import { api } from './api'
import type { BackendUser } from './authService'
import type { PaginatedResponse } from './userService'

// ─── Backend DTOs ─────────────────────────────────────────────────────────────

export interface BackendCourse {
  id:                 string
  subject_id:         string
  section:            string
  academic_period:    string
  professor_id?:      string | null
  status:             'ACTIVE' | 'INACTIVE'
  created_at:         string
  // Denormalizados desde Subject:
  code:               string
  name:               string
  credits:            number
  program_id:         string
  evaluation_config?: Record<string, unknown> | null
}

export interface EvaluationConfigActivityInput {
  id:         string
  name:       string
  percentage: number
}

export interface EvaluationConfigCutInput {
  id:              string
  name:            string
  percentage:      number
  evaluation_date?: string | null
  activities:      EvaluationConfigActivityInput[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface CourseCreateInput {
  subject_id:      string
  section?:        string
  academic_period: string
  professor_id?:   string
}

export const courseService = {
  /** Crea una sección de una materia. */
  async create(body: CourseCreateInput): Promise<BackendCourse> {
    return api.post<BackendCourse>('/courses', body)
  },

  /** Lista secciones de un programa. */
  async listByProgram(programId: string): Promise<BackendCourse[]> {
    const res = await api.get<BackendCourse[] | PaginatedResponse<BackendCourse>>(`/programs/${programId}/courses`)
    return Array.isArray(res) ? res : (res.data ?? [])
  },

  /** Lista secciones asignadas a un profesor (para el flujo de calificaciones). */
  async listByProfessor(professorId: string, limit = 50): Promise<BackendCourse[]> {
    const res = await api.get<BackendCourse[] | PaginatedResponse<BackendCourse>>(`/professors/${professorId}/courses?limit=${limit}`)
    return Array.isArray(res) ? res : (res.data ?? [])
  },

  /** Lista paginada de secciones de un profesor — para el Dashboard. */
  async listByProfessorPaginated(
    professorId: string,
    skip = 0,
    limit = 15,
    search = '',
  ): Promise<{ courses: BackendCourse[]; total: number }> {
    const qs = new URLSearchParams({ skip: String(skip), limit: String(limit) })
    if (search) qs.set('search', search)
    const res = await api.get<BackendCourse[] | PaginatedResponse<BackendCourse>>(
      `/professors/${professorId}/courses?${qs}`,
    )
    if (Array.isArray(res)) return { courses: res, total: res.length }
    return { courses: res.data ?? [], total: res.total ?? (res.data?.length ?? 0) }
  },

  /** Obtiene el profesor asignado a una sección. */
  async getCourseProf(courseId: string): Promise<BackendUser> {
    return api.get<BackendUser>(`/courses/${courseId}/professor`)
  },

  /** Lista estudiantes inscritos en una sección. */
  async listCourseStudents(courseId: string, professorId: string): Promise<BackendUser[]> {
    const res = await api.get<BackendUser[] | PaginatedResponse<BackendUser>>(
      `/courses/${courseId}/students?professor_id=${professorId}`,
    )
    return Array.isArray(res) ? res : (res.data ?? [])
  },

  /** Obtiene una sección por ID. */
  async getById(courseId: string): Promise<BackendCourse> {
    return api.get<BackendCourse>(`/courses/${courseId}`)
  },

  /** Lista secciones con paginación. */
  async listAll(params: {
    status?:     'ACTIVE' | 'INACTIVE'
    subject_id?: string
    skip?:       number
    limit?:      number
  } = {}): Promise<PaginatedResponse<BackendCourse>> {
    const qs = new URLSearchParams()
    if (params.status)     qs.set('status',     params.status)
    if (params.subject_id) qs.set('subject_id', params.subject_id)
    if (params.skip  != null) qs.set('skip',  String(params.skip))
    if (params.limit != null) qs.set('limit', String(params.limit))
    const query = qs.toString() ? `?${qs}` : ''
    return api.get<PaginatedResponse<BackendCourse>>(`/courses${query}`)
  },

  /** Asigna o reemplaza el profesor de una sección. */
  async assignProfessor(courseId: string, professorId: string): Promise<{ id: string; professor_id: string; course_id: string }> {
    return api.post(`/courses/${courseId}/professor`, { professor_id: professorId })
  },

  /** Cambia el estado de una sección (ACTIVE / INACTIVE). */
  async updateStatus(courseId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<BackendCourse> {
    return api.patch<BackendCourse>(`/courses/${courseId}/status`, { status })
  },

  /** Guarda la distribución de notas de la sección. */
  async saveEvaluationConfig(courseId: string, cuts: EvaluationConfigCutInput[]): Promise<BackendCourse> {
    return api.patch<BackendCourse>(`/courses/${courseId}/evaluation-config`, { cuts })
  },

  /**
   * Devuelve {course_id: student_count} para todos los cursos del profesor
   * en una sola query (evita el N+1 del dashboard).
   */
  async getProfessorCoursesSummary(professorId: string): Promise<Record<string, number>> {
    return api.get<Record<string, number>>(`/professors/${professorId}/courses-summary`)
  },

  /** Elimina la inscripción de un estudiante de un curso. */
  async unenrollStudent(courseId: string, studentId: string): Promise<void> {
    await api.delete(`/courses/${courseId}/students/${studentId}`)
  },
}
