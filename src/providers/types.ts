/**
 * AG Universal AI — Core Provider Types & Interfaces
 *
 * Defines the universal contract that all AI provider adapters must implement.
 * Compatible with OpenAI API format as the lingua franca.
 */

// ─── Chat Message Types ─────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

// ─── Request / Response ─────────────────────────────────────────────────────

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: string | object;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  signal?: AbortSignal;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: UsageInfo;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ─── Streaming ──────────────────────────────────────────────────────────────

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: StreamChoice[];
}

export interface StreamChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: string | null;
}

// ─── Provider Configuration ─────────────────────────────────────────────────

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  apiKey?: string;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  maxContextTokens: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  vendor: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

export interface HealthStatus {
  isHealthy: boolean;
  latencyMs?: number;
  error?: string;
  lastChecked: Date;
}

// ─── Provider Interface ─────────────────────────────────────────────────────

export interface ILLMProvider {
  readonly id: string;
  readonly name: string;
  readonly config: ProviderConfig;

  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  stream(request: ChatCompletionRequest, signal?: AbortSignal): AsyncIterable<string>;
  health(): Promise<HealthStatus>;
  capabilities(): ProviderCapabilities;
  listModels?(): Promise<ModelInfo[]>;
  updateModel?(model: string): void;
}

// ─── Telemetry ──────────────────────────────────────────────────────────────

export interface RequestMetric {
  id: string;
  timestamp: string;
  providerId: string;
  model: string;
  isStream: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

// ─── Events ─────────────────────────────────────────────────────────────────

export type ProviderChangeEvent = {
  previousId: string | undefined;
  newId: string;
  provider: ILLMProvider;
};

// ─── Session Management ─────────────────────────────────────────────────────

export interface ChatSessionMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
  timestamp?: number;
  providerId?: string;
  model?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  providerId?: string;
  model?: string;
  messages: ChatSessionMessage[];
}

export interface SessionState {
  activeSessionId: string | undefined;
  sessions: ChatSession[];
}

