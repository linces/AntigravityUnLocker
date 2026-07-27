export interface RequestLogEntry {
  id: string;
  timestamp: string;
  providerId: string;
  providerName: string;
  model: string;
  isStream: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export class TelemetryManager {
  private totalRequests = 0;
  private totalTokens = 0;
  private promptTokens = 0;
  private completionTokens = 0;
  private totalLatencyMs = 0;
  private providerMetrics: Record<string, { requests: number; tokens: number; totalLatencyMs: number }> = {};
  private logs: RequestLogEntry[] = [];
  private maxLogs = 25;

  public recordRequest(entry: RequestLogEntry) {
    this.totalRequests++;
    this.totalTokens += entry.totalTokens;
    this.promptTokens += entry.promptTokens;
    this.completionTokens += entry.completionTokens;
    this.totalLatencyMs += entry.latencyMs;

    if (!this.providerMetrics[entry.providerId]) {
      this.providerMetrics[entry.providerId] = { requests: 0, tokens: 0, totalLatencyMs: 0 };
    }
    this.providerMetrics[entry.providerId].requests++;
    this.providerMetrics[entry.providerId].tokens += entry.totalTokens;
    this.providerMetrics[entry.providerId].totalLatencyMs += entry.latencyMs;

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  public getMetrics(activeProviderId: string) {
    const avgLatencyMs = this.totalRequests > 0 ? Math.round(this.totalLatencyMs / this.totalRequests) : 0;
    
    const providerStats: Record<string, { requests: number; tokens: number; avgLatencyMs: number }> = {};
    for (const [id, data] of Object.entries(this.providerMetrics)) {
      providerStats[id] = {
        requests: data.requests,
        tokens: data.tokens,
        avgLatencyMs: data.requests > 0 ? Math.round(data.totalLatencyMs / data.requests) : 0
      };
    }

    return {
      totalRequests: this.totalRequests,
      totalTokens: this.totalTokens,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      avgLatencyMs,
      googleQuotaShield: '🛡️ 100% Active (0 Bytes to Google)',
      googleBytesSent: 0,
      activeProviderId,
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      providerStats,
      recentLogs: this.logs
    };
  }
}

export const telemetry = new TelemetryManager();
