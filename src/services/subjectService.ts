/**
 * Subject service — materias (definiciones académicas).
 * Wraps /api/v1/subjects and /api/v1/programs/{id}/subjects.
 */

import { api } from './api'
import type { PaginatedResponse } from './userService'

export interface BackendSubject {
  id: string
  code: string
  name: string
  credits: number
  program_id: string
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
}

export interface SubjectCreateInput {
  code: string
  name: string
  credits: number
  program_id: string
}

export interface SubjectUpdateInput {
  code?: string
  name?: string
  credits?: number
}

export interface SubjectBulkRowResult {
  row: number
  code: string
  status: 'created' | 'error'
  detail: string | null
  subject?: BackendSubject | null
}

export interface SubjectBulkUploadResponse {
  total_rows: number
  created: number
  failed: number
  results: SubjectBulkRowResult[]
}

export const subjectService = {
  /** Lista las materias de un programa. */
  async listByProgram(programId: string): Promise<BackendSubject[]> {
    const res = await api.get<BackendSubject[] | PaginatedResponse<BackendSubject>>(`/programs/${programId}/subjects`)
    return Array.isArray(res) ? res : (res.data ?? [])
  },

  /** Crea una materia. */
  async create(body: SubjectCreateInput): Promise<BackendSubject> {
    return api.post<BackendSubject>('/subjects', body)
  },

  /** Actualiza parcialmente una materia. */
  async update(subjectId: string, body: SubjectUpdateInput): Promise<BackendSubject> {
    return api.patch<BackendSubject>(`/subjects/${subjectId}`, body)
  },

  /** Cambia el estado de una materia. */
  async updateStatus(subjectId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<BackendSubject> {
    return api.patch<BackendSubject>(`/subjects/${subjectId}/status`, { status })
  },

  /** Carga masiva de materias desde un CSV para un programa dado. */
  async bulkUpload(programId: string, file: File): Promise<SubjectBulkUploadResponse> {
    const form = new FormData()
    form.append('file', file)
    return api.postForm<SubjectBulkUploadResponse>(
      `/subjects/bulk?program_id=${programId}`,
      form,
    )
  },
}
