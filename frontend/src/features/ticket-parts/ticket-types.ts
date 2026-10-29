// ─── Types & constants shared by the tickets pages ───────────────────────────
// Ported from src/features/tickets.tsx (types section).

export interface Ticket {
  id: number
  title: string
  description?: string
  status: string
  priority: string
  category_id?: number
  category_name?: string
  assignee_id?: number
  assignee_username?: string
  reporter_id?: number
  reporter_username?: string
  created_at: string
  updated_at: string
  comment_count?: number
  // Fields as returned by the current API (the React source expected
  // assignee_id/assignee_username/reporter_username — read both, see pages).
  assigned_to?: number | null
  assignee_name?: string
  creator_name?: string
}

export interface TicketComment {
  id: number
  ticket_id: number
  author_id: number
  author_username: string
  comment: string
  is_internal: boolean
  created_at: string
}

export interface TicketDetail extends Ticket {
  comments?: TicketComment[]
  activity?: Array<{ id: number; action: string; created_at: string; actor_username: string }>
  executions?: Array<{ ticket_id: number; execution_id: string; workflow_id: string; workflow_name: string; status: string; linked_at: string }>
  execution_data?: {
    workflow_name?: string
    execution_id?: string
    execution_status?: string
    started_at?: string
    failed_node?: string
    error_message?: string
    ai_analysis?: string
  }
}

export interface TicketStats {
  byStatus: Array<{ status: string; count: number | string }>
  byPriority: Array<{ priority: string; count: number | string }>
  unassigned: number
  avgResolutionHours: string | number | null
}

export interface AssignableUser {
  id: number
  username: string
  email: string
}

export interface TicketCategory {
  id: number
  name: string
}

export interface TicketListResponse {
  tickets: Ticket[]
  total: number
  page: number
  pages: number
}

export const STATUS_OPTIONS = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
export const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']