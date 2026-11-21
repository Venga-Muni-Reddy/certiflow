import { WhatsAppMessage, ChaosConfig, DeliveryStats } from '../types.js';

export function renderInboxHtml(
  messages: WhatsAppMessage[],
  chaos: ChaosConfig,
  stats: DeliveryStats,
  searchQuery: string = ''
): string {
  const filtered = messages.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.candidateName.toLowerCase().includes(q) ||
      m.certificateNumber.toLowerCase().includes(q) ||
      m.to.toLowerCase().includes(q) ||
      m.courseName.toLowerCase().includes(q)
    );
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CertiFlow Stand-In WhatsApp Inbox</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --wa-green: #075E54;
      --wa-light-green: #25D366;
      --wa-chat-bg: #EFEAE2;
      --wa-bubble-out: #D9FDD3;
      --wa-teal: #128C7E;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f0f2f5;
      color: #111b21;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--wa-green);
      color: white;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .wa-icon {
      width: 36px;
      height: 36px;
      background: var(--wa-light-green);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
      font-size: 20px;
    }
    .header-title h1 { font-size: 18px; font-weight: 700; }
    .header-title p { font-size: 12px; opacity: 0.85; }
    .status-badge {
      background: rgba(255,255,255,0.2);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .dashboard-container {
      max-width: 1200px;
      margin: 20px auto;
      width: 100%;
      padding: 0 16px;
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 20px;
      flex: 1;
    }
    .panel {
      background: white;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .panel h2 {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 14px;
      color: var(--wa-green);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 13px;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-val { font-weight: 700; color: #0f172a; }
    .chaos-btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 14px;
    }
    button.btn {
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: white;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button.btn:hover { background: #f8fafc; border-color: #94a3b8; }
    button.btn.active {
      background: var(--wa-green);
      color: white;
      border-color: var(--wa-green);
    }
    button.btn.danger {
      color: #dc2626;
      border-color: #fca5a5;
    }
    button.btn.danger:hover { background: #fee2e2; }
    .search-box {
      margin-bottom: 16px;
    }
    .search-box input {
      width: 100%;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      font-size: 13px;
      outline: none;
    }
    .search-box input:focus { border-color: var(--wa-teal); }
    .messages-viewport {
      background: var(--wa-chat-bg);
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      padding: 20px;
      min-height: 500px;
      max-height: 75vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .empty-state {
      text-align: center;
      margin: auto;
      color: #64748b;
      font-size: 14px;
    }
    .chat-bubble {
      background: white;
      border-radius: 10px 10px 10px 2px;
      padding: 14px 16px;
      max-width: 480px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.15);
      position: relative;
    }
    .chat-bubble.delivered {
      background: var(--wa-bubble-out);
      align-self: flex-start;
    }
    .bubble-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 12px;
      color: #475569;
    }
    .candidate-name {
      font-weight: 700;
      color: var(--wa-green);
      font-size: 14px;
    }
    .bubble-body {
      font-size: 13px;
      line-height: 1.5;
      color: #1e293b;
      margin-bottom: 12px;
    }
    .cert-pill {
      display: inline-block;
      background: white;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 8px;
      font-family: monospace;
      font-weight: 600;
      margin-top: 4px;
      color: #0f172a;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--wa-green);
      color: white;
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      transition: background 0.2s;
    }
    .download-btn:hover { background: var(--wa-teal); }
    .bubble-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      font-size: 11px;
      color: #64748b;
    }
    .check-mark { color: #53bdeb; font-weight: bold; font-size: 13px; }
  </style>
</head>
<body>
  <header>
    <div class="header-brand">
      <div class="wa-icon">✓</div>
      <div class="header-title">
        <h1>Pragati Skills Mission WhatsApp Stand-In</h1>
        <p>Reviewer Live Delivery & Chaos Inspection Portal</p>
      </div>
    </div>
    <div class="status-badge">
      LIVE INBOX (${messages.length} Delivered)
    </div>
  </header>

  <div class="dashboard-container">
    <!-- Left Panel: Chaos Controls & Delivery Metrics -->
    <div class="sidebar">
      <div class="panel">
        <h2>Delivery Telemetry</h2>
        <div class="stat-row">
          <span>Total Messages Delivered:</span>
          <span class="stat-val" style="color: #059669;">${stats.totalDelivered}</span>
        </div>
        <div class="stat-row">
          <span>Failed Attempts (Chaos):</span>
          <span class="stat-val" style="color: #dc2626;">${stats.totalFailed}</span>
        </div>
        <div class="stat-row">
          <span>Timeouts Injected:</span>
          <span class="stat-val" style="color: #d97706;">${stats.totalTimeouts}</span>
        </div>
        <div class="stat-row">
          <span>Duplicates Blocked (Idempotency):</span>
          <span class="stat-val" style="color: #2563eb;">${stats.duplicatesBlocked}</span>
        </div>
        <div class="stat-row">
          <span>Total HTTP Requests:</span>
          <span class="stat-val">${stats.totalRequests}</span>
        </div>
      </div>

      <div class="panel" style="margin-top: 16px;">
        <h2>Chaos Injection Simulation</h2>
        <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
          Simulate real-world WhatsApp API instability to prove BullMQ retry & idempotency recovery (Moment #3).
        </p>
        <div class="stat-row">
          <span>Current Failure Rate:</span>
          <span class="stat-val">${Math.round(chaos.failureRate * 100)}%</span>
        </div>
        <div class="stat-row">
          <span>Current Timeout Rate:</span>
          <span class="stat-val">${Math.round(chaos.timeoutRate * 100)}%</span>
        </div>

        <div class="chaos-btn-group">
          <button class="btn ${chaos.failureRate === 0 ? 'active' : ''}" onclick="setChaos(0, 0)">Zero Flakiness (0%)</button>
          <button class="btn ${chaos.failureRate === 0.3 ? 'active' : ''}" onclick="setChaos(0.3, 0.1)">Realistic (30%)</button>
          <button class="btn ${chaos.failureRate === 0.6 ? 'active' : ''}" onclick="setChaos(0.6, 0.2)">High Chaos (60%)</button>
          <button class="btn ${chaos.failureRate === 0.9 ? 'active' : ''}" onclick="setChaos(0.9, 0.3)">Severe (90%)</button>
        </div>

        <div style="margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          <button class="btn danger" style="width: 100%;" onclick="resetInbox()">Reset Inbox & Metrics</button>
        </div>
      </div>
    </div>

    <!-- Right Panel: Delivered Candidate WhatsApp Messages -->
    <div class="panel" style="display: flex; flex-direction: column;">
      <h2>Delivered WhatsApp Messages (${filtered.length})</h2>

      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Search by Candidate Name, Certificate Number, Course or Phone..." value="${escapeHtml(searchQuery)}" onkeyup="handleSearch(event)">
      </div>

      <div class="messages-viewport">
        ${
          filtered.length === 0
            ? `<div class="empty-state">
                <p style="font-size: 16px; font-weight: 600; margin-bottom: 6px;">No messages delivered yet</p>
                <p>When State Office approves a batch, certificates and download links appear here live.</p>
              </div>`
            : filtered
                .map(
                  (m) => `
          <div class="chat-bubble delivered">
            <div class="bubble-header">
              <span class="candidate-name">${escapeHtml(m.candidateName)}</span>
              <span>${escapeHtml(m.to)}</span>
            </div>
            <div class="bubble-body">
              <p>Congratulations! You have successfully completed <strong>${escapeHtml(m.courseName)}</strong> under the Pragati Skills Mission.</p>
              <div style="margin: 8px 0;">
                <span class="cert-pill">${escapeHtml(m.certificateNumber)}</span>
              </div>
              <p style="margin-bottom: 10px;">Your genuine digital certificate is ready for download:</p>
              <a href="${escapeHtml(m.downloadUrl)}" target="_blank" class="download-btn">
                <span>⬇ Download Official PDF</span>
              </a>
            </div>
            <div class="bubble-footer">
              <span>Delivered: ${new Date(m.deliveredAt).toLocaleTimeString()}</span>
              <span><span class="check-mark">✓✓</span> Read</span>
            </div>
          </div>
        `
                )
                .join('')
        }
      </div>
    </div>
  </div>

  <script>
    async function setChaos(failureRate, timeoutRate) {
      await fetch('/api/chaos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ failureRate, timeoutRate })
      });
      location.reload();
    }

    async function resetInbox() {
      if (confirm('Clear all messages and reset delivery counters?')) {
        await fetch('/api/reset', { method: 'POST' });
        location.reload();
      }
    }

    function handleSearch(e) {
      if (e.key === 'Enter') {
        const val = document.getElementById('searchInput').value;
        window.location.href = '/inbox?q=' + encodeURIComponent(val);
      }
    }

    // Auto-refresh every 4 seconds to pick up live deliveries
    setInterval(() => {
      const isInputActive = document.activeElement === document.getElementById('searchInput');
      if (!isInputActive) {
        location.reload();
      }
    }, 4000);
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
