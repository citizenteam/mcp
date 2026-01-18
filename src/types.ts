// Core types for Citizen MCP package

export interface DeviceAuthConfig {
  access_token: string;
  token_type: string;
  expires_at: number;
  user: {
    id: string;
    email: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    role: string;
  };
}

export interface App {
  name: string;
  status: string;
  url?: string;
  port?: number;
  builder?: string;
}

export interface DeploymentRun {
  run_id: string;
  app_name: string;
  status: string;
  source: string;
  created_at: string;
  steps: DeploymentStep[];
}

export interface DeploymentStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  logs?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

// Server from CitizenAuth API
export interface CitizenServer {
  id: string;
  slug: string;
  domain: string;
  organization_id: string;
  created_at: string;
}

// App with server info for deployment
export interface AppWithServer {
  app_name: string;
  status?: string;
  server_url: string;
  server_slug: string;
}
