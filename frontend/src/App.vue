<script setup lang="ts">
import { Suspense, defineAsyncComponent, computed } from 'vue'
import { RouterView } from 'vue-router'
import { N8nSpinner } from '@n8n/design-system'
import { useAuthStore } from '@/stores/auth'
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const LoginPage = defineAsyncComponent(() => import('@/features/login.vue'))

const auth = useAuthStore()
auth.checkAuth()

const loading = computed(() => auth.isLoading)
const authenticated = computed(() => auth.isAuthenticated)
</script>

<template>
  <div v-if="loading" class="flex h-screen items-center justify-center bg-bg text-text-muted">
    <N8nSpinner size="large" />
  </div>
  <Suspense v-else-if="!authenticated">
    <LoginPage />
    <template #fallback>
      <div class="flex h-screen items-center justify-center bg-bg text-text-muted">Loading...</div>
    </template>
  </Suspense>
  <template v-else>
    <Suspense>
      <RouterView />
      <template #fallback>
        <div class="flex items-center justify-center py-24 text-sm text-text-muted">Loading...</div>
      </template>
    </Suspense>
  </template>
  <ToastContainer />
  <ConfirmDialog />
</template>