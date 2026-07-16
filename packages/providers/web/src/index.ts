import { OFREPWebProvider } from '@openfeature/ofrep-web-provider'

export interface FlaghoistWebProviderOptions {
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
  constructor(options: FlaghoistWebProviderOptions) {
    const headers: [string, string][] = []
    if (options.apiKey) headers.push(['x-api-key', options.apiKey])
    if (options.headers) headers.push(...Object.entries(options.headers))
    super({ baseUrl: options.url, headers })
  }
}
