# Citizen Deployment MCP Server

[![npm version](https://badge.fury.io/js/@citizenteam%2Fmcp.svg)](https://www.npmjs.com/package/@citizenteam/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Model Context Protocol (MCP) server for deploying applications to [Citizen platform](https://citizen.ustun.tech). Deploy from git or local files with intelligent error handling and automatic fixes.

**Works with:**
- ✅ Claude Desktop
- ✅ Claude Code (VS Code Extension)
- ✅ Cursor
- ✅ VS Code with MCP extension

## Installation

```bash
npm install -g @citizenteam/mcp
# or
bun install -g @citizenteam/mcp
```

## Quick Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "citizen": {
      "command": "npx",
      "args": ["-y", "@citizenteam/mcp"]
    }
  }
}
```

**Config file location:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Claude Code (VS Code Extension)

1. Open VS Code settings (Cmd/Ctrl + ,)
2. Search for "MCP Servers"
3. Click "Edit in settings.json"
4. Add:

```json
{
  "claude.mcpServers": {
    "citizen": {
      "command": "npx",
      "args": ["-y", "@citizenteam/mcp"]
    }
  }
}
```

### Cursor

1. Open Cursor Settings → Features → MCP
2. Click "Add MCP Server"
3. Enter configuration:

```json
{
  "citizen": {
    "command": "npx",
    "args": ["-y", "@citizenteam/mcp"]
  }
}
```

Or manually edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "citizen": {
      "command": "npx",
      "args": ["-y", "@citizenteam/mcp"]
    }
  }
}
```

### VS Code (with MCP extension)

1. Install [MCP extension for VS Code](https://marketplace.visualstudio.com/items?itemName=mcp.vscode-mcp)
2. Open settings.json (Cmd/Ctrl + Shift + P → "Preferences: Open Settings (JSON)")
3. Add:

```json
{
  "mcp.servers": {
    "citizen": {
      "command": "npx",
      "args": ["-y", "@citizenteam/mcp"]
    }
  }
}
```

## First Time Setup

1. Restart your IDE/Claude Desktop after adding the configuration
2. Use the `authenticate` tool to login with device flow
3. Follow the device authorization link in your browser
4. Once authorized, you can deploy apps!

## Available Tools

### Authentication
- `authenticate` - Login with device flow
- `check_auth_status` - Check auth status

### App Management
- `list_apps` - List your apps (RBAC filtered)
- `get_app_info` - Get app details

### Deployment
- `deploy_from_git` - Deploy from git repository
- `deploy_from_local` - Deploy from local directory
- `get_deployment_status` - Check deployment status and logs
- `list_deployment_runs` - List recent deployments

## Available Resources

### Deployment Instructions (`citizen://instructions`)
A comprehensive guide that helps LLMs understand:
- Complete deployment workflows (git and local)
- Error handling and debugging strategies
- How to fix common build errors (Python version, Node version, port binding, etc.)
- Best practices for monitoring deployments
- RBAC permission model
- Common nixpacks configurations
- Example conversations and use cases

Your AI assistant will automatically read this resource to understand how to properly use the deployment tools, monitor builds, and fix errors when they occur.

## Example Usage

### Basic Deployment
```
You: Deploy my app from github.com/user/repo.git

AI will:
1. Read the deployment instructions to understand the workflow
2. Check if you're authenticated
3. List your apps to see what's available
4. Deploy using deploy_from_git tool
5. Monitor the deployment with get_deployment_status
6. If errors occur, analyze logs and suggest fixes
```

### Deployment with Error Handling
```
You: Deploy my Flask app from the current directory

AI will:
1. Deploy using deploy_from_local (creates tar.gz automatically)
2. Monitor build progress
3. If build fails (e.g., "Python 3.11 not found"):
   - Read the error from logs
   - Create/update nixpacks.toml with correct Python version
   - Redeploy automatically
4. Continue monitoring until successful
```

### Interactive Debugging
```
You: My last deployment failed, can you help?

AI will:
1. List recent deployment runs
2. Get detailed logs for the failed run
3. Analyze the error (missing dependency, version mismatch, etc.)
4. Suggest and apply fixes
5. Redeploy with corrections
```

## Features

- 🔐 **Secure Device Authentication** - OAuth-like device flow, no passwords needed
- 🚀 **Git & Local Deployment** - Deploy from GitHub or local files
- 🤖 **Intelligent Error Fixing** - AI analyzes logs and fixes build errors automatically
- 📊 **Real-time Monitoring** - Live deployment logs and status updates
- 🔒 **RBAC Support** - Role-based access control (viewer, member, admin, owner)
- 🏗️ **Auto-detect Builders** - Supports nixpacks and Dockerfile
- 🔄 **Fast Iteration** - Local deployment for quick fixes without git commits

## Requirements

- Node.js 18+ or Bun
- Citizen platform account ([sign up](https://citizen.ustun.tech))
- One of: Claude Desktop, Claude Code, Cursor, or VS Code with MCP extension

## Troubleshooting

### Authentication Issues
- Make sure you've run the `authenticate` tool
- Check if your token has expired with `check_auth_status`
- Verify you're using the correct organization

### Deployment Failures
- The AI will automatically analyze logs and suggest fixes
- Common issues: Python/Node version mismatches, missing dependencies, port binding
- Use `deploy_from_local` for faster iteration when fixing errors

### Permission Denied
- Check your role with `list_apps` - you may not have access to that app
- Contact your organization admin to grant you member+ role

## Links

- [NPM Package](https://www.npmjs.com/package/@citizenteam/mcp)
- [Citizen Platform](https://citizen.ustun.tech)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Report Issues](https://github.com/citizenteam/deployment-mcp/issues)

## License

MIT © Citizen Team
