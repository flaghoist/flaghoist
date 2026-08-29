import { useBooleanFlagValue } from '@openfeature/react-sdk'

export default function App() {
  // The standard OpenFeature React hook. `beta` is on because main.tsx set plan=beta in the
  // context, and the seeded `beta` flag has a targeting rule for it.
  const newCheckout = useBooleanFlagValue('new-checkout', false)
  const beta = useBooleanFlagValue('beta', false)

  return (
    <main>
      <h1>Flaghoist: React example</h1>

      {newCheckout ? (
        <section className="feature-on">The new checkout experience is live.</section>
      ) : (
        <section className="feature-off">Using the legacy checkout.</section>
      )}

      <ul>
        <li>
          new-checkout: <strong>{newCheckout ? 'on' : 'off'}</strong>
        </li>
        <li>
          beta: <strong>{beta ? 'on' : 'off'}</strong>
        </li>
      </ul>
    </main>
  )
}
