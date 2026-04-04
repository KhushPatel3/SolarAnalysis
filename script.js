// ---------- TAB NAVIGATION (DESKTOP & MOBILE) ----------
function setupTabNavigation() {
  const desktopTabs = document.querySelectorAll('.tab-btn');
  const mobileTabs  = document.querySelectorAll('.mobile-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  function switchTab(tabId) {
    desktopTabs.forEach(t => t.classList.remove('active'));
    const activeDesktopTab = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (activeDesktopTab) activeDesktopTab.classList.add('active');

    mobileTabs.forEach(t => t.classList.remove('active'));
    const activeMobileTab = document.querySelector(`.mobile-tab-btn[data-tab="${tabId}"]`);
    if (activeMobileTab) activeMobileTab.classList.add('active');

    tabContents.forEach(c => c.classList.remove('active'));
    const activeContent = document.getElementById(tabId);
    if (activeContent) activeContent.classList.add('active');

    tabContents.forEach(c => c.setAttribute('aria-hidden', c.id !== tabId));

    // Lazy-load comparison when that tab is first opened
    if (tabId === 'compare') loadComparisonIfNeeded();
  }

  desktopTabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  mobileTabs.forEach(tab  => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
}

setupTabNavigation();

// Register Chart.js annotation plugin
if (window['chartjs-plugin-annotation']) {
  Chart.register(window['chartjs-plugin-annotation']);
}

// ---------- GLOBAL STATE ----------
let globalMonthlyTotals = [];
let globalDailyData     = [];
let currentYear         = 2025;
const yearDataCache     = {};   // { 2025: {...}, 2026: {...} }
let forecastCache       = null; // cached Open-Meteo forecast response

const SEASON_BOUNDARIES = [2.5, 5.5, 8.5];

function createSeasonAnnotations() {
  return SEASON_BOUNDARIES.map(pos => ({
    type: 'line', xMin: pos, xMax: pos,
    borderColor: '#00000055', borderWidth: 1, borderDash: [5, 5]
  }));
}

// ---------- HELPER: load + cache one year's full data ----------
async function loadYearData(year) {
  if (yearDataCache[year]) return yearDataCache[year];
  const sheetResult = await fetchSheetData(year);
  // Capture the data-period text that fetchSheetData wrote as a side-effect
  const dataPeriodText = document.getElementById('data-period').textContent;
  const weatherYearData = sheetResult.latestDate
    ? await fetchWeatherData(year, sheetResult.latestDate)
    : null;
  yearDataCache[year] = { ...sheetResult, weatherYearData, dataPeriodText };
  return yearDataCache[year];
}

// ---------- RENDER SUMMARY ----------
function renderSummary(monthlyTotals) {
  const totalImport = monthlyTotals.reduce((s, m) => s + m.import, 0);
  const totalExport = monthlyTotals.reduce((s, m) => s + m.export, 0);
  const totalBill   = monthlyTotals.reduce((s, m) => s + m.bill, 0);
  const totalDays   = monthlyTotals.reduce((s, m) => s + m.days, 0) || 1;
  const netEnergy   = totalExport - totalImport;
  const billedMonths = monthlyTotals.filter(m => m.bill !== 0).length || 1;

  document.getElementById('total-import').textContent = `${totalImport.toFixed(1)} kWh`;
  document.getElementById('avg-import').textContent   = `Avg: ${(totalImport / totalDays).toFixed(1)} kWh/day`;
  document.getElementById('total-export').textContent = `${totalExport.toFixed(1)} kWh`;
  document.getElementById('avg-export').textContent   = `Avg: ${(totalExport / totalDays).toFixed(1)} kWh/day`;
  document.getElementById('net-energy').textContent   = `${netEnergy > 0 ? '+' : ''}${netEnergy.toFixed(1)} kWh`;
  document.getElementById('total-bill').textContent   = `$${totalBill.toFixed(2)}`;
  document.getElementById('avg-bill').textContent     = `Avg: $${(totalBill / billedMonths).toFixed(2)}/month`;

  const withData          = monthlyTotals.filter(m => m.days > 0);
  const bestExportMonth   = withData.slice().sort((a, b) => b.export - a.export)[0];
  const worstImportMonth  = withData.slice().sort((a, b) => b.import - a.import)[0];
  const bestNetMonth      = withData.slice().sort((a, b) => b.net - a.net)[0];
  const worstNetMonth     = withData.slice().sort((a, b) => a.net - b.net)[0];
  const cheapestMonth     = withData.filter(m => m.bill !== 0).slice().sort((a, b) => a.bill - b.bill)[0];
  const mostExpensiveMonth= withData.filter(m => m.bill !== 0).slice().sort((a, b) => b.bill - a.bill)[0];
  const positiveMonths    = withData.filter(m => m.net > 0).length;

  const insightList = [
    `Best export month: <strong>${bestExportMonth?.month}</strong> — ${bestExportMonth?.export.toFixed(1)} kWh exported`,
    `Highest import month: <strong>${worstImportMonth?.month}</strong> — ${worstImportMonth?.import.toFixed(1)} kWh drawn from grid`,
    `Best net surplus: <strong>${bestNetMonth?.month}</strong> at +${bestNetMonth?.net.toFixed(1)} kWh`,
    `Biggest net deficit: <strong>${worstNetMonth?.month}</strong> at ${worstNetMonth?.net.toFixed(1)} kWh`,
    cheapestMonth ? `Lowest bill month: <strong>${cheapestMonth.month}</strong> at $${cheapestMonth.bill.toFixed(2)}` : null,
    mostExpensiveMonth ? `Highest bill month: <strong>${mostExpensiveMonth.month}</strong> at $${mostExpensiveMonth.bill.toFixed(2)}` : null,
    `Net-positive months: <strong>${positiveMonths}</strong> out of ${withData.length} recorded`
  ].filter(Boolean);

  const ul = document.getElementById('insights-list');
  ul.innerHTML = '';
  insightList.forEach(text => {
    const li = document.createElement('li');
    li.innerHTML = text;
    ul.appendChild(li);
  });

  const table = document.getElementById('monthly-table');
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  monthlyTotals.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.month}</td>
      <td>${m.import.toFixed(1)}</td>
      <td>${m.export.toFixed(1)}</td>
      <td style="color:${m.net > 0 ? '#16a34a' : '#dc2626'}">${m.net.toFixed(1)}</td>
      <td style="color:${m.bill < 0 ? '#16a34a' : '#dc2626'}"><strong>${m.bill !== 0 ? '$' + m.bill.toFixed(2) : '--'}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  let tfoot = table.querySelector('tfoot');
  if (!tfoot) { tfoot = document.createElement('tfoot'); table.appendChild(tfoot); }
  tfoot.innerHTML = `
    <tr>
      <td>TOTAL</td>
      <td>${totalImport.toFixed(1)}</td>
      <td>${totalExport.toFixed(1)}</td>
      <td style="color:${netEnergy > 0 ? '#16a34a' : '#dc2626'}">${netEnergy.toFixed(1)}</td>
      <td style="color:${totalBill < 0 ? '#16a34a' : '#dc2626'}">$${totalBill.toFixed(2)}</td>
    </tr>
  `;

  const labels = monthlyTotals.map(m => m.month.slice(0, 3));

  ['monthly-bar-chart', 'monthly-line-chart', 'monthly-bill-chart'].forEach(id => {
    const c = Chart.getChart(id); if (c) c.destroy();
  });

  new Chart(document.getElementById('monthly-bar-chart'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Import (kWh)', data: monthlyTotals.map(m => m.import), backgroundColor: '#ef4444' },
      { label: 'Export (kWh)', data: monthlyTotals.map(m => m.export), backgroundColor: '#22c55e' }
    ]},
    options: { responsive: true, maintainAspectRatio: true, plugins: {
      annotation: { annotations: createSeasonAnnotations() },
      legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
    }, scales: {
      x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
      y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } }
    }}
  });

  new Chart(document.getElementById('monthly-line-chart'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Net Energy (kWh)', data: monthlyTotals.map(m => m.net), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4 }]},
    options: { responsive: true, maintainAspectRatio: true, plugins: {
      annotation: { annotations: createSeasonAnnotations() },
      legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
    }, scales: {
      x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
      y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } }
    }}
  });

  new Chart(document.getElementById('monthly-bill-chart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Bill ($)', data: monthlyTotals.map(m => m.bill), backgroundColor: monthlyTotals.map(m => m.bill < 0 ? '#16a34a' : '#dc2626') }]},
    options: { responsive: true, maintainAspectRatio: true, plugins: {
      legend: { display: false },
      annotation: { annotations: createSeasonAnnotations() }
    }, scales: {
      x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
      y: { beginAtZero: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } }
    }}
  });
}

