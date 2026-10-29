<script setup lang="ts">
// Replacement for the legacy TableWrap helper (card shell + full-width table):
// a card shell with a full-width compact table inside.
</script>

<template>
  <div class="overflow-hidden rounded-md border border-border bg-card shadow-card">
    <table class="w-full border-collapse text-[13px]">
      <slot />
    </table>
  </div>
</template>