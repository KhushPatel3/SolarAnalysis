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

// ---------- GOOGLE SHEETS FETCH & MONTHLY CALCULATION ----------
async function fetchSheetData() {
    const SHEET_ID = "1qXR5qKnv8lC_lyS9pp5DPUO6ce46Twgmt6pQSTq4FDA";
    const SHEET_NAME = "Data";
    const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${SHEET_NAME}`;

    const response = await fetch(SHEET_URL);
    const text = await response.text();
    const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\((.*)\)/)[1]);
    const rows = json.table.rows;

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

        for (let r = 3; r < 34; r++) { // Rows 4-34 daily import/export
            const imp = rows[r]?.c[m.colStart]?.v;
            const exp = rows[r]?.c[m.colStart + 1]?.v;
            if (imp != null && exp != null) {
                importTotal += parseFloat(imp);
                exportTotal += parseFloat(exp);
                daysCount++;
            }
        }

        // Row 36 has electricity bill
        let bill = 0;
        for (let c = m.colStart; c <= m.colStart + 1; c++) {
            const val = rows[31]?.c[c]?.v;
            if (val != null) {
                bill = parseFloat(String(val).replace(/[^0-9.-]+/g,""));
                break;
            }
        }

        return {
            month: m.name,
            import: importTotal,
            export: exportTotal,
            net: exportTotal - importTotal,
            bill,
            days: daysCount
        };
    });

    // ---------- Determine Latest Date ----------
    let lastDay = 0;
    let lastMonthIndex = 0;
    
    for (let r = 3; r < 34; r++) {
        for (let m = 0; m < months.length; m++) {
            const c = months[m].colStart;
            const imp = rows[r]?.c[c]?.v;
            const exp = rows[r]?.c[c+1]?.v;
            if ((imp != null && imp !== "") || (exp != null && exp !== "")) {
                lastDay = r - 2; // row 3 = day 1
                lastMonthIndex = m;
            }
        }
    }
    
    const latestDate = `${lastDay} ${months[lastMonthIndex].name} 2025`;
    document.getElementById('data-period').textContent = `Data Period: January 1 - ${latestDate} (${lastDay} days)`;

    return { monthlyTotals, dailyData: rows };
}

// ---------- SEASON DEFINITIONS ----------
const SEASONS = {
    'Summer': ['December','January','February'],
    'Autumn': ['March','April','May'],
    'Winter': ['June','July','August'],
    'Spring': ['September','October','November']
};

// ---------- SEASON BOUNDARIES ----------
const SEASON_BOUNDARIES = [2.5, 5.5, 8.5]; // indices between months (Feb-Mar, May-Jun, Aug-Sep)

// ---------- RENDER FUNCTIONS ----------
function renderSummary(monthlyTotals) {
    const totalImport = monthlyTotals.reduce((sum,m)=>sum+m.import,0);
    const totalExport = monthlyTotals.reduce((sum,m)=>sum+m.export,0);
    const totalDays = monthlyTotals.reduce((sum,m)=>sum+m.days,0);
    const netEnergy = totalExport - totalImport;

    document.getElementById('total-import').textContent = `${totalImport.toFixed(1)} kWh`;
    document.getElementById('avg-import').textContent = `Avg: ${(totalImport/totalDays).toFixed(1)} kWh/day`;
    document.getElementById('total-export').textContent = `${totalExport.toFixed(1)} kWh`;
    document.getElementById('avg-export').textContent = `Avg: ${(totalExport/totalDays).toFixed(1)} kWh/day`;
    document.getElementById('net-energy').textContent = `${netEnergy > 0 ? '+' : ''}${netEnergy.toFixed(1)} kWh`;

    const insights = [
        `Peak export months: ${[...monthlyTotals].sort((a,b)=>b.export-a.export).slice(0,3).map(d=>d.month).join(', ')}`,
        `Peak import months: ${[...monthlyTotals].sort((a,b)=>b.import-a.import).slice(0,3).map(d=>d.month).join(', ')}`,
        `Highest net surplus: ${[...monthlyTotals].sort((a,b)=>b.net-a.net)[0].month}`,
        `Lowest net (most deficit): ${[...monthlyTotals].sort((a,b)=>a.net-b.net)[0].month}`
    ];

    const insightsList = document.getElementById('insights-list');
    insightsList.innerHTML = '';
    insights.forEach(i => {
        const li = document.createElement('li');
        li.textContent = i;
        insightsList.appendChild(li);
    });

    // ---------- Monthly Breakdown Table ----------
    const tbody = document.querySelector('#monthly-table tbody');
    tbody.innerHTML = '';
    monthlyTotals.forEach(m => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${m.month}</td>
            <td>${m.import.toFixed(1)}</td>
            <td>${m.export.toFixed(1)}</td>
            <td>${m.net.toFixed(1)}</td>
            <td>${m.bill.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });

    const labels = monthlyTotals.map(m => m.month.substring(0,3));
    const importData = monthlyTotals.map(m => m.import);
    const exportData = monthlyTotals.map(m => m.export);
    const netData = monthlyTotals.map(m => m.net);

    // ---------- Monthly Import/Export Bar Chart ----------
    new Chart(document.getElementById('monthly-bar-chart'), {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'Import', data: importData, backgroundColor: '#ef4444' },
            { label: 'Export', data: exportData, backgroundColor: '#22c55e' }
        ]},
        options: {
            responsive:true,
            plugins: {
                annotation: {
                    annotations: SEASON_BOUNDARIES.map(pos => ({
                        type: 'line',
                        xMin: pos,
                        xMax: pos,
                        borderColor: '#00000055',
                        borderWidth: 1,
                        borderDash: [5,5]
                    }))
                }
            }
        }
    });

    // ---------- Monthly Net Energy Line Chart ----------
    new Chart(document.getElementById('monthly-line-chart'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Net Energy', data: netData, borderColor: '#3b82f6', fill:false }] },
        options: {
            responsive:true,
            plugins: {
                annotation: {
                    annotations: SEASON_BOUNDARIES.map(pos => ({
                        type: 'line',
                        xMin: pos,
                        xMax: pos,
                        borderColor: '#00000055',
                        borderWidth: 1,
                        borderDash: [5,5]
                    }))
                }
            }
        }
    });

    // ---------- Monthly Electricity Bills Chart ----------
    new Chart(document.getElementById('monthly-bill-chart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Electricity Bill ($)',
                data: monthlyTotals.map(m => m.bill),
                backgroundColor: monthlyTotals.map(m => m.bill < 0 ? '#16a34a' : '#dc2626')
            }]
        },
        options: {
            responsive:true,
            plugins: {
                legend: { display: false },
                annotation: {
                    annotations: SEASON_BOUNDARIES.map(pos => ({
                        type: 'line',
                        xMin: pos,
                        xMax: pos,
                        borderColor: '#00000055',
                        borderWidth: 1,
                        borderDash: [5,5]
                    }))
                }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderSeasonal(monthlyTotals) {
    const seasonData = [];
    for (let season in SEASONS) {
        let impSum=0, expSum=0, billSum=0;
        SEASONS[season].forEach(month=>{
            const m = monthlyTotals.find(d=>d.month===month);
            if(m){ impSum+=m.import; expSum+=m.export; billSum+=m.bill; }
        });
        seasonData.push({season, import:impSum, export:expSum, net:expSum-impSum, bill:billSum});
    }

    new Chart(document.getElementById('seasonal-bar-chart'), {
        type:'bar',
        data: { labels: seasonData.map(s=>s.season), datasets:[
            {label:'Import', data:seasonData.map(s=>s.import), backgroundColor:'#ef4444'},
            {label:'Export', data:seasonData.map(s=>s.export), backgroundColor:'#22c55e'}
        ] },
        options:{responsive:true}
    });

    const summaryDiv = document.getElementById('seasonal-summary');
    summaryDiv.innerHTML='';
    seasonData.forEach(s=>{
        const div = document.createElement('div');
        div.innerHTML=`<h4>${s.season}</h4><p>Import: ${s.import.toFixed(1)} kWh</p><p>Export: ${s.export.toFixed(1)} kWh</p><p>Net: ${s.net.toFixed(1)} kWh</p><p>Bill: $${s.bill.toFixed(2)}</p>`;
        summaryDiv.appendChild(div);
    });

    const analysisDiv = document.getElementById('seasonal-pattern-analysis');
    analysisDiv.innerHTML=`
    <h3>Seasonal Pattern Analysis</h3>
    <ul>
      <li>Summer: Exports usually exceed imports, peak month typically Jan/Feb.</li>
      <li>Autumn: Slight net positive, production decreases as days shorten.</li>
      <li>Winter: Imports exceed exports, most deficit in Jun/Jul.</li>
      <li>Spring: Exports recover, high net energy; Nov shows strong recovery.</li>
    </ul>`;
}

function renderRecommendation(monthlyTotals) {
    const totalImport = monthlyTotals.reduce((sum,m)=>sum+m.import,0);
    const totalExport = monthlyTotals.reduce((sum,m)=>sum+m.export,0);

    const contentDiv = document.getElementById('recommendation-content');
    contentDiv.innerHTML=`
    <h3>Battery Storage Recommendation</h3>
    <p>Based on import/export patterns, a ~10kWh battery is recommended to reduce winter grid imports and store excess summer generation.</p>
    
    <h3>Financial Analysis</h3>
    <p>Assuming $0.30/kWh import, $0.10/kWh export:</p>
    <ul>
      <li>Import cost: $${(totalImport*0.30).toFixed(0)}</li>
      <li>Export credit: $${(totalExport*0.10).toFixed(0)}</li>
      <li>Net cost: $${(totalImport*0.30 - totalExport*0.10).toFixed(0)}</li>
      <li>Projected annual net: ~$${((totalImport*0.30 - totalExport*0.10)*365/318).toFixed(0)}</li>
      <li>Battery would cut imports by ~70%, saving ~$${(totalImport*0.3*0.30*365/318).toFixed(0)}/year</li>
      <li>ROI: 7-9 years for a 10-13kWh system</li>
    </ul>
    
    <h3>Action Items</h3>
    <ul>
      <li>Install a 10kWh battery system</li>
      <li>Monitor seasonal patterns to optimize charge/discharge</li>
      <li>Consider solar water heating for further bill reduction</li>
    </ul>`;
}

// ---------- INIT ----------
async function init() {
    const { monthlyTotals } = await fetchSheetData();
    renderSummary(monthlyTotals);
    renderSeasonal(monthlyTotals);
    renderRecommendation(monthlyTotals);
}

init();
