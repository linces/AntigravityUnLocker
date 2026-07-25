import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProviderRouter } from './router/providerRouter.js';
import { ChatCompletionRequest } from './adapters/base.js';
import { translateConnectRequestToOpenAI, decodeConnectEnvelope } from './translation/connectToOpenAI.js';
import { encodeConnectEnvelope, formatConnectStreamChunk } from './translation/openAiToConnect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.AG_PROVIDER_PORT || 50051;
const configPath = path.join(__dirname, '../providers.json');

const router = new ProviderRouter(configPath);

app.use(express.json());
app.use(express.raw({ type: ['application/connect+proto', 'application/grpc', 'application/octet-stream'] }));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ag-provider',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// ConnectRPC / OpenAI Bridge Endpoint
app.post(['/v1/chat/completions', '/google.cloud.conversa.v1.AgentService/*'], async (req, res) => {
  try {
    let chatRequest: ChatCompletionRequest;

    if (Buffer.isBuffer(req.body)) {
      const frames = decodeConnectEnvelope(req.body);
      console.log(`[ag-provider] Received ConnectRPC binary request (${frames.length} frames decoded)`);
      chatRequest = translateConnectRequestToOpenAI(frames.length > 0 ? JSON.parse(frames[0].data.toString('utf-8')) : {});
    } else {
      chatRequest = translateConnectRequestToOpenAI(req.body);
    }
    
    if (chatRequest.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const provider = router.getProvider();
      for await (const chunk of provider.stream(chatRequest)) {
        res.write(formatConnectStreamChunk(chunk));
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const response = await router.chatWithFallback(chatRequest);
      
      if (req.headers['content-type']?.includes('connect+proto')) {
        const envelope = encodeConnectEnvelope(response);
        res.setHeader('Content-Type', 'application/connect+proto');
        res.send(envelope);
      } else {
        res.json(response);
      }
    }
  } catch (err: any) {
    console.error('[ag-provider] Translation/Proxy Error:', err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

// Admin status dashboard endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    defaultProvider: router.getProvider().id,
    metrics: {
      uptimeSeconds: process.uptime(),
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    }
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Antigravity Universal AI Provider Bridge (ag-provider) `);
  console.log(`  ConnectRPC & OpenAI Translation Pipeline Online`);
  console.log(`  Running on http://127.0.0.1:${PORT}`);
  console.log(`=======================================================`);
});
