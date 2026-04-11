import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { ToastContainer } from '@/components/ToastContainer'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/features/login'
import { DashboardPage } from '@/features/dashboard'
import { LibraryPage } from '@/features/library'
import { MonitoringPage, ExecutionDetailPage } from '@/features/monitoring'
import { ObservabilityPage } from '@/features/observability'
import { TicketsPage, TicketDetailPage } from '@/features/tickets'
import { KbPage, KbArticlePage } from '@/features/kb'
import { PromptsPage, PromptDetailPage } from '@/features/prompts'
import { AlertsPage } from '@/features/alerts'
import { SecurityPage } from '@/features/security'
import { VariablesPage } from '@/features/variables'
import { TagsPage } from '@/features/tags'
import { AuditPage } from '@/features/audit'
import { UsersPage } from '@/features/users'
import { SettingsPage } from '@/features/settings'
import { AiConfigPage } from '@/features/ai-config'
import { N8nWorkflowsPage } from '@/features/n8n-workflows'
import { CredentialsPage } from '@/features/credentials'
import { ApprovalsPage, ApprovalsBuilderPage } from '@/features/approvals'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="text-text-muted">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="dashboard" element={<Navigate to="/" replace />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="n8n" element={<N8nWorkflowsPage />} />
              <Route path="monitoring" element={<MonitoringPage />} />
              <Route path="monitoring/:id" element={<ExecutionDetailPage />} />
              <Route path="observability" element={<ObservabilityPage />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="tickets/:id" element={<TicketDetailPage />} />
              <Route path="kb" element={<KbPage />} />
              <Route path="kb/:slug" element={<KbArticlePage />} />
              <Route path="prompts" element={<PromptsPage />} />
              <Route path="prompts/:slug" element={<PromptDetailPage />} />
              <Route path="credentials" element={<CredentialsPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="approvals-builder" element={<ApprovalsBuilderPage />} />
              <Route path="settings/*" element={<SettingsPage />} />
              <Route path="ai" element={<AiConfigPage />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="variables" element={<VariablesPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthGate>
        <ToastContainer />
        <ConfirmDialog />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
