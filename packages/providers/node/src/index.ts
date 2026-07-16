import { OFREPProvider } from '@openfeature/ofrep-provider'

export interface FlaghoistProviderOptions {
  /** Base URL of your Flaghoist server, e.g. `https://team-flags.you.workers.dev`. */
  url: string
  /** Read-only API key, sent as the `x-api-key` header. */
  apiKey?: string
  /** Additional static headers to send with every request. */
  headers?: Record<string, string>
}

/**
 * An OpenFeature server-SDK provider for Flaghoist. It is the official OFREP provider,
 * pre-wired for a Flaghoist server: it evaluates flags against your server's OFREP endpoints
 * with the read API key attached. Register it with `OpenFeature.setProviderAndWait(...)`.
 *
 * @example
 *   import { OpenFeature } from '@openfeature/server-sdk'
 *   import { FlaghoistProvider } from '@flaghoist/provider-node'
 *
 *   await OpenFeature.setProviderAndWait(
 *     new FlaghoistProvider({ url: process.env.FLAGS_URL, apiKey: process.env.FLAGS_API_KEY }),
 *   )
 *   const client = OpenFeature.getClient()
 *   const enabled = await client.getBooleanValue('new-checkout', false, { targetingKey: userId })
 */
export class FlaghoistProvider extends OFREPProvider {
  constructor(options: FlaghoistProviderOptions) {
    const headers: [string, string][] = []
    if (options.apiKey) headers.push(['x-api-key', options.apiKey])
    if (options.headers) headers.push(...Object.entries(options.headers))
    super({ baseUrl: options.url, headers })
  }
}