// ---------- RENDER CUMULATIVE ----------
function renderCumulative(monthlyTotals) {
  const existing = Chart.getChart('cumulative-chart');
  if (existing) existing.destroy();

  const withData = monthlyTotals.filter(m => m.days > 0);
  if (withData.length === 0) return;

  let cumImport = 0, cumExport = 0, cumBill = 0;
  const labels = [], cumImports = [], cumExports = [], cumNets = [], cumBills = [];

  withData.forEach(m => {
    cumImport += m.import;
    cumExport += m.export;
    cumBill   += m.bill;
    labels.push(m.month.slice(0, 3));
    cumImports.push(parseFloat(cumImport.toFixed(1)));
    cumExports.push(parseFloat(cumExport.toFixed(1)));
    cumNets.push(parseFloat((cumExport - cumImport).toFixed(1)));
    cumBills.push(parseFloat(cumBill.toFixed(2)));
  });

  const tp = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
  const ts = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');

  new Chart(document.getElementById('cumulative-chart'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Cumulative Import (kWh)', data: cumImports, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.07)', fill: true, tension: 0.3, yAxisID: 'y', pointRadius: 3 },
      { label: 'Cumulative Export (kWh)', data: cumExports, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.07)', fill: true, tension: 0.3, yAxisID: 'y', pointRadius: 3 },
      { label: 'Cumulative Net (kWh)',    data: cumNets,    borderColor: '#3b82f6', backgroundColor: 'transparent', tension: 0.3, borderDash: [5, 4], yAxisID: 'y', pointRadius: 3 },
      { label: 'Cumulative Bill ($)',     data: cumBills,   borderColor: '#8b5cf6', backgroundColor: 'transparent', tension: 0.3, borderWidth: 2, yAxisID: 'yBill', pointRadius: 3 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: tp } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.yAxisID === 'yBill'
              ? ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`
              : ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} kWh`
          }
        }
      },
      scales: {
        x: { ticks: { color: ts } },
        y: { beginAtZero: true, ticks: { color: ts }, title: { display: true, text: 'Energy (kWh)', color: ts } },
        yBill: { position: 'right', ticks: { color: '#8b5cf6', callback: v => `$${v.toFixed(0)}` }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Cumulative Bill ($)', color: '#8b5cf6' } }
      }
    }
  });
}

