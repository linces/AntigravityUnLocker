import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { ProviderRouter } from './router/providerRouter.js';
import { ChatCompletionRequest } from './adapters/base.js';
import { translateConnectRequestToOpenAI, decodeConnectEnvelope } from './translation/connectToOpenAI.js';
import { encodeConnectEnvelope, formatConnectStreamChunk } from './translation/openAiToConnect.js';
import { getDashboardHtml } from './dashboard/dashboardHtml.js';
import v1internalRouter from './routes/v1internal.js';
import { telemetry } from './telemetry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env file if present in parent or current directory
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

const app = express();
const PORT = process.env.AG_PROVIDER_PORT || 50051;
const configPath = path.join(__dirname, '../providers.json');

const router = new ProviderRouter(configPath);

app.use(express.json());
app.use(express.raw({ type: ['application/connect+proto', 'application/grpc', 'application/octet-stream'] }));

// Healthcheck
app.get(['/health', '/healt'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'ag-provider',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// Interactive Web Dashboard
app.get(['/', '/dashboard'], (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(getDashboardHtml());
});

// ── v1internal Bootstrap Routes (Language Server Initialization) ─────────────
// These endpoints simulate the Google Cloud Code internal API that the
// language_server_windows_x64.exe needs to bootstrap: model catalog, user tier,
// NUXes, experiments. Without them the LS loops with "model not found" errors.
app.use(v1internalRouter);

// Admin API status & telemetry
app.get('/api/status', (req, res) => {
  const activeId = router.getActiveProviderId();
  res.json({
    status: 'online',
    defaultProvider: activeId,
    providers: router.getAllProviders(),
    metrics: telemetry.getMetrics(activeId)
  });
});

// Admin API switch provider
app.post('/api/provider/switch', (req, res) => {
  const { providerId } = req.body;
  try {
    router.setActiveProvider(providerId);
    res.json({ success: true, activeProvider: providerId });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ConnectRPC / OpenAI Bridge Endpoint
app.post(['/v1/chat/completions', '/google.cloud.conversa.v1.AgentService/*'], async (req, res) => {
  const startTime = performance.now();
  const provider = router.getProvider();
  let chatRequest: ChatCompletionRequest;

  try {
    if (Buffer.isBuffer(req.body)) {
      const frames = decodeConnectEnvelope(req.body);
      console.log(`[ag-provider] Received ConnectRPC binary request (${frames.length} frames decoded)`);
      chatRequest = translateConnectRequestToOpenAI(frames.length > 0 ? JSON.parse(frames[0].data.toString('utf-8')) : {});
    } else {
      chatRequest = translateConnectRequestToOpenAI(req.body);
    }
    
    const promptLen = JSON.stringify(chatRequest.messages || []).length;
    const promptTokens = Math.max(1, Math.ceil(promptLen / 4));
    let completionTokens = 0;

    if (chatRequest.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let streamedText = '';
      for await (const chunk of provider.stream(chatRequest)) {
        res.write(formatConnectStreamChunk(chunk));
        if (typeof chunk === 'string') {
          streamedText += chunk;
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();

      completionTokens = Math.max(1, Math.ceil(streamedText.length / 4));
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      telemetry.recordRequest({
        id: 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toISOString(),
        providerId: provider.id,
        providerName: provider.name,
        model: chatRequest.model || provider.id,
        isStream: true,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs,
        status: 'success'
      });
    } else {
      const response = await router.chatWithFallback(chatRequest);
      
      const compText = response.choices?.[0]?.message?.content || '';
      completionTokens = response.usage?.completion_tokens || Math.max(1, Math.ceil(compText.length / 4));
      const actualPromptTokens = response.usage?.prompt_tokens || promptTokens;

      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      telemetry.recordRequest({
        id: 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toISOString(),
        providerId: provider.id,
        providerName: provider.name,
        model: response.model || chatRequest.model || provider.id,
        isStream: false,
        promptTokens: actualPromptTokens,
        completionTokens,
        totalTokens: actualPromptTokens + completionTokens,
        latencyMs,
        status: 'success'
      });

      if (req.headers['content-type']?.includes('connect+proto')) {
        const envelope = encodeConnectEnvelope(response);
        res.setHeader('Content-Type', 'application/connect+proto');
        res.send(envelope);
      } else {
        res.json(response);
      }
    }
  } catch (err: any) {
    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    telemetry.recordRequest({
      id: 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      providerId: provider.id,
      providerName: provider.name,
      model: provider.id,
      isStream: false,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: err.message
    });

    console.error('[ag-provider] Translation/Proxy Error:', err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Antigravity Universal AI Provider Bridge (ag-provider) `);
  console.log(`  Control Panel: http://127.0.0.1:${PORT}/dashboard`);
  console.log(`  Running on http://127.0.0.1:${PORT}`);
  console.log(`=======================================================`);
});
