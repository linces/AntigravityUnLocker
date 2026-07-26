/**
 * Diagnostic Proxy — ag-provider Traffic Capture Tool
 * 
 * Purpose: Capture and log raw requests from Antigravity IDE to understand
 * the exact protocol, Content-Type, payload format, and HTTP version used.
 * 
 * This is a temporary tool — NOT part of the production bridge.
 * 
 * Usage:
 *   npx ts-node --esm src/diagnosticProxy.ts
 *   # or after build:
 *   node dist/diagnosticProxy.js
 * 
 * Then configure IDE:
 *   "antigravity.agentHostAddress": "http://127.0.0.1:50051"
 *   
 * Send any message in the IDE chat and observe the terminal output.
 */

import http2 from 'node:http2';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.AG_DIAG_PORT || '50051', 10);
const LOG_DIR = path.join(__dirname, '..', 'captures');

// ─── Ensure capture directory exists ───
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

let requestCounter = 0;

// ─── Utility: Format bytes as hex dump ───
function hexDump(buffer: Buffer, maxBytes: number = 512): string {
  const slice = buffer.subarray(0, maxBytes);
  const lines: string[] = [];

  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.subarray(i, i + 16);
    const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(chunk).map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
    lines.push(`  ${i.toString(16).padStart(6, '0')}  ${hex.padEnd(48)}  |${ascii}|`);
  }

  if (buffer.length > maxBytes) {
    lines.push(`  ... (${buffer.length - maxBytes} more bytes truncated)`);
  }

  return lines.join('\n');
}

// ─── Utility: Try to detect if body looks like JSON ───
function tryParseJSON(buffer: Buffer): { isJSON: boolean; parsed?: any; error?: string } {
  try {
    const str = buffer.toString('utf-8').trim();
    if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
      const parsed = JSON.parse(str);
      return { isJSON: true, parsed };
    }
    return { isJSON: false };
  } catch (e: any) {
    return { isJSON: false, error: e.message };
  }
}

