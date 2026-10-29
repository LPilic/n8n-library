/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'vue' {
  interface ComponentCustomProps {
    /** Fall-through HTML/attrs explicitly used on @n8n/design-system components
     *  (they inherit via Vue attr-fallthrough; typed here so strictTemplates passes). */
    type?: string
    id?: string
    'data-test-id'?: string
    dataTestId?: string
  }
}

// Makes this file a module context so the `declare module 'vue'` augmentation
// MERGES with the real vue types instead of shadowing them.
export {}