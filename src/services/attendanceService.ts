/**
 * attendanceService — cliente para los endpoints de asistencias QR.
 */

import { API_BASE } from '../config/env'
import { tokenStore } from './api'

function headers() {
  const token = tokenStore.getAccess()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface ClassSession {
  id: string
  course_id: string
  professor_id: string
  window_seconds: number
  qr_seed: string
  label: string | null
  is_active: boolean
  created_at: string
  closed_at: string | null
  current_token: string
}

export interface AttendanceRecord {
  id: string
  student_id: string
  student_name: string
  recorded_at: string
}

export interface AttendanceHistoryItem {
  session_id: string
  session_label: string | null
  recorded_at: string
  recorded_at_colombia: string
}

export interface SessionHistoryAttendee {
  student_id: string
  student_name: string
  recorded_at: string
}

export interface SessionHistoryItem {
  id: string
  label: string | null
  created_at: string
  closed_at: string | null
  is_active: boolean
  total_attendees: number
  attendees: SessionHistoryAttendee[]
}

/**
 * Genera el token QR actual para una sesión.
 * Mismo algoritmo que el backend: SHA256(seed:floor(epoch/window))[:32]
 * Funciona en cliente sin necesidad de llamar al servidor.
 */
export async function computeQrToken(qrSeed: string, windowSeconds: number): Promise<string> {
  const epoch = Math.floor(Date.now() / 1000)
  const windowIndex = Math.floor(epoch / windowSeconds)
  const raw = `${qrSeed}:${windowIndex}`
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 32)
}

export const attendanceService = {
  async createSession(courseId: string, windowSeconds: number, label?: string): Promise<ClassSession> {
    const res = await fetch(`${API_BASE}/api/v1/attendance/sessions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ course_id: courseId, window_seconds: windowSeconds, label }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  async listSessions(courseId: string): Promise<ClassSession[]> {
    const res = await fetch(`${API_BASE}/api/v1/attendance/sessions/course/${courseId}`, {
      headers: headers(),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  async registerAttendance(sessionId: string, token: string): Promise<{ ok: boolean; message: string; recorded_at: string; session_label?: string }> {
    const res = await fetch(`${API_BASE}/api/v1/attendance/sessions/${sessionId}/attend`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ token }),
    })
    let data: Record<string, unknown>
    try {
      data = await res.json() as Record<string, unknown>
    } catch {
      // La respuesta llegó truncada (conexión móvil cortada después de que el backend
      // procesó la solicitud). Lo tratamos como error de red para que AsistenciaEstudiante
      // reintente automáticamente y detecte el 409 si la asistencia ya quedó registrada.
      throw new Error('failed to fetch')
    }
    if (!res.ok) throw new Error((data.detail as string | undefined) || 'Error al registrar asistencia')
    return data as { ok: boolean; message: string; recorded_at: string; session_label?: string }
  },

  async getAttendances(sessionId: string): Promise<AttendanceRecord[]> {
    const res = await fetch(`${API_BASE}/api/v1/attendance/sessions/${sessionId}/attendances`, {
      headers: headers(),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  async closeSession(sessionId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/v1/attendance/sessions/${sessionId}/close`, {
      method: 'PATCH',
      headers: headers(),
    })
    if (!res.ok) throw new Error(await res.text())
  },

  // ─── History endpoints ──────────────────────────────────────────────────────

  async getMyHistory(): Promise<AttendanceHistoryItem[]> {
    try {
      const res = await fetch(`${API_BASE}/api/v1/attendance/student/me/history`, {
        headers: headers(),
      })
      return res.ok ? res.json() : []
    } catch { return [] }
  },

  async getMyHistoryByCourse(courseId: string): Promise<AttendanceHistoryItem[]> {
    try {
      const res = await fetch(`${API_BASE}/api/v1/attendance/student/me/history/course/${courseId}`, {
        headers: headers(),
      })
      return res.ok ? res.json() : []
    } catch { return [] }
  },

  async getCourseSessionHistory(courseId: string): Promise<SessionHistoryItem[]> {
    try {
      const res = await fetch(`${API_BASE}/api/v1/attendance/sessions/course/${courseId}/history`, {
        headers: headers(),
      })
      return res.ok ? res.json() : []
    } catch { return [] }
  },

  /** Notifica al estudiante que el profesor registró su asistencia manualmente. Fire-and-forget. */
  async notifyManualAttendance(studentId: string, courseName: string, cohort: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/v1/attendance/notify-manual`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ student_id: studentId, course_name: courseName, cohort }),
      })
    } catch { /* fire-and-forget — no relanzar */ }
  },
}
