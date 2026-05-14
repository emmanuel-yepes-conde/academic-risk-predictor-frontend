const LOCAL_API_BASE = 'http://localhost:8000'

function normalizeApiBase(value: string | undefined): string {
  const apiBase = value?.trim() || LOCAL_API_BASE
  return apiBase.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL)

export const API_V1 = `${API_BASE}/api/v1`
