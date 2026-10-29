import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from '@/components/AppLayout.vue'

// All routes lazy-loaded; names mirror the React SPA's pathname map.
export default createRouter({
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