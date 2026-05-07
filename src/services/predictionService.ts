/**
 * Prediction service.
 * Wraps POST /api/v1/predict and POST /api/v1/chat.
 */

import { API_BASE } from '../config/env'
import { tokenStore } from './api'

// ─── Request / Response DTOs ─────────────────────────────────────────────────

export interface PredictionInput {
  nota_corte_1:     number
  nota_corte_2:     number
  nota_corte_final: number
  nota_total?:      number
}

export interface CohortPredictionInput {
  cohort_key:             'first_cohort' | 'second_cohort' | 'third_cohort'
  nota_parcial:           number
  promedio_seguimiento:   number
  porcentaje_asistencia:  number
}

export interface CohortPredictionOutput {
  cohort_key:             'first_cohort' | 'second_cohort' | 'third_cohort'
  cohort_name:            string
  probabilidad_riesgo:    number
  porcentaje_riesgo:      number
  nivel_riesgo:           'ALTO' | 'MEDIO' | 'BAJO'
  datos_cohorte: {
    nota_parcial:          number
    promedio_seguimiento:  number
    porcentaje_asistencia: number
  }
  detalles_modelo: Record<string, number>
}

export interface RadarData {
  labels:           string[]
  estudiante:       number[]
  promedio_aprobado: number[]
}

export interface CoefficientDetail {
  variable:    string
  coeficiente: number
  valor:       number
  contribucion: number
}

export interface MathDetails {
  formula_logit: string
  valor_z:       number
  coeficientes:  CoefficientDetail[]
}

export interface PredictionOutput {
  probabilidad_riesgo: number
  porcentaje_riesgo:   number
  nivel_riesgo:        'ALTO' | 'MEDIO' | 'BAJO'
  analisis_ia:         string
  datos_radar:         RadarData
  detalles_matematicos: MathDetails
}

export interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  pregunta: string
  datos_estudiante: PredictionInput
  prediccion_actual?: { porcentaje_riesgo?: number; nivel_riesgo?: string }
}

export interface ChatResponse {
  respuesta: string
}

// ─── Service ──────────────────────────────────────────────────────────────────

async function postWithAuth<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = tokenStore.getAccess()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let detail = res.statusText
    try { detail = ((await res.json()) as { detail?: string }).detail ?? detail } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const predictionService = {
  /**
   * Run the ML prediction model.
   * @param input  - Academic variables.
   * @param studentId - Optional UUID to validate ML consent.
   */
  async predict(input: PredictionInput, studentId?: string): Promise<PredictionOutput> {
    const qs = studentId ? `?student_id=${studentId}` : ''
    return postWithAuth<PredictionOutput>(`/predict${qs}`, input)
  },

  async predictCohort(input: CohortPredictionInput, studentId?: string): Promise<CohortPredictionOutput> {
    const qs = studentId ? `?student_id=${studentId}` : ''
    return postWithAuth<CohortPredictionOutput>(`/predict/cohort${qs}`, input)
  },

  /**
   * Send a message to the academic advisor chat.
   */
  async chat(req: ChatRequest): Promise<ChatResponse> {
    return postWithAuth<ChatResponse>('/chat', req)
  },
}
