import { FlaghoistProvider } from '@flaghoist/vue'
import { OpenFeature } from '@openfeature/web-sdk'
import { createApp } from 'vue'
import App from './App.vue'

const url = import.meta.env.VITE_FLAGS_URL ?? 'http://localhost:8787'
const apiKey = import.meta.env.VITE_FLAGS_KEY ?? 'read-key'

async function bootstrap() {
  // Set the evaluation context (who this user is), then register the Flaghoist provider.
  await OpenFeature.setContext({ targetingKey: 'demo-user', plan: 'beta' })
  await OpenFeature.setProviderAndWait(new FlaghoistProvider({ url, apiKey }))
  createApp(App).mount('#app')
}

void bootstrap()
