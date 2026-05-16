const LOCAL_API_BASE = 'https://ca-mpra-dev.happymoss-e05a594f.brazilsouth.azurecontainerapps.io'
const RAG_API_DEFAULT = 'https://rag-predictor-api.blackgrass-448535b9.brazilsouth.azurecontainerapps.io'

function normalizeApiBase(value: string | undefined): string {
  const apiBase = value?.trim() || LOCAL_API_BASE
  return apiBase.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL)

export const API_V1 = `${API_BASE}/api/v1`

export const RAG_API_BASE =
  ((import.meta.env.VITE_RAG_API_BASE_URL as string | undefined)?.trim() || RAG_API_DEFAULT).replace(/\/$/, '')
