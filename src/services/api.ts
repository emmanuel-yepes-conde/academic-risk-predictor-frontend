/**
 * Base HTTP client.
 * - Attaches JWT bearer token when available.
 * - Auto-refreshes expired tokens on 401 responses.
 * - Forces logout when refresh also fails.
 * - Throws ApiError with status code on non-2xx responses.
 */

import { API_V1 } from '../config/env'

// ─── Token storage helpers ───────────────────────────────────────────────────

const ACCESS_KEY  = 'ar-token'
const REFRESH_KEY = 'ar-refresh-token'

export const tokenStore = {
  getAccess:    ()    => localStorage.getItem(ACCESS_KEY),
  getRefresh:   ()    => localStorage.getItem(REFRESH_KEY),
  setTokens:    (access: string, refresh: string) => {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  clearTokens:  () => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

// ─── Custom error ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Token refresh logic ─────────────────────────────────────────────────────

/** Prevent multiple concurrent refresh attempts */
let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) return false

  try {
    const res = await fetch(`${API_V1}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!res.ok) {
      tokenStore.clearTokens()
      return false
    }

    const data = await res.json() as { access_token: string; refresh_token: string }
    tokenStore.setTokens(data.access_token, data.refresh_token)
    return true
  } catch {
    tokenStore.clearTokens()
    return false
  }
}

/**
 * Attempt to refresh the token. Deduplicates concurrent calls so only
 * one refresh request is in-flight at a time.
 */
function refreshTokenOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

// ─── Force logout helper ─────────────────────────────────────────────────────

function forceLogout() {
  tokenStore.clearTokens()
  localStorage.removeItem('ar-user')
  // Redirect to login — only if not already there
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login'
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
  _retried?: boolean  // internal flag to prevent infinite retry loops
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuth = false, _retried = false, ...init } = options

  const isFormData = init.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string> ?? {}),
  }

  if (!skipAuth) {
    const token = tokenStore.getAccess()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_V1}${path}`, { ...init, headers })

  // ── Handle 401: try to refresh token and retry once ────────────────────
  if (res.status === 401 && !skipAuth && !_retried) {
    const refreshed = await refreshTokenOnce()

    if (refreshed) {
      // Retry the original request with the new token
      return request<T>(path, { ...options, _retried: true })
    }

    // Refresh failed → force logout
    forceLogout()
    throw new ApiError(401, 'Sesión expirada. Inicia sesión nuevamente.')
  }

  if (!res.ok) {
    let body: unknown
    try { body = await res.json() } catch { /* ignore */ }
    const detail = (body as { detail?: string })?.detail ?? res.statusText
    throw new ApiError(res.status, detail, body)
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

export const api = {
  get:    <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { method: 'GET', ...opts }),

  post:   <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), ...opts }),

  put:    <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body), ...opts }),

  patch:  <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),

  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { method: 'DELETE', ...opts }),

  postForm: <T>(path: string, body: FormData, opts?: RequestOptions) =>
    request<T>(path, { method: 'POST', body, ...opts }),
}
