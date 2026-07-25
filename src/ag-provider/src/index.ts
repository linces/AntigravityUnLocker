import express from 'express';

const app = express();
const PORT = process.env.AG_PROVIDER_PORT || 50051;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ag-provider',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// Bridge status dashboard API
app.get('/api/status', (req, res) => {
  res.json({
    activeProvider: 'qwen-siliconflow',
    supportedProviders: ['openrouter', 'ollama', 'lmstudio', 'vllm', 'siliconflow', 'deepseek', 'qwen'],
    metrics: {
      uptimeSeconds: process.uptime(),
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    }
  });
});

app.listen(PORT, () => {
  console.log(`[ag-provider] Bridge proxy server running on http://127.0.0.1:${PORT}`);
});
