<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { flagState, type FeatureFlag } from '../api'

const props = defineProps<{ flag: FeatureFlag; busy?: boolean }>()
const emit = defineEmits<{
  toggle: []
  rollout: [pct: number]
  edit: []
  remove: []
}>()

const state = computed(() => flagState(props.flag))
const rulesCount = computed(() => props.flag.rules?.length ?? 0)
const updated = computed(() =>
  new Date(props.flag.metadata.updatedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
)

// Local slider value updates live while dragging; the PUT fires only on release (@change).
const localPct = ref(props.flag.rollout.percentage)
watch(
  () => props.flag.rollout.percentage,
  (v) => (localPct.value = v),
)
</script>

<template>
  <div class="row card" :class="{ busy }">
    <div class="main">
      <div class="head">
        <span class="key mono">{{ flag.key }}</span>
        <span class="badge" :class="`badge-${state.kind}`">{{ state.label }}</span>
        <span v-if="rulesCount" class="rules mono"
          >◈ {{ rulesCount }} rule{{ rulesCount > 1 ? 's' : '' }}</span
        >
      </div>
      <p v-if="flag.description" class="desc">{{ flag.description }}</p>

      <div class="rollout" :class="{ dim: !flag.enabled }">
        <input
          type="range"
          min="0"
          max="100"
          v-model.number="localPct"
          :disabled="!flag.enabled"
          @change="emit('rollout', localPct)"
        />
        <span class="pct mono">{{ localPct }}%</span>
      </div>

      <div class="meta">updated {{ updated }} · {{ flag.metadata.updatedBy }}</div>
    </div>

    <div class="controls">
      <button
        class="toggle"
        :data-on="flag.enabled"
        :disabled="busy"
        :aria-label="flag.enabled ? 'Disable flag' : 'Enable flag'"
        @click="emit('toggle')"
      ></button>
      <div class="actions">
        <button class="btn btn-ghost sm" @click="emit('edit')">Edit</button>
        <button class="btn btn-danger sm" @click="emit('remove')">Delete</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  gap: 1.2rem;
  padding: 1.1rem 1.3rem;
  transition: opacity 0.15s;
}
.row.busy {
  opacity: 0.55;
  pointer-events: none;
}
.main {
  flex: 1;
  min-width: 0;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.key {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink);
}
.rules {
  font-size: 0.74rem;
  color: var(--slate);
}
.desc {
  margin: 0.35rem 0 0;
  font-size: 0.86rem;
  color: var(--ink-2);
}
.rollout {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 0.9rem 0 0.6rem;
  max-width: 420px;
}
.rollout.dim {
  opacity: 0.45;
}
.pct {
  font-size: 0.8rem;
  font-weight: 600;
  width: 3rem;
  text-align: right;
  color: var(--signal-ink);
}
.meta {
  font-size: 0.74rem;
  color: var(--slate);
  font-variant-numeric: tabular-nums;
}
.controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.9rem;
}
.actions {
  display: flex;
  gap: 0.4rem;
}
.sm {
  font-size: 0.78rem;
  padding: 0.35rem 0.6rem;
}
</style>
