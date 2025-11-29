// ---------- TAB NAV ----------
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    tabContents.forEach(c => c.classList.remove('active'));
    const id = tab.dataset.tab;
    document.getElementById(id).classList.add('active');
    // accessibility
    tabContents.forEach(c => c.setAttribute('aria-hidden', c.id !== id));
  });
});

// Register annotation plugin if loaded
if (window['chartjs-plugin-annotation']) {
  Chart.register(window['chartjs-plugin-annotation']);
}

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

    for (let r = 3; r < 34; r++) {
      const imp = rows[r]?.c[m.colStart]?.v;
      const exp = rows[r]?.c[m.colStart + 1]?.v;
      if (imp != null && exp != null) {
        importTotal += parseFloat(imp);
        exportTotal += parseFloat(exp);
        daysCount++;
      }
    }

    // row 36 in spreadsheet -> index 35 or 31 depending on sheet structure.
    // You've previously found row index 31 worked; check both: use 31, fallback 35.
    const billRaw = rows[31]?.c[m.colStart]?.v ?? rows[31]?.c[m.colStart + 1]?.v ?? rows[35]?.c[m.colStart]?.v ?? rows[35]?.c[m.colStart + 1]?.v;
    const bill = billRaw ? parseFloat(String(billRaw).replace(/[^0-9.-]+/g, "")) : 0;

    return {
      month: m.name,
      import: importTotal,
      export: exportTotal,
      net: exportTotal - importTotal,
      bill,
      days: daysCount
    };
  });

  // determine latest non-empty daily cell to compute latest date and days total
  let lastMonthIndex = -1;
  let lastDay = -1;
  for (let m = 0; m < months.length; m++) {
    const c = months[m].colStart;
    for (let r = 3; r < 34; r++) {
      const imp = rows[r]?.c[c]?.v;
      const exp = rows[r]?.c[c+1]?.v;
      if ((imp != null && imp !== "") || (exp != null && exp !== "")) {
        lastMonthIndex = m;
        lastDay = r - 2; // row 3 => day 1
      }
    }
  }

  const totalDays = monthlyTotals.reduce((s,m) => s + m.days, 0);
  if (lastMonthIndex === -1) {
    document.getElementById("data-period").textContent = "Data Period: No data";
  } else {
    const latestMonthName = months[lastMonthIndex].name;
    document.getElementById("data-period").textContent =
      `Data Period: January 1 - ${lastDay} ${latestMonthName} 2025 (${totalDays} days)`;
  }

  return { monthlyTotals, dailyData: rows };
}


// ---------- RENDER ----------

const SEASON_BOUNDARIES = [2.5, 5.5, 8.5]; // dotted vertical lines between months

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

