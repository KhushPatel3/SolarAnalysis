// ---------- WEATHER DATA — LIVE from Open-Meteo Archive API ----------
// Location: Hornby, Christchurch (-43.54, 172.52)
// API docs: https://open-meteo.com/en/docs/historical-weather-api
// No API key required. Data is fetched fresh on every page load.
// The end_date is set dynamically to match the latest date found in the spreadsheet.

// In-session cache so switching tabs/months doesn't re-fetch.
const _weatherCache = {};

/**
 * Fetches weather data for a given year from the Open-Meteo archive API.
 *
 * @param {number} year       - e.g. 2025 or 2026
 * @param {string} latestDate - ISO date string "YYYY-MM-DD" for the last day
 *                              with solar data in the spreadsheet. The API
 *                              end_date is capped to this value so we only
 *                              fetch what we actually need.
 * @returns {Promise<object|null>} Weather data object (same shape as the old
 *                                 static WEATHER_DATA[year]), or null on error.
 */
async function fetchWeatherData(year, latestDate) {
  const cacheKey = `${year}__${latestDate}`;
  if (_weatherCache[cacheKey]) return _weatherCache[cacheKey];

  const startDate = `${year}-01-01`;

  // The archive API only holds data up to ~5 days ago, so cap the end date.
  // Also never request beyond the last date that actually has solar data.
  const today = new Date().toISOString().split('T')[0];
  const endDate = latestDate && latestDate < today ? latestDate : today;

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=-43.54&longitude=172.52` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=sunshine_duration,shortwave_radiation_sum,precipitation_sum,cloud_cover_mean` +
    `&timezone=Pacific%2FAuckland`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();

    if (!json.daily || !json.daily.time || json.daily.time.length === 0) {
      console.warn('[weatherData] Open-Meteo returned no daily data for', year);
      return null;
    }

    const data = {
      time:                    json.daily.time,
      sunshine_duration:       json.daily.sunshine_duration,
      shortwave_radiation_sum: json.daily.shortwave_radiation_sum,
      precipitation_sum:       json.daily.precipitation_sum,
      cloud_cover_mean:        json.daily.cloud_cover_mean
    };

    _weatherCache[cacheKey] = data;
    return data;

  } catch (err) {
    console.error('[weatherData] Failed to fetch from Open-Meteo:', err);
    return null;
  }
}

// ---------- WEATHER HELPER ----------
// Extracts daily arrays for one calendar month from a live-fetched data object.
// weatherYearData  – the object returned by fetchWeatherData()
// monthIndex       – 0 = January … 11 = December
// year             – 4-digit year number
// Returns null if no data is available for that month.
function getWeatherForMonth(weatherYearData, monthIndex, year) {
  if (!weatherYearData) return null;

  const monthStr = String(monthIndex + 1).padStart(2, '0');
  const prefix   = `${year}-${monthStr}-`;

  const result = {
    days:           [],
    sunshine_hours: [],   // converted seconds → hours
    radiation:      [],   // MJ/m²
    precipitation:  [],   // mm
    cloud_cover:    []    // %
  };

  weatherYearData.time.forEach((date, i) => {
    if (date.startsWith(prefix)) {
      result.days.push(parseInt(date.split('-')[2], 10));
      result.sunshine_hours.push(+(weatherYearData.sunshine_duration[i] / 3600).toFixed(2));
      result.radiation.push(weatherYearData.shortwave_radiation_sum[i]);
      result.precipitation.push(weatherYearData.precipitation_sum[i]);
      result.cloud_cover.push(weatherYearData.cloud_cover_mean[i]);
    }
  });

  return result.days.length > 0 ? result : null;
}