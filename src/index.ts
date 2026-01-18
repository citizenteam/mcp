#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { DeviceAuthFlow } from './auth/device-flow.js';
import { createTarGz } from './utils/tar.js';
import { readFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DeviceAuthConfig, CitizenServer, AppWithServer } from './types.js';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CitizenMCPServer {
  private server: Server;
  private authFlow: DeviceAuthFlow;
  private config: DeviceAuthConfig | null = null;

  // Server discovery cache
  private servers: CitizenServer[] = [];
  private appServerMap: Map<string, AppWithServer> = new Map(); // app_name -> server info
  private runServerMap: Map<string, string> = new Map(); // run_id -> server_url (for tracking deployments)
  private citizenAuthUrl: string;

  constructor() {
    this.server = new Server(
      {
        name: 'citizen-deployment-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.citizenAuthUrl = process.env.CITIZENAUTH_URL || 'https://ustun.tech';
    this.authFlow = new DeviceAuthFlow(this.citizenAuthUrl);
    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.handleToolCall(request.params.name, request.params.arguments || {})
    );

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'citizen://instructions',
          name: 'Deployment Instructions',
          description: 'Complete guide for deploying applications to Citizen platform, including error handling, best practices, and example workflows',
          mimeType: 'application/json',
        },
      ],
    }));

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'citizen://instructions') {
        const instructionsPath = join(__dirname, '..', 'instructions.json');
        const instructions = readFileSync(instructionsPath, 'utf-8');
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'application/json',
              text: instructions,
            },
          ],
        };
      }
      throw new Error(`Unknown resource: ${request.params.uri}`);
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'get_instructions',
        description: 'CRITICAL: Call this FIRST before ANY deployment operation. Returns deployment instructions including polling intervals, error handling guides, and best practices. You MUST read and follow these instructions before calling deploy_from_git, deploy_from_local, or get_deployment_status.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'authenticate',
        description: 'Authenticate with Citizen platform using device flow. ALWAYS call this first if check_auth_status shows not authenticated. Opens browser for user authorization.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'check_auth_status',
        description: 'Check current authentication status. Call this at the start of any deployment workflow to ensure you are authenticated.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_servers',
        description: 'List all Citizen servers in your organization. This discovers available deployment targets. Call this before list_apps to see which servers are available.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_apps',
        description: 'List all applications you have access to (RBAC filtered). ALWAYS call this before deploying to understand which apps exist and which you have permission to deploy.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_app_info',
        description: 'Get detailed information about a specific app including current deployment status and configuration.',
        inputSchema: {
          type: 'object',
          properties: {
            app_name: {
              type: 'string',
              description: 'Application name',
            },
          },
          required: ['app_name'],
        },
      },
      {
        name: 'deploy_from_git',
        description: 'Deploy application from git repository (requires member+ role). Use when user provides a git URL. After deployment starts, ALWAYS monitor with get_deployment_status until completion. If build fails, read logs to understand error and fix accordingly.',
        inputSchema: {
          type: 'object',
          properties: {
            app_name: {
              type: 'string',
              description: 'Application name (must be one of the apps from list_apps)',
            },
            git_url: {
              type: 'string',
              description: 'Git repository URL (e.g., https://github.com/user/repo.git)',
            },
            git_branch: {
              type: 'string',
              description: 'Git branch (default: main)',
            },
            builder: {
              type: 'string',
              enum: ['auto', 'nixpacks', 'dockerfile'],
              description: 'Build system - use "auto" unless specific builder needed. "dockerfile" requires Dockerfile in repo. (default: auto)',
            },
          },
          required: ['app_name', 'git_url'],
        },
      },
      {
        name: 'deploy_from_local',
        description: 'Deploy from local directory. Automatically creates tar.gz, uploads, and deploys. Use this when deploying current directory, local files, or when iterating on fixes. ALWAYS monitor with get_deployment_status after calling. If build fails, analyze logs, fix files locally, and redeploy.',
        inputSchema: {
          type: 'object',
          properties: {
            app_name: {
              type: 'string',
              description: 'Application name',
            },
            directory_path: {
              type: 'string',
              description: 'Absolute path to local directory (use "." for current directory)',
            },
            builder: {
              type: 'string',
              enum: ['auto', 'nixpacks', 'dockerfile'],
              description: 'Build system - use "auto" for automatic detection (default: auto)',
            },
          },
          required: ['app_name', 'directory_path'],
        },
      },
      {
        name: 'get_deployment_status',
        description: 'Get deployment run status and detailed logs. CRITICAL: After starting any deployment, poll this every 5-10 seconds until status is "completed" or "failed". If failed, carefully read ALL logs to identify the error (missing dependencies, version mismatches, port binding issues, etc.) and suggest fixes.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: {
              type: 'string',
              description: 'Deployment run ID (returned from deploy_from_git or deploy_from_local)',
            },
          },
          required: ['run_id'],
        },
      },
      {
        name: 'list_deployment_runs',
        description: 'List recent deployment runs for an app with their status. Useful for debugging when user mentions "my last deployment failed".',
        inputSchema: {
          type: 'object',
          properties: {
            app_name: {
              type: 'string',
              description: 'Application name',
            },
          },
          required: ['app_name'],
        },
      },
      {
        name: 'open_app_url',
        description: 'Open app URL in system browser (not Cursor browser). Use this after successful deployment to verify the app is working. Opens the default browser just like device authentication flow.',
        inputSchema: {
          type: 'object',
          properties: {
            app_name: {
              type: 'string',
              description: 'Application name to open in browser',
            },
          },
          required: ['app_name'],
        },
      },
    ];
  }

  private async ensureAuth(): Promise<void> {
    if (!this.config) {
      this.config = await this.authFlow.loadConfig();
      if (!this.config) {
        throw new Error('Not authenticated. Please run the "authenticate" tool first.');
      }
    }
  }

  private async handleToolCall(name: string, args: any): Promise<any> {
    try {
      switch (name) {
        case 'get_instructions':
          return await this.handleGetInstructions();

        case 'authenticate':
          return await this.handleAuthenticate();

        case 'check_auth_status':
          return await this.handleCheckAuthStatus();

        case 'list_servers':
          await this.ensureAuth();
          return await this.handleListServers();

        case 'list_apps':
          await this.ensureAuth();
          return await this.handleListApps();

        case 'get_app_info':
          await this.ensureAuth();
          return await this.handleGetAppInfo(args.app_name);

        case 'deploy_from_git':
          await this.ensureAuth();
          return await this.handleDeployFromGit(args);

        case 'deploy_from_local':
          await this.ensureAuth();
          return await this.handleDeployFromLocal(args);

        case 'get_deployment_status':
          await this.ensureAuth();
          return await this.handleGetDeploymentStatus(args.run_id);

        case 'list_deployment_runs':
          await this.ensureAuth();
          return await this.handleListDeploymentRuns(args.app_name);

        case 'open_app_url':
          await this.ensureAuth();
          return await this.handleOpenAppUrl(args.app_name);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetInstructions() {
    const instructionsPath = join(__dirname, '..', 'instructions.json');
    const instructions = readFileSync(instructionsPath, 'utf-8');

    return {
      content: [
        {
          type: 'text',
          text: instructions,
        },
      ],
    };
  }

  private async handleAuthenticate() {
    this.config = await this.authFlow.authenticate();

    // Clear cached server/app data on new authentication
    this.servers = [];
    this.appServerMap.clear();
    this.runServerMap.clear();

    return {
      content: [
        {
          type: 'text',
          text: `✅ Successfully authenticated as ${this.config.user.name}\n` +
                `Organization: ${this.config.organization.name}\n` +
                `Role: ${this.config.organization.role}`,
        },
      ],
    };
  }

  private async handleCheckAuthStatus() {
    this.config = await this.authFlow.loadConfig();

    if (!this.config) {
      return {
        content: [
          {
            type: 'text',
            text: 'Not authenticated. Use the "authenticate" tool to login.',
          },
        ],
      };
    }

    const expiresIn = Math.floor((this.config.expires_at - Date.now()) / 1000 / 60 / 60 / 24);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Authenticated as ${this.config.user.name}\n` +
                `Organization: ${this.config.organization.name}\n` +
                `Role: ${this.config.organization.role}\n` +
                `Token expires in: ${expiresIn} days`,
        },
      ],
    };
  }

  // Fetch servers from CitizenAuth
  private async fetchServers(): Promise<CitizenServer[]> {
    const orgId = this.config!.organization.id;
    const response = await fetch(
      `${this.citizenAuthUrl}/api/v1/servers?org_id=${orgId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config!.access_token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch servers: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.data || [];
  }

  private async handleListServers() {
    this.servers = await this.fetchServers();

    if (this.servers.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No Citizen servers found in your organization.',
          },
        ],
      };
    }

    const serverList = this.servers.map(s =>
      `• ${s.slug} (${s.domain})`
    ).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${this.servers.length} server(s):\n\n${serverList}\n\nUse list_apps to see apps across all servers.`,
        },
      ],
    };
  }

  private async handleListApps() {
    // First, discover servers if not already done
    if (this.servers.length === 0) {
      this.servers = await this.fetchServers();
    }

    if (this.servers.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No Citizen servers found. Please ensure your organization has at least one server configured.',
          },
        ],
      };
    }

    // Clear previous app-server mapping
    this.appServerMap.clear();

    // Fetch apps from each server
    const allApps: { serverSlug: string; serverUrl: string; apps: string[] }[] = [];

    for (const server of this.servers) {
      const serverUrl = `https://${server.domain}`;

      try {
        const response = await fetch(`${serverUrl}/api/v1/citizen/apps`, {
          headers: {
            'Authorization': `Bearer ${this.config!.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json() as any;
          const apps = data.data || data || [];
          const appsList = Array.isArray(apps) ? apps : [];

          // Map each app to its server
          for (const app of appsList) {
            const appName = typeof app === 'string' ? app : (app.app_name || app.name);
            if (appName) {
              this.appServerMap.set(appName, {
                app_name: appName,
                status: typeof app === 'object' ? app.status : undefined,
                server_url: serverUrl,
                server_slug: server.slug,
              });
            }
          }

          allApps.push({
            serverSlug: server.slug,
            serverUrl,
            apps: appsList.map((a: any) => typeof a === 'string' ? a : (a.app_name || a.name)),
          });
        } else {
          console.error(`Failed to fetch apps from ${server.slug}: ${response.status}`);
        }
      } catch (error: any) {
        console.error(`Error fetching apps from ${server.slug}: ${error.message}`);
      }
    }

    // Build response text
    const totalApps = allApps.reduce((sum, s) => sum + s.apps.length, 0);

    if (totalApps === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No apps found across all servers. You may not have permission to view any apps.',
          },
        ],
      };
    }

    let responseText = `Found ${totalApps} app(s) across ${allApps.length} server(s):\n\n`;

    for (const serverApps of allApps) {
      if (serverApps.apps.length > 0) {
        responseText += `📦 ${serverApps.serverSlug}:\n`;
        for (const app of serverApps.apps) {
          responseText += `  • ${app}\n`;
        }
        responseText += '\n';
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText.trim(),
        },
      ],
    };
  }

  // Get server URL for an app (from cache or by refreshing)
  private async getServerUrlForApp(appName: string): Promise<string> {
    // Check cache first
    let appInfo = this.appServerMap.get(appName);

    // If not cached, refresh the app list
    if (!appInfo) {
      await this.handleListApps();
      appInfo = this.appServerMap.get(appName);
    }

    if (!appInfo) {
      throw new Error(`App '${appName}' not found. Use list_apps to see available apps.`);
    }

    return appInfo.server_url;
  }

  private async handleGetAppInfo(appName: string) {
    const serverUrl = await this.getServerUrlForApp(appName);

    const response = await fetch(`${serverUrl}/api/v1/citizen/apps/${appName}`, {
      headers: {
        'Authorization': `Bearer ${this.config!.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get app info: ${response.status}`);
    }

    const data = await response.json() as any;
    const info = data.data || data;

    const appServerInfo = this.appServerMap.get(appName);

    return {
      content: [
        {
          type: 'text',
          text: `App: ${appName}\n` +
                `Server: ${appServerInfo?.server_slug || 'unknown'}\n` +
                JSON.stringify(info, null, 2),
        },
      ],
    };
  }

  private async handleDeployFromGit(args: any) {
    const serverUrl = await this.getServerUrlForApp(args.app_name);
    const appServerInfo = this.appServerMap.get(args.app_name);

    const response = await fetch(`${serverUrl}/api/v1/citizen/apps/${args.app_name}/deploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config!.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        git_url: args.git_url,
        git_branch: args.git_branch || 'main',
        builder: args.builder || 'auto',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Deployment failed: ${response.status} ${error}`);
    }

    const data = await response.json() as any;
    const result = data.data || data;

    // Cache run_id -> server_url mapping for status tracking
    if (result.run_id) {
      this.runServerMap.set(result.run_id, serverUrl);
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ Deployment started\n` +
                `Server: ${appServerInfo?.server_slug || 'unknown'}\n` +
                `Run ID: ${result.run_id}\n` +
                `Status: ${result.status}\n` +
                `Source: ${args.git_url}@${args.git_branch || 'main'}\n\n` +
                `Use "get_deployment_status" to track progress.`,
        },
      ],
    };
  }

  private async handleDeployFromLocal(args: any) {
    const serverUrl = await this.getServerUrlForApp(args.app_name);
    const appServerInfo = this.appServerMap.get(args.app_name);

    // 1. Create tar.gz
    const tarPath = await createTarGz(args.directory_path);

    try {
      // 2. Upload
      const fileBuffer = readFileSync(tarPath);
      const filename = `${args.app_name}-${Date.now()}.tar.gz`;

      // Use native FormData with Blob for Node.js 18+ compatibility
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: 'application/gzip' });
      formData.append('file', blob, filename);

      const uploadResponse = await fetch(`${serverUrl}/api/v1/citizen/apps/${args.app_name}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config!.access_token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status} ${error}`);
      }

      const uploadData = await uploadResponse.json() as any;
      const uploadResult = uploadData.data || uploadData;

      // 3. Deploy
      const deployResponse = await fetch(`${serverUrl}/api/v1/citizen/apps/${args.app_name}/deploy-local`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config!.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: uploadResult.filename,
          builder: args.builder || 'auto',
        }),
      });

      if (!deployResponse.ok) {
        const error = await deployResponse.text();
        throw new Error(`Deploy failed: ${deployResponse.status} ${error}`);
      }

      const deployData = await deployResponse.json() as any;
      const deployResult = deployData.data || deployData;

      // Cache run_id -> server_url mapping for status tracking
      if (deployResult.run_id) {
        this.runServerMap.set(deployResult.run_id, serverUrl);
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Local deployment started\n` +
                  `Server: ${appServerInfo?.server_slug || 'unknown'}\n` +
                  `File: ${uploadResult.filename}\n` +
                  `Size: ${(uploadResult.size / 1024 / 1024).toFixed(2)} MB\n` +
                  `Run ID: ${deployResult.run_id}\n` +
                  `Status: ${deployResult.status}\n\n` +
                  `Use "get_deployment_status" to track progress.`,
          },
        ],
      };
    } finally {
      // Clean up
      unlinkSync(tarPath);
    }
  }

  // Get server URL for a run_id (from cache or by trying all servers)
  private async getServerUrlForRun(runId: string): Promise<string> {
    // Check cache first
    const cachedUrl = this.runServerMap.get(runId);
    if (cachedUrl) {
      return cachedUrl;
    }

    // If not cached, try each server until we find the run
    if (this.servers.length === 0) {
      this.servers = await this.fetchServers();
    }

    for (const server of this.servers) {
      const serverUrl = `https://${server.domain}`;
      try {
        const response = await fetch(`${serverUrl}/api/v1/citizen/runs/${runId}`, {
          headers: {
            'Authorization': `Bearer ${this.config!.access_token}`,
          },
        });

        if (response.ok) {
          // Found it - cache and return
          this.runServerMap.set(runId, serverUrl);
          return serverUrl;
        }
      } catch (error) {
        // Continue to next server
      }
    }

    throw new Error(`Deployment run '${runId}' not found on any server.`);
  }

  private async handleGetDeploymentStatus(runId: string) {
    const serverUrl = await this.getServerUrlForRun(runId);

    const response = await fetch(`${serverUrl}/api/v1/citizen/runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${this.config!.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get deployment status: ${response.status}`);
    }

    const data = await response.json() as any;
    const run = data.data || data;

    // Debug: log the raw response structure
    console.error('[DEBUG] Run response:', JSON.stringify(run, null, 2));

    // Handle steps - API returns step_name, not name
    let stepsText = 'No steps available';
    if (run.steps && Array.isArray(run.steps) && run.steps.length > 0) {
      stepsText = run.steps.map((step: any) => {
        const stepName = step.step_name || step.name || step.StepName || 'unknown';
        const stepStatus = step.status || step.Status || 'pending';
        return `  ${stepName}: ${stepStatus}`;
      }).join('\n');
    }

    // Get git_url or source
    const source = run.git_url || run.source || run.GitURL || 'local upload';

    return {
      content: [
        {
          type: 'text',
          text: `Deployment Run: ${run.run_id || run.id}\n` +
                `App: ${run.app_name}\n` +
                `Status: ${run.status}\n` +
                `Source: ${source}\n\n` +
                `Steps:\n${stepsText}`,
        },
      ],
    };
  }

  private async handleListDeploymentRuns(appName: string) {
    const serverUrl = await this.getServerUrlForApp(appName);

    const response = await fetch(`${serverUrl}/api/v1/citizen/apps/${appName}/runs`, {
      headers: {
        'Authorization': `Bearer ${this.config!.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list deployment runs: ${response.status}`);
    }

    const data = await response.json() as any;
    const runs = data.data || data || [];

    // Cache run_ids for this app's server
    for (const run of runs) {
      if (run.run_id) {
        this.runServerMap.set(run.run_id, serverUrl);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: runs.length === 0
            ? 'No deployment runs found.'
            : `Recent deployments for ${appName}:\n\n` +
              runs.map((run: any) =>
                `• ${run.run_id} - ${run.status} (${new Date(run.created_at).toLocaleString()})`
              ).join('\n'),
        },
      ],
    };
  }

  private async handleOpenAppUrl(appName: string) {
    const serverUrl = await this.getServerUrlForApp(appName);

    // Get app info to find the URL
    const response = await fetch(`${serverUrl}/api/v1/citizen/apps/${appName}`, {
      headers: {
        'Authorization': `Bearer ${this.config!.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get app info: ${response.status}`);
    }

    const data = await response.json() as any;
    const info = data.data || data;

    // Get the first domain
    const domains = info.domains || [];
    if (domains.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No domain found for app ${appName}. The app may not be deployed yet.`,
          },
        ],
        isError: true,
      };
    }

    const url = `https://${domains[0]}`;

    // Open in system browser (like device authentication)
    await open(url);

    return {
      content: [
        {
          type: 'text',
          text: `🌐 Opened ${url} in system browser.\n\nIf the app requires authentication, you'll be redirected to login first.`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Citizen MCP server running on stdio');
  }
}

const server = new CitizenMCPServer();
server.run().catch(console.error);
