import { ChatCompletionRequest, ChatMessage } from '../adapters/base.js';
import { translateConnectToolsToOpenAI } from './toolsTranslation.js';
import { translateConnectPartsToOpenAIContent } from './visionTranslation.js';

export interface ConnectFrame {
  flags: number;
  data: Buffer;
}

/**
 * Decodes ConnectRPC envelope frames (5-byte header: 1 byte flags + 4 bytes big-endian length)
 */
export function decodeConnectEnvelope(buffer: Buffer): ConnectFrame[] {
  const frames: ConnectFrame[] = [];
  let offset = 0;

  while (offset + 5 <= buffer.length) {
    const flags = buffer.readUInt8(offset);
    const length = buffer.readUInt32BE(offset + 1);
    offset += 5;

    if (offset + length > buffer.length) {
      break; // Incomplete frame
    }

    const data = buffer.subarray(offset, offset + length);
    offset += length;
    frames.push({ flags, data });
  }

  return frames;
}

/**
 * Translates incoming ConnectRPC payload or JSON structure into OpenAI ChatCompletionRequest format
 */
export function translateConnectRequestToOpenAI(rawBody: any): ChatCompletionRequest {
  if (typeof rawBody === 'object' && rawBody !== null && Array.isArray(rawBody.messages)) {
    const tools = rawBody.tools ? translateConnectToolsToOpenAI(rawBody.tools) : undefined;

    return {
      model: rawBody.model || 'default-model',
      messages: rawBody.messages.map((msg: any) => ({
        role: msg.role === 'model' ? 'assistant' : msg.role || 'user',
        content: msg.parts ? translateConnectPartsToOpenAIContent(msg.parts) : msg.content || '',
        name: msg.name,
      })),
      tools: tools && tools.length > 0 ? tools : undefined,
      temperature: rawBody.temperature ?? 0.7,
      stream: rawBody.stream ?? false,
    };
  }

  // Generic fallback if payload format varies
  return {
    model: 'default-model',
    messages: [
      {
        role: 'user',
        content: typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
      },
    ],
    stream: false,
  };
}
