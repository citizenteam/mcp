import { DeviceAuthConfig } from '../types.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';

export class DeviceAuthFlow {
  private apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.CITIZENAUTH_URL || 'https://ustun.tech';
  }

  async authenticate(): Promise<DeviceAuthConfig> {
    // 1. Initialize device flow
    const initResponse = await fetch(`${this.apiUrl}/api/v1/auth/device/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_name: 'Claude Desktop MCP',
        client_type: 'mcp_server',
      }),
    });

    if (!initResponse.ok) {
      throw new Error(`Device init failed: ${initResponse.statusText}`);
    }

    const initData = await initResponse.json() as any;
    const { device_code, user_code, interval } = initData.data;
    
    // Fix verification URL if it's pointing to localhost
    let verification_url_complete = initData.data.verification_url_complete;
    if (verification_url_complete.includes('localhost')) {
      verification_url_complete = `${this.apiUrl}/device/verify?user_code=${user_code}`;
    }

    // 2. Display authorization URL and open browser
    console.error('\n🔐 DEVICE AUTHORIZATION REQUIRED\n');
    console.error(`Visit: ${verification_url_complete}\n`);
    console.error(`Or enter code: ${user_code}\n`);
    console.error('Opening browser...\n');

    // Open browser automatically
    this.openBrowser(verification_url_complete);
    
    console.error('Waiting for authorization...\n');

    // 3. Poll for authorization
    let attempts = 0;
    const maxAttempts = 180; // 15 minutes

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));

      const statusResponse = await fetch(
        `${this.apiUrl}/api/v1/auth/device/status?device_code=${device_code}`
      );

      if (!statusResponse.ok) {
        throw new Error('Failed to check authorization status');
      }

      const statusData = await statusResponse.json() as any;

      if (statusData.data.status === 'authorized') {
        console.error('✅ Authorized!\n');
        break;
      } else if (statusData.data.status === 'expired') {
        throw new Error('Authorization expired. Please try again.');
      } else if (statusData.data.status === 'denied') {
        throw new Error('Authorization denied by user.');
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error('Authorization timeout');
    }

    // 4. Exchange device code for access token
    const tokenResponse = await fetch(`${this.apiUrl}/api/v1/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as any;

    const config: DeviceAuthConfig = {
      access_token: tokenData.data.access_token,
      token_type: tokenData.data.token_type,
      expires_at: Date.now() + (tokenData.data.expires_in * 1000),
      user: tokenData.data.user,
      organization: tokenData.data.organization,
    };

    // 5. Save to ~/.citizen/mcp-config.json
    await this.saveConfig(config);

    console.error(`✅ Authenticated as: ${config.user.name}`);
    console.error(`   Organization: ${config.organization.name} (${config.organization.role})\n`);

    return config;
  }

  async loadConfig(): Promise<DeviceAuthConfig | null> {
    const configPath = this.getConfigPath();

    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const data = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data) as DeviceAuthConfig;

      // Check expiration
      if (Date.now() > config.expires_at) {
        console.error('⚠️  Device token expired. Please re-authenticate.\n');
        return null;
      }

      return config;
    } catch (error) {
      console.error('Failed to load config:', error);
      return null;
    }
  }

  async saveConfig(config: DeviceAuthConfig): Promise<void> {
    const configPath = this.getConfigPath();
    const configDir = join(homedir(), '.citizen');

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  }

  async ensureAuthenticated(): Promise<DeviceAuthConfig> {
    let config = await this.loadConfig();

    if (!config) {
      config = await this.authenticate();
    }

    return config;
  }

  private getConfigPath(): string {
    return join(homedir(), '.citizen', 'mcp-config.json');
  }

  private openBrowser(url: string): void {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      // Linux
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      if (error) {
        console.error(`Could not open browser automatically: ${error.message}`);
        console.error(`Please manually visit: ${url}`);
      }
    });
  }
}
