import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './server.js'

const url = process.env['FLAGHOIST_URL']
const token = process.env['FLAGHOIST_ADMIN_TOKEN']

if (!url || !token) {
  process.stderr.write(
    'Missing required environment variables: FLAGHOIST_URL and FLAGHOIST_ADMIN_TOKEN\n',
  )
  process.exit(1)
}

const allowWrites = process.env['FLAGHOIST_MCP_ALLOW_WRITES'] === '1'

const server = createMcpServer({ url, token, allowWrites })
const transport = new StdioServerTransport()
await server.connect(transport)