// ---------- RENDER DAILY ----------
function renderDaily(dailyData, months, weatherYearData, year) {
  const monthSelect = document.getElementById('month-select');

  function updateDailyView() {
    const selectedMonth = parseInt(monthSelect.value);
    const month = months[selectedMonth];

    const dailyImport = [], dailyExport = [], days = [];
    for (let r = 0; r < 31; r++) {
      const imp = dailyData[r]?.c[month.colStart]?.v;
      const exp = dailyData[r]?.c[month.colStart + 1]?.v;
      if ((imp != null && imp !== '') || (exp != null && exp !== '')) {
        days.push(r + 1);
        dailyImport.push(imp != null && imp !== '' ? parseFloat(imp) : 0);
        dailyExport.push(exp != null && exp !== '' ? parseFloat(exp) : 0);
      }
    }

    const daysCount  = days.length;
    const avgImport  = daysCount > 0 ? dailyImport.reduce((a, b) => a + b, 0) / daysCount : 0;
    const avgExport  = daysCount > 0 ? dailyExport.reduce((a, b) => a + b, 0) / daysCount : 0;
    const bestDayIdx = dailyExport.indexOf(Math.max(...dailyExport));
    const bestDay    = bestDayIdx >= 0 ? `Day ${days[bestDayIdx]}` : 'N/A';

    const billRaw  = dailyData[31]?.c[month.colStart]?.v ?? dailyData[31]?.c[month.colStart + 1]?.v
                  ?? dailyData[35]?.c[month.colStart]?.v ?? dailyData[35]?.c[month.colStart + 1]?.v;
    const monthBill = billRaw ? parseFloat(String(billRaw).replace(/[^0-9.-]+/g, '')) : null;

    document.getElementById('days-recorded').textContent     = daysCount;
    document.getElementById('daily-avg-import').textContent  = `${avgImport.toFixed(1)} kWh`;
    document.getElementById('daily-avg-export').textContent  = `${avgExport.toFixed(1)} kWh`;
    document.getElementById('best-day').textContent          = bestDay;
    const billEl = document.getElementById('daily-monthly-bill');
    if (billEl) billEl.textContent = monthBill !== null ? `$${monthBill.toFixed(2)}` : '--';

    const weather = weatherYearData ? getWeatherForMonth(weatherYearData, selectedMonth, year) : null;
    let radiationMapped = [], sunshineMapped = [], cloudMapped = [], rainMapped = [];

    if (weather) {
      radiationMapped = days.map(d => { const i = weather.days.indexOf(d); return i >= 0 ? weather.radiation[i] : null; });
      sunshineMapped  = days.map(d => { const i = weather.days.indexOf(d); return i >= 0 ? weather.sunshine_hours[i] : null; });
      cloudMapped     = days.map(d => { const i = weather.days.indexOf(d); return i >= 0 ? weather.cloud_cover[i] : null; });
      rainMapped      = days.map(d => { const i = weather.days.indexOf(d); return i >= 0 ? weather.precipitation[i] : null; });

      const validSun   = sunshineMapped.filter(v => v !== null);
      const validCloud = cloudMapped.filter(v => v !== null);
      const validRain  = rainMapped.filter(v => v !== null);
      document.getElementById('avg-sunshine').textContent = validSun.length   ? `${(validSun.reduce((a,b)=>a+b,0)/validSun.length).toFixed(1)} hrs` : '--';
      document.getElementById('avg-cloud').textContent    = validCloud.length ? `${Math.round(validCloud.reduce((a,b)=>a+b,0)/validCloud.length)}%` : '--';
      document.getElementById('total-rain').textContent   = validRain.length  ? `${validRain.reduce((a,b)=>a+b,0).toFixed(1)} mm` : '--';

      const pairs = days.map((d, i) => {
        const wi = weather.days.indexOf(d);
        return wi >= 0 ? { day: d, export: dailyExport[i], radiation: weather.radiation[wi] } : null;
      }).filter(Boolean);

      if (pairs.length > 3) {
        const sorted = pairs.slice().sort((a, b) => b.radiation - a.radiation);
        const top3 = sorted.slice(0, 3), bot3 = sorted.slice(-3);
        const avgTop = top3.reduce((s, p) => s + p.export, 0) / top3.length;
        const avgBot = bot3.reduce((s, p) => s + p.export, 0) / bot3.length;
        const corrEl = document.getElementById('weather-correlation');
        if (corrEl) corrEl.innerHTML = `
          <div class="weather-corr-row"><span class="corr-label">☀️ Top 3 sunniest days — avg export</span><span class="corr-value positive">${avgTop.toFixed(1)} kWh</span></div>
          <div class="weather-corr-row"><span class="corr-label">☁️ Bottom 3 cloudiest days — avg export</span><span class="corr-value negative">${avgBot.toFixed(1)} kWh</span></div>
          <div class="weather-corr-row"><span class="corr-label">📈 Clear-day multiplier</span><span class="corr-value">${avgBot > 0 ? (avgTop / avgBot).toFixed(1) : '∞'}× more export on clear days</span></div>
        `;
      }
      document.getElementById('weather-stats-section').style.display = '';
    } else {
      document.getElementById('weather-stats-section').style.display = 'none';
    }

    const existing = Chart.getChart('daily-chart');
    if (existing) existing.destroy();

    const tp = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
    const ts = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');

    const datasets = [
      { label: 'Import (kWh)',  data: dailyImport, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)',  fill: true, tension: 0.3, yAxisID: 'y' },
      { label: 'Export (kWh)', data: dailyExport, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3, yAxisID: 'y' }
    ];

    if (weather && radiationMapped.length) {
      datasets.push({
        label: 'Solar Radiation (MJ/m²)', data: radiationMapped,
        borderColor: 'rgba(251,191,36,0.9)', backgroundColor: 'rgba(251,191,36,0.1)',
        fill: true, tension: 0.3, borderDash: [4, 3], pointRadius: 0, yAxisID: 'yWeather', order: 10
      });
    }

    const scales = {
      x: { ticks: { color: ts } },
      y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Energy (kWh)', color: ts }, ticks: { color: ts } }
    };
    if (weather) {
      scales.yWeather = {
        beginAtZero: true, position: 'right',
        title: { display: true, text: 'Radiation (MJ/m²)', color: 'rgba(251,191,36,1)' },
        ticks: { color: 'rgba(251,191,36,1)' }, grid: { drawOnChartArea: false }
      };
    }

    new Chart(document.getElementById('daily-chart'), {
      type: 'line',
      data: { labels: days.map(d => `Day ${d}`), datasets },
      options: {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: tp } },
          tooltip: { callbacks: { label: ctx => {
            const unit = ctx.dataset.yAxisID === 'yWeather' ? ' MJ/m²' : ' kWh';
            return ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) : '--'}${unit}`;
          }}}
        },
        scales
      }
    });
  }

  monthSelect.addEventListener('change', updateDailyView);
  updateDailyView();
}

// ---------- RENDER SEASONAL ----------
function renderSeasonal(monthlyTotals) {
  const SEASONS = {
    'Summer ☀️': ['December','January','February'],
    'Autumn 🍂': ['March','April','May'],
    'Winter ❄️': ['June','July','August'],
    'Spring 🌱': ['September','October','November']
  };
  const SEASON_COLORS = {
    'Summer ☀️': { bg: '#f97316', light: 'rgba(249,115,22,0.15)' },
    'Autumn 🍂': { bg: '#b45309', light: 'rgba(180,83,9,0.15)' },
    'Winter ❄️': { bg: '#3b82f6', light: 'rgba(59,130,246,0.15)' },
    'Spring 🌱': { bg: '#22c55e', light: 'rgba(34,197,94,0.15)' }
  };

  const withData     = monthlyTotals.filter(m => m.days > 0);
  const seasonData   = [];

  for (const s in SEASONS) {
    const months         = SEASONS[s].map(name => monthlyTotals.find(x => x.month === name)).filter(Boolean);
    const monthsWithData = months.filter(m => m.days > 0);
    let imp = 0, exp = 0, bill = 0, days = 0;
    months.forEach(m => { imp += m.import; exp += m.export; bill += m.bill; days += m.days; });
    const net = exp - imp;
    seasonData.push({
      season: s, import: imp, export: exp, net, bill, days,
      avgDailyExport: days > 0 ? exp / days : 0,
      avgDailyImport: days > 0 ? imp / days : 0,
      peakExportMonth: monthsWithData.slice().sort((a,b) => b.export - a.export)[0],
      peakImportMonth: monthsWithData.slice().sort((a,b) => b.import - a.import)[0],
      monthNames: SEASONS[s], color: SEASON_COLORS[s]
    });
  }

  const tp = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
  const ts = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');

  const sc = Chart.getChart('seasonal-bar-chart'); if (sc) sc.destroy();
  new Chart(document.getElementById('seasonal-bar-chart'), {
    type: 'bar',
    data: {
      labels: seasonData.map(s => s.season),
      datasets: [
        { label: 'Import (kWh)', data: seasonData.map(s => s.import), backgroundColor: '#ef4444' },
        { label: 'Export (kWh)', data: seasonData.map(s => s.export), backgroundColor: '#22c55e' },
        { label: 'Bill ($)', data: seasonData.map(s => s.bill),
          backgroundColor: seasonData.map(s => s.bill < 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'),
          type: 'line', yAxisID: 'yBill', borderColor: '#8b5cf6', borderWidth: 2,
          pointBackgroundColor: '#8b5cf6', tension: 0.3, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        title: { display: true, text: 'Seasonal Energy & Bill Overview', color: tp, font: { size: 14, weight: 'bold' } },
        legend: { labels: { color: tp } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.yAxisID === 'yBill'
          ? ` Bill: $${ctx.parsed.y.toFixed(2)}` : ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} kWh` } }
      },
      scales: {
        x: { ticks: { color: ts } },
        y: { ticks: { color: ts }, title: { display: true, text: 'Energy (kWh)', color: ts } },
        yBill: { position: 'right', ticks: { color: '#8b5cf6', callback: v => `$${v.toFixed(0)}` }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Bill ($)', color: '#8b5cf6' } }
      }
    }
  });

  const mc = Chart.getChart('seasonal-monthly-chart'); if (mc) mc.destroy();
  const allLabels = monthlyTotals.map(m => m.month.slice(0, 3));
  new Chart(document.getElementById('seasonal-monthly-chart'), {
    type: 'bar',
    data: {
      labels: allLabels,
      datasets: [
        { label: 'Import (kWh)', data: monthlyTotals.map(m => m.import), backgroundColor: '#ef444488', borderColor: '#ef4444', borderWidth: 1 },
        { label: 'Export (kWh)', data: monthlyTotals.map(m => m.export), backgroundColor: '#22c55e88', borderColor: '#22c55e', borderWidth: 1 },
        { label: 'Net (kWh)',    data: monthlyTotals.map(m => m.net), type: 'line', borderColor: '#3b82f6', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0.4, yAxisID: 'y' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { annotation: { annotations: createSeasonAnnotations() }, legend: { labels: { color: tp } }, tooltip: { mode: 'index', intersect: false } },
      scales: { x: { ticks: { color: ts } }, y: { ticks: { color: ts }, title: { display: true, text: 'Energy (kWh)', color: ts } } }
    }
  });

  const summaryDiv = document.getElementById('seasonal-summary');
  summaryDiv.innerHTML = '';
  const bestSeason  = seasonData.slice().sort((a, b) => b.net - a.net)[0];
  const worstSeason = seasonData.slice().sort((a, b) => a.net - b.net)[0];

  seasonData.forEach(s => {
    const isBest  = s.season === bestSeason.season;
    const isWorst = s.season === worstSeason.season;
    const badge   = isBest ? '<span class="season-badge best">Best</span>' : isWorst ? '<span class="season-badge worst">Hardest</span>' : '';
    const d = document.createElement('div');
    d.className = 'card season-card';
    d.innerHTML = `
      <div class="season-card-header" style="border-left: 4px solid ${s.color.bg}">
        <h4>${s.season} ${badge}</h4>
        <span class="season-months">${s.monthNames.join(' · ')}</span>
      </div>
      <div class="season-stats-grid">
        <div class="season-stat"><span class="season-stat-label">Import</span><span class="season-stat-val" style="color:#ef4444">${s.import.toFixed(1)} kWh</span></div>
        <div class="season-stat"><span class="season-stat-label">Export</span><span class="season-stat-val" style="color:#22c55e">${s.export.toFixed(1)} kWh</span></div>
        <div class="season-stat"><span class="season-stat-label">Net</span><span class="season-stat-val" style="color:${s.net>=0?'#16a34a':'#dc2626'}">${s.net>0?'+':''}${s.net.toFixed(1)} kWh</span></div>
        <div class="season-stat"><span class="season-stat-label">Bill</span><span class="season-stat-val" style="color:${s.bill<=0?'#16a34a':'#dc2626'}">$${s.bill.toFixed(2)}</span></div>
        <div class="season-stat"><span class="season-stat-label">Avg Export/day</span><span class="season-stat-val">${s.avgDailyExport.toFixed(1)} kWh</span></div>
        <div class="season-stat"><span class="season-stat-label">Avg Import/day</span><span class="season-stat-val">${s.avgDailyImport.toFixed(1)} kWh</span></div>
      </div>
    `;
    summaryDiv.appendChild(d);
  });

  const bestBillSeason  = seasonData.slice().sort((a, b) => a.bill - b.bill)[0];
  const worstBillSeason = seasonData.slice().sort((a, b) => b.bill - a.bill)[0];
  const summerData = seasonData.find(s => s.season.startsWith('Summer'));
  const winterData = seasonData.find(s => s.season.startsWith('Winter'));
  const exportRatio = winterData && winterData.export > 0 ? (summerData?.export / winterData.export).toFixed(1) : '—';
  const importRatio = winterData && summerData ? (winterData.import / summerData.import).toFixed(1) : '—';

  document.getElementById('seasonal-pattern-analysis').innerHTML = `
    <div class="card">
      <h3>🔍 Pattern Analysis</h3>
      <div class="pattern-grid">
        <div class="pattern-item"><span class="pattern-icon">📈</span><div><strong>Summer vs Winter export:</strong> ${exportRatio}× more energy exported in summer than winter${summerData ? ` (${summerData.export.toFixed(0)} vs ${winterData?.export.toFixed(0)} kWh)` : ''}</div></div>
        <div class="pattern-item"><span class="pattern-icon">📉</span><div><strong>Winter grid reliance:</strong> ${importRatio}× more imported from grid in winter vs summer — peak demand months are ${winterData?.peakImportMonth?.month ?? '—'}</div></div>
        <div class="pattern-item"><span class="pattern-icon">💸</span><div><strong>Best bill season:</strong> ${bestBillSeason.season} at $${bestBillSeason.bill.toFixed(2)} total — ${bestBillSeason.bill <= 0 ? 'you were in credit for the whole season' : 'lowest spend of the year'}</div></div>
        <div class="pattern-item"><span class="pattern-icon">⚡</span><div><strong>Costliest season:</strong> ${worstBillSeason.season} at $${worstBillSeason.bill.toFixed(2)} — averaging $${worstBillSeason.days > 0 ? (worstBillSeason.bill / (worstBillSeason.days / 30)).toFixed(2) : '--'}/month</div></div>
      </div>
    </div>`;

  document.getElementById('seasonal-month-breakdown').innerHTML = `
    <div class="card">
      <h3>📋 Month-by-Month Breakdown</h3>
      <div class="table-wrapper" style="margin-bottom:0;box-shadow:none;border:none;padding:0">
        <table>
          <thead><tr><th>Month</th><th>Season</th><th>Import</th><th>Export</th><th>Net</th><th>Bill</th></tr></thead>
          <tbody>
            ${withData.map(m => {
              const seasonName = Object.entries(SEASONS).find(([, months]) => months.includes(m.month))?.[0] ?? '—';
              const sc2 = SEASON_COLORS[seasonName];
              return `<tr>
                <td><span style="border-left:3px solid ${sc2?.bg ?? '#999'};padding-left:6px">${m.month}</span></td>
                <td style="font-size:0.85rem;color:var(--text-secondary)">${seasonName}</td>
                <td style="color:#ef4444">${m.import.toFixed(1)}</td>
                <td style="color:#22c55e">${m.export.toFixed(1)}</td>
                <td style="color:${m.net >= 0 ? '#16a34a' : '#dc2626'}">${m.net > 0 ? '+' : ''}${m.net.toFixed(1)}</td>
                <td style="color:${m.bill <= 0 ? '#16a34a' : '#dc2626'};font-weight:700">${m.bill !== 0 ? '$' + m.bill.toFixed(2) : '--'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ---------- RENDER RECOMMENDATIONS ----------
function renderRecommendations(monthlyTotals) {
  const withData       = monthlyTotals.filter(m => m.days > 0);
  const totalImport    = withData.reduce((s, m) => s + m.import, 0);
  const totalExport    = withData.reduce((s, m) => s + m.export, 0);
  const totalBill      = withData.reduce((s, m) => s + m.bill, 0);
  const totalDays      = withData.reduce((s, m) => s + m.days, 0) || 1;
  const netEnergy      = totalExport - totalImport;
  const withBill       = withData.filter(m => m.bill !== 0);
  const billedMonths   = withBill.length || 1;
  const avgMonthlyBill = totalBill / billedMonths;

  const worstMonths    = withData.slice().sort((a, b) => a.net - b.net).slice(0, 3);
  const bestMonths     = withData.slice().sort((a, b) => b.net - a.net).slice(0, 3);
  const mostExpensive  = withBill.slice().sort((a, b) => b.bill - a.bill).slice(0, 3);
  const cheapest       = withBill.slice().sort((a, b) => a.bill - b.bill).slice(0, 3);
  const top3Export     = withData.slice().sort((a, b) => b.export - a.export).slice(0, 3);
  const bot3Export     = withData.slice().sort((a, b) => a.export - b.export).slice(0, 3);
  const avgTopDailyExp = top3Export.reduce((s, m) => s + (m.days > 0 ? m.export / m.days : 0), 0) / top3Export.length;
  const avgBotDailyExp = bot3Export.reduce((s, m) => s + (m.days > 0 ? m.export / m.days : 0), 0) / bot3Export.length;

  const biggestDeficit  = withData.slice().sort((a, b) => a.net - b.net)[0];
  const potentialSaving = biggestDeficit ? Math.abs(biggestDeficit.import * 0.3).toFixed(2) : null;
  const perfColor = netEnergy > 0 ? '#16a34a' : '#dc2626';
  const perfWord  = netEnergy > 0 ? 'net positive' : 'net negative';

  document.getElementById('recommendation-content').innerHTML = `
    <div class="card">
      <h3>🎯 Performance Overview</h3>
      <div class="pattern-grid">
        <div class="pattern-item"><span class="pattern-icon">⚡</span><div>System is <strong style="color:${perfColor}">${perfWord}</strong> with a net ${netEnergy > 0 ? 'surplus' : 'deficit'} of <strong>${Math.abs(netEnergy).toFixed(1)} kWh</strong> across ${withData.length} months (${totalDays} days recorded)</div></div>
        <div class="pattern-item"><span class="pattern-icon">💰</span><div>Total electricity cost: <strong style="color:${totalBill < 0 ? '#16a34a' : '#dc2626'}">$${totalBill.toFixed(2)}</strong> — averaging <strong>$${avgMonthlyBill.toFixed(2)}/month</strong> across ${billedMonths} billed months</div></div>
        <div class="pattern-item"><span class="pattern-icon">☀️</span><div>Average daily export: <strong>${(totalExport / totalDays).toFixed(1)} kWh/day</strong> — peaks in ${top3Export.map(m => m.month).join(', ')} at <strong>${avgTopDailyExp.toFixed(1)} kWh/day avg</strong></div></div>
        <div class="pattern-item"><span class="pattern-icon">🔌</span><div>Average daily import: <strong>${(totalImport / totalDays).toFixed(1)} kWh/day</strong> — highest in ${worstMonths.map(m => m.month).join(', ')}</div></div>
      </div>
    </div>
    <div class="card">
      <h3>📉 Months to Focus On</h3>
      <p style="color:var(--text-secondary);font-size:0.92rem;margin-bottom:1rem">Highest grid reliance — targeted behaviour changes here have the most impact.</p>
      <div class="pattern-grid">
        ${worstMonths.map(m => `<div class="pattern-item"><span class="pattern-icon">🔴</span><div><strong>${m.month}:</strong> Net ${m.net.toFixed(1)} kWh — imported ${m.import.toFixed(1)} kWh, exported ${m.export.toFixed(1)} kWh${m.bill !== 0 ? `, bill <strong style="color:#dc2626">$${m.bill.toFixed(2)}</strong>` : ''}</div></div>`).join('')}
      </div>
      ${biggestDeficit ? `<p style="margin-top:1rem">💡 Shifting ~30% of grid loads in <strong>${biggestDeficit.month}</strong> to solar hours could save an estimated <strong>$${potentialSaving}</strong>.</p>` : ''}
    </div>
    <div class="card">
      <h3>✨ Best Performing Months</h3>
      <div class="pattern-grid">
        ${bestMonths.map(m => `<div class="pattern-item"><span class="pattern-icon">🟢</span><div><strong>${m.month}:</strong> Net +${m.net.toFixed(1)} kWh — exported ${m.export.toFixed(1)} kWh (${m.days > 0 ? (m.export/m.days).toFixed(1) : '--'} kWh/day avg)${m.bill !== 0 ? `, bill <strong style="color:#16a34a">$${m.bill.toFixed(2)}</strong>` : ''}</div></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h3>💸 Bill Breakdown</h3>
      <div class="pattern-grid">
        <div class="pattern-item"><span class="pattern-icon">📈</span><div><strong>Most expensive months:</strong> ${mostExpensive.map(m => `${m.month} ($${m.bill.toFixed(2)})`).join(', ')}</div></div>
        <div class="pattern-item"><span class="pattern-icon">📉</span><div><strong>Cheapest months:</strong> ${cheapest.map(m => `${m.month} ($${m.bill.toFixed(2)})`).join(', ')}</div></div>
        <div class="pattern-item"><span class="pattern-icon">📊</span><div><strong>Export season daily avg:</strong> ${avgTopDailyExp.toFixed(1)} kWh — vs <strong>${avgBotDailyExp.toFixed(1)} kWh</strong> in low-export months (${(avgTopDailyExp / Math.max(avgBotDailyExp, 0.1)).toFixed(1)}× difference)</div></div>
      </div>
    </div>
    <div class="card">
      <h3>💡 Optimisation Recommendations</h3>
      <div class="recommendation-section"><h4>🔋 Energy Usage Timing</h4><ul>
        <li>Run high-energy appliances (dishwasher, washing machine, dryer) during peak solar hours (10am–3pm)</li>
        <li>Programme your hot water cylinder to heat during the day — this alone can shift 2–4 kWh/day away from peak tariff hours</li>
        <li>If you have an EV or pool pump, use timers to align with solar production windows</li>
      </ul></div>
      <div class="recommendation-section"><h4>🏠 Winter Strategy</h4><ul>
        <li>Your three weakest months (${worstMonths.map(m => m.month).join(', ')}) account for the bulk of grid costs — focus load-shifting efforts here first</li>
        <li>Pre-heat rooms or water during any sunny midday window, even in winter, to reduce evening grid draw</li>
        <li>Clean solar panels before winter — soiling can reduce output 5–15%</li>
      </ul></div>
      <div class="recommendation-section"><h4>💰 Financial Optimisation</h4><ul>
        <li>Review your export buyback rate — a higher feed-in tariff in summer could meaningfully reduce annual bills</li>
        <li>See the Battery Simulator above for estimated savings from adding battery storage</li>
        <li>Your average monthly bill of $${avgMonthlyBill.toFixed(2)} could be lowered by targeting ${mostExpensive[0]?.month ?? 'peak months'} specifically</li>
      </ul></div>
      <div class="recommendation-section"><h4>📊 Monitoring Tips</h4><ul>
        <li>A sudden drop in export without matching weather change likely indicates panel shading or inverter issues</li>
        <li>Track your export/import ratio month-on-month — a declining ratio in summer suggests degradation</li>
        <li>Clean panels 2–4 times per year; post-winter and mid-summer are the most impactful times</li>
      </ul></div>
    </div>
    <div class="card" style="background:linear-gradient(135deg,#ecfccb 0%,#d9f99d 100%);border:none">
      <h3>🌟 Did You Know?</h3>
      <ul>
        <li>Solar panels still generate on cloudy days — typically 10–25% of clear-day output</li>
        <li>The optimal tilt angle for solar panels in Christchurch is around 43° facing north</li>
        <li>Most panels degrade at ~0.5% efficiency per year — after 20 years you still have ~90% output</li>
        <li>Regular cleaning can recover 5–20% lost output depending on dust and bird activity in your area</li>
      </ul>
    </div>
  `;
}

// ---------- RENDER COMPARISON ----------
function renderComparison(m25, m26) {
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const tp = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
  const ts = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');

  // Months where both years have recorded data
  const overlapping = MONTH_NAMES.filter(mn => {
    const d25 = m25.find(m => m.month === mn);
    const d26 = m26.find(m => m.month === mn);
    return (d25?.days ?? 0) > 0 && (d26?.days ?? 0) > 0;
  });

  // Delta KPIs (overlapping months only for fair comparison)
  const sum = (arr, mn, key) => overlapping.reduce((s, name) => {
    const row = arr.find(m => m.month === name);
    return s + (row ? (row[key] || 0) : 0);
  }, 0);

  const imp25 = sum(m25, null, 'import'), imp26 = sum(m26, null, 'import');
  const exp25 = sum(m25, null, 'export'), exp26 = sum(m26, null, 'export');
  const bill25= sum(m25, null, 'bill'),   bill26= sum(m26, null, 'bill');

  const impDelta  = imp26 - imp25;
  const expDelta  = exp26 - exp25;
  const billDelta = bill26 - bill25;

  const labels = MONTH_NAMES.map(m => m.slice(0, 3));

  const compareContent = document.getElementById('compare-content');
  compareContent.innerHTML = `
    ${overlapping.length < 12 ? `<div class="card compare-info-banner">
      <p>📅 Comparing <strong>${overlapping.length} month${overlapping.length !== 1 ? 's' : ''}</strong> where both years have recorded data${overlapping.length > 0 ? ` (${overlapping[0].slice(0,3)} – ${overlapping[overlapping.length-1].slice(0,3)})` : ''}. Full comparison will expand as 2026 data grows.</p>
    </div>` : ''}

    <div class="card-grid">
      <div class="card ${impDelta < 0 ? 'gradient-green' : 'gradient-red'}">
        <div class="card-icon">⚡</div><h3>Import Δ</h3>
        <p class="metric-value">${impDelta > 0 ? '+' : ''}${impDelta.toFixed(1)} kWh</p>
        <p class="metric-sub">2026 vs 2025 same months</p>
      </div>
      <div class="card ${expDelta > 0 ? 'gradient-green' : 'gradient-red'}">
        <div class="card-icon">☀️</div><h3>Export Δ</h3>
        <p class="metric-value">${expDelta > 0 ? '+' : ''}${expDelta.toFixed(1)} kWh</p>
        <p class="metric-sub">2026 vs 2025 same months</p>
      </div>
      <div class="card ${billDelta < 0 ? 'gradient-green' : 'gradient-red'}">
        <div class="card-icon">💰</div><h3>Bill Δ</h3>
        <p class="metric-value">${billDelta > 0 ? '+' : ''}$${billDelta.toFixed(2)}</p>
        <p class="metric-sub">2026 vs 2025 same months</p>
      </div>
    </div>

    <div class="chart-wrapper"><h3>Monthly Export — 2025 vs 2026</h3><canvas id="compare-export-chart"></canvas></div>
    <div class="chart-wrapper"><h3>Monthly Import — 2025 vs 2026</h3><canvas id="compare-import-chart"></canvas></div>
    <div class="chart-wrapper"><h3>Monthly Bill — 2025 vs 2026</h3><canvas id="compare-bill-chart"></canvas></div>

    <div class="table-wrapper">
      <h3>Side-by-Side Monthly Breakdown</h3>
      <table>
        <thead><tr>
          <th>Month</th>
          <th>Import 25</th><th>Import 26</th>
          <th>Export 25</th><th>Export 26</th>
          <th>Bill 25</th><th>Bill 26</th>
        </tr></thead>
        <tbody>
          ${MONTH_NAMES.map(mn => {
            const d25r = m25.find(m => m.month === mn);
            const d26r = m26.find(m => m.month === mn);
            if (!d25r?.days && !d26r?.days) return '';
            const fmt = (v, color) => v !== undefined && !isNaN(v) ? `<td style="color:${color}">${v.toFixed(1)}</td>` : '<td>—</td>';
            const fmtBill = (m) => m?.bill !== 0 && m?.bill !== undefined ? `<td style="color:${m.bill<=0?'#16a34a':'#dc2626'};font-weight:700">$${m.bill.toFixed(2)}</td>` : '<td>—</td>';
            return `<tr>
              <td><strong>${mn.slice(0,3)}</strong></td>
              ${fmt(d25r?.days > 0 ? d25r.import : undefined, '#ef4444')}
              ${fmt(d26r?.days > 0 ? d26r.import : undefined, '#ef4444')}
              ${fmt(d25r?.days > 0 ? d25r.export : undefined, '#22c55e')}
              ${fmt(d26r?.days > 0 ? d26r.export : undefined, '#22c55e')}
              ${fmtBill(d25r?.days > 0 ? d25r : null)}
              ${fmtBill(d26r?.days > 0 ? d26r : null)}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  const commonOpts = (title) => ({
    responsive: true, maintainAspectRatio: true,
    plugins: { legend: { labels: { color: tp } }, annotation: { annotations: createSeasonAnnotations() }, tooltip: { mode: 'index', intersect: false } },
    scales: { x: { ticks: { color: ts } }, y: { beginAtZero: true, ticks: { color: ts }, title: { display: true, text: title, color: ts } } }
  });

  // Destroy any old charts first
  ['compare-export-chart','compare-import-chart','compare-bill-chart'].forEach(id => {
    const c = Chart.getChart(id); if (c) c.destroy();
  });

  new Chart(document.getElementById('compare-export-chart'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Export 2025 (kWh)', data: m25.map(m => m.export), backgroundColor: 'rgba(34,197,94,0.75)', borderRadius: 3 },
      { label: 'Export 2026 (kWh)', data: m26.map(m => m.export), backgroundColor: 'rgba(34,197,94,0.3)', borderColor: '#22c55e', borderWidth: 2, borderRadius: 3 }
    ]},
    options: commonOpts('Export (kWh)')
  });

  new Chart(document.getElementById('compare-import-chart'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Import 2025 (kWh)', data: m25.map(m => m.import), backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 3 },
      { label: 'Import 2026 (kWh)', data: m26.map(m => m.import), backgroundColor: 'rgba(239,68,68,0.3)', borderColor: '#ef4444', borderWidth: 2, borderRadius: 3 }
    ]},
    options: commonOpts('Import (kWh)')
  });

  new Chart(document.getElementById('compare-bill-chart'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Bill 2025 ($)', data: m25.map(m => m.bill), backgroundColor: m25.map(m => m.bill <= 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)'), borderRadius: 3 },
      { label: 'Bill 2026 ($)', data: m26.map(m => m.bill), backgroundColor: m26.map(m => m.bill <= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'), borderColor: m26.map(m => m.bill <= 0 ? '#22c55e' : '#ef4444'), borderWidth: 2, borderRadius: 3 }
    ]},
    options: commonOpts('Bill ($)')
  });
}

// ---------- LAZY-LOAD COMPARISON ----------
async function loadComparisonIfNeeded() {
  const content  = document.getElementById('compare-content');
  const loading  = document.getElementById('compare-loading');
  if (!content || content.dataset.loaded === 'true') return;

  loading.style.display = '';
  content.style.display = 'none';

  const [data25, data26] = await Promise.all([loadYearData(2025), loadYearData(2026)]);
  renderComparison(data25.monthlyTotals, data26.monthlyTotals);

  // Restore the data-period header for whichever year is currently active
  const cur = yearDataCache[currentYear];
  if (cur?.dataPeriodText) document.getElementById('data-period').textContent = cur.dataPeriodText;

  loading.style.display = 'none';
  content.style.display = '';
  content.dataset.loaded = 'true';
}

// ---------- RENDER FORECAST (UPDATED WITH TEMPERATURE) ----------
async function renderForecast(weatherYearData, dailyData, months, year) {
  const el = document.getElementById('forecast-content');
  if (!el) return;
  el.innerHTML = '<div class="card"><h3>⏳ Fetching 7-day forecast from Open-Meteo...</h3></div>';

  // Fetch forecast (cached) - Updated URL to include temperature_2m_max
  if (!forecastCache) {
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast' +
        '?latitude=-43.54&longitude=172.52' +
        '&daily=sunshine_duration,shortwave_radiation_sum,precipitation_sum,cloud_cover_mean,temperature_2m_max' +
        '&forecast_days=7&timezone=Pacific%2FAuckland'
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      forecastCache = json.daily;
    } catch (err) {
      el.innerHTML = '<div class="card"><h3>❌ Could not load forecast data from Open-Meteo.</h3><p>Check your internet connection and try again.</p></div>';
      return;
    }
  }
  const fc = forecastCache;

  // Build radiation → export ratio from historical data
  let ratioSum = 0, ratioCount = 0;
  if (weatherYearData) {
    months.forEach((m, mi) => {
      const wMonth = getWeatherForMonth(weatherYearData, mi, year);
      if (!wMonth) return;
      for (let r = 0; r < 31; r++) {
        const exp = dailyData[r]?.c[m.colStart + 1]?.v;
        if (exp == null || exp === '') continue;
        const dayNum = r + 1;
        const wi = wMonth.days.indexOf(dayNum);
        if (wi < 0) continue;
        const rad = wMonth.radiation[wi];
        if (rad > 5) {   // ignore near-zero radiation days (noise)
          ratioSum  += parseFloat(exp) / rad;
          ratioCount++;
        }
      }
    });
  }

  const kWhPerMJ   = ratioCount > 0 ? ratioSum / ratioCount : 0.05;
  const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const predictedExports = fc.shortwave_radiation_sum.map(r => Math.max(0, r * kWhPerMJ));
  const weekTotal        = predictedExports.reduce((a, b) => a + b, 0);

  let cardsHtml = fc.time.map((date, i) => {
    const d        = new Date(date + 'T00:00:00');
    const dayName  = DAY_NAMES[d.getDay()];
    const dayStr   = `${d.getDate()}/${d.getMonth()+1}`;
    const sun      = (fc.sunshine_duration[i] / 3600).toFixed(1);
    const rain     = fc.precipitation_sum[i].toFixed(1);
    const cloud    = Math.round(fc.cloud_cover_mean[i]);
    const temp     = Math.round(fc.temperature_2m_max[i]); // Temperature extracted here
    const pred     = predictedExports[i].toFixed(1);
    const predNum  = parseFloat(pred);
    const icon     = cloud > 75 ? '☁️' : cloud > 50 ? '⛅' : parseFloat(sun) > 7 ? '☀️' : '🌤';
    const clr      = predNum > 8 ? '#16a34a' : predNum > 4 ? '#f59e0b' : '#dc2626';

    return `
      <div class="forecast-day-card card">
        <div class="forecast-date">${dayName}<br><span style="font-size:0.75rem">${dayStr}</span></div>
        <div class="forecast-condition">${icon}</div>
        <div class="forecast-export" style="color:${clr}">${pred} kWh</div>
        <div class="forecast-details">
          <span><strong>🌡️ ${temp}°C</strong></span> 
          <span>☀️ ${sun}h</span>
          <span>☁️ ${cloud}%</span>
          <span>🌧 ${rain}mm</span>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="card forecast-info-banner">
      <div class="forecast-summary-row">
        <div><strong>📍 Hornby, Christchurch</strong> · 7-day forecast from Open-Meteo</div>
        <div>Predicted week total: <strong style="color:#22c55e">${weekTotal.toFixed(1)} kWh</strong></div>
        <div style="color:var(--text-secondary);font-size:0.85rem">Model: ${kWhPerMJ.toFixed(3)} kWh/MJ·m² from ${ratioCount} historical days</div>
      </div>
    </div>

    <div class="forecast-cards">${cardsHtml}</div>

    <div class="chart-wrapper">
      <h3>7-Day Predicted Export <span class="chart-legend-note">— line: sunshine hours</span></h3>
      <canvas id="forecast-chart"></canvas>
    </div>

    <div class="card forecast-disclaimer">
      <p>⚠️ <strong>Accuracy note:</strong> Predictions use a linear radiation-to-export model fitted to your historical data.
      Actual output varies with panel angle, shading, temperature, and inverter efficiency. Treat as a rough guide for planning energy usage.</p>
    </div>
  `;

  // Forecast chart
  const existing = Chart.getChart('forecast-chart');
  if (existing) existing.destroy();

  const labels     = fc.time.map((date, i) => { const d = new Date(date + 'T00:00:00'); return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`; });
  const sunHours   = fc.sunshine_duration.map(s => parseFloat((s / 3600).toFixed(1)));
  const tp = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
  const ts = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');

  new Chart(document.getElementById('forecast-chart'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Predicted Export (kWh)', data: predictedExports.map(v => parseFloat(v.toFixed(2))),
        backgroundColor: predictedExports.map(v => v > 8 ? 'rgba(34,197,94,0.8)' : v > 4 ? 'rgba(251,191,36,0.8)' : 'rgba(239,68,68,0.8)'),
        borderRadius: 6, yAxisID: 'y' },
      { label: 'Sunshine Hours', data: sunHours, type: 'line',
        borderColor: 'rgba(251,191,36,1)', backgroundColor: 'transparent',
        borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: 'rgba(251,191,36,1)', tension: 0.3, yAxisID: 'ySun' }
    ]},
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: tp } } },
      scales: {
        x: { ticks: { color: ts } },
        y: { beginAtZero: true, ticks: { color: ts }, title: { display: true, text: 'Predicted Export (kWh)', color: ts } },
        ySun: { position: 'right', beginAtZero: true, ticks: { color: 'rgba(251,191,36,1)' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Sunshine (hrs)', color: 'rgba(251,191,36,1)' } }
      }
    }
  });
}

