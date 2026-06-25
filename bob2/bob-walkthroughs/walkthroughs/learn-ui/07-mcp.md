
# Using MCP in Bob

An MCP (Model Context Protocol) server acts as a bridge, giving Bob access to a wider range of **tools** and external services like databases, APIs, or custom scripts. It uses a standard communication method, allowing Bob to leverage these external capabilities.


Model Context Protocol (MCP) extends Bob's capabilities by connecting to external tools and services. This guide covers everything you need to know about using MCP with Bob.

## Configuring MCP Servers

MCP server configurations can be managed at two levels:

1.  **Global Configuration**: Stored in the `mcp_settings.json` file, accessible via VS Code settings. These settings apply across all your workspaces unless overridden by a project-level configuration.
2.  **Project-level Configuration**: Defined in a `.Bob/mcp.json` file within your project's Bobt directory. This allows you to set up project-specific servers and share configurations with your team by committing the file to version control. Bob automatically detects and loads this file if it exists.

**Precedence**: If a server name exists in both global and project configurations, the **project-level configuration takes precedence**.

### Editing MCP Settings Files

You can edit both global and project-level MCP configuration files directly from the Bob MCP settings view:

1. Click the server icon in the top navigation of the Bob pane.
2. Scroll to the bottom of the MCP settings view.
3. Click the appropriate button:
    *   **`Edit Global MCP`**: Opens the global `mcp_settings.json` file.
    *   **`Edit Project MCP`**: Opens the project-specific `.Bob/mcp.json` file. If this file doesn't exist, Bob will create it for you.

Both files use a JSON format with a `mcpServers` object containing named server configurations:

  ```json
  {
    "mcpServers": {
      "server1": {
        "command": "python",
        "args": ["/path/to/server.py"],
        "env": {
          "API_KEY": "your_api_key"
        },
        "alwaysAllow": ["tool1", "tool2"],
        "disabled": false
      }
    }
  }
  ```
  
  *Example of MCP Server config in Bob (STDIO Transport)*
  
### Understanding Transport Types

MCP supports two transport types for server communication:

#### STDIO Transport

Used for local servers running on your machine:

* Communicates via standard input/output streams
* Lower latency (no network overhead)
* Better security (no network exposure)
* Simpler setup (no HTTP server needed)
* Runs as a child process on your machine

STDIO configuration parameters:

*   `command` (required): The executable to run (e.g., `node`, `python`, `npx`, or an absolute path).
*   `args` (optional): An array of string arguments to pass to the command.
*   `cwd` (optional): The working directory from which to launch the server process. If omitted, defaults to the first workspace folder path or the main process's working directory. Useful if the server script relies on relative paths.
*   `env` (optional): An object containing environment variables to set for the server process.
*   `alwaysAllow` (optional): An array of tool names from this server to automatically approve.
*   `disabled` (optional): Set to `true` to disable this server configuration.

STDIO configuration example:
```json
{
 "mcpServers": {
   "local-server": {
     "command": "node",
     "args": ["server.js"],
     "cwd": "/path/to/project/Bobt", // Optional: Specify working directory
     "env": {
       "API_KEY": "your_api_key"
     },
     "alwaysAllow": ["tool1", "tool2"],
     "disabled": false
   }
 }
}
```

#### SSE Transport

Used for remote servers accessed over HTTP/HTTPS:

* Communicates via Server-Sent Events protocol
* Can be hosted on a different machine
* Supports multiple client connections
* Requires network access
* Allows centralized deployment and management

SSE configuration parameters:

*   `url` (required): The full URL endpoint of the remote MCP server (e.g., `https://your-server.com/mcp`).
*   `headers` (optional): An object containing custom HTTP headers to send with requests (e.g., for authentication tokens).
*   `alwaysAllow` (optional): An array of tool names from this server to automatically approve.
*   `disabled` (optional): Set to `true` to disable this server configuration.

SSE configuration example:
```json
{
 "mcpServers": {
   "remote-server": {
     "url": "https://your-server-url.com/mcp",
     "headers": {
       "Authorization": "Bearer your-token" // Example: Authentication header
     },
     "alwaysAllow": ["tool3"],
     "disabled": false
   }
 }
}
```

## Enabling or Disabling MCP Servers

Disabling your MCP Servers here will remove all MCP related logic and definitions from your system prompt, reducing your token usage. This will prevent Bob from connecting to any MCP servers, and the `use_mcp_tool` and `access_mcp_resource` tools will not be available. Check this off if you don't intend to use MCP Servers. This is on by default.

1. Click the server icon in the top navigation of the Bob pane
2. Check/Uncheck `Enable MCP Servers` 

  <!--
 src="/img/using-mcp-in-Bob/using-mcp-in-Bob-2.png" alt="Enable MCP Servers toggle" width="400" />
-->