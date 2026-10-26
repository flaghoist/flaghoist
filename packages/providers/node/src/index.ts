import {
  type EvaluationResponse,
  type FetchAPI,
  handleEvaluationError,
  isEvaluationFailureResponse,
  OFREPApi,
  OFREPApiTooManyRequestsError,
  toResolutionDetails,
} from '@openfeature/ofrep-core'
import { OFREPProvider } from '@openfeature/ofrep-provider'
import {
  ErrorCode,
  type EvaluationContext,
  GeneralError,
  type JsonValue,
  type ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/server-sdk'

export interface FlaghoistProviderOptions {
  url: string
  apiKey?: string
  headers?: Record<string, string>
  /**
   * Evaluate every flag for a context in one request, and answer each check from that result.
   * Default true. Set false to make one request per flag check, like the plain OFREP provider.
   */
  bulk?: boolean
  /**
   * How long one bulk result is reused for the same evaluation context, in milliseconds. Default
   * 5000. Checks for the same context that arrive while a request is in flight always share it,
   * even at 0.
   */
  cacheTtlMs?: number
  /** The most evaluation contexts kept in the cache at once, oldest dropped first. Default 1000. */
  maxCachedContexts?: number
  /** Abort a request after this many milliseconds. Default 10000. */
  timeoutMs?: number
  /** A fetch implementation to use instead of the global one. */
  fetch?: FetchAPI
}

type FlagValue = boolean | string | number | JsonValue

interface CacheEntry {
  /** When this entry stops being served. Infinity while the request is in flight. */
  expires: number
  flags: Promise<Map<string, EvaluationResponse>>
}

/**
 * Serialize a context with object keys sorted, so `{ a, b }` and `{ b, a }` share a cache entry.
 */
function contextKey(context: EvaluationContext): string {
  return JSON.stringify(context, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
      )
    }
    return value
  })
}

/** The bulk endpoint answered with an OFREP error body rather than a list of flags. */
class BulkFailure extends Error {
  constructor(readonly response: { errorCode: ErrorCode; errorDetails?: string }) {
    super(response.errorDetails ?? response.errorCode)
  }
}

export class FlaghoistProvider extends OFREPProvider {
  private readonly bulk: boolean
  private readonly cacheTtlMs: number
  private readonly maxCachedContexts: number
  private readonly api: OFREPApi
  private readonly cache = new Map<string, CacheEntry>()
  private pausedUntil: Date | null = null

  constructor(options: FlaghoistProviderOptions) {
    const headers: [string, string][] = []
    if (options.apiKey) headers.push(['x-api-key', options.apiKey])
    if (options.headers) headers.push(...Object.entries(options.headers))
    const base = {
      baseUrl: options.url,
      headers,
      timeoutMs: options.timeoutMs,
      fetchImplementation: options.fetch,
    }
    super(base)
    this.bulk = options.bulk ?? true
    this.cacheTtlMs = options.cacheTtlMs ?? 5000
    this.maxCachedContexts = options.maxCachedContexts ?? 1000
    this.api = new OFREPApi(base, options.fetch)
  }

  override async onClose(): Promise<void> {
    this.api.close()
    this.cache.clear()
    await super.onClose()
  }

  override resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    if (!this.bulk) return super.resolveBooleanEvaluation(flagKey, defaultValue, context)
    return this.resolveFromBulk(flagKey, defaultValue, context)
  }

  override resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    if (!this.bulk) return super.resolveStringEvaluation(flagKey, defaultValue, context)
    return this.resolveFromBulk(flagKey, defaultValue, context)
  }

  override resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    if (!this.bulk) return super.resolveNumberEvaluation(flagKey, defaultValue, context)
    return this.resolveFromBulk(flagKey, defaultValue, context)
  }

  override resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    if (!this.bulk) return super.resolveObjectEvaluation(flagKey, defaultValue, context)
    return this.resolveFromBulk(flagKey, defaultValue, context)
  }

  private async resolveFromBulk<T extends FlagValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    let flags: Map<string, EvaluationResponse>
    try {
      flags = await this.flagsFor(context)
    } catch (error) {
      if (error instanceof BulkFailure) {
        return handleEvaluationError({ key: flagKey, ...error.response }, defaultValue)
      }
      throw error
    }
    const result = flags.get(flagKey)
    if (!result) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `Flag ${flagKey} not found`,
      }
    }
    if (isEvaluationFailureResponse(result)) return handleEvaluationError(result, defaultValue)
    // toResolutionDetails is typed for OFREP's value union; flags here are that union too.
    return toResolutionDetails(result, defaultValue as never) as ResolutionDetails<T>
  }

  /** Every flag evaluated for this context: from the cache, a request in flight, or a new one. */
  private flagsFor(context: EvaluationContext): Promise<Map<string, EvaluationResponse>> {
    const now = Date.now()
    if (this.pausedUntil && this.pausedUntil > new Date(now)) {
      throw new GeneralError(
        `OFREP evaluation paused due to TooManyRequests until ${this.pausedUntil.toISOString()}`,
      )
    }
    this.pausedUntil = null

    const key = contextKey(context)
    const cached = this.cache.get(key)
    if (cached && cached.expires > now) return cached.flags
    if (cached) this.cache.delete(key)

    const entry: CacheEntry = { expires: Number.POSITIVE_INFINITY, flags: this.fetchAll(context) }
    this.cache.set(key, entry)
    while (this.cache.size > this.maxCachedContexts) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
    entry.flags.then(
      () => {
        entry.expires = Date.now() + this.cacheTtlMs
      },
      () => {
        // A failure is not cached, so the next check tries again.
        if (this.cache.get(key) === entry) this.cache.delete(key)
      },
    )
    return entry.flags
  }

  private async fetchAll(context: EvaluationContext): Promise<Map<string, EvaluationResponse>> {
    let result: Awaited<ReturnType<OFREPApi['postBulkEvaluateFlags']>>
    try {
      result = await this.api.postBulkEvaluateFlags({ context })
    } catch (error) {
      if (error instanceof OFREPApiTooManyRequestsError) this.pausedUntil = error.retryAfterDate
      throw error
    }
    if (result.httpStatus !== 200) {
      // No ETag is sent, so a 304 is not expected; treat it like any other unusable answer.
      throw new BulkFailure(
        result.value ?? { errorCode: ErrorCode.GENERAL, errorDetails: 'Unexpected 304' },
      )
    }
    const flags = new Map<string, EvaluationResponse>()
    for (const flag of result.value.flags ?? []) {
      if (flag.key) flags.set(flag.key, flag)
    }
    return flags
  }
}