// ---------- YEAR SWITCHER ----------
async function loadYear(year) {
  currentYear = year;

  document.querySelectorAll('.year-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.year) === year);
  });
  const switcher = document.querySelector('.year-switcher');
  if (switcher) {
    const btns = [...switcher.querySelectorAll('.year-btn')];
    switcher.setAttribute('data-active', btns.findIndex(b => parseInt(b.dataset.year) === year));
  }

  const data = await loadYearData(year);
  const { monthlyTotals, dailyData, months, weatherYearData } = data;

  globalMonthlyTotals = monthlyTotals;
  globalDailyData     = dailyData;

  // Restore correct data-period text for this year
  if (data.dataPeriodText) document.getElementById('data-period').textContent = data.dataPeriodText;

  renderSummary(monthlyTotals);
  renderCumulative(monthlyTotals);
  renderDaily(dailyData, months, weatherYearData, year);
  renderSeasonal(monthlyTotals);
  renderRecommendations(monthlyTotals);
  renderForecast(weatherYearData, dailyData, months, year); // async, updates DOM when ready

  // Invalidate comparison so it reloads fresh if revisited
  const compareContent = document.getElementById('compare-content');
  if (compareContent) compareContent.dataset.loaded = 'false';
}

document.querySelectorAll('.year-btn').forEach(btn => {
  btn.addEventListener('click', () => loadYear(parseInt(btn.dataset.year)));
});

