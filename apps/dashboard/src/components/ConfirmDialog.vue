<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * An in-page confirmation for a destructive action.
 *
 * This exists because `window.confirm` cannot be relied on. Chrome offers "prevent this page from
 * creating additional dialogs" after a few in a row, and once that is ticked every later call
 * returns false with no dialog shown. Delete then did nothing at all, silently, and looked like a
 * broken button rather than a refused action.
 */
defineProps<{
  title: string
  body: string
  confirmLabel?: string
  busy?: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

// Focus lands on Cancel, not Confirm. A stray Enter on a destructive dialog should do nothing.
const cancelEl = ref<HTMLButtonElement | null>(null)
onMounted(() => cancelEl.value?.focus())
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div class="confirm card" role="alertdialog" aria-modal="true" :aria-label="title">
      <h2>{{ title }}</h2>
      <p>{{ body }}</p>
      <div class="actions">
        <button ref="cancelEl" class="btn btn-ghost" :disabled="busy" @click="emit('cancel')">
          Cancel
        </button>
        <button class="btn btn-danger" :disabled="busy" @click="emit('confirm')">
          {{ busy ? 'Deleting…' : (confirmLabel ?? 'Delete') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: light-dark(rgba(11, 30, 58, 0.34), rgba(2, 8, 16, 0.62));
  backdrop-filter: blur(3px);
}
.confirm {
  width: min(26rem, 100%);
  padding: 1.25rem;
}
.confirm h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.confirm p {
  margin: 0 0 1.25rem;
  font-size: 0.86rem;
  color: var(--text-2);
  line-height: 1.5;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
