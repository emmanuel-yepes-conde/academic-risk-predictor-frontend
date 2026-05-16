import { RAG_API_BASE } from '../config/env'

export interface RagUploadResponse {
  status:    string
  filename:  string
  idmateria: string
}

export interface RagDocument {
  idmateria:   string
  filename:    string
  uploaded_at: string
}

export const ragService = {
  async uploadDocument(file: File, idmateria: string): Promise<RagUploadResponse> {
    const form = new FormData()
    form.append('file', file)
    form.append('idmateria', idmateria)

    const res = await fetch(`${RAG_API_BASE}/upload`, {
      method: 'POST',
      body: form,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Error ${res.status}: ${text}`)
    }

    return res.json() as Promise<RagUploadResponse>
  },

  async listDocuments(idmateria: string): Promise<RagDocument[]> {
    const res = await fetch(`${RAG_API_BASE}/documents`)
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const all = await res.json() as RagDocument[]
    return all.filter(d => d.idmateria === idmateria)
  },

  async deleteDocument(idmateria: string, filename: string): Promise<void> {
    const res = await fetch(
      `${RAG_API_BASE}/documents/${encodeURIComponent(idmateria)}/${encodeURIComponent(filename)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) throw new Error(`Error ${res.status}`)
  },

  async query(question: string, idmateria: string): Promise<RagQueryResponse> {
    const res = await fetch(`${RAG_API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, idmateria, show_context: false }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Error ${res.status}: ${text}`)
    }
    return res.json() as Promise<RagQueryResponse>
  },
}

export interface RagEvidence {
  file:         string
  page:         number
  score:        number
  text_preview: string
}

export interface RagQueryResponse {
  question:  string
  answer:    string
  evidences: RagEvidence[]
  context:   string | null
}
