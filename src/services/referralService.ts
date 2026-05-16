/**
 * Referral service — wraps /api/v1/referrals and related endpoints.
 */

import { api } from './api'

// ─── Enums & constants ────────────────────────────────────────────────────────

export const REFERRAL_TYPE_OPTIONS = [
  'Bajo rendimiento académico',
  'Inasistencia reiterada',
  'Incumplimiento de actividades',
  'Problemas personales',
  'Dificultades económicas',
  'Problemas de salud',
  'Otros',
] as const

export type ReferralType = typeof REFERRAL_TYPE_OPTIONS[number]
export type AsistioValue   = 'Sin confirmar' | 'Sí' | 'No'
export type ReferralStatus = 'PENDIENTE' | 'ATENDIDA' | 'CANCELADA'

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface BackendReferral {
  id:                     string
  enrollment_id:          string
  created_by:             string
  tipo_remision:          ReferralType
  tipo_remision_otro:     string | null
  observaciones:          string
  observaciones_remision: string | null
  fecha_remision:         string          // "YYYY-MM-DD"
  asistio:                AsistioValue
  status:                 ReferralStatus
  created_at:             string
  updated_at:             string
}

export interface ReferralCreateInput {
  tipo_remision:      ReferralType
  tipo_remision_otro?: string | null
  observaciones:      string
  fecha_remision:     string             // "YYYY-MM-DD"
}

export interface ReferralUpdateInput {
  observaciones_remision?: string | null
  asistio?:                AsistioValue
  status?:                 ReferralStatus
}

// ─── Evaluation config ────────────────────────────────────────────────────────

export interface CutActivity {
  id:         string   // unique key within the cut, e.g. "act_parcial"
  name:       string
  percentage: number
}

export interface CutConfig {
  id:              string         // first_cohort | second_cohort | third_cohort
  name:            string
  percentage:      number         // total weight of this cut
  evaluation_date: string | null
  activities:      CutActivity[]  // must sum to percentage
}

export interface EvaluationConfig {
  course_id: string
  cuts:      CutConfig[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const referralService = {
  /** Create a referral for an enrollment */
  async create(enrollmentId: string, body: ReferralCreateInput): Promise<BackendReferral> {
    return api.post<BackendReferral>(`/enrollments/${enrollmentId}/referrals`, body)
  },

  /** List referrals for a specific enrollment */
  async listByEnrollment(enrollmentId: string): Promise<BackendReferral[]> {
    return api.get<BackendReferral[]>(`/enrollments/${enrollmentId}/referrals`)
  },

  /** List all referrals for a course */
  async listByCourse(courseId: string): Promise<BackendReferral[]> {
    return api.get<BackendReferral[]>(`/courses/${courseId}/referrals`)
  },

  /** Update a referral (asistio, observaciones_remision, status) */
  async update(referralId: string, body: ReferralUpdateInput): Promise<BackendReferral> {
    return api.patch<BackendReferral>(`/referrals/${referralId}`, body)
  },

  /** Get evaluation config (cuts) for a course */
  async getEvaluationConfig(courseId: string): Promise<EvaluationConfig> {
    return api.get<EvaluationConfig>(`/courses/${courseId}/evaluation-config`)
  },

  /** Save evaluation config (cuts) for a course */
  async setEvaluationConfig(courseId: string, cuts: CutConfig[]): Promise<EvaluationConfig> {
    return api.put<EvaluationConfig>(`/courses/${courseId}/evaluation-config`, { cuts })
  },
}
