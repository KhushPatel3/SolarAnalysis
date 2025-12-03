// ---------- DARK MODE & RELOAD BUTTON SETUP ----------
const darkModeToggle = document.getElementById('dark-mode-toggle');
const htmlElement = document.documentElement;

// 1. NEW: Constant for the reload button
const reloadButton = document.getElementById('reload-data-button'); 

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
htmlElement.setAttribute('data-theme', savedTheme);

darkModeToggle.addEventListener('click', () => {
  const currentTheme = htmlElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  htmlElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

// ---------- TAB NAVIGATION (DESKTOP & MOBILE) ----------
function setupTabNavigation() {
  const desktopTabs = document.querySelectorAll('.tab-btn');
  const mobileTabs = document.querySelectorAll('.mobile-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  function switchTab(tabId) {
    // Update desktop tabs
    desktopTabs.forEach(t => t.classList.remove('active'));
    const activeDesktopTab = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (activeDesktopTab) activeDesktopTab.classList.add('active');

    // Update mobile tabs
    mobileTabs.forEach(t => t.classList.remove('active'));
    const activeMobileTab = document.querySelector(`.mobile-tab-btn[data-tab="${tabId}"]`);
    if (activeMobileTab) activeMobileTab.classList.add('active');

    // Update content
    tabContents.forEach(c => c.classList.remove('active'));
    const activeContent = document.getElementById(tabId);
    if (activeContent) activeContent.classList.add('active');

    // Accessibility
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

// ---------- SHEET FETCH ----------
async function fetchSheetData() {
  const SHEET_ID = "1qXR5qKnv8lC_lyS9pp5DPUO6ce46Twgmt6pQSTq4FDA";
  const SHEET_NAME = "Data";
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${SHEET_NAME}`;

  const response = await fetch(SHEET_URL);
  const text = await response.text();
  const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\((.*)\)/)[1]);
  const rows = json.table.rows || [];

  const months = [
    { name: "January", colStart: 1 },
    { name: "February", colStart: 3 },
    { name: "March", colStart: 5 },
    { name: "April", colStart: 7 },
    { name: "May", colStart: 9 },
    { name: "June", colStart: 11 },
    { name: "July", colStart: 13 },
    { name: "August", colStart: 15 },
    { name: "September", colStart: 17 },
    { name: "October", colStart: 19 },
    { name: "November", colStart: 21 },
    { name: "December", colStart: 23 }
  ];

  const monthlyTotals = months.map(m => {
    let importTotal = 0;
    let exportTotal = 0;
    let daysCount = 0;

    // Loop runs 0 to 30 (31 iterations) to ensure Day 31 is covered.
    for (let r = 0; r < 31; r++) {
      const imp = rows[r]?.c[m.colStart]?.v;
      const exp = rows[r]?.c[m.colStart + 1]?.v;
      
      // Using loose check (||) to match Daily logic, ensuring we catch partial data if it exists
      if ((imp != null && imp !== "") || (exp != null && exp !== "")) {
        importTotal += (imp != null && imp !== "") ? parseFloat(imp) : 0;
        exportTotal += (exp != null && exp !== "") ? parseFloat(exp) : 0;
        daysCount++;
      }
    }

    const billRaw = rows[31]?.c[m.colStart]?.v ?? rows[31]?.c[m.colStart + 1]?.v ?? rows[35]?.c[m.colStart]?.v ?? rows[35]?.c[m.colStart + 1]?.v;
    const bill = billRaw ? parseFloat(String(billRaw).replace(/[^0-9.-]+/g, "")) : 0;

    // Calculate self-sufficiency
    const totalConsumption = importTotal + exportTotal;
    const selfSufficiency = totalConsumption > 0 ? (exportTotal / totalConsumption) * 100 : 0;

    return {
      month: m.name,
      import: importTotal,
      export: exportTotal,
      net: exportTotal - importTotal,
      bill,
      days: daysCount,
      selfSufficiency
    };
  });

  // Determine latest date
  let lastMonthIndex = -1;
  let lastDay = -1;
  for (let m = 0; m < months.length; m++) {
    const c = months[m].colStart;
    for (let r = 0; r < 31; r++) {
      const imp = rows[r]?.c[c]?.v;
      const exp = rows[r]?.c[c+1]?.v;
      if ((imp != null && imp !== "") || (exp != null && exp !== "")) {
        lastMonthIndex = m;
        lastDay = r + 1;
      }
    }
  }

  const totalDays = monthlyTotals.reduce((s,m) => s + m.days, 0);
  if (lastMonthIndex === -1) {
    document.getElementById("data-period").textContent = "Data Period: No data";
  } else {
    const latestMonthName = months[lastMonthIndex].name;
    document.getElementById("data-period").textContent =
      `Data Period: 1 January - ${lastDay} ${latestMonthName} 2025 (${totalDays} days)`;
  }

  return { monthlyTotals, dailyData: rows, months };
}

// ---------- SEASON BOUNDARIES ----------
const SEASON_BOUNDARIES = [2.5, 5.5, 8.5];

function createSeasonAnnotations() {
  return SEASON_BOUNDARIES.map(pos => ({
    type: 'line',
    xMin: pos,
    xMax: pos,
    borderColor: '#00000055',
    borderWidth: 1,
    borderDash: [5,5]
  }));
}

// ---------- RENDER SUMMARY ----------
function renderSummary(monthlyTotals) {
  const totalImport = monthlyTotals.reduce((s,m) => s + m.import, 0);
  const totalExport = monthlyTotals.reduce((s,m) => s + m.export, 0);
  const totalBill = monthlyTotals.reduce((s,m) => s + m.bill, 0); // NEW: Calculate total bill
  const totalDays = monthlyTotals.reduce((s,m) => s + m.days, 0) || 1;
  const netEnergy = totalExport - totalImport;

  // Calculate overall self-sufficiency
  const totalConsumption = totalImport + totalExport;
  const overallSelfSufficiency = totalConsumption > 0 ? (totalExport / totalConsumption) * 100 : 0;

  document.getElementById('total-import').textContent = `${totalImport.toFixed(1)} kWh`;
  document.getElementById('avg-import').textContent = `Avg: ${(totalImport/totalDays).toFixed(1)} kWh/day`;
  document.getElementById('total-export').textContent = `${totalExport.toFixed(1)} kWh`;
  document.getElementById('avg-export').textContent = `Avg: ${(totalExport/totalDays).toFixed(1)} kWh/day`;
  document.getElementById('net-energy').textContent = `${netEnergy > 0 ? '+' : ''}${netEnergy.toFixed(1)} kWh`;
  document.getElementById('self-sufficiency').textContent = `${overallSelfSufficiency.toFixed(1)}%`;

  // Insights
  const insightList = [
    `Peak export months: ${monthlyTotals.slice().sort((a,b)=>b.export-a.export).slice(0,3).map(x=>x.month).join(', ')}`,
    `Peak import months: ${monthlyTotals.slice().sort((a,b)=>b.import-a.import).slice(0,3).map(x=>x.month).join(', ')}`,
    `Highest net surplus: ${monthlyTotals.slice().sort((a,b)=>b.net-a.net)[0].month}`,
    `Greatest deficit: ${monthlyTotals.slice().sort((a,b)=>a.net-b.net)[0].month}`,
    `Best self-sufficiency: ${monthlyTotals.slice().sort((a,b)=>b.selfSufficiency-a.selfSufficiency)[0].month} (${monthlyTotals.slice().sort((a,b)=>b.selfSufficiency-a.selfSufficiency)[0].selfSufficiency.toFixed(1)}%)`
  ];
  const ul = document.getElementById('insights-list');
  ul.innerHTML = '';
  insightList.forEach(i => {
    const li = document.createElement('li');
    li.textContent = i;
    ul.appendChild(li);
  });

  // Monthly table Body
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

  // NEW: Monthly Table Footer (Total Row)
  let tfoot = table.querySelector('tfoot');
  if (!tfoot) {
    tfoot = document.createElement('tfoot');
    table.appendChild(tfoot);
  }
  
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

  const labels = monthlyTotals.map(m => m.month.slice(0,3));
  const importData = monthlyTotals.map(m => m.import);
  const exportData = monthlyTotals.map(m => m.export);
  const netData = monthlyTotals.map(m => m.net);
  const billData = monthlyTotals.map(m => m.bill);
  const billColors = monthlyTotals.map(m => m.bill < 0 ? '#16a34a' : '#dc2626');
  const selfSufficiencyData = monthlyTotals.map(m => m.selfSufficiency);

  // Import/Export bar chart
  new Chart(document.getElementById('monthly-bar-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Import (kWh)', data: importData, backgroundColor: '#ef4444' },
        { label: 'Export (kWh)', data: exportData, backgroundColor: '#22c55e' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        annotation: { annotations: createSeasonAnnotations() },
        legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
      },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } }
      }
    }
  });

  // Net line chart
  new Chart(document.getElementById('monthly-line-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Net Energy (kWh)', data: netData, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        annotation: { annotations: createSeasonAnnotations() },
        legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
      },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } }
      }
    }
  });

  // Self-sufficiency chart
  new Chart(document.getElementById('self-sufficiency-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Self-Sufficiency (%)',
        data: selfSufficiencyData,
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        annotation: { annotations: createSeasonAnnotations() },
        legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
      },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') }
        }
      }
    }
  });

  // Bill bar chart
  new Chart(document.getElementById('monthly-bill-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Bill ($)', data: billData, backgroundColor: billColors }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        annotation: { annotations: createSeasonAnnotations() }
      },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
        y: {
          beginAtZero: true,
          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') }
        }
      }
    }
  });
}

// ---------- RENDER DAILY ----------
function renderDaily(dailyData, months) {
  const monthSelect = document.getElementById('month-select');

  function updateDailyView() {
    const selectedMonth = parseInt(monthSelect.value);
    const month = months[selectedMonth];

    const dailyImport = [];
    const dailyExport = [];
    const days = [];

    // Consistent loop with data fetching (0 to 30)
    for (let r = 0; r < 31; r++) {
      const imp = dailyData[r]?.c[month.colStart]?.v;
      const exp = dailyData[r]?.c[month.colStart + 1]?.v;

      // Include day if either import or export has data (not null and not empty string)
      if ((imp != null && imp !== "") || (exp != null && exp !== "")) {
        days.push(r + 1); // r=0 is Day 1
        dailyImport.push(imp != null && imp !== "" ? parseFloat(imp) : 0);
        dailyExport.push(exp != null && exp !== "" ? parseFloat(exp) : 0);
      }
    }

    const daysCount = days.length;
    const avgImport = daysCount > 0 ? dailyImport.reduce((a,b) => a+b, 0) / daysCount : 0;
    const avgExport = daysCount > 0 ? dailyExport.reduce((a,b) => a+b, 0) / daysCount : 0;
    const bestDayIndex = dailyExport.indexOf(Math.max(...dailyExport));
    const bestDay = bestDayIndex >= 0 ? `Day ${days[bestDayIndex]}` : 'N/A';

    document.getElementById('days-recorded').textContent = daysCount;
    document.getElementById('daily-avg-import').textContent = `${avgImport.toFixed(1)} kWh`;
    document.getElementById('daily-avg-export').textContent = `${avgExport.toFixed(1)} kWh`;
    document.getElementById('best-day').textContent = bestDay;

    // Clear existing chart
    const existingChart = Chart.getChart('daily-chart');
    if (existingChart) existingChart.destroy();

    // Create daily chart
    new Chart(document.getElementById('daily-chart'), {
      type: 'line',
      data: {
        labels: days.map(d => `Day ${d}`),
        datasets: [
          {
            label: 'Import (kWh)',
            data: dailyImport,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'Export (kWh)',
            data: dailyExport,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
        },
        scales: {
          x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
          y: {
            beginAtZero: true,
            ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') }
          }
        }
      }
    });
  }

  monthSelect.addEventListener('change', updateDailyView);
  updateDailyView(); // Initial render
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
    SEASONS[s].forEach(mName => {
      const m = monthlyTotals.find(x => x.month === mName);
      if (m) { imp += m.import; exp += m.export; bill += m.bill; }
    });
    seasonData.push({ season: s, import: imp, export: exp, net: exp - imp, bill });
  }

  // Clear existing chart
  const existingChart = Chart.getChart('seasonal-bar-chart');
  if (existingChart) existingChart.destroy();

  new Chart(document.getElementById('seasonal-bar-chart'), {
    type: 'bar',
    data: {
      labels: seasonData.map(s => s.season),
      datasets: [
        { label: 'Import (kWh)', data: seasonData.map(s => s.import), backgroundColor: '#ef4444' },
        { label: 'Export (kWh)', data: seasonData.map(s => s.export), backgroundColor: '#22c55e' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') } }
      },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') } }
      }
    }
  });

  const summaryDiv = document.getElementById('seasonal-summary');
  summaryDiv.innerHTML = '';
  seasonData.forEach(s => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<h4>${s.season}</h4>
      <p><strong>Import:</strong> ${s.import.toFixed(1)} kWh</p>
      <p><strong>Export:</strong> ${s.export.toFixed(1)} kWh</p>
      <p><strong>Net:</strong> ${s.net.toFixed(1)} kWh</p>
      <p><strong>Bill:</strong> $${s.bill.toFixed(2)}</p>`;
    summaryDiv.appendChild(d);
  });

  const pattern = document.getElementById('seasonal-pattern-analysis');
  pattern.innerHTML = `<div class="card">
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
  const totalImport = monthlyTotals.reduce((s,m) => s + m.import, 0);
  const totalExport = monthlyTotals.reduce((s,m) => s + m.export, 0);
  const netEnergy = totalExport - totalImport;
  const avgSelfSufficiency = monthlyTotals.reduce((s,m) => s + m.selfSufficiency, 0) / monthlyTotals.length;

  const worstMonths = monthlyTotals.slice().sort((a,b) => a.net - b.net).slice(0, 3);
  const bestMonths = monthlyTotals.slice().sort((a,b) => b.net - a.net).slice(0, 3);

  let recommendations = `
    <div class="card">
      <h3>🎯 Performance Overview</h3>
      <p>Your solar system is performing ${netEnergy > 0 ? '<strong style="color: #16a34a;">excellently</strong>' : '<strong style="color: #dc2626;">below expectations</strong>'}. 
      You have a net ${netEnergy > 0 ? 'surplus' : 'deficit'} of <strong>${Math.abs(netEnergy).toFixed(1)} kWh</strong> for the period.</p>
      <p>Your average self-sufficiency is <strong>${avgSelfSufficiency.toFixed(1)}%</strong>, meaning you're generating ${avgSelfSufficiency.toFixed(1)}% of your energy needs from solar.</p>
    </div>
    
    <div class="card">
      <h3>📉 Months to Watch</h3>
      <p>Your lowest performing months are:</p>
      <ul>
        ${worstMonths.map(m => `<li><strong>${m.month}:</strong> Net ${m.net.toFixed(1)} kWh (${m.selfSufficiency.toFixed(1)}% self-sufficient)</li>`).join('')}
      </ul>
      <p><strong>Tip:</strong> During winter months (Jun-Aug), consider shifting high-energy tasks to midday when solar production peaks.</p>
    </div>
    
    <div class="card">
      <h3>✨ Best Performing Months</h3>
      <p>Your best performing months are:</p>
      <ul>
        ${bestMonths.map(m => `<li><strong>${m.month}:</strong> Net ${m.net.toFixed(1)} kWh (${m.selfSufficiency.toFixed(1)}% self-sufficient)</li>`).join('')}
      </ul>
    </div>
    
    <div class="card">
      <h3>💡 Optimization Recommendations</h3>
      <div class="recommendation-section">
        <h4>🔋 Energy Usage Timing</h4>
        <ul>
          <li>Run high-energy appliances (dishwasher, washing machine, dryer) during peak solar hours (10am-3pm)</li>
          <li>Consider programming your hot water cylinder to heat during the day when solar production is highest</li>
          <li>Use timers on pool pumps or EV chargers to operate during sunny hours</li>
        </ul>
      </div>
      
      <div class="recommendation-section">
        <h4>🏠 Winter Strategies</h4>
        <ul>
          <li>Minimize energy use in early morning and evening when solar isn't available</li>
          <li>Consider batch-cooking during sunny weekend days</li>
          <li>Clean solar panels before winter to maximize efficiency</li>
        </ul>
      </div>
      
      <div class="recommendation-section">
        <h4>💰 Financial Optimization</h4>
        <ul>
          <li>Review your electricity plan - ensure you're on the best rate for solar customers</li>
          <li>Consider adding battery storage to capture excess summer production for winter use</li>
          <li>Track your export rates and consider switching providers if better rates are available</li>
        </ul>
      </div>
      
      <div class="recommendation-section">
        <h4>📊 Monitoring Tips</h4>
        <ul>
          <li>Regularly check panel performance - sudden drops could indicate shading or maintenance needs</li>
          <li>Keep panels clean for optimal performance (2-4 times per year)</li>
          <li>Monitor inverter status lights and error messages</li>
          <li>Compare your monthly production with weather patterns</li>
        </ul>
      </div>
    </div>
    
    <div class="card" style="background: linear-gradient(135deg, #ecfccb 0%, #d9f99d 100%); border: none;">
      <h3>🌟 Did You Know?</h3>
      <ul>
        <li>Solar panels can still generate electricity on cloudy days, just at reduced capacity (10-25% of sunny day output)</li>
        <li>The optimal angle for solar panels in NZ is approximately your latitude (41° in Wanaka)</li>
        <li>Regular cleaning can improve panel efficiency by 15-25%</li>
        <li>Most solar panels maintain 80% efficiency after 25 years</li>
      </ul>
    </div>
  `;

  document.getElementById('recommendation-content').innerHTML = recommendations;
}

// ---------- INIT ----------
(async function init() {
  const { monthlyTotals, dailyData, months } = await fetchSheetData();
  globalMonthlyTotals = monthlyTotals;
  globalDailyData = dailyData;

  renderSummary(monthlyTotals);
  renderDaily(dailyData, months);
  renderSeasonal(monthlyTotals);
  renderRecommendations(monthlyTotals);
})();