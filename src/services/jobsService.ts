/**
 * jobsService — jobs programados y disparadores de eventos del admin.
 */
import { api } from './api'

export interface JobConfig {
  id:            string
  name:          string
  description:   string
  job_type:      'cron' | 'trigger'
  cron_expr:     string | null
  trigger_event: string | null
  channels:      string[]
  enabled:       boolean
  last_run_at:   string | null
}

export interface JobUpdate {
  name?:        string
  description?: string
  cron_expr?:   string
  enabled?:     boolean
}

export const jobsService = {
  list(): Promise<JobConfig[]> {
    return api.get<JobConfig[]>('/admin/jobs')
  },

  update(id: string, body: JobUpdate): Promise<JobConfig> {
    return api.patch<JobConfig>(`/admin/jobs/${id}`, body)
  },

  trigger(id: string): Promise<{ ok: boolean; message: string }> {
    return api.post<{ ok: boolean; message: string }>(`/admin/jobs/${id}/trigger`, {})
  },
}
