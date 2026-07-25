export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ag-provider | Universal AI Control Panel</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tailwindcss/ui@latest/dist/tailwind-ui.min.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
    .card { background-color: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; }
    .badge-online { background-color: #064e3b; color: #34d399; border: 1px solid #059669; }
  </style>
</head>
<body class="p-6 max-w-6xl mx-auto">
  <!-- Header -->
  <header class="flex items-center justify-between pb-6 mb-8 border-b border-slate-700">
    <div>
      <h1 class="text-2xl font-bold text-sky-400 flex items-center gap-2">
        <span>⚡ ag-provider Control Panel</span>
      </h1>
      <p class="text-sm text-slate-400 mt-1">Universal OpenAI Compatibility Proxy for Antigravity IDE</p>
    </div>
    <div class="flex items-center gap-3">
      <span class="px-3 py-1 text-xs font-semibold rounded-full badge-online" id="server-status">● Online</span>
      <span class="text-xs text-slate-400">Port: <code class="text-slate-200">50051</code></span>
    </div>
  </header>

  <!-- Metrics Row -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
    <div class="card p-4">
      <div class="text-xs font-medium text-slate-400 uppercase">Active Provider</div>
      <div class="text-xl font-bold text-sky-300 mt-1 truncate" id="active-provider">Loading...</div>
    </div>
    <div class="card p-4">
      <div class="text-xs font-medium text-slate-400 uppercase">Heap Memory</div>
      <div class="text-xl font-bold text-emerald-400 mt-1" id="memory-usage">0 MB</div>
    </div>
    <div class="card p-4">
      <div class="text-xs font-medium text-slate-400 uppercase">Uptime</div>
      <div class="text-xl font-bold text-purple-400 mt-1" id="uptime">0s</div>
    </div>
    <div class="card p-4">
      <div class="text-xs font-medium text-slate-400 uppercase">Last Latency</div>
      <div class="text-xl font-bold text-amber-400 mt-1" id="last-latency">-- ms</div>
    </div>
  </div>

  <!-- Main Section: Provider Switcher & Health -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Provider Control Card -->
    <div class="card p-6 lg:col-span-2">
      <h2 class="text-lg font-semibold mb-4 text-slate-200">Provider & Model Selection</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Active Backend</label>
          <select id="provider-select" class="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-sky-500 outline-none">
            <option value="qwen-siliconflow">Qwen 2.5 Coder 32B (SiliconFlow)</option>
            <option value="ollama-local">Ollama Local (qwen2.5-coder:14b)</option>
            <option value="lmstudio-local">LM Studio Local</option>
            <option value="openrouter">OpenRouter Multi-Provider</option>
          </select>
        </div>
        <div class="flex items-center justify-between pt-4">
          <button onclick="switchProvider()" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition-colors">
            Switch Active Provider
          </button>
          <button onclick="testConnection()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors">
            Test Connection
          </button>
        </div>
        <div id="test-result" class="hidden p-3 rounded-lg text-xs mt-3"></div>
      </div>
    </div>

    <!-- Quick Stats & Endpoint Info -->
    <div class="card p-6">
      <h2 class="text-lg font-semibold mb-4 text-slate-200">IDE Target Endpoint</h2>
      <div class="text-xs text-slate-400 space-y-3">
        <div>
          <span class="block text-slate-500 font-semibold mb-1">ANTIGRAVITY CONFIG:</span>
          <code class="block bg-slate-900 p-2 rounded border border-slate-800 text-sky-400 select-all font-mono">
            "antigravity.agentHostAddress": "http://127.0.0.1:50051"
          </code>
        </div>
        <div class="pt-2">
          <span class="block text-slate-500 font-semibold mb-1">PROXY ROUTE:</span>
          <span class="text-slate-300">HTTP/2 ConnectRPC -> OpenAI REST/SSE</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('active-provider').innerText = data.defaultProvider || 'N/A';
        document.getElementById('memory-usage').innerText = data.metrics.memoryUsageMb + ' MB';
        document.getElementById('uptime').innerText = Math.round(data.metrics.uptimeSeconds) + 's';
      } catch (err) {
        document.getElementById('server-status').innerText = '● Offline';
        document.getElementById('server-status').className = 'px-3 py-1 text-xs font-semibold rounded-full bg-red-900 text-red-300 border border-red-700';
      }
    }

    async function switchProvider() {
      const selected = document.getElementById('provider-select').value;
      const res = await fetch('/api/provider/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: selected })
      });
      const data = await res.json();
      alert('Provider switched to: ' + data.activeProvider);
      fetchStatus();
    }

    async function testConnection() {
      const resultBox = document.getElementById('test-result');
      resultBox.className = 'p-3 rounded-lg text-xs mt-3 bg-slate-800 text-slate-300 border border-slate-700';
      resultBox.innerText = 'Testing connection...';
      resultBox.classList.remove('hidden');

      const start = performance.now();
      try {
        const res = await fetch('/health');
        const end = performance.now();
        const latency = Math.round(end - start);
        document.getElementById('last-latency').innerText = latency + ' ms';
        resultBox.className = 'p-3 rounded-lg text-xs mt-3 bg-emerald-950 text-emerald-300 border border-emerald-800';
        resultBox.innerText = 'Connection Successful! Latency: ' + latency + ' ms';
      } catch (err) {
        resultBox.className = 'p-3 rounded-lg text-xs mt-3 bg-red-950 text-red-300 border border-red-800';
        resultBox.innerText = 'Connection Failed: ' + err.message;
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 3000);
  </script>
</body>
</html>`;
}
