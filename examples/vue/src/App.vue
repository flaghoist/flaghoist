<script setup lang="ts">
import { useFeatureFlag } from '@flaghoist/vue'

const newCheckout = useFeatureFlag('new-checkout')
const beta = useFeatureFlag('beta')
</script>

<template>
  <main>
    <h1>Flaghoist — Vue example</h1>

    <section v-if="newCheckout" class="feature-on">✨ The new checkout experience is live.</section>
    <section v-else class="feature-off">Using the legacy checkout.</section>

    <ul>
      <li>
        new-checkout: <strong>{{ newCheckout ? 'on' : 'off' }}</strong>
      </li>
      <li>
        beta: <strong>{{ beta ? 'on' : 'off' }}</strong>
      </li>
    </ul>
  </main>
</template>
