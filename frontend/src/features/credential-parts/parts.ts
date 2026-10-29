// Shared page-local types + helpers for the credentials feature port
// (mirrors features/credentials.tsx).

export interface SharedWith {
  name: string
  role: string
}

export interface Credential {
  id: string
  name: string
  type: string
  createdAt: string
  updatedAt: string
  shared?: SharedWith[]
}

export interface CredType {
  name: string
  displayName: string
}

export interface Project {
  id: string
  name: string
}

export interface SchemaProperty {
  type: string
  displayName?: string
  description?: string
  required?: boolean
}

export interface CredSchema {
  properties?: Record<string, SchemaProperty>
  required?: string[]
}

export interface AuditEntry {
  action: string
  username: string
  credential_name: string
  n8n_credential_id: string
  detail: string
  created_at: string
}

export interface UserFieldDefinition {
  key: string
  label: string
  type: 'string' | 'number' | 'integer' | 'boolean'
  required: boolean
  sensitive: boolean
  description?: string
}

export interface StoreTemplate {
  id: string
  name: string
  type?: string
  credential_type?: string
  description?: string
  allowed_roles?: string[]
  creator?: string
  creator_name?: string
  user_fields?: string[]
  user_field_definitions?: UserFieldDefinition[]
  schema?: Record<string, SchemaProperty>
  instanceId?: number
  instance_id?: number
  instance_name?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatCredType(type: string): string {
  if (!type) return 'Unknown'
  return type
    .replace(/OAuth2$/, ' OAuth2')
    .replace(/Api$/, ' API')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

export function getCredOwner(cred: Credential): string {
  if (!cred.shared?.length) return ''
  const owner = cred.shared.find((s) => s.role?.includes('owner'))
  const name = owner?.name || cred.shared[0]?.name || ''
  return shortName(name)
}

export function shortName(name: string): string {
  return name.split('<')[0].trim()
}

export function camelToLabel(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
}

export function isSensitiveField(name: string): boolean {
  const lower = name.toLowerCase()
  return ['password', 'secret', 'token', 'apikey', 'api_key', 'private'].some((k) =>
    lower.includes(k),
  )
}

// Small typed DOM-event readers, to keep template handlers concise.
export function inputVal(e: Event): string {
  return (e.target as HTMLInputElement).value
}

export function inputChecked(e: Event): boolean {
  return (e.target as HTMLInputElement).checked
}