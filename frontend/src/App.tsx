import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { ToastContainer } from '@/components/ToastContainer'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AppLayout } from '@/components/AppLayout'

const LoginPage = lazy(() => import('@/features/login').then((m) => ({ default: m.LoginPage })))
const DashboardPage = lazy(() => import('@/features/dashboard').then((m) => ({ default: m.DashboardPage })))
const LibraryPage = lazy(() => import('@/features/library').then((m) => ({ default: m.LibraryPage })))
const MonitoringPage = lazy(() => import('@/features/monitoring').then((m) => ({ default: m.MonitoringPage })))
const ExecutionDetailPage = lazy(() => import('@/features/monitoring').then((m) => ({ default: m.ExecutionDetailPage })))
const ObservabilityPage = lazy(() => import('@/features/observability').then((m) => ({ default: m.ObservabilityPage })))
const TicketsPage = lazy(() => import('@/features/tickets').then((m) => ({ default: m.TicketsPage })))
const TicketDetailPage = lazy(() => import('@/features/tickets').then((m) => ({ default: m.TicketDetailPage })))
const KbPage = lazy(() => import('@/features/kb').then((m) => ({ default: m.KbPage })))
const KbArticlePage = lazy(() => import('@/features/kb').then((m) => ({ default: m.KbArticlePage })))
const PromptsPage = lazy(() => import('@/features/prompts').then((m) => ({ default: m.PromptsPage })))
const PromptDetailPage = lazy(() => import('@/features/prompts').then((m) => ({ default: m.PromptDetailPage })))
const AlertsPage = lazy(() => import('@/features/alerts').then((m) => ({ default: m.AlertsPage })))
const SecurityPage = lazy(() => import('@/features/security').then((m) => ({ default: m.SecurityPage })))
const VariablesPage = lazy(() => import('@/features/variables').then((m) => ({ default: m.VariablesPage })))
const TagsPage = lazy(() => import('@/features/tags').then((m) => ({ default: m.TagsPage })))
const AuditPage = lazy(() => import('@/features/audit').then((m) => ({ default: m.AuditPage })))
const UsersPage = lazy(() => import('@/features/users').then((m) => ({ default: m.UsersPage })))
const SettingsPage = lazy(() => import('@/features/settings').then((m) => ({ default: m.SettingsPage })))
const AiConfigPage = lazy(() => import('@/features/ai-config').then((m) => ({ default: m.AiConfigPage })))
const N8nWorkflowsPage = lazy(() => import('@/features/n8n-workflows').then((m) => ({ default: m.N8nWorkflowsPage })))
const CredentialsPage = lazy(() => import('@/features/credentials').then((m) => ({ default: m.CredentialsPage })))
const CredentialStorePage = lazy(() => import('@/features/credentials').then((m) => ({ default: m.CredentialStoreTab })))
const ApprovalsPage = lazy(() => import('@/features/approvals').then((m) => ({ default: m.ApprovalsPage })))
const ApprovalsBuilderPage = lazy(() => import('@/features/approvals').then((m) => ({ default: m.ApprovalsBuilderPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-sm text-text-muted">
      Loading...
    </div>
  )
}

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
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center bg-bg text-text-muted">Loading...</div>}>
        <LoginPage />
      </Suspense>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate>
          <Suspense fallback={<PageFallback />}>
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
                <Route path="credential-store" element={<CredentialStorePage />} />
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
          </Suspense>
        </AuthGate>
        <ToastContainer />
        <ConfirmDialog />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
