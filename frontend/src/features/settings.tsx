import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Users,
  Server,
  Mail,
  FileText,
  FolderOpen,
  Key,
  Webhook,
  Bot,
  ShieldCheck,
  Palette,
  Upload,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tab {
  id: string
  label: string
  icon: React.ReactNode
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS: Tab[] = [
  { id: 'users',            label: 'Users',           icon: <Users size={14} /> },
  { id: 'instances',        label: 'Instances',       icon: <Server size={14} /> },
  { id: 'smtp',             label: 'SMTP',            icon: <Mail size={14} /> },
  { id: 'email_templates',  label: 'Email Templates', icon: <FileText size={14} /> },
  { id: 'categories',       label: 'Categories',      icon: <FolderOpen size={14} /> },
  { id: 'api_keys',         label: 'API Keys',        icon: <Key size={14} /> },
  { id: 'webhooks',         label: 'Webhooks',        icon: <Webhook size={14} /> },
  { id: 'ai',               label: 'AI',              icon: <Bot size={14} /> },
  { id: '2fa',              label: '2FA',             icon: <ShieldCheck size={14} /> },
  { id: 'branding',         label: 'Branding',        icon: <Palette size={14} /> },
  { id: 'import_export',    label: 'Import / Export', icon: <Upload size={14} /> },
]

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('users')

  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  return (
    <div className="flex gap-0 min-h-[400px]">
      {/* Sidebar */}
      <nav className="w-44 shrink-0 border-r border-border pr-0 mr-0">
        <ul className="space-y-0.5 py-1">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-sm text-left transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary-light text-primary font-medium'
                    : 'text-text-muted hover:bg-card-hover hover:text-text-dark',
                )}
              >
                <span className={cn(
                  'shrink-0',
                  activeTab === tab.id ? 'text-primary' : 'text-text-xmuted',
                )}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 pl-6">
        <div className="mb-4 pb-3 border-b border-border-light">
          <h2 className="text-base font-semibold text-text-dark flex items-center gap-2">
            <span className="text-text-muted">{current.icon}</span>
            {current.label}
          </h2>
        </div>
        <SettingsTabContent tabId={activeTab} />
      </div>
    </div>
  )
}

// ─── SettingsTabContent ───────────────────────────────────────────────────────

function SettingsTabContent({ tabId }: { tabId: string }) {
  const labels: Record<string, { title: string; description: string }> = {
    users:           { title: 'User Management',    description: 'Manage user accounts, roles, and permissions.' },
    instances:       { title: 'n8n Instances',      description: 'Configure connected n8n instance credentials and endpoints.' },
    smtp:            { title: 'SMTP Configuration', description: 'Configure outbound email settings for notifications and alerts.' },
    email_templates: { title: 'Email Templates',    description: 'Customise email templates for alerts, notifications, and invitations.' },
    categories:      { title: 'Categories',         description: 'Manage workflow and ticket categories used throughout the app.' },
    api_keys:        { title: 'API Keys',           description: 'Manage API keys for programmatic access to the library.' },
    webhooks:        { title: 'Webhooks',           description: 'Configure outbound webhooks to notify external systems of events.' },
    ai:              { title: 'AI Settings',        description: 'Configure AI providers, models, and generation settings.' },
    '2fa':           { title: 'Two-Factor Auth',    description: 'Configure two-factor authentication requirements and policies.' },
    branding:        { title: 'Branding',           description: 'Customise logo, colours, and app name.' },
    import_export:   { title: 'Import / Export',    description: 'Import or export workflows, credentials, and configuration.' },
  }

  const info = labels[tabId]

  return (
    <div className="flex flex-col items-start gap-3">
      {info && (
        <p className="text-sm text-text-muted">{info.description}</p>
      )}
      <div className="mt-6 flex flex-col items-center justify-center w-full py-16 border border-dashed border-border rounded-md">
        <p className="text-sm font-medium text-text-muted">Coming soon</p>
        <p className="text-xs text-text-xmuted mt-1">
          {info?.title ?? tabId} settings will appear here.
        </p>
      </div>
    </div>
  )
}
