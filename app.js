/* Water Quality Visualizer – app.js */
'use strict';

/* ── Chart.js color palette ── */
const PALETTE = [
  '#1a6e8e','#27ae60','#e67e22','#8e44ad','#e74c3c',
  '#2980b9','#16a085','#d35400','#c0392b','#7f8c8d'
];

/* ── Known numeric water-quality columns & their "safe" ranges ── */
const PARAM_META = {
  pH:                    { label: 'pH',                unit: '',        safe: [6.5, 8.5] },
  Dissolved_Oxygen_mg_L: { label: 'Dissolved Oxygen',  unit: 'mg/L',   safe: [5, 14]    },
  Temperature_C:         { label: 'Temperature',        unit: '°C',     safe: [0, 25]    },
  Turbidity_NTU:         { label: 'Turbidity',          unit: 'NTU',    safe: [0, 4]     },
  Conductivity_uS_cm:    { label: 'Conductivity',       unit: 'µS/cm',  safe: [50, 1500] },
  Nitrate_mg_L:          { label: 'Nitrate',            unit: 'mg/L',   safe: [0, 10]    },
  Phosphate_mg_L:        { label: 'Phosphate',          unit: 'mg/L',   safe: [0, 0.1]   },
  Coliform_CFU_100mL:    { label: 'Coliform',           unit: 'CFU/100mL', safe: [0, 0]  },
};

/* ── State ── */
let allRows = [];          // parsed CSV rows (objects)
let numericCols = [];      // column names that are numeric
let activeChart = null;    // Chart.js instance

/* ── DOM refs ── */
const uploadZone   = document.getElementById('upload-zone');
const fileInput    = document.getElementById('file-input');
const sampleBtn    = document.getElementById('sample-btn');
const appSection   = document.getElementById('app-section');
const fileNameEl   = document.getElementById('file-name');
const rowCountEl   = document.getElementById('row-count');
const colCountEl   = document.getElementById('col-count');
const statsGrid    = document.getElementById('stats-grid');
const paramChecks  = document.getElementById('param-checks');
const xAxisSel     = document.getElementById('x-axis');
const colorBySel   = document.getElementById('color-by');
const chartTypeSel = document.getElementById('chart-type-sel');
const renderBtn    = document.getElementById('render-btn');
const chartCanvas  = document.getElementById('main-chart');
const tableBody    = document.getElementById('table-body');
const tableHead    = document.getElementById('table-head');
const errorBox     = document.getElementById('error-box');
const wqiSection   = document.getElementById('wqi-section');
const wqiBody      = document.getElementById('wqi-body');

/* ═══════════════════════════════════════════
   File loading
═══════════════════════════════════════════ */
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

sampleBtn.addEventListener('click', async () => {
  try {
    const resp = await fetch('sample-data.csv');
    if (!resp.ok) throw new Error('Could not load sample data.');
    const text = await resp.text();
    processCSVText(text, 'sample-data.csv');
  } catch (e) {
    showError(e.message);
  }
});

/* Drag & drop */
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});

function loadFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('Please upload a CSV file (.csv).');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => processCSVText(ev.target.result, file.name);
  reader.onerror = () => showError('Could not read the file.');
  reader.readAsText(file);
}

/* ═══════════════════════════════════════════
   CSV processing
═══════════════════════════════════════════ */
function processCSVText(text, fileName) {
  hideError();
  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true, dynamicTyping: true });

  if (result.errors.length && result.data.length === 0) {
    showError('Failed to parse CSV: ' + result.errors[0].message);
    return;
  }

  allRows = result.data;
  const headers = result.meta.fields || [];

  /* Identify numeric columns */
  numericCols = headers.filter(h =>
    allRows.some(r => r[h] !== null && r[h] !== '' && !isNaN(Number(r[h])))
  );

  /* Identify possible category / label columns */
  const categoryCols = headers.filter(h => !numericCols.includes(h));

  fileNameEl.textContent = fileName;
  rowCountEl.textContent = allRows.length;
  colCountEl.textContent = headers.length;

  buildXAxisOptions(headers, categoryCols);
  buildColorByOptions(categoryCols);
  buildParamCheckboxes();
  renderTable(headers);
  buildSummaryStats();
  buildWQI();

  appSection.classList.remove('hidden');
  renderChart();
}

/* ═══════════════════════════════════════════
   Build UI controls
═══════════════════════════════════════════ */
function buildXAxisOptions(headers, categoryCols) {
  xAxisSel.innerHTML = '';
  headers.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = friendlyName(h);
    /* Default: prefer Date or first category col */
    if (h.toLowerCase().includes('date') || h.toLowerCase().includes('time')) opt.selected = true;
    xAxisSel.appendChild(opt);
  });
}