function renderSummary(monthlyTotals) {
  const totalImport = monthlyTotals.reduce((s,m) => s + m.import, 0);
  const totalExport = monthlyTotals.reduce((s,m) => s + m.export, 0);
  const totalDays = monthlyTotals.reduce((s,m) => s + m.days, 0) || 1;
  const netEnergy = totalExport - totalImport;

  document.getElementById('total-import').textContent = `${totalImport.toFixed(1)} kWh`;
  document.getElementById('avg-import').textContent = `Avg: ${(totalImport/totalDays).toFixed(1)} kWh/day`;
  document.getElementById('total-export').textContent = `${totalExport.toFixed(1)} kWh`;
  document.getElementById('avg-export').textContent = `Avg: ${(totalExport/totalDays).toFixed(1)} kWh/day`;
  document.getElementById('net-energy').textContent = `${netEnergy > 0 ? '+' : ''}${netEnergy.toFixed(1)} kWh`;

  // insights
  const insightList = [
    `Peak export months: ${monthlyTotals.slice().sort((a,b)=>b.export-a.export).slice(0,3).map(x=>x.month).join(', ')}`,
    `Peak import months: ${monthlyTotals.slice().sort((a,b)=>b.import-a.import).slice(0,3).map(x=>x.month).join(', ')}`,
    `Highest net surplus: ${monthlyTotals.slice().sort((a,b)=>b.net-a.net)[0].month}`,
    `Greatest deficit: ${monthlyTotals.slice().sort((a,b)=>a.net-b.net)[0].month}`
  ];
  const ul = document.getElementById('insights-list');
  ul.innerHTML = '';
  insightList.forEach(i => {
    const li = document.createElement('li');
    li.textContent = i;
    ul.appendChild(li);
  });

  // monthly table
  const tbody = document.querySelector('#monthly-table tbody');
  tbody.innerHTML = '';
  monthlyTotals.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.month}</td>
      <td>${m.import.toFixed(1)}</td>
      <td>${m.export.toFixed(1)}</td>
      <td>${m.net.toFixed(1)}</td>
      <td style="color:${m.bill < 0 ? '#16a34a' : '#dc2626'}">${m.bill.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  const labels = monthlyTotals.map(m => m.month.slice(0,3));
  const importData = monthlyTotals.map(m => m.import);
  const exportData = monthlyTotals.map(m => m.export);
  const netData = monthlyTotals.map(m => m.net);
  const billData = monthlyTotals.map(m => m.bill);
  const billColors = monthlyTotals.map(m => m.bill < 0 ? '#16a34a' : '#dc2626');

  // import/export bar chart
  new Chart(document.getElementById('monthly-bar-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Import', data: importData, backgroundColor: '#ef4444' },
        { label: 'Export', data: exportData, backgroundColor: '#22c55e' }
      ]
    },
    options: {
      responsive:true,
      plugins: {
        annotation: { annotations: createSeasonAnnotations() }
      }
    }
  });

  // net line chart
  new Chart(document.getElementById('monthly-line-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Net Energy', data: netData, borderColor: '#3b82f6', fill:false }]
    },
    options: {
      responsive:true,
      plugins: { annotation:{ annotations: createSeasonAnnotations() } }
    }
  });

  // bill bar chart
  new Chart(document.getElementById('monthly-bill-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label:'Bill ($)', data: billData, backgroundColor: billColors }]
    },
    options: {
      responsive:true,
      plugins: { legend:{ display:false }, annotation:{ annotations: createSeasonAnnotations() } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderSeasonal(monthlyTotals) {
  const SEASONS = {
    'Summer': ['December','January','February'],
    'Autumn': ['March','April','May'],
    'Winter': ['June','July','August'],
    'Spring': ['September','October','November']
  };

  const seasonData = [];
  for (const s in SEASONS) {
    let imp=0, exp=0, bill=0;
    SEASONS[s].forEach(mName => {
      const m = monthlyTotals.find(x => x.month === mName);
      if (m) { imp += m.import; exp += m.export; bill += m.bill; }
    });
    seasonData.push({ season: s, import: imp, export: exp, net: exp-imp, bill});
  }

  new Chart(document.getElementById('seasonal-bar-chart'), {
    type:'bar',
    data: {
      labels: seasonData.map(s=>s.season),
      datasets: [
        { label:'Import', data: seasonData.map(s=>s.import), backgroundColor:'#ef4444' },
        { label:'Export', data: seasonData.map(s=>s.export), backgroundColor:'#22c55e' }
      ]
    },
    options: {
      responsive:true,
      animation: false // remove transition for seasonal analysis
    }
  });

  const summaryDiv = document.getElementById('seasonal-summary');
  summaryDiv.innerHTML = '';
  seasonData.forEach(s => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<h4>${s.season}</h4>
      <p>Import: ${s.import.toFixed(1)} kWh</p>
      <p>Export: ${s.export.toFixed(1)} kWh</p>
      <p>Net: ${s.net.toFixed(1)} kWh</p>
      <p>Bill: $${s.bill.toFixed(2)}</p>`;
    summaryDiv.appendChild(d);
  });

  const pattern = document.getElementById('seasonal-pattern-analysis');
  pattern.innerHTML = `<div class="card">
    <h3>Seasonal Pattern Analysis</h3>
    <ul>
      <li>Summer: Exports typically far exceed imports (peak months Jan/Feb)</li>
      <li>Autumn: Production declines as days shorten; still net positive</li>
      <li>Winter: Imports exceed exports; worst months Jun/Jul</li>
      <li>Spring: Exports recover significantly; Nov shows strong recovery</li>
    </ul></div>`;
}

// ---------- INIT ----------
(async function init() {
  const { monthlyTotals } = await fetchSheetData();
  renderSummary(monthlyTotals);
  renderSeasonal(monthlyTotals);
})();
