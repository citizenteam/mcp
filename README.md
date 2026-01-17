# Citizen Deployment MCP Server

MCP (Model Context Protocol) server for deploying applications to Citizen platform.

## Installation

```bash
npm install -g @citizenteam/mcp
# or
bun install -g @citizenteam/mcp
```

## Claude Desktop Setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "citizen": {
      "command": "citizen-mcp"
    }
  }
}
```

Config file location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## First Time Setup

1. Restart Claude Desktop after adding the configuration
2. Use the "authenticate" tool to login
3. Follow the device authorization link in your browser
4. Once authorized, you can deploy apps!

## Available Tools

### Authentication
- `authenticate` - Login with device flow
- `check_auth_status` - Check auth status

### App Management
- `list_apps` - List your apps
- `get_app_info` - Get app details

### Deployment
- `deploy_from_git` - Deploy from git repository
- `deploy_from_local` - Deploy from local directory
- `get_deployment_status` - Check deployment status
- `list_deployment_runs` - List recent deployments

## Available Resources

### Deployment Instructions (`citizen://instructions`)
A comprehensive guide that helps LLMs (like Claude) understand:
- Complete deployment workflows (git and local)
- Error handling and debugging strategies
- How to fix common build errors (Python version, Node version, port binding, etc.)
- Best practices for monitoring deployments
- RBAC permission model
- Common nixpacks configurations
- Example conversations and use cases

Claude Desktop will automatically read this resource to understand how to properly use the deployment tools, monitor builds, and fix errors when they occur.

## Example Usage

### Basic Deployment
```
You: Deploy my app from github.com/user/repo.git

Claude will:
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

Claude will:
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

Claude will:
1. List recent deployment runs
2. Get detailed logs for the failed run
3. Analyze the error (missing dependency, version mismatch, etc.)
4. Suggest and apply fixes
5. Redeploy with corrections
```

## Requirements

- Node.js 18+ or Bun
- Citizen platform account
- Claude Desktop

## License

MIT
