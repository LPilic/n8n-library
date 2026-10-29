// ─── Prompts feature: shared types + helpers (ported from prompts.tsx) ────────

export type PromptStatus = 'draft' | 'published' | 'archived'

export interface Prompt {
  id: number
  name: string
  slug?: string
  description?: string
  content?: string
  status: PromptStatus
  category?: string
  variables?: string[]
  tags?: string[]
  version?: number
  author_username?: string
  created_by_name?: string
  created_at: string
  updated_at: string
}

export interface PromptVersion {
  id: number
  prompt_id: number
  version: number
  content: string
  variables?: string[]
  change_note?: string
  message?: string
  author_username?: string
  created_at: string
}

export interface PromptDiff {
  from: PromptVersion
  to: PromptVersion
}

export interface PromptListResponse {
  prompts: Prompt[]
  total: number
  page: number
  pages: number
}

export const PROMPT_STATUSES: PromptStatus[] = ['draft', 'published', 'archived']

export function statusBadge(status: PromptStatus): string {
  switch (status) {
    case 'published':
      return 'bg-success-light text-success'
    case 'draft':
      return 'bg-warning-light text-warning'
    case 'archived':
      return 'bg-border-light text-text-xmuted'
    default:
      return 'bg-border-light text-text-muted'
  }
}

// ─── Word-level diff ──────────────────────────────────────────────────────────

export type DiffToken = { text: string; type: 'same' | 'added' | 'removed' }

export function wordDiff(
  oldText: string,
  newText: string,
): { left: DiffToken[]; right: DiffToken[] } {
  const oldWords = oldText.split(/(\s+)/)
  const newWords = newText.split(/(\s+)/)

  // Simple LCS-based diff
  const m = oldWords.length
  const n = newWords.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const left: DiffToken[] = []
  const right: DiffToken[] = []

  let i = m
  let j = n
  const ops: Array<'same' | 'del' | 'ins'> = []
  const opI: number[] = []
  const opJ: number[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      ops.push('same')
      opI.push(i - 1)
      opJ.push(j - 1)
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push('ins')
      opI.push(-1)
      opJ.push(j - 1)
      j--
    } else {
      ops.push('del')
      opI.push(i - 1)
      opJ.push(-1)
      i--
    }
  }

  ops.reverse()
  opI.reverse()
  opJ.reverse()

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]
    if (op === 'same') {
      left.push({ text: oldWords[opI[k]], type: 'same' })
      right.push({ text: newWords[opJ[k]], type: 'same' })
    } else if (op === 'del') {
      left.push({ text: oldWords[opI[k]], type: 'removed' })
    } else {
      right.push({ text: newWords[opJ[k]], type: 'added' })
    }
  }

  return { left, right }
}