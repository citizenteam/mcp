import { DeviceAuthConfig } from '../types.js';

interface ApiResponse<T = any> {
  data?: T;
  [key: string]: any;
}

export class CitizenAPIClient {
  private baseUrl: string;
  private config: DeviceAuthConfig;
  private serverUrl: string | null = null;

  constructor(config: DeviceAuthConfig, baseUrl?: string) {
    this.config = config;
    // Default to CitizenAuth URL, will be updated after first server discovery
    this.baseUrl = baseUrl || process.env.CITIZEN_API_URL || '';
  }

  // Set the server URL dynamically (called after server discovery)
  setServerUrl(url: string) {
    this.serverUrl = url;
  }

  getServerUrl(): string | null {
    return this.serverUrl;
  }

  // Get base URL for Citizen API calls
  private getCitizenBaseUrl(): string {
    if (this.serverUrl) {
      return this.serverUrl;
    }
    if (this.baseUrl) {
      return this.baseUrl;
    }
    throw new Error('No Citizen server URL configured. Please run list_apps first to discover server.');
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.getCitizenBaseUrl()}${path}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} ${error}`);
    }

    const data = await response.json() as any;
    return data.data || data;
  }

  async post<T>(path: string, body: any): Promise<T> {
    const response = await fetch(`${this.getCitizenBaseUrl()}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} ${error}`);
    }

    const data = await response.json() as any;
    return data.data || data;
  }

  async uploadFile(path: string, file: Buffer, filename: string): Promise<any> {
    // Use native FormData with Blob for Node.js 18+ compatibility
    const formData = new FormData();
    const blob = new Blob([file], { type: 'application/gzip' });
    formData.append('file', blob, filename);

    const response = await fetch(`${this.getCitizenBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.access_token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`File upload failed: ${response.status} ${error}`);
    }

    const data = await response.json() as any;
    return data.data || data;
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} ${error}`);
    }

    const data = await response.json() as any;
    return data.data || data;
  }
}