function renderBillEstimator(monthlyTotals) {
    const container = document.getElementById('bill-estimate-container');
    if (!container) return;

    // Use the most recent month's data available
    const lastMonth = monthlyTotals[monthlyTotals.length - 1];
    if (!lastMonth) return;

    const importRate = 0.2765; // $0.2765 per unit
    const exportRate = 0.1250; // $0.1250 per unit
    const dailyFix   = 1.20;   // $1.20 per day
    const billDays   = 30;     // Your specific billing cycle

    // Calculation logic
    const importCost = lastMonth.import * importRate;
    const exportCredit = lastMonth.export * exportRate;
    const fixedCharges = billDays * dailyFix;
    const totalBill = (importCost - exportCredit) + fixedCharges;

    container.innerHTML = `
        <div class="bill-grid">
            <div class="bill-item">
                <span class="bill-label">Import Cost (${lastMonth.import} units)</span>
                <span class="bill-value" style="color:var(--accent-red)">+$${importCost.toFixed(2)}</span>
            </div>
            <div class="bill-item">
                <span class="bill-label">Export Credit (${lastMonth.export} units)</span>
                <span class="bill-value" style="color:var(--accent-green)">-$${exportCredit.toFixed(2)}</span>
            </div>
            <div class="bill-item">
                <span class="bill-label">Fixed Charges (${billDays} days)</span>
                <span class="bill-value">+$${fixedCharges.toFixed(2)}</span>
            </div>
            <div class="bill-item">
                <span class="bill-label">Usage Period</span>
                <span class="bill-value" style="font-size: 1rem;">~30 Days</span>
            </div>
            <div class="bill-total-row">
                <span class="bill-label">Estimated ${lastMonth.month} Bill</span>
                <div class="bill-total-value">$${totalBill.toFixed(2)}</div>
            </div>
        </div>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 10px; text-align: center;">
            *Estimates are based on calendar totals. Actual bills from the 25th to the 23rd may vary slightly.
        </p>
    `;
}

