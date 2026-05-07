// Admin Dashboard JS

const API = {
  headers() {
    return {
      'Content-Type': 'application/json',
      'x-admin-user': sessionStorage.getItem('admin_user') || '',
      'x-admin-pass': sessionStorage.getItem('admin_pass') || '',
    };
  },
  async get(path) {
    const res = await fetch(path, { headers: this.headers() });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
  async post(path, body = {}) {
    const res = await fetch(path, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
};

// ── Auth ─────────────────────────────────────────────────────────────────────
document.getElementById('loginBtn').addEventListener('click', async () => {
  const username = document.getElementById('adminUser').value.trim();
  const password = document.getElementById('adminPass').value.trim();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(async r => { if (!r.ok) throw new Error('Invalid credentials'); });
    sessionStorage.setItem('admin_user', username);
    sessionStorage.setItem('admin_pass', password);
    showDashboard();
  } catch {
    errEl.textContent = 'Invalid username or password';
  }
});

document.getElementById('adminPass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
});

function isLoggedIn() {
  return sessionStorage.getItem('admin_user') && sessionStorage.getItem('admin_pass');
}

if (isLoggedIn()) showDashboard();

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// ── Loading ───────────────────────────────────────────────────────────────────
function setLoading(on) {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !on);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function showDashboard() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  setLoading(true);
  try {
    await Promise.all([loadVisual(), loadDataTab(), loadFailedTransfers()]);
  } finally {
    setLoading(false);
  }
}

// ── CSV Util ──────────────────────────────────────────────────────────────────
function downloadCSV(data, filename) {
  if (!data.length) return alert('No data to download');
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
const CHART_COLORS = ['#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e','#a855f7','#fb923c','#34d399'];

function fillDates(rows, key = 'date', valueKey = 'count', days = 30) {
  const map = Object.fromEntries(rows.map(r => [r[key], Number(r[valueKey])]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const label = d.toISOString().slice(0, 10);
    result.push({ label, value: map[label] || 0 });
  }
  return result;
}

function makeLineChart(canvasId, label, data, color = CHART_COLORS[0]) {
  const ctx = document.getElementById(canvasId);
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.label),
      datasets: [{ label, data: data.map(d => d.value), borderColor: color, backgroundColor: color + '22', tension: 0.4, fill: true, pointRadius: 3 }],
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#e2e8f0' } } }, scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 } }, y: { ticks: { color: '#94a3b8' }, beginAtZero: true } } },
  });
}

function makeBarChart(canvasId, label, data, color = CHART_COLORS[1]) {
  const ctx = document.getElementById(canvasId);
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{ label, data: data.map(d => d.value), backgroundColor: color + 'cc', borderRadius: 4 }],
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#e2e8f0' } } }, scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 } }, y: { ticks: { color: '#94a3b8' }, beginAtZero: true } } },
  });
}

function makePieChart(canvasId, labels, values) {
  const ctx = document.getElementById(canvasId);
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: '#1e293b' }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#e2e8f0', padding: 12 } } } },
  });
}

function makeStackedBarChart(canvasId, labels, datasets) {
  const ctx = document.getElementById(canvasId);
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: { responsive: true, scales: { x: { stacked: true, ticks: { color: '#94a3b8', maxTicksLimit: 8 } }, y: { stacked: true, ticks: { color: '#94a3b8' }, beginAtZero: true } }, plugins: { legend: { labels: { color: '#e2e8f0' } } } },
  });
}

// ── Visual Tab ────────────────────────────────────────────────────────────────
let cachedStats = null;

