import { FlaghoistWebProvider } from '@flaghoist/provider-web'
import { OpenFeature, OpenFeatureProvider } from '@openfeature/react-sdk'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const url = import.meta.env.VITE_FLAGS_URL ?? 'http://localhost:8787'
const apiKey = import.meta.env.VITE_FLAGS_KEY ?? 'read-key'

async function bootstrap() {
  // Set who this user is: the targetingKey drives sticky percentage rollouts and targeting rules.
  // Then register the Flaghoist provider. Note the only Flaghoist-specific piece is the provider;
  // everything the components use is the standard @openfeature/react-sdk. There is no
  // Flaghoist-specific React package to install.
  await OpenFeature.setContext({ targetingKey: 'demo-user', plan: 'beta' })
  await OpenFeature.setProviderAndWait(new FlaghoistWebProvider({ url, apiKey }))

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <OpenFeatureProvider>
        <App />
      </OpenFeatureProvider>
    </StrictMode>,
  )
}

void bootstrap()
