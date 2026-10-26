import { OFREPWebProvider, type OFREPWebProviderOptions } from '@openfeature/ofrep-web-provider'
import type { Logger } from '@openfeature/web-sdk'

/**
 * Every option of the official OFREP web provider (`pollInterval`, `changeDetection`, `cacheMode`,
 * `cacheTTL`, `timeoutMs` and the rest) passes straight through with its upstream default. Only
 * `baseUrl` and the tuple-style `headers` are replaced by the friendlier fields below.
 */
export type FlaghoistWebProviderOptions = Omit<OFREPWebProviderOptions, 'baseUrl' | 'headers'> & {
  /** Base URL of your Flaghoist server, e.g. `https://team-flags.you.workers.dev`. */
  url: string
  /** Read-only API key, sent as the `x-api-key` header. */
  apiKey?: string
  /** Additional static headers to send with every request. */
  headers?: Record<string, string>
}

/**
 * An OpenFeature web-SDK provider for Flaghoist. It is the official OFREP web provider,
 * pre-wired for a Flaghoist server: it points at your server's OFREP endpoints and attaches
 * the read API key. Register it with `OpenFeature.setProviderAndWait(...)`.
 *
 * @example
 *   import { OpenFeature } from '@openfeature/web-sdk'
 *   import { FlaghoistWebProvider } from '@flaghoist/provider-web'
 *
 *   await OpenFeature.setProviderAndWait(
 *     new FlaghoistWebProvider({ url: import.meta.env.VITE_FLAGS_URL, apiKey: import.meta.env.VITE_FLAGS_KEY }),
 *   )
 */
export class FlaghoistWebProvider extends OFREPWebProvider {
  constructor(options: FlaghoistWebProviderOptions, logger?: Logger) {
    const { url, apiKey, headers: extra, ...rest } = options
    const headers: [string, string][] = []
    if (apiKey) headers.push(['x-api-key', apiKey])
    if (extra) headers.push(...Object.entries(extra))
    super({ ...rest, baseUrl: url, headers }, logger)
  }
}