async function loadVisual() {
  const stats = await API.get('/api/admin/stats');
  cachedStats = stats;

  // Overview cards
  const o = stats.overview;
  const cards = [
    { label: 'Total Players', value: o.total_players, sub: `+${o.today_new_players} new today`, color: '#6366f1' },
    { label: 'Today Active', value: o.today_active_players, sub: `${o.today_spins} spins today`, color: '#22d3ee' },
    { label: 'Total Spins', value: o.total_spins, sub: 'All time', color: '#818cf8' },
    { label: 'Coins Won', value: o.total_coins_won, sub: `Avg ${o.avg_coins_per_active_player} per active player`, color: '#f59e0b' },
    { label: 'Coins Transferred', value: o.total_coins_transferred, sub: `${o.total_successful_transfers} successful transfers`, color: '#10b981' },
    { label: 'Pending in Wallets', value: o.pending_coins, sub: 'Won but not transferred', color: '#a855f7' },
    { label: 'Transfer Rate', value: `${o.transfer_rate_pct}%`, sub: `${o.players_transferred} of ${o.total_players} players`, color: '#34d399' },
    { label: 'Failed Transfers', value: o.total_failed_transfers, sub: 'Needs attention', color: '#f43f5e' },
    { label: 'Never Spun', value: o.registered_never_spun, sub: 'Registered but no spin', color: '#64748b' },
  ];
  document.getElementById('overviewCards').innerHTML = cards.map(c => `
    <div class="stat-card" style="border-top:3px solid ${c.color}">
      <p class="stat-label">${c.label}</p>
      <p class="stat-value" style="color:${c.color}">${typeof c.value === 'number' ? Number(c.value).toLocaleString() : c.value}</p>
      <p class="stat-sub">${c.sub}</p>
    </div>`).join('');

  // Charts
  const { charts, retention, behaviour } = stats;

  makeLineChart('chartSpins', 'Spins per Day', fillDates(charts.dailySpins, 'date', 'count'), CHART_COLORS[0]);
  makeBarChart('chartPlayers', 'New Players per Day', fillDates(charts.dailyPlayers, 'date', 'count'), CHART_COLORS[1]);
  makeLineChart('chartDAU', 'Daily Active Users', fillDates(charts.dailyActiveUsers, 'date', 'count'), CHART_COLORS[2]);
  makeLineChart('chartCoinsWon', 'Coins Won per Day', fillDates(charts.dailyCoinsWon, 'date', 'count'), CHART_COLORS[5]);
  makeBarChart('chartCoinsTransferred', 'Coins Transferred per Day', fillDates(charts.dailyCoinsTransferred, 'date', 'count'), CHART_COLORS[3]);

  // Stacked bar: transfers success vs failed
  const dateMap = {};
  for (const row of charts.dailyTransfers) {
    if (!dateMap[row.date]) dateMap[row.date] = { success: 0, failed: 0 };
    if (['success', 'mock_success', 'submitted'].includes(row.status)) dateMap[row.date].success += Number(row.count);
    else dateMap[row.date].failed += Number(row.count);
  }
  const tDates = fillDates([], 'date', 'count');
  makeStackedBarChart('chartTransfers', tDates.map(d => d.label), [
    { label: 'Success', data: tDates.map(d => dateMap[d.label]?.success || 0), backgroundColor: '#10b981cc', borderRadius: 2 },
    { label: 'Failed', data: tDates.map(d => dateMap[d.label]?.failed || 0), backgroundColor: '#f43f5ecc', borderRadius: 2 },
  ]);

  // Transfer status pie
  const tsLabels = charts.transferStatusBreakdown.map(r => r.status);
  const tsValues = charts.transferStatusBreakdown.map(r => Number(r.count));
  makePieChart('chartTransferStatus', tsLabels, tsValues);

  // Rewards pie
  const rlLabels = charts.rewardsBreakdown.map(r => r.reward_key);
  const rlValues = charts.rewardsBreakdown.map(r => Number(r.count));
  makePieChart('chartRewards', rlLabels, rlValues);

  // Retention bar
  const retData = [
    { label: 'Day 1', value: Number(retention.day1) || 0 },
    { label: 'Day 3', value: Number(retention.day3) || 0 },
    { label: 'Day 7', value: Number(retention.day7) || 0 },
    { label: 'Day 14', value: Number(retention.day14) || 0 },
    { label: 'Day 30', value: Number(retention.day30) || 0 },
  ];
  makeBarChart('chartRetention', 'Retention %', retData, CHART_COLORS[3]);

  // Behaviour cards
  const b = behaviour;
  const bCards = [
    { label: 'Full Engagement Today', value: b.full_engagement_today || 0, sub: 'Used all 3 spins today', color: '#10b981' },
    { label: 'Never Transferred', value: b.never_transferred || 0, sub: 'Has coins, never transferred', color: '#f59e0b' },
    { label: 'Has Coins, Not Transferred', value: b.has_coins_never_transferred || 0, sub: 'Potential lost conversions', color: '#fb923c' },
    { label: 'Streak Players', value: b.streak_players || 0, sub: '3+ days active this week', color: '#34d399' },
    { label: 'Churned (7 days)', value: b.churned_7days || 0, sub: 'No spin in 7 days', color: '#f43f5e' },
    { label: 'Churned (30 days)', value: b.churned_30days || 0, sub: 'No spin in 30 days', color: '#ef4444' },
  ];
  document.getElementById('behaviourCards').innerHTML = bCards.map(c => `
    <div class="stat-card" style="border-top:3px solid ${c.color}">
      <p class="stat-label">${c.label}</p>
      <p class="stat-value" style="color:${c.color}">${Number(c.value).toLocaleString()}</p>
      <p class="stat-sub">${c.sub}</p>
    </div>`).join('');

  // Top players table
  const tbody = document.querySelector('#topPlayersTable tbody');
  tbody.innerHTML = b.topPlayers.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.mobile_number}</td>
      <td>${p.display_name || '—'}</td>
      <td>${p.total_spins || 0}</td>
      <td>${p.total_coins}</td>
      <td>${p.transferred}</td>
      <td><strong>${p.wallet_balance}</strong></td>
      <td>${p.last_spin || '—'}</td>
    </tr>`).join('');
}

// ── Data Tab ──────────────────────────────────────────────────────────────────
let dataCache = { players: [], spins: [], transfers: [] };

async function loadDataTab() {
  const [players, spins, transfers] = await Promise.all([
    API.get('/api/admin/data/players'),
    API.get('/api/admin/data/spins'),
    API.get('/api/admin/data/transfers'),
  ]);
  dataCache = { players, spins, transfers };
  renderTable('playersTable', players, ['id','mobile_number','display_name','total_coins','transferred_coins','wallet_balance','total_spins','created_at']);
  renderTable('spinsTable', spins, ['id','mobile_number','display_name','reward_key','coin_value','spin_date','created_at']);
  renderTable('transfersTable', transfers, ['id','mobile_number','display_name','coins_requested','status','error_message','wallet_balance','created_at']);
}

function renderTable(tableId, rows, keys) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="20" class="empty-row">No data</td></tr>'; return; }
  tbody.innerHTML = rows.map(row => `<tr>${keys.map(k => `<td>${row[k] ?? '—'}</td>`).join('')}</tr>`).join('');
}

document.getElementById('filterSpinsBtn').addEventListener('click', async () => {
  const date = document.getElementById('spinDateFilter').value;
  const spins = await API.get(`/api/admin/data/spins${date ? `?date=${date}` : ''}`);
  dataCache.spins = spins;
  renderTable('spinsTable', spins, ['id','mobile_number','display_name','reward_key','coin_value','spin_date','created_at']);
});

document.getElementById('filterTransfersBtn').addEventListener('click', async () => {
  const date = document.getElementById('transferDateFilter').value;
  const mobile = document.getElementById('transferMobileFilter').value;
  const status = document.getElementById('transferStatusFilter').value;
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (mobile) params.set('mobile', mobile);
  if (status) params.set('status', status);
  const transfers = await API.get(`/api/admin/data/transfers?${params}`);
  dataCache.transfers = transfers;
  renderTable('transfersTable', transfers, ['id','mobile_number','display_name','coins_requested','status','error_message','wallet_balance','created_at']);
});

// CSV download buttons
document.querySelectorAll('.dl-btn[data-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    downloadCSV(dataCache[type] || [], `${type}-${new Date().toISOString().slice(0,10)}.csv`);
  });
});

document.getElementById('ftDownloadBtn').addEventListener('click', () => {
  downloadCSV(failedCache, `failed-transfers-${new Date().toISOString().slice(0,10)}.csv`);
});

// ── Failed Transfers Tab ──────────────────────────────────────────────────────
let failedCache = [];

async function loadFailedTransfers(filters = {}) {
  const params = new URLSearchParams({ status: 'failed_provider' });
  if (filters.date) params.set('date', filters.date);
  if (filters.mobile) params.set('mobile', filters.mobile);

  const [failed1, failed2] = await Promise.all([
    API.get(`/api/admin/data/transfers?status=failed_provider${filters.date ? `&date=${filters.date}` : ''}${filters.mobile ? `&mobile=${filters.mobile}` : ''}`),
    API.get(`/api/admin/data/transfers?status=failed_not_registered${filters.date ? `&date=${filters.date}` : ''}${filters.mobile ? `&mobile=${filters.mobile}` : ''}`),
  ]);
  failedCache = [...failed1, ...failed2].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  renderFailedTable(failedCache);
}

function renderFailedTable(rows) {
  const tbody = document.querySelector('#failedTable tbody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No failed transfers 🎉</td></tr>'; return; }
  tbody.innerHTML = rows.map(row => `
    <tr id="frow-${row.id}">
      <td>${row.id}</td>
      <td>${row.mobile_number}</td>
      <td>${row.display_name || '—'}</td>
      <td>${row.coins_requested}</td>
      <td><span class="status-badge status-${row.status}">${row.status}</span></td>
      <td class="error-cell">${row.error_message || '—'}</td>
      <td><strong>${row.wallet_balance}</strong></td>
      <td>${row.created_at ? new Date(row.created_at).toLocaleDateString('en-IN') : '—'}</td>
      <td>
        <button class="retry-btn" data-id="${row.id}" ${row.wallet_balance <= 0 ? 'disabled title="No balance"' : ''}>
          Retry
        </button>
      </td>
    </tr>`).join('');

  document.querySelectorAll('.retry-btn').forEach(btn => {
    btn.addEventListener('click', () => retrySingle(Number(btn.dataset.id), btn));
  });
}

async function retrySingle(id, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  const statusEl = document.getElementById('retryStatus');
  try {
    const result = await API.post(`/api/admin/transfers/${id}/retry`);
    if (result.success) {
      const row = document.getElementById(`frow-${id}`);
      if (row) row.style.opacity = '0.4';
      btn.textContent = '✓ Done';
      showRetryStatus(`✅ Transfer ${id} retried — ${result.coins} coins sent`, 'success');
    } else {
      btn.textContent = 'Retry';
      btn.disabled = false;
      showRetryStatus(`❌ Retry failed: ${result.message || result.reason}`, 'error');
    }
  } catch (err) {
    btn.textContent = 'Retry';
    btn.disabled = false;
    showRetryStatus(`❌ Error: ${err.message}`, 'error');
  }
}

document.getElementById('retryAllBtn').addEventListener('click', async () => {
  const mobile = document.getElementById('ftMobileFilter').value.trim();
  if (!confirm(`Retry ALL failed transfers${mobile ? ` for ${mobile}` : ''}? This will attempt to transfer current wallet balances.`)) return;
  setLoading(true);
  try {
    const { results } = await API.post('/api/admin/retry-all', { mobile: mobile || null });
    const success = results.filter(r => r.success).length;
    const fail = results.length - success;
    showRetryStatus(`✅ Retry All done — ${success} succeeded, ${fail} failed`, success > 0 ? 'success' : 'error');
    await loadFailedTransfers();
  } catch (err) {
    showRetryStatus(`❌ Error: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
});

document.getElementById('ftFilterBtn').addEventListener('click', () => {
  loadFailedTransfers({
    date: document.getElementById('ftDateFilter').value,
    mobile: document.getElementById('ftMobileFilter').value.trim(),
  });
});

function showRetryStatus(msg, type) {
  const el = document.getElementById('retryStatus');
  el.textContent = msg;
  el.className = `retry-status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}
