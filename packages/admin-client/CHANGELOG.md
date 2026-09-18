# @flaghoist/admin-client

## 0.2.0

### Minor Changes

- d5acde8: New package: HTTP client for the Flaghoist admin API.
  
  Extracts `createAdminClient` from the CLI and collapses the dashboard's `createApi` into the same implementation. Both packages now import from this shared client rather than maintaining independent copies. The MCP server (coming in a follow-up) will use it as its third consumer.
