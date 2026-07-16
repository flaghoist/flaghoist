<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ error?: string; connecting?: boolean }>()
const emit = defineEmits<{ connect: [url: string, token: string] }>()

const url = ref('http://localhost:8787')
const token = ref('')

function submit() {
  if (url.value && token.value) emit('connect', url.value.trim(), token.value.trim())
}
</script>

<template>
  <div class="gate">
    <div class="gate-card card">
      <svg class="mark" width="52" height="52" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="16" cy="9" r="3" fill="var(--ink)" />
        <line
          x1="16"
          y1="9"
          x2="16"
          y2="57"
          stroke="var(--ink)"
          stroke-width="3.5"
          stroke-linecap="round"
        />
        <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="var(--signal)" />
        <path d="M16 31 L40.5 24 L52 32.5 L16 31 Z" fill="var(--ink)" fill-opacity="0.14" />
      </svg>
      <h1 class="wordmark">Flag<span>hoist</span></h1>
      <p class="sub">Admin signal station</p>

      <form @submit.prevent="submit">
        <label class="label">Server URL</label>
        <input v-model="url" class="mono field" placeholder="https://team-flags.you.workers.dev" />

        <label class="label" style="margin-top: 0.9rem">Admin token</label>
        <input v-model="token" type="password" class="field" placeholder="bearer token" />

        <p v-if="error" class="err">{{ error }}</p>

        <button type="submit" class="btn btn-primary connect" :disabled="connecting">
          {{ connecting ? 'Connecting…' : 'Connect' }}
        </button>
      </form>
    </div>
    <p class="footnote">The token stays in this browser. Reads are never exposed here.</p>
  </div>
</template>

<style scoped>
.gate {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
}
.gate-card {
  width: 100%;
  max-width: 380px;
  padding: 2.2rem 2rem;
  text-align: center;
}
.mark {
  margin-bottom: 0.6rem;
}
.wordmark {
  font-family: var(--font-display);
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
}
.wordmark span {
  color: var(--signal);
}
.sub {
  margin: 0.3rem 0 1.8rem;
  font-size: 0.8rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--slate);
}
form {
  text-align: left;
}
.field {
  width: 100%;
}
.err {
  margin: 0.8rem 0 0;
  font-size: 0.82rem;
  color: var(--off);
}
.connect {
  width: 100%;
  justify-content: center;
  margin-top: 1.4rem;
  padding: 0.65rem;
}
.footnote {
  font-size: 0.76rem;
  color: var(--slate);
}
</style>