function buildColorByOptions(categoryCols) {
  colorBySel.innerHTML = '<option value="">— None —</option>';
  categoryCols.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = friendlyName(h);
    if (h.toLowerCase().includes('location') || h.toLowerCase().includes('site')) opt.selected = true;
    colorBySel.appendChild(opt);
  });
}

function buildParamCheckboxes() {
  paramChecks.innerHTML = '';
  numericCols.forEach((col, i) => {
    const color = PALETTE[i % PALETTE.length];
    const label = document.createElement('label');
    label.className = 'param-check checked';
    label.style.background = color;
    label.innerHTML = `
      <input type="checkbox" value="${col}" checked>
      <span class="dot" style="background:#fff"></span>
      ${friendlyName(col)}
    `;
    label.querySelector('input').addEventListener('change', function () {
      label.classList.toggle('checked', this.checked);
      label.style.background = this.checked ? color : '#fff';
      label.style.color = this.checked ? '#fff' : '';
    });
    paramChecks.appendChild(label);
  });
}

/* ═══════════════════════════════════════════
   Chart rendering
═══════════════════════════════════════════ */
renderBtn.addEventListener('click', renderChart);
chartTypeSel.addEventListener('change', renderChart);

function selectedParams() {
  return [...paramChecks.querySelectorAll('input:checked')].map(i => i.value);
}

