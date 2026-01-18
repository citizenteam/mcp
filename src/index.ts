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
import { CitizenAPIClient } from './api/client.js';
import { createTarGz } from './utils/tar.js';
import { readFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DeviceAuthConfig, App, DeploymentRun } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CitizenMCPServer {
  private server: Server;
  private authFlow: DeviceAuthFlow;
  private apiClient: CitizenAPIClient | null = null;
  private config: DeviceAuthConfig | null = null;

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

    this.authFlow = new DeviceAuthFlow();
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
    ];
  }

  private async ensureAuth(): Promise<void> {
    if (!this.config) {
      this.config = await this.authFlow.loadConfig();
      if (!this.config) {
        throw new Error('Not authenticated. Please run the "authenticate" tool first.');
      }
      this.apiClient = new CitizenAPIClient(this.config);
    }
  }

  private async handleToolCall(name: string, args: any): Promise<any> {
    try {
      switch (name) {
        case 'authenticate':
          return await this.handleAuthenticate();

        case 'check_auth_status':
          return await this.handleCheckAuthStatus();

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

  private async handleAuthenticate() {
    this.config = await this.authFlow.authenticate();
    this.apiClient = new CitizenAPIClient(this.config);

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

  private async handleListApps() {
    const apps = await this.apiClient!.get<any>('/api/v1/citizen/apps');

    // API returns string array like ["app1", "app2"] or object array
    const appsList = Array.isArray(apps) ? apps : [];

    return {
      content: [
        {
          type: 'text',
          text: appsList.length === 0
            ? 'No apps found. You may not have permission to view any apps.'
            : `Found ${appsList.length} app(s):\n\n` +
              appsList.map((app: any) => {
                // Handle both string array and object array
                if (typeof app === 'string') {
                  return `• ${app}`;
                }
                return `• ${app.app_name || app.name || 'unnamed'} - ${app.status || 'unknown'}`;
              }).join('\n'),
        },
      ],
    };
  }

  private async handleGetAppInfo(appName: string) {
    const info = await this.apiClient!.get(`/api/v1/citizen/apps/${appName}`);

    return {
      content: [
        {
          type: 'text',
          text: `App: ${appName}\n` +
                JSON.stringify(info, null, 2),
        },
      ],
    };
  }

  private async handleDeployFromGit(args: any) {
    const result = await this.apiClient!.post(
      `/api/v1/citizen/apps/${args.app_name}/deploy`,
      {
        git_url: args.git_url,
        git_branch: args.git_branch || 'main',
        builder: args.builder || 'auto',
      }
    ) as any;

    return {
      content: [
        {
          type: 'text',
          text: `✅ Deployment started\n` +
                `Run ID: ${result.run_id}\n` +
                `Status: ${result.status}\n` +
                `Source: ${args.git_url}@${args.git_branch || 'main'}\n\n` +
                `Use "get_deployment_status" to track progress.`,
        },
      ],
    };
  }

  private async handleDeployFromLocal(args: any) {
    // 1. Create tar.gz
    const tarPath = await createTarGz(args.directory_path);

    try {
      // 2. Upload
      const fileBuffer = readFileSync(tarPath);
      const filename = `${args.app_name}-${Date.now()}.tar.gz`;

      const uploadResult = await this.apiClient!.uploadFile(
        `/api/v1/citizen/apps/${args.app_name}/upload`,
        fileBuffer,
        filename
      ) as any;

      // 3. Deploy
      const deployResult = await this.apiClient!.post(
        `/api/v1/citizen/apps/${args.app_name}/deploy-local`,
        {
          filename: uploadResult.filename,
          builder: args.builder || 'auto',
        }
      ) as any;

      return {
        content: [
          {
            type: 'text',
            text: `✅ Local deployment started\n` +
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

  private async handleGetDeploymentStatus(runId: string) {
    const run = await this.apiClient!.get<DeploymentRun>(`/api/v1/citizen/runs/${runId}`);

    const stepsText = run.steps
      ? run.steps.map((step: any) => `  ${step.name}: ${step.status}`).join('\n')
      : 'No steps available';

    return {
      content: [
        {
          type: 'text',
          text: `Deployment Run: ${run.run_id}\n` +
                `App: ${run.app_name}\n` +
                `Status: ${run.status}\n` +
                `Source: ${run.source}\n\n` +
                `Steps:\n${stepsText}`,
        },
      ],
    };
  }

  private async handleListDeploymentRuns(appName: string) {
    const runs = await this.apiClient!.get<DeploymentRun[]>(
      `/api/v1/citizen/apps/${appName}/runs`
    );

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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Citizen MCP server running on stdio');
  }
}

const server = new CitizenMCPServer();
server.run().catch(console.error);
