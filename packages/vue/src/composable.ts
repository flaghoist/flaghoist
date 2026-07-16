import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk'
import { onScopeDispose, readonly, ref, type Ref } from 'vue'

/**
 * Reactively read a boolean feature flag. Returns a read-only ref that starts at the flag's
 * current value and updates whenever the provider becomes ready or its configuration changes.
 * Assumes an OpenFeature provider has been registered (see `FlaghoistProvider`).
 *
 * @example
 *   <script setup lang="ts">
 *   import { useFeatureFlag } from '@flaghoist/vue'
 *   const newCheckout = useFeatureFlag('new-checkout')
 *   </script>
 *   <template>
 *     <NewCheckout v-if="newCheckout" />
 *     <LegacyCheckout v-else />
 *   </template>
 */
export function useFeatureFlag(flagKey: string, defaultValue = false): Readonly<Ref<boolean>> {
  const client = OpenFeature.getClient()
  const flag = ref(client.getBooleanValue(flagKey, defaultValue))

  const update = () => {
    flag.value = client.getBooleanValue(flagKey, defaultValue)
  }
  client.addHandler(ProviderEvents.Ready, update)
  client.addHandler(ProviderEvents.ConfigurationChanged, update)

  onScopeDispose(() => {
    client.removeHandler(ProviderEvents.Ready, update)
    client.removeHandler(ProviderEvents.ConfigurationChanged, update)
  })

  return readonly(flag) as Readonly<Ref<boolean>>
}