// ─── Utility: Try to detect ConnectRPC envelope ───
function tryDecodeConnectEnvelope(buffer: Buffer): { isEnvelope: boolean; frames?: { flags: number; length: number; dataPreview: string; isJSON: boolean }[] } {
  if (buffer.length < 5) return { isEnvelope: false };

  const frames: { flags: number; length: number; dataPreview: string; isJSON: boolean }[] = [];
  let offset = 0;

  while (offset + 5 <= buffer.length) {
    const flags = buffer.readUInt8(offset);
    const length = buffer.readUInt32BE(offset + 1);
    offset += 5;

    if (length > buffer.length - offset + 5) {
      // Frame length exceeds remaining data — might not be a valid envelope
      if (frames.length === 0) return { isEnvelope: false };
      break;
    }

    const data = buffer.subarray(offset, offset + length);
    offset += length;

    const jsonCheck = tryParseJSON(data);
    frames.push({
      flags,
      length,
      dataPreview: jsonCheck.isJSON
        ? JSON.stringify(jsonCheck.parsed, null, 2).substring(0, 2000)
        : `(binary ${length} bytes) ` + Array.from(data.subarray(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' '),
      isJSON: jsonCheck.isJSON
    });
  }

  return { isEnvelope: frames.length > 0, frames };
}

// ─── Core: Handle incoming request ───
function handleRequest(
  req: http2.Http2ServerRequest,
  res: http2.Http2ServerResponse,
  httpVersion: string
): void {
  const id = ++requestCounter;
  const timestamp = new Date().toISOString();
  const chunks: Buffer[] = [];

  // Helper to send responses
  const sendResponse = (statusCode: number, headers: Record<string, string>, body: Buffer | string) => {
    res.writeHead(statusCode, headers);
    res.end(body);
  };

  req.on('data', (chunk: Buffer) => chunks.push(chunk));

  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const headers = req.headers;
    const method = req.method || 'UNKNOWN';
    const url = req.url || '/';
    const contentType = (headers['content-type'] as string) || '(not set)';

    // ─── Analysis ───
    const jsonAnalysis = tryParseJSON(body);
    const envelopeAnalysis = tryDecodeConnectEnvelope(body);

    // ─── Build report ───
    const separator = '═'.repeat(80);
    const report = [
      '',
      separator,
      `  REQUEST #${id} — ${timestamp}`,
      separator,
      '',
      `  HTTP Version:    ${httpVersion}`,
      `  Method:          ${method}`,
      `  URL/Path:        ${url}`,
      `  Body Size:       ${body.length} bytes`,
      `  Content-Type:    ${contentType}`,
      '',
      '  ── ALL HEADERS ──',
      ...Object.entries(headers).map(([k, v]) => `    ${k}: ${v}`),
      '',
      '  ── BODY ANALYSIS ──',
      `    Is valid JSON:           ${jsonAnalysis.isJSON ? '✅ YES' : '❌ NO'}`,
      `    Is ConnectRPC envelope:  ${envelopeAnalysis.isEnvelope ? '✅ YES' : '❌ NO'}`,
    ];

    if (jsonAnalysis.isJSON) {
      report.push(
        '',
        '  ── JSON BODY (parsed) ──',
        JSON.stringify(jsonAnalysis.parsed, null, 2).split('\n').map(l => '    ' + l).join('\n')
      );
    }

    if (envelopeAnalysis.isEnvelope && envelopeAnalysis.frames) {
      report.push('', '  ── CONNECTRPC ENVELOPE FRAMES ──');
      for (let i = 0; i < envelopeAnalysis.frames.length; i++) {
        const f = envelopeAnalysis.frames[i];
        report.push(
          `    Frame ${i}: flags=0x${f.flags.toString(16).padStart(2, '0')}, length=${f.length}, isJSON=${f.isJSON}`,
          `    Data: ${f.dataPreview.split('\n').map(l => '      ' + l).join('\n')}`
        );
      }
    }

    report.push(
      '',
      '  ── RAW HEX DUMP ──',
      hexDump(body),
      '',
      separator,
      ''
    );

    const reportText = report.join('\n');

    // ─── Output to console ───
    console.log(reportText);

    // ─── Save to file ───
    const captureFile = path.join(LOG_DIR, `capture_${id}_${Date.now()}.txt`);
    fs.writeFileSync(captureFile, reportText, 'utf-8');

    // Also save raw body binary
    if (body.length > 0) {
      const rawFile = path.join(LOG_DIR, `capture_${id}_${Date.now()}.bin`);
      fs.writeFileSync(rawFile, body);
    }

    // ─── Send minimal valid response to prevent IDE crash ───
    // Try to respond with something the IDE might accept
    const acceptType = contentType;

    if (acceptType.includes('connect+proto') || acceptType.includes('grpc')) {
      // Send a minimal ConnectRPC response: empty envelope with end-of-stream flag
      // 5-byte header: flags=0x02 (end-of-stream), length=2, payload="{}"
      const payload = Buffer.from('{}', 'utf-8');
      const header = Buffer.alloc(5);
      header.writeUInt8(0x00, 0); // data frame
      header.writeUInt32BE(payload.length, 1);
      const envelope = Buffer.concat([header, payload]);

      sendResponse(200, {
        'Content-Type': 'application/connect+proto',
        'Content-Length': String(envelope.length),
      }, envelope);
    } else if (url.includes('chat/completions')) {
      // OpenAI-style JSON response
      sendResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify({
        id: `diag-${id}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'diagnostic-proxy',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: '[ag-provider diagnostic proxy] Request captured successfully. Check terminal for details.',
          },
          finish_reason: 'stop',
        }],
      }));
    } else if (url === '/health') {
      sendResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify({ status: 'diagnostic-mode', captures: requestCounter }));
    } else {
      sendResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify({ status: 'captured', requestId: id }));
    }

    console.log(`  📁 Capture saved to: ${captureFile}`);
    console.log('');
  });

  req.on('error', (err) => {
    console.error(`  ❌ Request error: ${err.message}`);
  });
}

// ─── Start Servers ───
//
// Strategy: Run HTTP/1.1 and HTTP/2 (h2c) servers on separate ports.
// ConnectRPC protocol supports HTTP/1.1 natively (unlike gRPC which requires HTTP/2).
// Since the IDE points to `http://` (not `https://`), it's likely using HTTP/1.1 or h2c.
// We'll capture from both to see which one the IDE chooses.

import http from 'node:http';

// Wrapper to make http1 handler compatible with our function signature
function handleHttp1Request(req: http.IncomingMessage, res: http.ServerResponse): void {
  const id = ++requestCounter;
  const timestamp = new Date().toISOString();
  const chunks: Buffer[] = [];

  const sendResponse = (statusCode: number, headers: Record<string, string>, body: Buffer | string) => {
    res.writeHead(statusCode, headers);
    res.end(body);
  };

  req.on('data', (chunk: Buffer) => chunks.push(chunk));

  req.on('end', () => {
    const bodyBuf = Buffer.concat(chunks);
    const headers = req.headers;
    const method = req.method || 'UNKNOWN';
    const url = req.url || '/';
    const contentType = (headers['content-type'] as string) || '(not set)';

    const jsonAnalysis = tryParseJSON(bodyBuf);
    const envelopeAnalysis = tryDecodeConnectEnvelope(bodyBuf);

    const separator = '═'.repeat(80);
    const report = [
      '',
      separator,
      `  REQUEST #${id} — ${timestamp}`,
      separator,
      '',
      `  HTTP Version:    HTTP/${req.httpVersion}`,
      `  Method:          ${method}`,
      `  URL/Path:        ${url}`,
      `  Body Size:       ${bodyBuf.length} bytes`,
      `  Content-Type:    ${contentType}`,
      '',
      '  ── ALL HEADERS ──',
      ...Object.entries(headers).map(([k, v]) => `    ${k}: ${v}`),
      '',
      '  ── BODY ANALYSIS ──',
      `    Is valid JSON:           ${jsonAnalysis.isJSON ? '✅ YES' : '❌ NO'}`,
      `    Is ConnectRPC envelope:  ${envelopeAnalysis.isEnvelope ? '✅ YES' : '❌ NO'}`,
    ];

    if (jsonAnalysis.isJSON) {
      report.push(
        '',
        '  ── JSON BODY (parsed) ──',
        JSON.stringify(jsonAnalysis.parsed, null, 2).split('\n').map(l => '    ' + l).join('\n')
      );
    }

    if (envelopeAnalysis.isEnvelope && envelopeAnalysis.frames) {
      report.push('', '  ── CONNECTRPC ENVELOPE FRAMES ──');
      for (let i = 0; i < envelopeAnalysis.frames.length; i++) {
        const f = envelopeAnalysis.frames[i];
        report.push(
          `    Frame ${i}: flags=0x${f.flags.toString(16).padStart(2, '0')}, length=${f.length}, isJSON=${f.isJSON}`,
          `    Data: ${f.dataPreview.split('\n').map(l => '      ' + l).join('\n')}`
        );
      }
    }

    report.push(
      '',
      '  ── RAW HEX DUMP ──',
      hexDump(bodyBuf),
      '',
      separator,
      ''
    );

    const reportText = report.join('\n');
    console.log(reportText);

    const captureFile = path.join(LOG_DIR, `capture_${id}_${Date.now()}.txt`);
    fs.writeFileSync(captureFile, reportText, 'utf-8');

    if (bodyBuf.length > 0) {
      const rawFile = path.join(LOG_DIR, `capture_${id}_${Date.now()}.bin`);
      fs.writeFileSync(rawFile, bodyBuf);
    }

    // Respond based on content type
    if (contentType.includes('connect+proto') || contentType.includes('grpc')) {
      const payload = Buffer.from('{}', 'utf-8');
      const header = Buffer.alloc(5);
      header.writeUInt8(0x00, 0);
      header.writeUInt32BE(payload.length, 1);
      const envelope = Buffer.concat([header, payload]);
      sendResponse(200, { 'Content-Type': 'application/connect+proto', 'Content-Length': String(envelope.length) }, envelope);
    } else if (url.includes('chat/completions') || url.includes('AgentService')) {
      sendResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify({
        id: `diag-${id}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'diagnostic-proxy',
        choices: [{ index: 0, message: { role: 'assistant', content: '[ag-provider diagnostic] Request captured.' }, finish_reason: 'stop' }],
      }));
    } else if (url === '/health') {
      sendResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify({ status: 'diagnostic-mode', captures: requestCounter }));
    } else {
      sendResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify({ status: 'captured', requestId: id }));
    }

    console.log(`  📁 Capture saved to: ${captureFile}`);
    console.log('');
  });

  req.on('error', (err) => console.error(`  ❌ Request error: ${err.message}`));
}

// Primary: HTTP/1.1 (ConnectRPC supports this natively)
const http1Server = http.createServer(handleHttp1Request);

// Secondary: HTTP/2 cleartext (h2c) — in case IDE uses HTTP/2
const h2Server = http2.createServer((req, res) => {
  handleRequest(req, res, 'HTTP/2 (h2c)');
});

const HTTP1_PORT = PORT;
const H2C_PORT = PORT + 1;

http1Server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`  ❌ Port ${HTTP1_PORT} is in use. Make sure ag-provider is not running.`);
    process.exit(1);
  }
});

http1Server.listen(HTTP1_PORT, '127.0.0.1', () => {
  h2Server.listen(H2C_PORT, '127.0.0.1', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║        ag-provider — DIAGNOSTIC PROXY (Traffic Capture)     ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  HTTP/1.1:      http://127.0.0.1:${HTTP1_PORT}  (primary)            ║`);
    console.log(`║  HTTP/2 (h2c):  http://127.0.0.1:${H2C_PORT}  (secondary)           ║`);
    console.log(`║  Captures dir:  ./captures/                                ║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  STEP 1: Configure IDE settings.json:                     ║');
    console.log(`║    "antigravity.agentHostAddress": "http://127.0.0.1:${HTTP1_PORT}" ║`);
    console.log('║                                                            ║');
    console.log('║  STEP 2: Send a message in IDE chat                       ║');
    console.log('║  STEP 3: Watch this terminal for captured traffic         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Waiting for incoming requests...');
    console.log('');
  });
});

// ─── Graceful shutdown ───
process.on('SIGINT', () => {
  console.log('\n  Shutting down diagnostic proxy...');
  http1Server.close();
  h2Server.close();
  console.log(`  Total requests captured: ${requestCounter}`);
  console.log(`  Captures saved in: ${LOG_DIR}`);
  process.exit(0);
});