let forecastChart = null;

async function renderForecastTab() {
    const forecastContainer = document.getElementById('forecast');
    if (!forecastContainer) return;

    // 1. Create the UI structure
    forecastContainer.innerHTML = `
        <div class="forecast-header">
            <h2>🔮 7-Day Solar Forecast</h2>
            <p style="color:var(--text-secondary); margin-bottom:1rem;">Predicted export for East-West panels</p>
        </div>
        <div id="forecast-grid" class="forecast-grid"></div>
        <div class="card" style="margin-top:20px; padding:15px;">
            <canvas id="forecastChart" style="width:100%; height:250px;"></canvas>
        </div>
    `;

    const grid = document.getElementById('forecast-grid');
    const data = await fetchSolarForecast(6.0); // Adjust to your kW system size
    if (!data) {
        grid.innerHTML = "<p>Error loading forecast.</p>";
        return;
    }

    // 2. Build the Forecast Cards
    data.forEach(day => {
        const dateLabel = new Date(day.date).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric' });
        let icon = day.rain > 1 ? "🌧️" : (day.cloud > 70 ? "☁️" : "☀️");

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <div style="font-weight:bold; font-size:0.85rem;">${dateLabel}</div>
            <div style="font-size:1.8rem; margin:8px 0;">${icon}</div>
            <div style="font-size:1.2rem; font-weight:800; color:var(--accent-green);">${day.predictedExport} <small style="font-size:0.7rem">kWh</small></div>
            <div class="forecast-mini-details">
                <span>🌡️ ${day.temp}°C</span>
                <span>☁️ ${day.cloud}%</span>
                <span>💧 ${day.rain}mm</span>
            </div>
        `;
        grid.appendChild(card);
    });

    // 3. Build the Line Graph
    const ctx = document.getElementById('forecastChart').getContext('2d');
    if (forecastChart) forecastChart.destroy();
    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date.split('-').slice(1).join('/')),
            datasets: [{
                label: 'Predicted Export (kWh)',
                data: data.map(d => d.predictedExport),
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// Ensure the tab click triggers the render
document.addEventListener('DOMContentLoaded', () => {
    const forecastBtns = document.querySelectorAll('[data-tab="forecast"]');
    forecastBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Small timeout ensures the tab is visible before Chart.js tries to draw
            setTimeout(renderForecastTab, 50);
        });
    });
});

// ---------- INIT ----------
loadYear(2026);