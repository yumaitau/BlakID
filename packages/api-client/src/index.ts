export type BlakIDClientOptions = {
  baseUrl: string;
  token?: string;
};

export class BlakIDClient {
  constructor(private readonly options: BlakIDClientOptions) {}

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (this.options.token) headers.set("Authorization", `Bearer ${this.options.token}`);
    const response = await fetch(`${this.options.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  health() {
    return this.req<{ status: string }>("/api/health");
  }
  ready() {
    return this.req<{ status: string }>("/api/ready");
  }
  organisations() {
    return this.req<unknown[]>("/api/v1/organisations");
  }
  users(organisationId: string) {
    return this.req<unknown[]>(`/api/v1/users?organisationId=${encodeURIComponent(organisationId)}`);
  }
}
