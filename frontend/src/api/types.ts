export interface User {
  id: number
  username: string
  email: string
  role: 'admin' | 'editor' | 'viewer'
}

export interface LoginResponse {
  user?: User
  requires_2fa?: boolean
  temp_token?: string
  error?: string
}

export interface BrandingSettings {
  brand_logo?: string
  brand_primary?: string
  brand_name?: string
  [key: string]: string | undefined
}

export interface DashboardData {
  tickets: {
    byStatus: Record<string, number>
    byPriority: Record<string, number>
    openCount: number
    myTickets: Array<Record<string, unknown>>
    recentTickets: Array<Record<string, unknown>>
  }
  kb: {
    totalPublished: number
    popular: Array<Record<string, unknown>>
    recent: Array<Record<string, unknown>>
  }
  templates: { total: number }
  user: { username: string; role: string }
  instances?: Array<{ id: number; name: string; is_default: boolean }>
  selectedInstance?: number
  executions?: {
    recent: Array<Record<string, unknown>>
    failedCount: number
    successCount: number
    total: number
    successRate: number
  }
  n8nHealth?: { status: string; latencyMs: number }
}

export interface Notification {
  id: number
  type: string
  title: string
  message: string
  link?: string
  is_read: boolean
  created_at: string
}

export interface SearchResult {
  id: number
  title: string
  type: string
  link: string
  status?: string
  priority?: string
}
