/**
 * Consent service — wraps /api/v1/consents/me endpoints.
 * Solo aplica para usuarios con rol STUDENT.
 */

import { api } from './api'

export interface ConsentRead {
  id:             string
  student_id:     string
  accepted:       boolean
  terms_version:  string
  accepted_at:    string
}

export interface ConsentStatus {
  has_accepted:           boolean
  current_terms_version:  string
  consent:                ConsentRead | null
}

export const consentService = {
  /** Estado del consentimiento ML del estudiante autenticado. */
  async getMine(): Promise<ConsentStatus> {
    return api.get<ConsentStatus>('/consents/me')
  },

  /** Registra la aceptación de los términos vigentes. */
  async accept(): Promise<ConsentRead> {
    return api.post<ConsentRead>('/consents/me', { accepted: true })
  },
}
