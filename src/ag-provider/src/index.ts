import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProviderRouter } from './router/providerRouter.js';
import { ChatCompletionRequest } from './adapters/base.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.AG_PROVIDER_PORT || 50051;
const configPath = path.join(__dirname, '../providers.json');

const router = new ProviderRouter(configPath);

app.use(express.json());

// Healthcheck
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ag-provider',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// IDE ConnectRPC / Chat Proxy Endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const chatRequest: ChatCompletionRequest = req.body;
    
    if (chatRequest.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const provider = router.getProvider();
      for await (const chunk of provider.stream(chatRequest)) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const response = await router.chatWithFallback(chatRequest);
      res.json(response);
    }
  } catch (err: any) {
    console.error('[ag-provider] Proxy Error:', err.message);
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
  console.log(`  Running on http://127.0.0.1:${PORT}`);
  console.log(`=======================================================`);
});
