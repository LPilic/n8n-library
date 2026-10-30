<script setup lang="ts">
import { Suspense, defineAsyncComponent, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterView } from 'vue-router'
import { N8nButton, N8nSpinner } from '@n8n/design-system'
import { useAuthStore } from '@/stores/auth'
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const LoginPage = defineAsyncComponent(() => import('@/features/login.vue'))

const auth = useAuthStore()
auth.checkAuth()

const loading = computed(() => auth.isLoading)
const authenticated = computed(() => auth.isAuthenticated)

// Stale-tab detection: compare this tab's build id with the served index.html
const updateAvailable = ref(false)
let updateTimer: ReturnType<typeof setInterval> | undefined
function reload() {
  window.location.reload()
}
onMounted(() => {
  updateTimer = setInterval(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      const res = await fetch('/', { cache: 'no-store' })
      const html = await res.text()
      const served = html.match(/name="build-id" content="([^"]+)"/)?.[1]
      if (served && served !== __BUILD_ID__) updateAvailable.value = true
      else if (served === __BUILD_ID__) updateAvailable.value = false
    } catch {
      // offline — ignore
    }
  }, 90_000)
})
onBeforeUnmount(() => clearInterval(updateTimer))
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
  <div
    v-if="updateAvailable"
    class="fixed right-6 bottom-6 z-[200] flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-modal"
  >
    <span class="text-text-dark">A new version is available.</span>
    <N8nButton
      label="Reload"
      size="small"
      variant="brand"
      @click="updateAvailable = false; reload()"
    />
    <button class="cursor-pointer text-sm text-text-muted hover:text-text-dark" @click="updateAvailable = false">×</button>
  </div>
  <ToastContainer />
  <ConfirmDialog />
</template>