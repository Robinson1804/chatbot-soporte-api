/* admin.js — Dashboard OTIN/INEI
   Requiere Chart.js 4.x cargado previamente via CDN.
*/
const REFRESH_MS = 60_000;

// Chart instances — never destroy/recreate, only update data
const charts = {};

// ─── Error banner ─────────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('errorBanner');
  el.textContent = msg;
  el.hidden = false;
}
function hideError() {
  document.getElementById('errorBanner').hidden = true;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchMetrics() {
  try {
    const r = await fetch('/api/metrics', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    hideError();
    renderAll(data);
  } catch (err) {
    showError('No se pudieron cargar las métricas. Reintentando en 60 s.');
    console.error('[admin.js] fetchMetrics:', err);
  }
}

// ─── Render orchestrator ──────────────────────────────────────────────────────
function renderAll(d) {
  document.getElementById('lastUpdate').textContent =
    new Date(d.generatedAt).toLocaleString('es-PE');

  renderKpiPromedio(d.volumen?.promedioMensajes);
  renderKpiTickets(d.ticketsSSI);
  renderBarSesiones(d.volumen?.sesionesPorDia);
  renderLineHoras(d.volumen?.mensajesPorHora);
  renderBarDocs(d.documentos?.porTipo);
  renderDoughnutUrgencias(d.urgencias);
  renderDoughnutTickets(d.ticketsSSI);
}

// ─── KPI helpers ──────────────────────────────────────────────────────────────
function renderKpiPromedio(data) {
  const el = document.getElementById('kpiPromedio');
  const sub = document.getElementById('kpiPromedioSub');
  if (!data) { el.textContent = 'N/D'; sub.textContent = ''; return; }
  el.textContent = data.promedio ?? '--';
  sub.textContent = `${data.sesiones_evaluadas ?? 0} sesiones evaluadas`;
}

function renderKpiTickets(data) {
  const el = document.getElementById('kpiTickets');
  const sub = document.getElementById('kpiTicketsSub');
  if (!data) { el.textContent = 'N/D'; sub.textContent = ''; return; }
  el.textContent = data.tasa_exito !== null ? `${data.tasa_exito}%` : 'N/D';
  sub.textContent = `${data.creados} creados / ${data.fallidos} fallidos`;
}

// ─── Chart upsert helper ───────────────────────────────────────────────────────
function upsertChart(id, config) {
  if (charts[id]) {
    charts[id].data = config.data;
    charts[id].update();
  } else {
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, config);
  }
}

// ─── Individual chart renderers ───────────────────────────────────────────────
function renderBarSesiones(rows) {
  if (!rows) return;
  upsertChart('chartSesionesDia', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.fecha.slice(5)), // MM-DD
      datasets: [{
        label: 'Sesiones',
        data: rows.map(r => r.total),
        backgroundColor: '#1565C0',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderLineHoras(rows) {
  if (!rows) return;
  upsertChart('chartHorasPico', {
    type: 'line',
    data: {
      labels: rows.map(r => `${r.hora}h`),
      datasets: [{
        label: 'Mensajes',
        data: rows.map(r => r.total),
        borderColor: '#1565C0',
        backgroundColor: 'rgba(21,101,192,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderBarDocs(rows) {
  if (!rows) return;
  upsertChart('chartDocsTipo', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.tipo),
      datasets: [{
        label: 'Documentos',
        data: rows.map(r => r.total),
        backgroundColor: '#1565C0',
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderDoughnutUrgencias(rows) {
  if (!rows) return;
  upsertChart('chartUrgencias', {
    type: 'doughnut',
    data: {
      labels: rows.map(r => r.nivel),
      datasets: [{
        data: rows.map(r => r.total),
        backgroundColor: ['#991B1B', '#92400E', '#1E40AF', '#475569'],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

function renderDoughnutTickets(data) {
  if (!data) return;
  upsertChart('chartTicketsSSI', {
    type: 'doughnut',
    data: {
      labels: ['Creados', 'Fallidos'],
      datasets: [{
        data: [data.creados, data.fallidos],
        backgroundColor: ['#22C55E', '#B91C1C'],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
fetchMetrics();
setInterval(fetchMetrics, REFRESH_MS);
