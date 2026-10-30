import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from '@/components/AppLayout.vue'

// All routes lazy-loaded; names mirror the React SPA's pathname map.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', name: 'dashboard', component: () => import('@/features/dashboard.vue') },
        { path: 'dashboard', redirect: '/' },
        { path: 'library', component: () => import('@/features/library.vue') },
        { path: 'n8n', component: () => import('@/features/n8n-workflows.vue') },
        { path: 'monitoring', component: () => import('@/features/monitoring.vue') },
        { path: 'monitoring/:id', component: () => import('@/features/execution-detail.vue') },
        { path: 'tracing', component: () => import('@/features/tracing.vue') },
        { path: 'observability', component: () => import('@/features/observability.vue') },
        { path: 'tickets', component: () => import('@/features/tickets.vue') },
        { path: 'tickets/:id', component: () => import('@/features/ticket-detail.vue') },
        { path: 'kb', component: () => import('@/features/kb.vue') },
        { path: 'kb/:slug', component: () => import('@/features/kb-article.vue') },
        { path: 'prompts', component: () => import('@/features/prompts.vue') },
        { path: 'prompts/:slug', component: () => import('@/features/prompt-detail.vue') },
        { path: 'credentials', component: () => import('@/features/credentials.vue') },
        { path: 'credential-store', component: () => import('@/features/credential-store.vue') },
        { path: 'approvals', component: () => import('@/features/approvals.vue') },
        { path: 'approvals-builder', component: () => import('@/features/approvals-builder.vue') },
        {
          path: 'settings/:section*',
          component: () => import('@/features/settings.vue'),
        },
        { path: 'ai', component: () => import('@/features/ai-config.vue') },
        { path: 'alerts', component: () => import('@/features/alerts.vue') },
        { path: 'security', component: () => import('@/features/security.vue') },
        { path: 'variables', component: () => import('@/features/variables.vue') },
        { path: 'tags', component: () => import('@/features/tags.vue') },
        { path: 'audit', component: () => import('@/features/audit.vue') },
        { path: 'users', component: () => import('@/features/users.vue') },
        { path: ':pathMatch(.*)*', redirect: '/' },
      ],
    },
    { path: '/login', redirect: '/' },
  ],
})

// Stale-tab recovery: a browser tab loaded before a deploy references chunk
// hashes that no longer exist; navigating then fails on the lazy import.
// Reload once to pick up the fresh index.html + chunks.
router.onError((error, to) => {
  const msg = String(error?.message || '')
  if (/Failed to fetch dynamically imported|dynamically imported module|Importing a module script failed/.test(msg)) {
    const key = 'nav-reload:' + (to?.fullPath ?? '')
    if (sessionStorage.getItem(key) !== '1') {
      sessionStorage.setItem(key, '1')
      window.location.href = to?.fullPath ?? '/'
    }
    return
  }
  console.error(error)
})

export default router