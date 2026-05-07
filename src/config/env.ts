/**
 * Centralised environment configuration.
 * Override via VITE_API_BASE_URL in your .env file.
 */
const envApiBase =
  (import.meta as ImportMeta & { env: Record<string, string> }).env?.VITE_API_BASE_URL?.trim()

// TODO(main-deploy): hardcode temporal para conectar frontend al backend desplegado.
// Eliminar este fallback cuando volvamos a manejar la URL solo por variables de entorno.
export const API_BASE =
  envApiBase && envApiBase.length > 0
    ? envApiBase
    : 'https://ca-mpra-dev.happymoss-e05a594f.brazilsouth.azurecontainerapps.io'

export const API_V1 = `${API_BASE}/api/v1`
