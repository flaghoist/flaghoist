import {
  type AdminClient,
  type FeatureFlag,
  createAdminClient,
  createFlag,
  flagState,
  setRollout,
  setRules,
  toggleFlag,
  OPERATORS,
} from '@flaghoist/admin-client'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

function describeFlag(f: FeatureFlag): string {
  const state = flagState(f)
  const parts = [`${f.key}: ${state.label}`]
  if (f.description) parts.push(f.description)
  if (f.rules?.length) parts.push(`${f.rules.length} targeting rule(s)`)
  return parts.join(' -- ')
}

function flagDetail(f: FeatureFlag): string {
  const state = flagState(f)
  const lines: string[] = [
    `key: ${f.key}`,
    `state: ${state.label}`,
    `enabled: ${f.enabled}`,
    `rollout: ${f.rollout.percentage}%`,
  ]
  if (f.description) lines.push(`description: ${f.description}`)
  if (f.rules?.length) {
    lines.push(`rules (${f.rules.length}):`)
    for (const rule of f.rules) {
      const conds = rule.conditions
        .map((c) => `${c.attribute} ${c.operator} ${JSON.stringify(c.value)}`)
        .join(' AND ')
      lines.push(`  if ${conds} => enabled=${rule.result.enabled}`)
    }
  }
  lines.push(`created: ${f.metadata.createdAt} by ${f.metadata.createdBy}`)
  lines.push(`updated: ${f.metadata.updatedAt} by ${f.metadata.updatedBy}`)
  return lines.join('\n')
}

export interface McpServerOptions {
  url: string
  token: string
  allowWrites: boolean
  fetch?: (input: string, init?: RequestInit) => Promise<Response>
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const client: AdminClient = createAdminClient({
    url: options.url,
    token: options.token,
    fetch: options.fetch,
  })

  const server = new McpServer({
    name: 'flaghoist',
    version: '0.1.0',
  })

  server.tool('list_flags', 'List all feature flags', {}, async () => {
    const flags = await client.list()
    if (flags.length === 0) {
      return { content: [{ type: 'text', text: 'No flags found.' }] }
    }
    const text = flags.map(describeFlag).join('\n')
    return { content: [{ type: 'text', text: `${flags.length} flag(s):\n${text}` }] }
  })

  server.tool(
    'get_flag',
    'Get details of a single feature flag',
    { key: z.string().describe('The flag key') },
    async ({ key }) => {
      const flag = await client.get(key)
      if (!flag) {
        return { content: [{ type: 'text', text: `Flag "${key}" not found.` }], isError: true }
      }
      return { content: [{ type: 'text', text: flagDetail(flag) }] }
    },
  )

  if (options.allowWrites) {
    server.tool(
      'create_flag',
      'Create a new feature flag (disabled by default, 0% rollout)',
      {
        key: z.string().describe('Unique flag key'),
        description: z.string().optional().describe('Human-readable description'),
        enabled: z.boolean().optional().describe('Start enabled? Default: false'),
        percentage: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe('Rollout percentage. Default: 0'),
      },
      async ({ key, description, enabled, percentage }) => {
        const flag = await createFlag(client, key, { enabled, percentage, description })
        const state = flagState(flag)
        return {
          content: [
            {
              type: 'text',
              text: `Created "${key}". State: ${state.label}, rollout: ${flag.rollout.percentage}%.`,
            },
          ],
        }
      },
    )

    server.tool(
      'toggle_flag',
      'Enable or disable a flag',
      {
        key: z.string().describe('The flag key'),
        enabled: z
          .boolean()
          .optional()
          .describe('Set to true/false, or omit to flip the current state'),
      },
      async ({ key, enabled }) => {
        const flag = await toggleFlag(client, key, enabled ?? 'flip')
        const state = flagState(flag)
        return {
          content: [
            {
              type: 'text',
              text: `"${key}" is now ${state.label}. Rollout: ${flag.rollout.percentage}%.`,
            },
          ],
        }
      },
    )

    server.tool(
      'set_rollout',
      'Set the rollout percentage for a flag',
      {
        key: z.string().describe('The flag key'),
        percentage: z.number().min(0).max(100).describe('Rollout percentage (0-100)'),
      },
      async ({ key, percentage }) => {
        const flag = await setRollout(client, key, percentage)
        const state = flagState(flag)
        return {
          content: [
            {
              type: 'text',
              text: `"${key}" rollout set to ${flag.rollout.percentage}%. State: ${state.label}.`,
            },
          ],
        }
      },
    )

    server.tool(
      'set_targeting_rules',
      'Replace the targeting rules on a flag',
      {
        key: z.string().describe('The flag key'),
        rules: z
          .array(
            z.object({
              conditions: z.array(
                z.object({
                  attribute: z.string().describe('Context attribute to match'),
                  operator: z.enum(OPERATORS).describe('Comparison operator'),
                  value: z
                    .union([
                      z.string(),
                      z.number(),
                      z.boolean(),
                      z.array(z.union([z.string(), z.number()])),
                    ])
                    .describe('Value to compare against'),
                }),
              ),
              result: z.object({
                enabled: z.boolean().describe('Whether the flag is on for matching users'),
              }),
            }),
          )
          .describe('The new set of targeting rules (replaces all existing rules)'),
      },
      async ({ key, rules }) => {
        const flag = await setRules(client, key, rules)
        return {
          content: [
            {
              type: 'text',
              text: `"${key}" now has ${flag.rules?.length ?? 0} targeting rule(s).`,
            },
          ],
        }
      },
    )
  }

  return server
}
