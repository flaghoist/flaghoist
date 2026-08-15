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
const ruleCount = computed(() => props.flag.rules?.length ?? 0)
const updated = computed(() =>
  new Date(props.flag.metadata.updatedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
)

// The slider tracks the drag locally and only PUTs on release, so a drag is one write, not sixty.
const localPct = ref(props.flag.rollout.percentage)
watch(
  () => props.flag.rollout.percentage,
  (v) => (localPct.value = v),
)
</script>

<template>
  <article class="row" :class="{ busy, off: !flag.enabled }">
    <div class="cell-main">
      <div class="line">
        <code class="key">{{ flag.key }}</code>
        <span class="badge" :class="`badge-${state.kind}`">{{ state.label }}</span>
        <button v-if="ruleCount" class="rules" @click="emit('edit')">
          {{ ruleCount }} rule{{ ruleCount > 1 ? 's' : '' }}
        </button>
      </div>
      <p v-if="flag.description" class="desc">{{ flag.description }}</p>
      <p class="meta">{{ updated }} · {{ flag.metadata.updatedBy }}</p>
    </div>

    <div class="cell-rollout">
      <input
        type="range"
        min="0"
        max="100"
        v-model.number="localPct"
        :disabled="!flag.enabled || busy"
        :aria-label="`Rollout percentage for ${flag.key}`"
        @change="emit('rollout', localPct)"
      />
      <output class="pct mono">{{ localPct }}%</output>
    </div>

    <div class="cell-actions">
      <button
        class="toggle"
        :data-on="flag.enabled"
        :disabled="busy"
        :aria-label="flag.enabled ? `Disable ${flag.key}` : `Enable ${flag.key}`"
        @click="emit('toggle')"
      ></button>
      <button class="btn btn-quiet btn-sm" @click="emit('edit')">Edit</button>
      <button class="btn btn-quiet btn-sm danger" @click="emit('remove')">Delete</button>
    </div>

    <span v-if="busy" class="saving" role="status">Saving</span>
  </article>
</template>

<style scoped>
.row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px auto;
  align-items: center;
  gap: 1.2rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--line-soft);
  transition: background 0.12s;
}
.row:last-child {
  border-bottom: 0;
}
.row:hover {
  background: var(--surface-2);
}
.row.busy {
  pointer-events: none;
}
/* A disabled flag stays legible but recedes, so the live ones read first on a long list. */
.row.off .cell-main,
.row.off .cell-rollout {
  opacity: 0.55;
}

.cell-main {
  min-width: 0;
}
.line {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}
.key {
  font-family: var(--font-mono);
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text);
}
.rules {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--accent-text);
  background: var(--accent-wash);
  border: 0;
  border-radius: 4px;
  padding: 0.12rem 0.4rem;
}
.rules:hover {
  text-decoration: underline;
}
.desc {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  margin: 0.25rem 0 0;
  font-size: 0.71rem;
  color: var(--text-mute);
  font-variant-numeric: tabular-nums;
}

.cell-rollout {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.pct {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent-text);
  width: 2.8rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cell-actions {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.danger:hover {
  color: var(--red-text);
  background: var(--red-wash);
}

.saving {
  position: absolute;
  inset-block: 0;
  right: 1rem;
  display: flex;
  align-items: center;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--text-mute);
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  padding-inline: 0.6rem;
  border-radius: var(--r-sm);
}

@media (max-width: 760px) {
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 0.7rem;
  }
  .cell-rollout {
    grid-column: 1 / -1;
    order: 3;
  }
  .desc {
    white-space: normal;
  }
}
</style>
