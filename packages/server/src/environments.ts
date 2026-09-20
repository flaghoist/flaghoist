import type { FeatureFlag, StorageAdapter } from '@flaghoist/core'

/**
 * Wrap a StorageAdapter so its flag methods (`get`/`put`/`delete`/`list`) are scoped to one
 * environment. The default environment uses bare keys and never stamps `environment` on the
 * flag, so a deployment that turns environments on for the first time needs no migration:
 * existing flags are already the default environment. A named environment prefixes the storage
 * key and stamps `environment` on write, so `list()` — which sees every key in the shared
 * backend — can tell environments apart.
 *
 * Non-flag concerns (audit, webhooks) are deliberately not scoped here; they stay on the
 * unscoped adapter passed to `createAuditLog`/`createWebhookStore` in index.ts.
 */
export function scopedStorage(
  storage: StorageAdapter,
  environment: string,
  defaultEnvironment: string,
): StorageAdapter {
  const isDefault = environment === defaultEnvironment
  const storageKey = (key: string): string => (isDefault ? key : `${environment}:${key}`)

  return {
    async get(key) {
      return storage.get(storageKey(key))
    },
    async put(key, flag) {
      const { environment: _drop, ...rest } = flag
      const stamped: FeatureFlag = isDefault
        ? (rest as FeatureFlag)
        : { ...(rest as FeatureFlag), environment }
      await storage.put(storageKey(key), stamped)
    },
    async delete(key) {
      await storage.delete(storageKey(key))
    },
    async list() {
      const all = await storage.list()
      return isDefault
        ? all.filter((f) => !f.environment)
        : all.filter((f) => f.environment === environment)
    },
  }
}

export type EnvironmentResolution =
  { ok: true; environment: string } | { ok: false; status: 400; message: string }

/**
 * Resolve which environment an admin request targets, from the `X-Flaghoist-Environment` header.
 * When the server has no `environments` configured, the feature is fully off: every request maps
 * to `defaultEnvironment` regardless of the header, so `scopedStorage` acts as a no-op passthrough
 * and a deployment that never opts in sees no behavior change at all.
 */
export function resolveAdminEnvironment(
  environments: string[] | undefined,
  defaultEnvironment: string,
  headers: Headers,
): EnvironmentResolution {
  if (!environments || environments.length === 0) {
    return { ok: true, environment: defaultEnvironment }
  }
  const requested = headers.get('x-flaghoist-environment')?.trim()
  if (!requested) return { ok: true, environment: defaultEnvironment }
  if (!environments.includes(requested)) {
    return {
      ok: false,
      status: 400,
      message: `Unknown environment "${requested}". Configured environments: ${environments.join(', ')}.`,
    }
  }
  return { ok: true, environment: requested }
}

/**
 * Resolve which environment a read (OFREP) request targets, from the environment the auth
 * verifier attached to its result (see `apiKeys()` in auth.ts). A verifier that does not name an
 * environment (the plain `apiKey()` single-secret verifier) always maps to the default
 * environment, and so does any value outside the configured list.
 */
export function resolveReadEnvironment(
  environments: string[] | undefined,
  defaultEnvironment: string,
  authEnvironment: string | undefined,
): string {
  if (!environments || environments.length === 0) return defaultEnvironment
  if (authEnvironment && environments.includes(authEnvironment)) return authEnvironment
  return defaultEnvironment
}
