<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { OPERATORS, type FeatureFlag, type FlagInput } from '../api'

const props = defineProps<{
  flag?: FeatureFlag | null
  busy?: boolean
  error?: string
  existingKeys?: string[]
}>()
const emit = defineEmits<{ save: [key: string, input: FlagInput]; cancel: [] }>()

interface EditableCondition {
  attribute: string
  operator: string
  value: string
}
interface EditableRule {
  conditions: EditableCondition[]
  result: { enabled: boolean; usePct: boolean; percentage: number }
}

const isNew = !props.flag
const key = ref(props.flag?.key ?? '')
const description = ref(props.flag?.description ?? '')
const enabled = ref(props.flag?.enabled ?? false)
const percentage = ref(props.flag?.rollout.percentage ?? 0)
const keyEl = ref<HTMLInputElement | null>(null)
const descEl = ref<HTMLInputElement | null>(null)

const rules = reactive<EditableRule[]>(
  (props.flag?.rules ?? []).map((r) => ({
    conditions: r.conditions.map((c) => ({
      attribute: c.attribute,
      operator: c.operator,
      value: Array.isArray(c.value) ? c.value.join(', ') : String(c.value),
    })),
    result: {
      enabled: r.result.enabled,
      usePct: r.result.rollout != null,
      percentage: r.result.rollout?.percentage ?? 100,
    },
  })),
)

// Land on the first field the operator can actually change. On an existing flag the key is
// readonly, so focusing it would put the caret somewhere typing does nothing.
onMounted(() => (isNew ? keyEl.value : descEl.value)?.focus())

// Mirrors the server's own key rule, so a bad key is caught here rather than as a 400.
const KEY_RULE = /^[a-z0-9][a-z0-9-_]*$/

const keyError = computed(() => {
  if (!isNew) return ''
  const k = key.value.trim()
  if (!k) return ''
  if (!KEY_RULE.test(k)) return 'Lowercase letters, numbers, dashes and underscores only.'
  if (props.existingKeys?.includes(k)) return `A flag named "${k}" already exists.`
  return ''
})

const canSave = computed(() => !props.busy && (!isNew || (!!key.value.trim() && !keyError.value)))

function coerce(raw: string): string | number | boolean {
  const s = raw.trim()
  if (s === 'true') return true
  if (s === 'false') return false
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s)
  return s
}

const isList = (op: string) => op === 'in' || op === 'notIn'

function addRule() {
  rules.push({
    conditions: [{ attribute: '', operator: 'eq', value: '' }],
    result: { enabled: true, usePct: false, percentage: 100 },
  })
}

function buildInput(): FlagInput {
  return {
    enabled: enabled.value,
    rollout: { percentage: percentage.value },
    description: description.value,
    rules: rules.map((r) => ({
      conditions: r.conditions
        .filter((c) => c.attribute.trim())
        .map((c) => ({
          attribute: c.attribute.trim(),
          operator: c.operator,
          value: isList(c.operator)
            ? c.value
                .split(',')
                .map((v) => coerce(v))
                .filter((v): v is string | number => v !== '' && typeof v !== 'boolean')
            : coerce(c.value),
        })),
      result: {
        enabled: r.result.enabled,
        ...(r.result.usePct ? { rollout: { percentage: r.result.percentage } } : {}),
      },
    })),
  }
}

