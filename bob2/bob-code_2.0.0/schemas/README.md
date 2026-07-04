# MCP Configuration JSON Schema

This directory contains the JSON Schema for Model Context Protocol (MCP) server configurations.

## Overview

The `mcp-config.schema.json` file provides real-time validation and IntelliSense for MCP configuration files in VS Code. It validates both global settings (`mcp_settings.json`) and project-level configurations (`.bob/mcp.json`).

## Features

- **Real-time Validation**: Errors appear in VS Code's Problems panel as you type
- **IntelliSense**: Autocomplete suggestions with descriptions and examples
- **Type Safety**: Validates server types (stdio, sse, streamable-http)
- **Field Validation**: Prevents mixing incompatible fields (e.g., stdio + url)
- **Value Constraints**: Enforces timeout ranges, URL formats, and required fields

## Supported Server Types

### 1. Stdio Servers (Local Process)
For locally-installed MCP servers that communicate via stdin/stdout.

**Required fields:**
- `command` - Executable command (e.g., "node", "python", "npx")

**Optional fields:**
- `args` - Command-line arguments
- `env` - Environment variables
- `cwd` - Working directory
- `timeout` - Connection timeout (1-3600 seconds, default: 60)
- `disabled` - Temporarily disable server
- `alwaysAllow` - Auto-approve specific tools
- `disabledTools` - Disable specific tools
- `watchPaths` - Auto-restart on file changes

**Example:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"],
      "timeout": 60
    }
  }
}
```

### 2. SSE Servers (Server-Sent Events)
For remote MCP servers using HTTP streaming (legacy transport).

**Required fields:**
- `type` - Must be "sse"
- `url` - HTTP/HTTPS endpoint

**Optional fields:**
- `headers` - Custom HTTP headers (e.g., Authorization)
- `timeout`, `disabled`, `alwaysAllow`, `disabledTools`, `watchPaths`

**Example:**
```json
{
  "mcpServers": {
    "weather-api": {
      "type": "sse",
      "url": "https://api.weather.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### 3. Streamable-HTTP Servers (Recommended)
For remote MCP servers using HTTP with streaming support.

**Required fields:**
- `type` - Must be "streamable-http"
- `url` - HTTP/HTTPS endpoint

**Optional fields:**
- `headers` - Custom HTTP headers
- `timeout`, `disabled`, `alwaysAllow`, `disabledTools`, `watchPaths`

**Example:**
```json
{
  "mcpServers": {
    "custom-server": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "timeout": 45
    }
  }
}
```

## Validation Rules

### Field Mixing Prevention
- **Stdio servers** cannot have `url` or `headers`
- **URL-based servers** (sse/streamable-http) cannot have `command`, `args`, `env`, or `cwd`

### Value Constraints
- `timeout`: 1-3600 seconds (1 second to 1 hour)
- `url`: Must be valid HTTP/HTTPS URL (ftp:// not allowed)
- `command`: Cannot be empty string
- `type`: Must be "stdio", "sse", or "streamable-http"

## Schema Generation

The schema is generated from the runtime Zod validation in [`McpHub.ts`](../services/mcp/McpHub.ts) to ensure consistency.

**To regenerate the schema:**
```bash
cd src
pnpm generate:mcp-schema
```

**To test the schema:**
```bash
cd src
npx tsx ../scripts/test-mcp-schema.ts
```

## Files

- `mcp-config.schema.json` - The JSON Schema file
- `../scripts/generate-mcp-schema.ts` - Schema generator script
- `../scripts/test-mcp-schema.ts` - Comprehensive test suite (25 tests)

## VS Code Integration

The schema is automatically registered in `package.json` for these file patterns:
- `**/mcp_settings.json` (global settings)
- `**/.bob/mcp.json` (project-level settings)

No additional configuration needed - validation and IntelliSense work automatically!

## Troubleshooting

**Schema not working?**
1. Ensure the file matches one of the registered patterns
2. Reload VS Code window (Cmd/Ctrl + Shift + P → "Reload Window")
3. Check that the schema file exists at `src/schemas/mcp-config.schema.json`

**Need to add a new field?**
1. Update the Zod schema in [`McpHub.ts`](../services/mcp/McpHub.ts)
2. Update the generator in [`generate-mcp-schema.ts`](../scripts/generate-mcp-schema.ts)
3. Regenerate: `pnpm generate:mcp-schema`
4. Add tests in [`test-mcp-schema.ts`](../scripts/test-mcp-schema.ts)
5. Run tests: `npx tsx ../scripts/test-mcp-schema.ts`

## References

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [JSON Schema Draft 7 Specification](https://json-schema.org/draft-07/json-schema-release-notes.html)
- [Implementation Plan](../../docs/plans/mcp-json-schema-validation.md)