function renderChart() {
  const xCol   = xAxisSel.value;
  const colorBy = colorBySel.value;
  const type   = chartTypeSel.value;
  const params = selectedParams();

  if (!params.length) {
    showError('Select at least one parameter to chart.');
    return;
  }
  hideError();

  if (activeChart) { activeChart.destroy(); activeChart = null; }

  if (type === 'scatter') {
    renderScatter(xCol, params[0], colorBy);
    return;
  }

  /* Group by colorBy column (or treat as single series) */
  const groups = groupData(colorBy);

  const labels = type === 'bar'
    ? [...new Set(allRows.map(r => String(r[xCol])))]
    : [...new Set(allRows.map(r => String(r[xCol])))].sort();

  const datasets = [];
  let colorIdx = 0;

  if (colorBy && groups.size > 1) {
    /* One dataset per group, one chart per param */
    params.forEach(param => {
      groups.forEach((rows, groupVal) => {
        const color = PALETTE[colorIdx++ % PALETTE.length];
        const dataMap = {};
        rows.forEach(r => { dataMap[String(r[xCol])] = Number(r[param]); });
        datasets.push({
          label: `${friendlyName(param)} – ${groupVal}`,
          data: labels.map(l => dataMap[l] ?? null),
          borderColor: color,
          backgroundColor: hexAlpha(color, type === 'bar' ? 0.75 : 0.2),
          tension: 0.35,
          fill: type === 'area',
          pointRadius: 4,
          spanGaps: true,
        });
      });
    });
  } else {
    params.forEach((param, i) => {
      const color = PALETTE[i % PALETTE.length];
      const dataMap = {};
      allRows.forEach(r => { dataMap[String(r[xCol])] = Number(r[param]); });
      datasets.push({
        label: friendlyName(param),
        data: labels.map(l => dataMap[l] ?? null),
        borderColor: color,
        backgroundColor: hexAlpha(color, type === 'bar' ? 0.75 : 0.2),
        tension: 0.35,
        fill: type === 'area',
        pointRadius: 4,
        spanGaps: true,
      });
    });
  }

  const chartType = type === 'area' ? 'line' : type;

  activeChart = new Chart(chartCanvas, {
    type: chartType,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 14, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const col = numericCols[ctx.datasetIndex % numericCols.length];
              const meta = PARAM_META[col];
              const unit = meta ? meta.unit : '';
              return ` ${ctx.dataset.label}: ${ctx.parsed.y ?? ctx.parsed}${unit ? ' ' + unit : ''}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 45, font: { size: 11 } } },
        y: { beginAtZero: false, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderScatter(xCol, yCol, colorBy) {
  const groups = groupData(colorBy);
  const datasets = [];
  let colorIdx = 0;

  groups.forEach((rows, groupVal) => {
    const color = PALETTE[colorIdx++ % PALETTE.length];
    datasets.push({
      label: colorBy ? String(groupVal) : friendlyName(yCol),
      data: rows.map(r => ({ x: r[xCol], y: r[yCol] })),
      backgroundColor: hexAlpha(color, 0.7),
      borderColor: color,
      pointRadius: 6,
    });
  });

  activeChart = new Chart(chartCanvas, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: (${ctx.parsed.x}, ${ctx.parsed.y})`
          }
        }
      },
      scales: {
        x: { title: { display: true, text: friendlyName(xCol) } },
        y: { title: { display: true, text: friendlyName(yCol) } }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   Data table
═══════════════════════════════════════════ */
function renderTable(headers) {
  tableHead.innerHTML = '<tr>' + headers.map(h => `<th>${friendlyName(h)}</th>`).join('') + '</tr>';
  tableBody.innerHTML = allRows.map(row =>
    '<tr>' + headers.map(h => `<td>${row[h] ?? ''}</td>`).join('') + '</tr>'
  ).join('');
}

/* ═══════════════════════════════════════════
   Summary statistics
═══════════════════════════════════════════ */
function buildSummaryStats() {
  /* Count unique locations / sites */
  const locationCol = Object.keys(allRows[0] || {}).find(k =>
    k.toLowerCase().includes('location') || k.toLowerCase().includes('site')
  );
  const sites = locationCol ? new Set(allRows.map(r => r[locationCol])).size : '—';

  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${allRows.length}</div>
      <div class="stat-label">Total Readings</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${numericCols.length}</div>
      <div class="stat-label">Parameters</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${sites}</div>
      <div class="stat-label">Monitoring Sites</div>
    </div>
  `;

  numericCols.slice(0, 4).forEach(col => {
    const vals = allRows.map(r => Number(r[col])).filter(v => !isNaN(v));
    const avg = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2);
    const meta = PARAM_META[col];
    statsGrid.innerHTML += `
      <div class="stat-card">
        <div class="stat-value">${avg}<small style="font-size:0.7rem"> ${meta?.unit||''}</small></div>
        <div class="stat-label">Avg ${meta?.label || friendlyName(col)}</div>
      </div>
    `;
  });
}

/* ═══════════════════════════════════════════
   Water Quality Index per site
═══════════════════════════════════════════ */
function buildWQI() {
  const locationCol = Object.keys(allRows[0] || {}).find(k =>
    k.toLowerCase().includes('location') || k.toLowerCase().includes('site')
  );
  if (!locationCol) { wqiSection.classList.add('hidden'); return; }

  const sites = [...new Set(allRows.map(r => r[locationCol]))];
  const knownParams = Object.keys(PARAM_META).filter(k => numericCols.includes(k));
  if (!knownParams.length) { wqiSection.classList.add('hidden'); return; }

  wqiSection.classList.remove('hidden');
  wqiBody.innerHTML = '';

  sites.forEach(site => {
    const rows = allRows.filter(r => r[locationCol] === site);
    let scores = [];

    knownParams.forEach(param => {
      const vals = rows.map(r => Number(r[param])).filter(v => !isNaN(v));
      if (!vals.length) return;
      const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
      const [lo, hi] = PARAM_META[param].safe;

      /* Simple sub-index: 100 = perfect, 0 = terrible */
      let sub;
      if (param === 'Coliform_CFU_100mL') {
        sub = avg === 0 ? 100 : Math.max(0, 100 - avg);
      } else if (lo === hi) {
        sub = 50;
      } else {
        const mid = (lo + hi) / 2;
        const range = (hi - lo) / 2;
        sub = Math.max(0, 100 - Math.abs(avg - mid) / range * 50);
      }
      scores.push(sub);
    });

    const wqi = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
    const { cls, label } = wqiClass(wqi);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${site}</strong></td>
      <td>${rows.length}</td>
      <td>${wqi !== null ? `<span class="wqi-badge ${cls}">${wqi} – ${label}</span>` : '—'}</td>
    `;
    wqiBody.appendChild(tr);
  });
}

function wqiClass(wqi) {
  if (wqi >= 90) return { cls: 'wqi-excellent', label: 'Excellent' };
  if (wqi >= 70) return { cls: 'wqi-good',      label: 'Good'      };
  if (wqi >= 50) return { cls: 'wqi-fair',       label: 'Fair'      };
  if (wqi >= 25) return { cls: 'wqi-poor',       label: 'Poor'      };
  return             { cls: 'wqi-bad',            label: 'Very Poor' };
}

/* ═══════════════════════════════════════════
   Helpers
═══════════════════════════════════════════ */
function groupData(colorBy) {
  const map = new Map();
  if (!colorBy) {
    map.set('All', allRows);
  } else {
    allRows.forEach(row => {
      const key = row[colorBy];
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
  }
  return map;
}

function friendlyName(col) {
  return col.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}

function hideError() {
  errorBox.classList.add('hidden');
}