function save() {
  if (!canSave.value) return
  emit('save', key.value.trim(), buildInput())
}
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div
      class="editor card"
      role="dialog"
      aria-modal="true"
      :aria-label="isNew ? 'New flag' : `Edit ${key}`"
    >
      <header class="head">
        <h2>{{ isNew ? 'New flag' : 'Edit flag' }}</h2>
        <button class="btn btn-quiet btn-sm" aria-label="Close" @click="emit('cancel')">Esc</button>
      </header>

      <div class="body">
        <div class="grid-2">
          <div>
            <label class="label" for="fe-key">Key</label>
            <input
              id="fe-key"
              ref="keyEl"
              v-model="key"
              class="mono full"
              :readonly="!isNew"
              :aria-invalid="!!keyError"
              placeholder="new-checkout"
            />
            <p v-if="keyError" class="field-err">{{ keyError }}</p>
            <p v-else-if="!isNew" class="field-hint">Keys cannot be renamed after creation.</p>
          </div>
          <div class="enable">
            <label class="label" for="fe-enabled">Enabled</label>
            <button
              id="fe-enabled"
              class="toggle"
              :data-on="enabled"
              :aria-pressed="enabled"
              aria-label="Toggle enabled"
              @click="enabled = !enabled"
            ></button>
          </div>
        </div>

        <label class="label spaced" for="fe-desc">Description</label>
        <input
          id="fe-desc"
          ref="descEl"
          v-model="description"
          class="full"
          placeholder="What does this gate?"
        />

        <label class="label spaced" for="fe-pct">
          Default rollout <span class="mono pct">{{ percentage }}%</span>
        </label>
        <input id="fe-pct" type="range" min="0" max="100" v-model.number="percentage" />
        <p class="field-hint">Applied to everyone that no targeting rule matches.</p>

        <div class="rules-head">
          <span class="label plain">Targeting rules</span>
          <button class="btn btn-ghost btn-sm" @click="addRule">Add rule</button>
        </div>

        <p v-if="rules.length === 0" class="field-hint">
          No rules. Every visitor is evaluated against the default rollout above.
        </p>

        <div v-for="(rule, ri) in rules" :key="ri" class="rule">
          <div class="rule-head">
            <span class="rule-n mono">Rule {{ ri + 1 }}</span>
            <span class="rule-note">{{ ri === 0 ? 'checked first' : `checked ${ri + 1}` }}</span>
            <button class="btn btn-quiet btn-sm danger" @click="rules.splice(ri, 1)">Remove</button>
          </div>

          <!-- The rule reads as a sentence, so what it will do is legible without decoding a form. -->
          <div v-for="(cond, ci) in rule.conditions" :key="ci" class="cond">
            <span class="word">{{ ci === 0 ? 'If' : 'and' }}</span>
            <input v-model="cond.attribute" class="mono attr" placeholder="country" />
            <select v-model="cond.operator" class="op">
              <option v-for="op in OPERATORS" :key="op" :value="op">{{ op }}</option>
            </select>
            <input
              v-model="cond.value"
              class="val"
              :placeholder="isList(cond.operator) ? 'DE, FR, ES' : 'value'"
            />
            <button
              class="x"
              :disabled="rule.conditions.length === 1"
              aria-label="Remove condition"
              @click="rule.conditions.splice(ci, 1)"
            >
              ✕
            </button>
          </div>

          <button
            class="btn btn-quiet btn-sm addc"
            @click="rule.conditions.push({ attribute: '', operator: 'eq', value: '' })"
          >
            and another condition
          </button>

          <div class="result">
            <span class="word">then serve</span>
            <button
              class="toggle toggle-sm"
              :data-on="rule.result.enabled"
              :aria-pressed="rule.result.enabled"
              aria-label="Serve on or off"
              @click="rule.result.enabled = !rule.result.enabled"
            ></button>
            <span class="mono state">{{ rule.result.enabled ? 'on' : 'off' }}</span>

            <template v-if="rule.result.enabled">
              <span class="word">to</span>
              <label class="pct-toggle">
                <input type="checkbox" v-model="rule.result.usePct" />
                <span v-if="!rule.result.usePct">everyone that matches</span>
              </label>
              <template v-if="rule.result.usePct">
                <input
                  type="number"
                  min="0"
                  max="100"
                  v-model.number="rule.result.percentage"
                  class="mono pct-input"
                  aria-label="Percentage of matches"
                />
                <span class="word">% of matches</span>
              </template>
            </template>
          </div>
        </div>
      </div>

      <footer class="foot">
        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <div class="foot-actions">
          <button class="btn btn-ghost" @click="emit('cancel')">Cancel</button>
          <button class="btn btn-primary" :disabled="!canSave" @click="save">
            {{ busy ? 'Saving' : isNew ? 'Create flag' : 'Save changes' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2.5rem 1.25rem;
  overflow-y: auto;
  background: light-dark(rgba(11, 30, 58, 0.34), rgba(2, 8, 16, 0.62));
  backdrop-filter: blur(3px);
}
.editor {
  width: 100%;
  max-width: 600px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid var(--line);
}
.head h2 {
  font-size: 1.02rem;
}
.body {
  padding: 1.2rem;
}
.full {
  width: 100%;
}
.spaced {
  margin-top: 1.1rem;
}
.grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1.2rem;
  align-items: start;
}
.enable {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.label.plain {
  margin: 0;
}
.pct {
  color: var(--accent-text);
  font-weight: 600;
}
.field-hint {
  margin: 0.35rem 0 0;
  font-size: 0.76rem;
  color: var(--text-mute);
}
.field-err {
  margin: 0.35rem 0 0;
  font-size: 0.76rem;
  color: var(--red-text);
}

.rules-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 1.5rem 0 0.5rem;
}
.rule {
  border: 1px solid var(--line);
  border-left: 2px solid var(--signal);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  padding: 0.8rem 0.9rem;
  margin-bottom: 0.7rem;
  background: var(--surface-2);
}
.rule-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}
.rule-n {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent-text);
}
.rule-note {
  flex: 1;
  font-size: 0.72rem;
  color: var(--text-mute);
}
.danger:hover {
  color: var(--red-text);
  background: var(--red-wash);
}

.cond {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}
.word {
  font-size: 0.79rem;
  color: var(--text-2);
  white-space: nowrap;
}
.attr {
  flex: 1.1;
  min-width: 0;
}
.op {
  flex: 0 0 8.2rem;
  min-width: 0;
}
.val {
  flex: 1.3;
  min-width: 0;
}
.x {
  border: 0;
  background: none;
  color: var(--text-mute);
  font-size: 0.8rem;
  padding: 0.25rem;
  border-radius: 4px;
}
.x:hover:not(:disabled) {
  color: var(--red-text);
}
.x:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.addc {
  margin-top: 0.1rem;
}

.result {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--line-soft);
}
.state {
  font-size: 0.79rem;
  font-weight: 600;
}
.pct-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.79rem;
  color: var(--text-2);
}
.pct-input {
  width: 4.2rem;
}

.foot {
  padding: 0.9rem 1.2rem;
  border-top: 1px solid var(--line);
}
.err {
  margin: 0 0 0.7rem;
  padding: 0.55rem 0.7rem;
  font-size: 0.8rem;
  color: var(--red-text);
  background: var(--red-wash);
  border-radius: var(--r-sm);
}
.foot-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@media (max-width: 560px) {
  .cond {
    flex-wrap: wrap;
  }
  .op,
  .attr,
  .val {
    flex: 1 1 100%;
  }
}
</style>
