/**
 * Encodes string/object data into a ConnectRPC binary envelope frame.
 * Header: 1-byte flags (0x00 = data, 0x02 = end-of-stream) + 4-byte big-endian payload length.
 */
export function encodeConnectEnvelope(data: string | object, flags: number = 0x00): Buffer {
  const payloadBuffer = typeof data === 'string' 
    ? Buffer.from(data, 'utf-8')
    : Buffer.from(JSON.stringify(data), 'utf-8');

  const headerBuffer = Buffer.alloc(5);
  headerBuffer.writeUInt8(flags, 0);
  headerBuffer.writeUInt32BE(payloadBuffer.length, 1);

  return Buffer.concat([headerBuffer, payloadBuffer]);
}

/**
 * Wraps text delta chunks into SSE or ConnectRPC stream frames
 */
export function formatConnectStreamChunk(text: string, finishReason?: string): string {
  const jsonFrame = {
    choices: [
      {
        delta: { content: text },
        finish_reason: finishReason || null
      }
    ]
  };

  return `data: ${JSON.stringify(jsonFrame)}\n\n`;
}
