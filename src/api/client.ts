import { DeviceAuthConfig } from '../types.js';

export class CitizenAPIClient {
  private baseUrl: string;
  private config: DeviceAuthConfig;

  constructor(config: DeviceAuthConfig, baseUrl?: string) {
    this.config = config;
    this.baseUrl = baseUrl || process.env.CITIZEN_API_URL || 'https://jolly-yonder.amber-ridge.app.selmangunes.com';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
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
    const response = await fetch(`${this.baseUrl}${path}`, {
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

    const response = await fetch(`${this.baseUrl}${path}`, {
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
