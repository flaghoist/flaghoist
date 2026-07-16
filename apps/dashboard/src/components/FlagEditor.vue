<script setup lang="ts">
import { reactive, ref } from 'vue'
import { OPERATORS, type FeatureFlag, type FlagInput } from '../api'

const props = defineProps<{ flag?: FeatureFlag | null; busy?: boolean; error?: string }>()
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

function coerce(raw: string): string | number | boolean {
  const s = raw.trim()
  if (s === 'true') return true
  if (s === 'false') return false
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s)
  return s
}

function addRule() {
  rules.push({
    conditions: [{ attribute: '', operator: 'eq', value: '' }],
    result: { enabled: true, usePct: false, percentage: 100 },
  })
}
function addCondition(rule: EditableRule) {
  rule.conditions.push({ attribute: '', operator: 'eq', value: '' })
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
          value:
            c.operator === 'in' || c.operator === 'notIn'
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
  if (isNew && !key.value.trim()) return
  emit('save', key.value.trim(), buildInput())
}
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div class="editor card">
      <header class="editor-head">
        <h2>{{ isNew ? 'New flag' : 'Edit flag' }}</h2>
        <button class="btn btn-ghost sm" @click="emit('cancel')">✕</button>
      </header>

      <div class="editor-body">
        <div class="field-row">
          <div style="flex: 1">
            <label class="label">Key</label>
            <input v-model="key" class="mono full" :readonly="!isNew" placeholder="new-checkout" />
          </div>
          <div class="enable-block">
            <label class="label">Enabled</label>
            <button
              class="toggle"
              :data-on="enabled"
              @click="enabled = !enabled"
              aria-label="Toggle enabled"
            ></button>
          </div>
        </div>

        <label class="label" style="margin-top: 1rem">Description</label>
        <input v-model="description" class="full" placeholder="What does this flag gate?" />

        <label class="label" style="margin-top: 1rem">Default rollout — {{ percentage }}%</label>
        <input type="range" min="0" max="100" v-model.number="percentage" />
        <p class="hint">Applied when no targeting rule matches.</p>

        <div class="rules-head">
          <span class="label" style="margin: 0">Targeting rules</span>
          <button class="btn btn-ghost sm" @click="addRule">+ Add rule</button>
        </div>
        <p v-if="rules.length === 0" class="empty-rules">
          No rules — the flag evaluates on its default rollout for everyone.
        </p>

        <div v-for="(rule, ri) in rules" :key="ri" class="rule">
          <div class="rule-head">
            <span class="rule-tag mono">rule {{ ri + 1 }}</span>
            <button class="btn btn-danger sm" @click="rules.splice(ri, 1)">Remove</button>
          </div>

          <div v-for="(cond, ci) in rule.conditions" :key="ci" class="cond">
            <input v-model="cond.attribute" class="mono cond-attr" placeholder="attribute" />
            <select v-model="cond.operator" class="cond-op">
              <option v-for="op in OPERATORS" :key="op" :value="op">{{ op }}</option>
            </select>
            <input
              v-model="cond.value"
              class="cond-val"
              :placeholder="
                cond.operator === 'in' || cond.operator === 'notIn' ? 'a, b, c' : 'value'
              "
            />
            <button class="x" @click="rule.conditions.splice(ci, 1)" aria-label="Remove condition">
              ✕
            </button>
          </div>
          <button class="btn btn-ghost sm add-cond" @click="addCondition(rule)">
            + condition (AND)
          </button>

          <div class="result">
            <span class="then">then serve</span>
            <button
              class="toggle sm-toggle"
              :data-on="rule.result.enabled"
              @click="rule.result.enabled = !rule.result.enabled"
              aria-label="Result on/off"
            ></button>
            <span class="result-state">{{ rule.result.enabled ? 'on' : 'off' }}</span>
            <label v-if="rule.result.enabled" class="pct-check">
              <input type="checkbox" v-model="rule.result.usePct" /> to
              <input
                v-if="rule.result.usePct"
                type="number"
                min="0"
                max="100"
                v-model.number="rule.result.percentage"
                class="pct-input mono"
              />
              <span v-if="rule.result.usePct">% of matches</span>
              <span v-else>all matches</span>
            </label>
          </div>
        </div>
      </div>

      <footer class="editor-foot">
        <p v-if="error" class="err">{{ error }}</p>
        <div class="foot-actions">
          <button class="btn btn-ghost" @click="emit('cancel')">Cancel</button>
          <button class="btn btn-primary" :disabled="busy || (isNew && !key.trim())" @click="save">
            {{ busy ? 'Saving…' : isNew ? 'Create flag' : 'Save changes' }}
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
  background: rgba(11, 30, 58, 0.42);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 3rem 1.5rem;
  overflow-y: auto;
  z-index: 20;
}
.editor {
  width: 100%;
  max-width: 620px;
  display: flex;
  flex-direction: column;
}
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.4rem;
  border-bottom: 1px solid var(--line);
}
.editor-head h2 {
  font-family: var(--font-display);
  font-size: 1.4rem;
}
.editor-body {
  padding: 1.3rem 1.4rem;
}
.full {
  width: 100%;
}
.field-row {
  display: flex;
  gap: 1.2rem;
  align-items: flex-end;
}
.enable-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.hint,
.empty-rules {
  font-size: 0.78rem;
  color: var(--slate);
  margin: 0.4rem 0 0;
}
.rules-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 1.6rem 0 0.6rem;
}
.rule {
  border: 1px solid var(--line);
  border-left: 3px solid var(--signal);
  border-radius: 0 10px 10px 0;
  padding: 0.9rem 1rem;
  margin-bottom: 0.8rem;
  background: rgba(255, 74, 31, 0.02);
}
.rule-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}
.rule-tag {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--signal-ink);
}
.cond {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.4rem;
}
.cond-attr {
  flex: 1.2;
  min-width: 0;
}
.cond-op {
  flex: 1;
  min-width: 0;
}
.cond-val {
  flex: 1.4;
  min-width: 0;
}
.x {
  border: none;
  background: transparent;
  color: var(--slate);
  font-size: 0.9rem;
  padding: 0.3rem;
}
.x:hover {
  color: var(--off);
}
.add-cond {
  margin-top: 0.2rem;
}
.result {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  margin-top: 0.8rem;
  padding-top: 0.7rem;
  border-top: 1px dashed var(--line);
  font-size: 0.85rem;
}
.then {
  color: var(--ink-2);
  font-weight: 500;
}
.result-state {
  font-family: var(--font-mono);
  font-weight: 600;
}
.sm-toggle {
  width: 38px;
  height: 22px;
}
.sm-toggle::after {
  width: 16px;
  height: 16px;
}
.sm-toggle[data-on='true']::after {
  transform: translateX(16px);
}
.pct-check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--ink-2);
}
.pct-input {
  width: 4rem;
}
.editor-foot {
  padding: 1rem 1.4rem;
  border-top: 1px solid var(--line);
}
.foot-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
.err {
  margin: 0 0 0.7rem;
  font-size: 0.82rem;
  color: var(--off);
}
.sm {
  font-size: 0.78rem;
  padding: 0.35rem 0.6rem;
}
</style>
