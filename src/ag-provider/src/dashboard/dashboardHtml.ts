export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ag-provider | Universal AI Control Panel</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #0b0f19; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
    .card { background-color: #131c2e; border: 1px solid #1e293b; border-radius: 0.85rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4); }
    .badge-online { background-color: #064e3b; color: #34d399; border: 1px solid #059669; }
    .badge-shield { background-color: #1e1b4b; color: #a78bfa; border: 1px solid #6d28d9; }
    .table-row { border-bottom: 1px solid #1e293b; }
    .table-row:last-child { border-bottom: none; }
  </style>
</head>
<body class="p-6 max-w-7xl mx-auto space-y-6">

  <!-- Header Section -->
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
    <div>
      <h1 class="text-3xl font-extrabold text-sky-400 flex items-center gap-3">
        <span>⚡ ag-provider Control Panel</span>
      </h1>
      <p class="text-sm text-slate-400 mt-1">Universal OpenAI Compatibility Proxy Bridge for Antigravity IDE</p>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <span class="px-3.5 py-1.5 text-xs font-bold rounded-full badge-shield flex items-center gap-1.5">
        <i class="fa-solid fa-shield-halved"></i> <span>Google Quota: 0 Bytes (100% Local Bypass)</span>
      </span>
      <span class="px-3 py-1.5 text-xs font-bold rounded-full badge-online" id="server-status">● Online</span>
      <span class="text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">Port: <code class="text-sky-400 font-bold">50051</code></span>
    </div>
  </header>

  <!-- Metrics Overview Grid -->
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
    <!-- Active Provider -->
    <div class="card p-4">
      <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Engine</div>
      <div class="text-lg font-bold text-sky-400 mt-1 truncate" id="active-provider">Loading...</div>
    </div>
    <!-- Total Requests -->
    <div class="card p-4">
      <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Requests</div>
      <div class="text-xl font-extrabold text-indigo-400 mt-1" id="total-requests">0</div>
    </div>
    <!-- Total Tokens -->
    <div class="card p-4">
      <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Tokens</div>
      <div class="text-xl font-extrabold text-emerald-400 mt-1" id="total-tokens">0</div>
    </div>
    <!-- Avg Latency -->
    <div class="card p-4">
      <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Latency</div>
      <div class="text-xl font-extrabold text-amber-400 mt-1" id="avg-latency">-- ms</div>
    </div>
    <!-- Memory Usage -->
    <div class="card p-4">
      <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Heap Memory</div>
      <div class="text-xl font-extrabold text-pink-400 mt-1" id="memory-usage">0 MB</div>
    </div>
    <!-- Uptime -->
    <div class="card p-4">
      <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Uptime</div>
      <div class="text-xl font-extrabold text-cyan-400 mt-1" id="uptime">0s</div>
    </div>
  </div>

  <!-- Main Grid: Provider Control & System Overview -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    
    <!-- Provider Control & Model Selection -->
    <div class="card p-6 lg:col-span-2 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
          <i class="fa-solid fa-sliders text-sky-400"></i> Dynamic Provider & Engine Switcher
        </h2>
        <span class="text-xs text-slate-400">Live switching without restarting IDE</span>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-400 mb-1.5">Select Active LLM Backend Engine</label>
        <select id="provider-select" class="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-sky-500 outline-none">
          <option value="">Loading providers...</option>
        </select>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button onclick="switchProvider()" class="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-sky-600/20">
          <i class="fa-solid fa-bolt"></i> Switch Active Engine
        </button>
        <button onclick="testConnection()" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-all flex items-center gap-2 border border-slate-700">
          <i class="fa-solid fa-stethoscope text-emerald-400"></i> Test Active Latency
        </button>
      </div>

      <div id="test-result" class="hidden p-3.5 rounded-xl text-xs mt-3"></div>
    </div>

    <!-- Quick Architecture Facts -->
    <div class="card p-6 space-y-4">
      <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
        <i class="fa-solid fa-circle-info text-indigo-400"></i> Architecture Facts
      </h2>
      <div class="space-y-3 text-xs text-slate-300">
        <div class="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
          <span class="text-indigo-400 font-bold block mb-1">🎯 Frontend IDE Dropdown</span>
          <span>The model dropdown inside Antigravity IDE UI (e.g. Gemini 3.6 Flash) is a visual label. The actual backend engine is set here in the Dashboard!</span>
        </div>
        <div class="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
          <span class="text-emerald-400 font-bold block mb-1">🛡️ Google Token / Quota Protection</span>
          <span>Setting <code class="text-sky-300">127.0.0.1:50051</code> reroutes 100% of network traffic locally. Google receives 0 bytes and consumes 0 quota.</span>
        </div>
      </div>
    </div>

  </div>

  <!-- Provider Breakdown Table -->
  <div class="card p-6">
    <h2 class="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
      <i class="fa-solid fa-server text-purple-400"></i> Configured Engines & Usage Statistics
    </h2>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs text-slate-300">
        <thead class="bg-slate-900 text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
          <tr>
            <th class="p-3">Engine Name</th>
            <th class="p-3">Provider ID</th>
            <th class="p-3">Model</th>
            <th class="p-3">Requests</th>
            <th class="p-3">Tokens</th>
            <th class="p-3">Avg Latency</th>
          </tr>
        </thead>
        <tbody id="provider-stats-tbody">
          <tr><td colspan="6" class="p-4 text-center text-slate-500">Loading metrics...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Live Request Activity Log Feed -->
  <div class="card p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
        <i class="fa-solid fa-list-check text-emerald-400"></i> Live Request Log Feed (Last 25 Requests)
      </h2>
      <span class="text-xs text-slate-500 font-mono" id="log-count">0 items</span>
    </div>
    <div class="overflow-x-auto max-h-80 overflow-y-auto">
      <table class="w-full text-left text-xs text-slate-300 font-mono">
        <thead class="bg-slate-900 text-slate-400 uppercase font-semibold text-[10px] tracking-wider sticky top-0">
          <tr>
            <th class="p-3">Time</th>
            <th class="p-3">Provider</th>
            <th class="p-3">Model</th>
            <th class="p-3">Type</th>
            <th class="p-3">Est. Tokens</th>
            <th class="p-3">Latency</th>
            <th class="p-3">Status</th>
          </tr>
        </thead>
        <tbody id="request-log-tbody">
          <tr><td colspan="7" class="p-4 text-center text-slate-500">No requests recorded yet. Send a prompt in Antigravity IDE chat!</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    let providersLoaded = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();

        document.getElementById('server-status').innerText = '● Online';
        document.getElementById('server-status').className = 'px-3 py-1.5 text-xs font-bold rounded-full badge-online';

        document.getElementById('active-provider').innerText = data.defaultProvider || 'N/A';
        document.getElementById('total-requests').innerText = (data.metrics.totalRequests || 0).toLocaleString();
        document.getElementById('total-tokens').innerText = (data.metrics.totalTokens || 0).toLocaleString();
        document.getElementById('avg-latency').innerText = (data.metrics.avgLatencyMs || 0) + ' ms';
        document.getElementById('memory-usage').innerText = data.metrics.memoryUsageMb + ' MB';
        document.getElementById('uptime').innerText = Math.round(data.metrics.uptimeSeconds) + 's';

        // Update Provider Select
        if (data.providers && (!providersLoaded || document.getElementById('provider-select').children.length <= 1)) {
          const select = document.getElementById('provider-select');
          select.innerHTML = '';
          data.providers.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.text = (p.id === data.defaultProvider ? '🔥 [ACTIVE] ' : '') + p.name;
            if (p.id === data.defaultProvider) opt.selected = true;
            select.appendChild(opt);
          });
          providersLoaded = true;
        }

        // Update Provider Stats Table
        if (data.providers) {
          const tbody = document.getElementById('provider-stats-tbody');
          tbody.innerHTML = '';
          data.providers.forEach(p => {
            const stat = (data.metrics.providerStats && data.metrics.providerStats[p.id]) || { requests: 0, tokens: 0, avgLatencyMs: 0 };
            const isActive = p.id === data.defaultProvider;
            const tr = document.createElement('tr');
            tr.className = 'table-row hover:bg-slate-900/50 ' + (isActive ? 'bg-sky-950/30' : '');
            tr.innerHTML = \`
              <td class="p-3 font-semibold text-slate-200">\${isActive ? '🔥 ' : ''}\${p.name}</td>
              <td class="p-3 font-mono text-slate-400">\${p.id}</td>
              <td class="p-3 font-mono text-sky-400">\${p.model}</td>
              <td class="p-3 font-bold text-slate-200">\${stat.requests}</td>
              <td class="p-3 font-bold text-emerald-400">\${stat.tokens.toLocaleString()}</td>
              <td class="p-3 text-amber-400 font-semibold">\${stat.avgLatencyMs} ms</td>
            \`;
            tbody.appendChild(tr);
          });
        }

        // Update Request Logs Feed
        if (data.metrics.recentLogs) {
          const tbody = document.getElementById('request-log-tbody');
          const logs = data.metrics.recentLogs;
          document.getElementById('log-count').innerText = logs.length + ' requests';
          
          if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">No requests recorded yet. Send a prompt in Antigravity IDE chat!</td></tr>';
          } else {
            tbody.innerHTML = '';
            logs.forEach(log => {
              const tr = document.createElement('tr');
              tr.className = 'table-row hover:bg-slate-900/50';
              const timeStr = new Date(log.timestamp).toLocaleTimeString();
              tr.innerHTML = \`
                <td class="p-3 text-slate-400">\${timeStr}</td>
                <td class="p-3 font-bold text-sky-300">\${log.providerId}</td>
                <td class="p-3 text-slate-300 font-mono">\${log.model}</td>
                <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] \${log.isStream ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' : 'bg-slate-800 text-slate-300'}">\${log.isStream ? 'STREAM' : 'SYNC'}</span></td>
                <td class="p-3 text-emerald-400 font-bold">\${log.totalTokens}</td>
                <td class="p-3 text-amber-400 font-semibold">\${log.latencyMs} ms</td>
                <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] \${log.status === 'success' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-300 border border-red-800'}">\${log.status.toUpperCase()}</span></td>
              \`;
              tbody.appendChild(tr);
            });
          }
        }

      } catch (err) {
        document.getElementById('server-status').innerText = '● Offline';
        document.getElementById('server-status').className = 'px-3 py-1.5 text-xs font-bold rounded-full bg-red-900 text-red-300 border border-red-700';
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
      providersLoaded = false;
      fetchStatus();
    }

    async function testConnection() {
      const resultBox = document.getElementById('test-result');
      resultBox.className = 'p-3.5 rounded-xl text-xs mt-3 bg-slate-800 text-slate-300 border border-slate-700';
      resultBox.innerText = 'Testing active backend latency...';
      resultBox.classList.remove('hidden');

      const start = performance.now();
      try {
        const res = await fetch('/health');
        const end = performance.now();
        const latency = Math.round(end - start);
        resultBox.className = 'p-3.5 rounded-xl text-xs mt-3 bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-2';
        resultBox.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Connection Successful! Active Latency: <b>' + latency + ' ms</b>';
      } catch (err) {
        resultBox.className = 'p-3.5 rounded-xl text-xs mt-3 bg-red-950 text-red-300 border border-red-800 flex items-center gap-2';
        resultBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-400"></i> Connection Failed: ' + err.message;
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 2000);
  </script>
</body>
</html>`;
}
