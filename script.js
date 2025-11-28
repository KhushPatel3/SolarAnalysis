// script.js

// ---------- TAB NAVIGATION ----------
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(btn => btn.classList.remove('active'));
        tab.classList.add('active');

        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// ---------- GOOGLE SHEETS FETCH ----------
const SHEET_ID = 'YOUR_SHEET_ID_HERE'; // replace with your sheet ID
const SHEET_NAME = 'Sheet1'; // replace with your sheet name
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${SHEET_NAME}`;

async function fetchSheetData() {
    const response = await fetch(SHEET_URL);
    const text = await response.text();
    const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\((.*)\)/)[1]);
    const rows = json.table.rows;

    // Map rows to an array of objects {month, import, export, bill}
    return rows.map(r => ({
        month: r.c[0].v,
        import: parseFloat(r.c[1].v),
        export: parseFloat(r.c[2].v),
        bill: parseFloat(r.c[3].v)
    }));
}

// ---------- CALCULATIONS ----------
function calculateTotals(data) {
    const totalImport = data.reduce((sum, m) => sum + m.import, 0);
    const totalExport = data.reduce((sum, m) => sum + m.export, 0);
    const netEnergy = totalExport - totalImport;
    const totalDays = data.reduce((sum, m) => sum + (m.days || 30), 0); // fallback to 30 if days not available
    return { totalImport, totalExport, netEnergy, totalDays };
}

function calculateAverages(totals) {
    return {
        avgDailyImport: totals.totalImport / totals.totalDays,
        avgDailyExport: totals.totalExport / totals.totalDays
    };
}

function seasonalData(data) {
    const seasons = {
        'Summer': ['December','January','February'],
        'Autumn': ['March','April','May'],
        'Winter': ['June','July','August'],
        'Spring': ['September','October','November']
    };

    const result = [];

    for (let season in seasons) {
        const months = seasons[season];
        let importSum = 0, exportSum = 0, billSum = 0;
        months.forEach(m => {
            const monthData = data.find(d => d.month.toLowerCase() === m.toLowerCase());
            if (monthData) {
                importSum += monthData.import;
                exportSum += monthData.export;
                billSum += monthData.bill || 0;
            }
        });
        result.push({
            season,
            import: importSum,
            export: exportSum,
            net: exportSum - importSum,
            bill: billSum
        });
    }
    return result;
}

// ---------- INJECT SUMMARY ----------
function renderSummary(data) {
    const totals = calculateTotals(data);
    const averages = calculateAverages(totals);

    document.getElementById('total-import').textContent = `${totals.totalImport.toFixed(1)} kWh`;
    document.getElementById('avg-import').textContent = `Avg: ${averages.avgDailyImport.toFixed(1)} kWh/day`;
    document.getElementById('total-export').textContent = `${totals.totalExport.toFixed(1)} kWh`;
    document.getElementById('avg-export').textContent = `Avg: ${averages.avgDailyExport.toFixed(1)} kWh/day`;
    document.getElementById('net-energy').textContent = `${totals.netEnergy > 0 ? '+' : ''}${totals.netEnergy.toFixed(1)} kWh`;

    // Insights
    const insights = [
        `You exported ${((totals.totalExport / totals.totalImport - 1)*100).toFixed(0)}% more than imported`,
        `Peak export months: ${data.sort((a,b)=>b.export-a.export).slice(0,3).map(d=>d.month).join(', ')}`,
        `Peak import months: ${data.sort((a,b)=>b.import-a.import).slice(0,3).map(d=>d.month).join(', ')}`,
        `Winter challenge: Imports are higher than exports in winter months (Jun-Aug)`,
        `Spring recovery: Exports surge compared to imports, boosting net energy`
    ];

    const insightsList = document.getElementById('insights-list');
    insightsList.innerHTML = '';
    insights.forEach(i => {
        const li = document.createElement('li');
        li.textContent = i;
        insightsList.appendChild(li);
    });
}

// ---------- INJECT MONTHLY TAB ----------
function renderMonthly(data) {
    const labels = data.map(d => d.month.substring(0,3));
    const importData = data.map(d => d.import);
    const exportData = data.map(d => d.export);
    const netData = data.map(d => d.export - d.import);

    // Bar chart
    new Chart(document.getElementById('monthly-bar-chart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Import', data: importData, backgroundColor: '#ef4444' },
                { label: 'Export', data: exportData, backgroundColor: '#22c55e' }
            ]
        },
        options: { responsive: true }
    });

    // Line chart for net energy
    new Chart(document.getElementById('monthly-line-chart'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Net Energy', data: netData, borderColor: '#3b82f6', fill: false }] },
        options: { responsive: true }
    });

    // Table
    const tbody = document.querySelector('#monthly-table tbody');
    tbody.innerHTML = '';
    data.forEach(d => {
        const net = d.export - d.import;
        const row = document.createElement('tr');
        row.innerHTML = `
      <td>${d.month}</td>
      <td>${d.import.toFixed(1)}</td>
      <td>${d.export.toFixed(1)}</td>
      <td>${net.toFixed(1)}</td>
      <td>${d.bill.toFixed(2)}</td>
    `;
        tbody.appendChild(row);
    });
}

// ---------- INJECT SEASONAL TAB ----------
function renderSeasonal(data) {
    const sData = seasonalData(data);

    // Seasonal bar chart
    new Chart(document.getElementById('seasonal-bar-chart'), {
        type: 'bar',
        data: {
            labels: sData.map(d=>d.season),
            datasets: [
                { label: 'Import', data: sData.map(d=>d.import), backgroundColor: '#ef4444' },
                { label: 'Export', data: sData.map(d=>d.export), backgroundColor: '#22c55e' }
            ]
        },
        options: { responsive: true }
    });

    // Season summaries
    const summaryDiv = document.getElementById('seasonal-summary');
    summaryDiv.innerHTML = '';
    sData.forEach(s => {
        const div = document.createElement('div');
        div.innerHTML = `
      <h4>${s.season}</h4>
      <p>Import: ${s.import.toFixed(1)} kWh</p>
      <p>Export: ${s.export.toFixed(1)} kWh</p>
      <p>Net: ${s.net.toFixed(1)} kWh</p>
      <p>Bill: $${s.bill.toFixed(2)}</p>
    `;
        summaryDiv.appendChild(div);
    });

    // Pattern analysis
    const analysisDiv = document.getElementById('seasonal-pattern-analysis');
    analysisDiv.innerHTML = `
    <h3>Seasonal Pattern Analysis</h3>
    <ul>
      <li>Summer: Exports much higher than imports, peak month likely Jan/Feb.</li>
      <li>Autumn: Net positive but ratio drops; production decreases as days shorten.</li>
      <li>Winter: Imports exceed exports; toughest period, peak import in Jun/Jul.</li>
      <li>Spring: Exports surge again, high net energy, partial November data shows strong recovery.</li>
    </ul>
  `;
}

// ---------- INJECT RECOMMENDATION TAB ----------
function renderRecommendation(data) {
    const totals = calculateTotals(data);

    const contentDiv = document.getElementById('recommendation-content');
    contentDiv.innerHTML = `
    <h3>Battery Storage Recommendation</h3>
    <p>Based on patterns in import/export, a 10kWh battery system is recommended. It covers average daily usage, handles most winter days, and captures excess summer generation for later use.</p>
    
    <h3>Financial Analysis</h3>
    <p>Assuming $0.30/kWh import and $0.10/kWh export:</p>
    <ul>
      <li>Current import cost: $${(totals.totalImport*0.30).toFixed(0)}</li>
      <li>Export credit: $${(totals.totalExport*0.10).toFixed(0)}</li>
      <li>Net cost: $${(totals.totalImport*0.30 - totals.totalExport*0.10).toFixed(0)} for 318 days</li>
      <li>Projected annual net: ~$${((totals.totalImport*0.30 - totals.totalExport*0.10)*365/318).toFixed(0)}</li>
      <li>Battery would reduce grid imports by ~70%, saving ~$${(totals.totalImport*0.3*0.30*365/318).toFixed(0)}/year</li>
      <li>ROI: 7-9 years for a 10-13kWh system</li>
    </ul>
    
    <h3>Action Items</h3>
    <ul>
      <li>Install battery system sized to 10kWh for optimal return</li>
      <li>Monitor seasonal patterns to decide battery charging/discharging strategy</li>
      <li>Consider solar water heating or other storage solutions for further savings</li>
    </ul>
  `;
}

// ---------- INIT ----------
async function init() {
    const data = await fetchSheetData();
    renderSummary(data);
    renderMonthly(data);
    renderSeasonal(data);
    renderRecommendation(data);
}

init();
