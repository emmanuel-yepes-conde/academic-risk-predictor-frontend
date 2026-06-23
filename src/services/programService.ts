/**
 * Program service.
 * Wraps /api/v1/programs endpoints.
 * Note: Universities/Campuses were removed from the backend — programs are standalone.
 */

import { api } from './api'
import type { PaginatedResponse } from './userService'

// ─── Backend DTOs ─────────────────────────────────────────────────────────────

/** @deprecated — no longer used, kept for type compatibility in Programas/Materias tabs */
export interface BackendUniversity {
  id:         string
  name:       string
  code:       string
  country:    string
  city:       string
  active:     boolean
  created_at: string
}

export interface BackendProgram {
  id:            string
  institution:   string
  degree_type:   string
  program_code:  string
  program_name:  string
  location:      string
  snies_code:    number
  created_at:    string
}

/** @deprecated — no longer used */
export interface BackendCampus {
  id:            string
  university_id: string
  campus_code:   string
  name:          string
  city:          string
  active:        boolean
  created_at:    string
}

// ─── Create / Update DTOs ─────────────────────────────────────────────────────

export interface ProgramCreateInput {
  institution:   string
  degree_type:   string
  program_code:  string
  program_name:  string
  location:      string
  snies_code:    number
}

export interface ProgramUpdateInput {
  institution?:  string
  degree_type?:  string
  program_code?: string
  program_name?: string
  location?:     string
  snies_code?:   number
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const programService = {
  /** Get a single program by ID. */
  async getProgram(programId: string): Promise<BackendProgram> {
    return api.get<BackendProgram>(`/programs/${programId}`)
  },

  /** Create a new program (requires ADMIN role). */
  async createProgram(body: ProgramCreateInput): Promise<BackendProgram> {
    return api.post<BackendProgram>('/programs', body)
  },

  /** Update an existing program (requires ADMIN role). */
  async updateProgram(programId: string, body: ProgramUpdateInput): Promise<BackendProgram> {
    return api.patch<BackendProgram>(`/programs/${programId}`, body)
  },

  /** List all programs (global, no university filter). */
  async listAll(skip = 0, limit = 50): Promise<BackendProgram[]> {
    const res = await api.get<BackendProgram[] | PaginatedResponse<BackendProgram>>(`/programs?skip=${skip}&limit=${limit}`)
    return Array.isArray(res) ? res : res.data
  },

  // ── Compatibility stubs (universities removed from backend) ───────────────

  /** @deprecated Universities removed — returns empty paginated response */
  async listUniversities(): Promise<PaginatedResponse<BackendUniversity>> {
    return { data: [], total: 0, skip: 0, limit: 0 }
  },

  /** @deprecated Universities removed — returns empty array */
  async listProgramsByUniversity(_universityId: string): Promise<PaginatedResponse<BackendProgram>> {
    return { data: [], total: 0, skip: 0, limit: 0 }
  },

  /** @deprecated Universities removed — returns empty array */
  async listCampusesByUniversity(_universityId: string): Promise<BackendCampus[]> {
    return []
  },

  /** @deprecated Universities removed — throws */
  async createUniversity(_body: unknown): Promise<BackendUniversity> {
    throw new Error('Universities no longer supported')
  },
}
