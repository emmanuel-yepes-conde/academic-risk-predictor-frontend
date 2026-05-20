/**
 * Authentication service.
 * Handles login / logout / token refresh against the backend JWT endpoints.
 */

import { api, tokenStore, ApiError } from './api'

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token:  string
  refresh_token: string
  token_type:    string
  expires_in:    number
}

export interface BackendUser {
  id:                       string
  email:                    string
  institutional_email:      string | null
  full_name:                string
  role:                     'STUDENT' | 'PROFESSOR' | 'ADMIN'
  status:                   'ACTIVE' | 'INACTIVE'
  ml_consent:               boolean
  created_at:               string
  updated_at:               string
  last_login:               string | null
  student_institutional_id: string | null | undefined
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const authService = {
  /**
   * Authenticate with the backend.
   * Stores the returned tokens in localStorage.
   * Returns the TokenResponse so the caller can decode the user.
   */
  async login(email: string, password: string): Promise<TokenResponse> {
    try {
      const tokens = await api.post<TokenResponse>(
        '/auth/login',
        { email, password },
        { skipAuth: true },
      )
      tokenStore.setTokens(tokens.access_token, tokens.refresh_token)
      return tokens
    } catch (err: unknown) {
      // Re-throw with friendly message
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) {
          throw new Error('Correo o contraseña incorrectos. Verifica tus credenciales.')
        }
        if (err.status >= 500) {
          throw new Error('El servidor no está disponible. Intenta más tarde.')
        }
      }
      if (err instanceof TypeError) {
        throw new Error('No se pudo conectar con el servidor. Verifica tu conexión.')
      }
      throw err
    }
  },

  /**
   * Refresh the access token using the stored refresh token.
   */
  async refresh(): Promise<TokenResponse | null> {
    const refreshToken = tokenStore.getRefresh()
    if (!refreshToken) return null
    try {
      const tokens = await api.post<TokenResponse>(
        '/auth/refresh',
        { refresh_token: refreshToken },
        { skipAuth: true },
      )
      tokenStore.setTokens(tokens.access_token, tokens.refresh_token)
      return tokens
    } catch {
      tokenStore.clearTokens()
      return null
    }
  },

  /**
   * Notify the backend of logout (stateless) and clear local tokens.
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout', {})
    } catch {
      // ignore — clear tokens regardless
    } finally {
      tokenStore.clearTokens()
    }
  },

  /**
   * Decode the JWT payload without verification (client-side only).
   * Returns null if the token is missing or malformed.
   */
  decodeToken(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null
      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
      return JSON.parse(payload) as Record<string, unknown>
    } catch {
      return null
    }
  },

  isApiError: (e: unknown): e is ApiError => e instanceof ApiError,
}
