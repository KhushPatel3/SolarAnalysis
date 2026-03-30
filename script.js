// ---------- TAB NAVIGATION (DESKTOP & MOBILE) ----------
function setupTabNavigation() {
  const desktopTabs = document.querySelectorAll('.tab-btn');
  const mobileTabs = document.querySelectorAll('.mobile-tab-btn');
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
  }

  desktopTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  mobileTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

setupTabNavigation();

// Register Chart.js annotation plugin
if (window['chartjs-plugin-annotation']) {
  Chart.register(window['chartjs-plugin-annotation']);
}

// ---------- GLOBAL DATA STORAGE ----------
let globalMonthlyTotals = [];
let globalDailyData = [];

// ---------- SEASON BOUNDARIES ----------
const SEASON_BOUNDARIES = [2.5, 5.5, 8.5];

function createSeasonAnnotations() {
  return SEASON_BOUNDARIES.map(pos => ({
    type: 'line',
    xMin: pos,
    xMax: pos,
    borderColor: '#00000055',
    borderWidth: 1,
    borderDash: [5, 5]
  }));
}

// ---------- RENDER SUMMARY ----------
function renderSummary(monthlyTotals) {
  const totalImport = monthlyTotals.reduce((s, m) => s + m.import, 0);
  const totalExport = monthlyTotals.reduce((s, m) => s + m.export, 0);
  const totalBill = monthlyTotals.reduce((s, m) => s + m.bill, 0);
  const totalDays = monthlyTotals.reduce((s, m) => s + m.days, 0) || 1;
  const netEnergy = totalExport - totalImport;

  const totalConsumption = totalImport + totalExport;
  const overallSelfSufficiency = totalConsumption > 0 ? (totalExport / totalConsumption) * 100 : 0;

  document.getElementById('total-import').textContent = `${totalImport.toFixed(1)} kWh`;
  document.getElementById('avg-import').textContent = `Avg: ${(totalImport / totalDays).toFixed(1)} kWh/day`;
  document.getElementById('total-export').textContent = `${totalExport.toFixed(1)} kWh`;
  document.getElementById('avg-export').textContent = `Avg: ${(totalExport / totalDays).toFixed(1)} kWh/day`;
  document.getElementById('net-energy').textContent = `${netEnergy > 0 ? '+' : ''}${netEnergy.toFixed(1)} kWh`;
  document.getElementById('self-sufficiency').textContent = `${overallSelfSufficiency.toFixed(1)}%`;

  // Insights
  const insightList = [
    `Peak export months: ${monthlyTotals.slice().sort((a, b) => b.export - a.export).slice(0, 3).map(x => x.month).join(', ')}`,
    `Peak import months: ${monthlyTotals.slice().sort((a, b) => b.import - a.import).slice(0, 3).map(x => x.month).join(', ')}`,
    `Highest net surplus: ${monthlyTotals.slice().sort((a, b) => b.net - a.net)[0].month}`,
    `Greatest deficit: ${monthlyTotals.slice().sort((a, b) => a.net - b.net)[0].month}`,
    `Best self-sufficiency: ${monthlyTotals.slice().sort((a, b) => b.selfSufficiency - a.selfSufficiency)[0].month} (${monthlyTotals.slice().sort((a, b) => b.selfSufficiency - a.selfSufficiency)[0].selfSufficiency.toFixed(1)}%)`
  ];
  const ul = document.getElementById('insights-list');
  ul.innerHTML = '';
  insightList.forEach(i => {
    const li = document.createElement('li');
    li.textContent = i;
    ul.appendChild(li);
  });

  // Monthly table body
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
      <td>${m.selfSufficiency.toFixed(1)}%</td>
      <td style="color:${m.bill < 0 ? '#16a34a' : '#dc2626'}"><strong>${m.bill.toFixed(2)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  // Monthly table footer
  let tfoot = table.querySelector('tfoot');
  if (!tfoot) { tfoot = document.createElement('tfoot'); table.appendChild(tfoot); }
  tfoot.innerHTML = `
    <tr>
      <td>TOTAL</td>
      <td>${totalImport.toFixed(1)}</td>
      <td>${totalExport.toFixed(1)}</td>
      <td style="color:${netEnergy > 0 ? '#16a34a' : '#dc2626'}">${netEnergy.toFixed(1)}</td>
      <td>${overallSelfSufficiency.toFixed(1)}%</td>
      <td style="color:${totalBill < 0 ? '#16a34a' : '#dc2626'}">${totalBill.toFixed(2)}</td>
    </tr>
  `;

  const labels = monthlyTotals.map(m => m.month.slice(0, 3));

  ['monthly-bar-chart', 'monthly-line-chart', 'self-sufficiency-chart', 'monthly-bill-chart'].forEach(id => {
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

  new Chart(document.getElementById('self-sufficiency-chart'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Self-Sufficiency (%)', data: monthlyTotals.map(m => m.selfSufficiency), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', fill: true, tension: 0.4 }]},
    options: { responsive: true, maintainAspectRatio: true, plugins: {
      annotation: { annotations: createSeasonAnnotations() },
      legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
    }, scales: {
      x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
      y: { beginAtZero: true, max: 100, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } }
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

// ---------- RENDER DAILY ----------
function renderDaily(dailyData, months, weatherYearData, year) {
  const monthSelect = document.getElementById('month-select');

  function updateDailyView() {
    const selectedMonth = parseInt(monthSelect.value);
    const month = months[selectedMonth];

    // --- Solar data ---
    const dailyImport = [], dailyExport = [], days = [];
    for (let r = 0; r < 31; r++) {
      const imp = dailyData[r]?.c[month.colStart]?.v;
      const exp = dailyData[r]?.c[month.colStart + 1]?.v;
      if ((imp != null && imp !== "") || (exp != null && exp !== "")) {
        days.push(r + 1);
        dailyImport.push(imp != null && imp !== "" ? parseFloat(imp) : 0);
        dailyExport.push(exp != null && exp !== "" ? parseFloat(exp) : 0);
      }
    }

    const daysCount = days.length;
    const avgImport = daysCount > 0 ? dailyImport.reduce((a, b) => a + b, 0) / daysCount : 0;
    const avgExport = daysCount > 0 ? dailyExport.reduce((a, b) => a + b, 0) / daysCount : 0;
    const bestDayIndex = dailyExport.indexOf(Math.max(...dailyExport));
    const bestDay = bestDayIndex >= 0 ? `Day ${days[bestDayIndex]}` : 'N/A';

    document.getElementById('days-recorded').textContent = daysCount;
    document.getElementById('daily-avg-import').textContent = `${avgImport.toFixed(1)} kWh`;
    document.getElementById('daily-avg-export').textContent = `${avgExport.toFixed(1)} kWh`;
    document.getElementById('best-day').textContent = bestDay;

    // --- Weather data ---
    const weather = weatherYearData ? getWeatherForMonth(weatherYearData, selectedMonth, year) : null;
    let radiationMapped = [], sunshineMapped = [], cloudMapped = [], rainMapped = [];

    if (weather) {
      radiationMapped = days.map(d => { const i = weather.days.indexOf(d); return i >= 0 ? weather.radiation[i] : null; });
      sunshineMapped  = days.map(d => { const i = weather.days.indexOf(d); return i >= 0 ? weather.sunshine_hours[i] : null; });
      cloudMapped     = days.map(d => { const i = weather.days.indexOf(d); return i >= 0 ? weather.cloud_cover[i] : null; });
      rainMapped      = days.map(d => { const i = weather.days.indexOf(d); return i >= 0 ? weather.precipitation[i] : null; });

      // Update weather stat cards
      const validSun  = sunshineMapped.filter(v => v !== null);
      const validCloud = cloudMapped.filter(v => v !== null);
      const validRain  = rainMapped.filter(v => v !== null);
      document.getElementById('avg-sunshine').textContent = validSun.length ? `${(validSun.reduce((a,b)=>a+b,0)/validSun.length).toFixed(1)} hrs` : '--';
      document.getElementById('avg-cloud').textContent    = validCloud.length ? `${Math.round(validCloud.reduce((a,b)=>a+b,0)/validCloud.length)}%` : '--';
      document.getElementById('total-rain').textContent   = validRain.length ? `${validRain.reduce((a,b)=>a+b,0).toFixed(1)} mm` : '--';

      // Correlation insight
      const pairs = days.map((d, i) => {
        const wi = weather.days.indexOf(d);
        return wi >= 0 ? { day: d, export: dailyExport[i], radiation: weather.radiation[wi] } : null;
      }).filter(Boolean);

      if (pairs.length > 3) {
        const sorted = pairs.slice().sort((a, b) => b.radiation - a.radiation);
        const top3 = sorted.slice(0, 3);
        const bot3 = sorted.slice(-3);
        const avgTop = top3.reduce((s, p) => s + p.export, 0) / top3.length;
        const avgBot = bot3.reduce((s, p) => s + p.export, 0) / bot3.length;
        const corrEl = document.getElementById('weather-correlation');
        if (corrEl) corrEl.innerHTML = `
          <div class="weather-corr-row">
            <span class="corr-label">☀️ Top 3 sunniest days — avg export</span>
            <span class="corr-value positive">${avgTop.toFixed(1)} kWh</span>
          </div>
          <div class="weather-corr-row">
            <span class="corr-label">☁️ Bottom 3 cloudiest days — avg export</span>
            <span class="corr-value negative">${avgBot.toFixed(1)} kWh</span>
          </div>
          <div class="weather-corr-row">
            <span class="corr-label">📈 Clear-day multiplier</span>
            <span class="corr-value">${avgBot > 0 ? (avgTop / avgBot).toFixed(1) : '∞'}× more export on clear days</span>
          </div>
        `;
      }

      document.getElementById('weather-stats-section').style.display = '';
    } else {
      document.getElementById('weather-stats-section').style.display = 'none';
    }

    // --- Chart ---
    const existing = Chart.getChart('daily-chart');
    if (existing) existing.destroy();

    const textPrimary   = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
    const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');

    const datasets = [
      { label: 'Import (kWh)',  data: dailyImport, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)',  fill: true, tension: 0.3, yAxisID: 'y' },
      { label: 'Export (kWh)', data: dailyExport, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3, yAxisID: 'y' }
    ];

    if (weather && radiationMapped.length) {
      datasets.push({
        label: 'Solar Radiation (MJ/m²)',
        data: radiationMapped,
        borderColor: 'rgba(251,191,36,0.9)',
        backgroundColor: 'rgba(251,191,36,0.1)',
        fill: true,
        tension: 0.3,
        borderDash: [4, 3],
        pointRadius: 0,
        yAxisID: 'yWeather',
        order: 10
      });
    }

    const scales = {
      x: { ticks: { color: textSecondary } },
      y: {
        beginAtZero: true,
        position: 'left',
        title: { display: true, text: 'Energy (kWh)', color: textSecondary },
        ticks: { color: textSecondary }
      }
    };

    if (weather) {
      scales.yWeather = {
        beginAtZero: true,
        position: 'right',
        title: { display: true, text: 'Radiation (MJ/m²)', color: 'rgba(251,191,36,1)' },
        ticks: { color: 'rgba(251,191,36,1)' },
        grid: { drawOnChartArea: false }
      };
    }

    new Chart(document.getElementById('daily-chart'), {
      type: 'line',
      data: { labels: days.map(d => `Day ${d}`), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: textPrimary } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const unit = ctx.dataset.yAxisID === 'yWeather' ? ' MJ/m²' : ' kWh';
                return ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) : '--'}${unit}`;
              }
            }
          }
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
    'Summer': ['December','January','February'],
    'Autumn': ['March','April','May'],
    'Winter': ['June','July','August'],
    'Spring': ['September','October','November']
  };

  const seasonData = [];
  for (const s in SEASONS) {
    let imp = 0, exp = 0, bill = 0;
    SEASONS[s].forEach(mName => { const m = monthlyTotals.find(x => x.month === mName); if (m) { imp += m.import; exp += m.export; bill += m.bill; } });
    seasonData.push({ season: s, import: imp, export: exp, net: exp - imp, bill });
  }

  const ec = Chart.getChart('seasonal-bar-chart'); if (ec) ec.destroy();

  new Chart(document.getElementById('seasonal-bar-chart'), {
    type: 'bar',
    data: { labels: seasonData.map(s => s.season), datasets: [
      { label: 'Import (kWh)', data: seasonData.map(s => s.import), backgroundColor: '#ef4444' },
      { label: 'Export (kWh)', data: seasonData.map(s => s.export), backgroundColor: '#22c55e' }
    ]},
    options: { responsive: true, maintainAspectRatio: true, plugins: {
      legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
    }, scales: {
      x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
      y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } }
    }}
  });

  const summaryDiv = document.getElementById('seasonal-summary');
  summaryDiv.innerHTML = '';
  seasonData.forEach(s => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<h4>${s.season}</h4><p><strong>Import:</strong> ${s.import.toFixed(1)} kWh</p><p><strong>Export:</strong> ${s.export.toFixed(1)} kWh</p><p><strong>Net:</strong> ${s.net.toFixed(1)} kWh</p><p><strong>Bill:</strong> $${s.bill.toFixed(2)}</p>`;
    summaryDiv.appendChild(d);
  });

  document.getElementById('seasonal-pattern-analysis').innerHTML = `<div class="card">
    <h3>🌍 Seasonal Pattern Analysis</h3>
    <ul>
      <li><strong>Summer:</strong> Exports typically far exceed imports (peak months Jan/Feb) due to longer daylight hours and optimal sun angle</li>
      <li><strong>Autumn:</strong> Production declines as days shorten; still net positive with moderate solar generation</li>
      <li><strong>Winter:</strong> Imports exceed exports; worst months Jun/Jul with shorter days and lower sun angle</li>
      <li><strong>Spring:</strong> Exports recover significantly; Nov shows strong recovery as days lengthen</li>
    </ul></div>`;
}

// ---------- RENDER RECOMMENDATIONS ----------
function renderRecommendations(monthlyTotals) {
  const totalImport = monthlyTotals.reduce((s, m) => s + m.import, 0);
  const totalExport = monthlyTotals.reduce((s, m) => s + m.export, 0);
  const netEnergy = totalExport - totalImport;
  const avgSelfSufficiency = monthlyTotals.reduce((s, m) => s + m.selfSufficiency, 0) / monthlyTotals.length;
  const worstMonths = monthlyTotals.slice().sort((a, b) => a.net - b.net).slice(0, 3);
  const bestMonths  = monthlyTotals.slice().sort((a, b) => b.net - a.net).slice(0, 3);

  document.getElementById('recommendation-content').innerHTML = `
    <div class="card">
      <h3>🎯 Performance Overview</h3>
      <p>Your solar system is performing ${netEnergy > 0 ? '<strong style="color:#16a34a;">excellently</strong>' : '<strong style="color:#dc2626;">below expectations</strong>'}. 
      You have a net ${netEnergy > 0 ? 'surplus' : 'deficit'} of <strong>${Math.abs(netEnergy).toFixed(1)} kWh</strong> for the period.</p>
      <p>Your average self-sufficiency is <strong>${avgSelfSufficiency.toFixed(1)}%</strong>.</p>
    </div>
    <div class="card">
      <h3>📉 Months to Watch</h3>
      <ul>${worstMonths.map(m => `<li><strong>${m.month}:</strong> Net ${m.net.toFixed(1)} kWh (${m.selfSufficiency.toFixed(1)}% self-sufficient)</li>`).join('')}</ul>
      <p><strong>Tip:</strong> During winter months (Jun-Aug), consider shifting high-energy tasks to midday when solar production peaks.</p>
    </div>
    <div class="card">
      <h3>✨ Best Performing Months</h3>
      <ul>${bestMonths.map(m => `<li><strong>${m.month}:</strong> Net ${m.net.toFixed(1)} kWh (${m.selfSufficiency.toFixed(1)}% self-sufficient)</li>`).join('')}</ul>
    </div>
    <div class="card">
      <h3>💡 Optimisation Recommendations</h3>
      <div class="recommendation-section"><h4>🔋 Energy Usage Timing</h4><ul>
        <li>Run high-energy appliances (dishwasher, washing machine, dryer) during peak solar hours (10am-3pm)</li>
        <li>Consider programming your hot water cylinder to heat during the day when solar production is highest</li>
        <li>Use timers on pool pumps or EV chargers to operate during sunny hours</li>
      </ul></div>
      <div class="recommendation-section"><h4>🏠 Winter Strategies</h4><ul>
        <li>Minimise energy use in early morning and evening when solar isn't available</li>
        <li>Consider batch-cooking during sunny weekend days</li>
        <li>Clean solar panels before winter to maximise efficiency</li>
      </ul></div>
      <div class="recommendation-section"><h4>💰 Financial Optimisation</h4><ul>
        <li>Review your electricity plan — ensure you're on the best rate for solar customers</li>
        <li>Consider adding battery storage to capture excess summer production for winter use</li>
        <li>Track your export rates and consider switching providers if better rates are available</li>
      </ul></div>
      <div class="recommendation-section"><h4>📊 Monitoring Tips</h4><ul>
        <li>Regularly check panel performance — sudden drops could indicate shading or maintenance needs</li>
        <li>Keep panels clean for optimal performance (2-4 times per year)</li>
        <li>Monitor inverter status lights and error messages</li>
      </ul></div>
    </div>
    <div class="card" style="background:linear-gradient(135deg,#ecfccb 0%,#d9f99d 100%);border:none;">
      <h3>🌟 Did You Know?</h3>
      <ul>
        <li>Solar panels can still generate electricity on cloudy days, just at reduced capacity (10-25% of sunny day output)</li>
        <li>The optimal angle for solar panels in NZ is approximately your latitude (41° in Wanaka)</li>
        <li>Regular cleaning can improve panel efficiency by 15-25%</li>
        <li>Most solar panels maintain 80% efficiency after 25 years</li>
      </ul>
    </div>
  `;
}

// ---------- YEAR SWITCHER ----------
let currentYear = 2026;

async function loadYear(year) {
  currentYear = year;

  document.querySelectorAll('.year-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.year) === year);
  });

  const switcher = document.querySelector('.year-switcher');
  if (switcher) {
    const btns = [...switcher.querySelectorAll('.year-btn')];
    const activeIndex = btns.findIndex(b => parseInt(b.dataset.year) === year);
    switcher.setAttribute('data-active', activeIndex);
  }

  const { monthlyTotals, dailyData, months, latestDate } = await fetchSheetData(year);
  globalMonthlyTotals = monthlyTotals;
  globalDailyData = dailyData;

  // Fetch live weather up to the last date that has solar data in the sheet.
  // fetchWeatherData() is defined in weatherData.js and caches within the session.
  const weatherYearData = latestDate
    ? await fetchWeatherData(year, latestDate)
    : null;

  renderSummary(monthlyTotals);
  renderDaily(dailyData, months, weatherYearData, year);
  renderSeasonal(monthlyTotals);
  renderRecommendations(monthlyTotals);
}

document.querySelectorAll('.year-btn').forEach(btn => {
  btn.addEventListener('click', () => loadYear(parseInt(btn.dataset.year)));
});

// ---------- INIT ----------
loadYear(2026);