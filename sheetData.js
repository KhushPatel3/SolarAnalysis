// ---------- SHEET FETCH ----------
// Pass a year (e.g. 2025 or 2026) to fetch from the matching sheet tab.
async function fetchSheetData(year) {
  const SHEET_ID = "1qXR5qKnv8lC_lyS9pp5DPUO6ce46Twgmt6pQSTq4FDA";
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${year}`;

  const response = await fetch(SHEET_URL);
  const text = await response.text();
  const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\((.*)\)/)[1]);
  const rows = json.table.rows || [];

  const months = [
    { name: "January",   colStart: 1  },
    { name: "February",  colStart: 3  },
    { name: "March",     colStart: 5  },
    { name: "April",     colStart: 7  },
    { name: "May",       colStart: 9  },
    { name: "June",      colStart: 11 },
    { name: "July",      colStart: 13 },
    { name: "August",    colStart: 15 },
    { name: "September", colStart: 17 },
    { name: "October",   colStart: 19 },
    { name: "November",  colStart: 21 },
    { name: "December",  colStart: 23 }
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

  // Determine latest date with data
  let lastMonthIndex = -1;
  let lastDay = -1;
  for (let m = 0; m < months.length; m++) {
    const c = months[m].colStart;
    for (let r = 0; r < 31; r++) {
      const imp = rows[r]?.c[c]?.v;
      const exp = rows[r]?.c[c + 1]?.v;
      if ((imp != null && imp !== "") || (exp != null && exp !== "")) {
        lastMonthIndex = m;
        lastDay = r + 1;
      }
    }
  }

  const totalDays = monthlyTotals.reduce((s, m) => s + m.days, 0);

  // Build the ISO date string for the last day that has solar data.
  // This is passed to fetchWeatherData() so the API end_date matches exactly.
  let latestDate = null;
  if (lastMonthIndex === -1) {
    document.getElementById("data-period").textContent = "Data Period: No data";
  } else {
    const latestMonthName = months[lastMonthIndex].name;
    document.getElementById("data-period").textContent =
      `Data Period: 1 January - ${lastDay} ${latestMonthName} ${year} (${totalDays} days)`;

    const mm = String(lastMonthIndex + 1).padStart(2, '0');
    const dd = String(lastDay).padStart(2, '0');
    latestDate = `${year}-${mm}-${dd}`;
  }

  return { monthlyTotals, dailyData: rows, months, latestDate };
}