<script setup lang="ts">
export interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error'
}

defineProps<{ toasts: Toast[] }>()
const emit = defineEmits<{ dismiss: [id: number] }>()
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="t.tone"
          :role="t.tone === 'error' ? 'alert' : 'status'"
        >
          <svg v-if="t.tone === 'ok'" viewBox="0 0 24 24" aria-hidden="true" class="toast-icon ok">
            <circle cx="12" cy="12" r="9" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true" class="toast-icon err">
            <circle cx="12" cy="12" r="9" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span class="toast-text">{{ t.text }}</span>
          <button class="toast-close" aria-label="Dismiss" @click="emit('dismiss', t.id)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 100;
  display: flex;
  flex-direction: column-reverse;
  gap: 0.5rem;
  max-width: 380px;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  font-size: 0.82rem;
  pointer-events: auto;
}
.toast.ok {
  border-left: 3px solid var(--green);
}
.toast.error {
  border-left: 3px solid var(--red);
}
.toast-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.toast-icon.ok {
  stroke: var(--green-text);
}
.toast-icon.err {
  stroke: var(--red-text);
}
.toast-text {
  flex: 1;
  min-width: 0;
  color: var(--text);
}
.toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--text-mute);
  padding: 0;
  flex-shrink: 0;
}
.toast-close:hover {
  color: var(--text);
  background: var(--surface-2);
}
.toast-close svg {
  width: 12px;
  height: 12px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.toast-enter-active {
  transition: all 0.25s ease;
}
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
