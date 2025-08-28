// Stock Prediction Game
// Uses Alpha Vantage REAL data (no demo). API: TIME_SERIES_DAILY_ADJUSTED

(() => {
  const DEFAULT_API_KEY = 'PXMXESAGXIQDGE9K';
  const BASE_URL = 'https://www.alphavantage.co/query';
  const OUTPUT_SIZE = 'compact'; // last 100 trading days

  /** DOM Elements */
  const form = document.getElementById('ticker-form');
  const tickerInput = document.getElementById('ticker-input');
  const errorMsg = document.getElementById('error-msg');
  const gameInfo = document.getElementById('game-info');
  const infoSymbol = document.getElementById('info-symbol');
  const infoDate = document.getElementById('info-date');
  const infoPrice = document.getElementById('info-price');
  const infoScore = document.getElementById('info-score');
  const btnUp = document.getElementById('btn-up');
  const btnDown = document.getElementById('btn-down');
  const btnEnd = document.getElementById('btn-end');
  const btnNew = document.getElementById('btn-new');
  const roundResult = document.getElementById('round-result');
  const chartSection = document.getElementById('chart-section');
  const apiKeyInput = document.getElementById('api-key-input');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const canvas = document.getElementById('price-chart');

  /** Game State */
  const state = {
    symbol: '',
    dailySeries: [], // array of {date: 'YYYY-MM-DD', close: number}
    chart: null,
    startIndex: -1, // index in dailySeries for the randomly chosen start date
    currentIndex: -1, // latest shown index
    score: 0,
    inRound: false,
    round: 0,
    highScore: 0,
  };

  // Brand color gradients for popular tickers. Fallback uses hash-based HSL.
  const BRAND_GRADIENTS = {
    'AAPL': ['#0d0d0d', '#1d1d1f'],
    'MSFT': ['#0078d4', '#004578'],
    'GOOG': ['#4285f4', '#0f9d58'],
    'GOOGL': ['#4285f4', '#0f9d58'],
    'AMZN': ['#ff9900', '#232f3e'],
    'TSLA': ['#cc0000', '#111111'],
    'META': ['#1877f2', '#1c1e21'],
    'NFLX': ['#e50914', '#221f1f'],
    'NVDA': ['#76b900', '#0f131a'],
    'COF': ['#004977', '#d03027'],
    'BAC': ['#0066b3', '#da001a'],
    'JPM': ['#1261a0', '#0a2f51'],
  };

  function hashStringToInt(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getGradientForTicker(symbol) {
    const upper = symbol.toUpperCase();
    if (BRAND_GRADIENTS[upper]) return BRAND_GRADIENTS[upper];
    const base = hashStringToInt(upper) % 360;
    const c1 = hslToHex(base, 70, 45);
    const c2 = hslToHex((base + 30) % 360, 65, 25);
    return [c1, c2];
  }

  function applyBrandTheme(symbol) {
    const [c1, c2] = getGradientForTicker(symbol);
    try {
      document.documentElement.style.setProperty('--accent', c1);
      document.body.style.background = `linear-gradient(135deg, ${c2} 0%, ${c1} 100%)`;
      document.body.style.backgroundAttachment = 'fixed';
      // Update chart theme if exists
      if (state.chart) {
        state.chart.data.datasets[0].borderColor = c1;
        state.chart.data.datasets[0].backgroundColor = hexToRgba(c1, 0.15);
        state.chart.update();
      }
    } catch (_) {}
  }

  function formatUSD(num) {
    if (num == null || Number.isNaN(num)) return '–';
    return Number(num).toFixed(2);
  }

  function parseDailySeriesFromResponse(json) {
    const series = json['Time Series (Daily)'] || json['Time Series (Daily)'];
    if (!series) return [];
    const entries = Object.entries(series).map(([date, obj]) => ({
      date,
      close: Number(obj['4. close'])
    }));
    // API returns newest first. Sort ascending by date for charting
    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  }

  function isWeekday(date) {
    const d = new Date(date);
    const day = d.getUTCDay();
    return day !== 0 && day !== 6; // not Sunday(0) or Saturday(6)
  }

  function formatDate(d) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function randomStartDateWithinRange(series) {
    // Choose a weekday date between 7 and 100 days before today, and that exists in series
    const today = new Date();
    const minOffset = 7; // at least 7 days before today
    const maxOffset = 100; // not more than 100 days before today
    // attempt up to 200 times to find a matching date that exists in series
    const availableDates = new Set(series.map(s => s.date));
    for (let i = 0; i < 200; i++) {
      const offset = Math.floor(Math.random() * (maxOffset - minOffset + 1)) + minOffset;
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - offset);
      const dateStr = formatDate(d);
      if (isWeekday(dateStr) && availableDates.has(dateStr)) {
        return dateStr;
      }
    }
    // Fallback: pick the latest date in series that is within range and weekday
    const cutoffMin = new Date();
    cutoffMin.setUTCDate(cutoffMin.getUTCDate() - maxOffset);
    const cutoffMax = new Date();
    cutoffMax.setUTCDate(cutoffMax.getUTCDate() - minOffset);
    for (let i = series.length - 1; i >= 0; i--) {
      const d = new Date(series[i].date + 'T00:00:00Z');
      if (d >= cutoffMin && d <= cutoffMax && isWeekday(series[i].date)) {
        return series[i].date;
      }
    }
    return null;
  }

  function buildChart(labels, data) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f8cff';
    state.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Close Price ($)',
          data,
          borderColor: accent,
          backgroundColor: hexToRgba(accent.startsWith('#') ? accent : '#4f8cff', 0.15),
          tension: 0.2,
          fill: true,
          pointRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: '#9aa4b2' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            ticks: { color: '#9aa4b2' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        },
        plugins: {
          legend: { labels: { color: '#e6edf3' } },
          tooltip: { mode: 'index', intersect: false }
        },
        interaction: { mode: 'index', intersect: false }
      }
    });
  }

  function updateInfoPanel() {
    infoSymbol.textContent = state.symbol || '–';
    if (state.currentIndex >= 0) {
      const { date, close } = state.dailySeries[state.currentIndex];
      infoDate.textContent = date;
      infoPrice.textContent = formatUSD(close);
    } else {
      infoDate.textContent = '–';
      infoPrice.textContent = '–';
    }
    infoScore.textContent = String(state.score);
    document.getElementById('info-round').textContent = String(state.round);
    document.getElementById('info-highscore').textContent = String(state.highScore);
  }

  function setButtonsEnabled(enabled) {
    btnUp.disabled = !enabled;
    btnDown.disabled = !enabled;
  }

  function getApiKey() {
    return localStorage.getItem('av_api_key') || DEFAULT_API_KEY;
  }

  function persistApiKey(key) {
    try {
      if (key && key.trim()) {
        localStorage.setItem('av_api_key', key.trim());
      }
    } catch (_) {}
  }

  // High score persistence (all-time for this browser)
  function loadHighScore() {
    try {
      const v = localStorage.getItem('spg_high_score');
      state.highScore = v ? Number(v) : 0;
    } catch (_) { state.highScore = 0; }
  }

  function saveHighScore() {
    try {
      localStorage.setItem('spg_high_score', String(state.highScore));
    } catch (_) {}
  }

  async function fetchDailySeries(symbol) {
    // Try adjusted first, then fallback to non-adjusted if needed
    const tryFetch = async (func) => {
      const url = `${BASE_URL}?function=${func}&symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}&outputsize=${OUTPUT_SIZE}&datatype=json`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Network error: ${res.status}`);
      }
      const json = await res.json();
      if (json['Note']) {
        throw new Error('API rate limit reached. Please wait and try again.');
      }
      if (json['Information']) {
        throw new Error('Alpha Vantage rejected the request. If you see a premium or limit message, set your own API key below and try again.');
      }
      if (json['Error Message']) {
        throw new Error('Invalid ticker symbol or API call.');
      }
      const series = parseDailySeriesFromResponse(json);
      return series;
    };

    let series = null;
    try {
      series = await tryFetch('TIME_SERIES_DAILY_ADJUSTED');
    } catch (eAdjusted) {
      try {
        series = await tryFetch('TIME_SERIES_DAILY');
      } catch (eDaily) {
        // Surface the daily error if both fail
        throw eDaily;
      }
    }
    if (!series || series.length === 0) {
      throw new Error('No data available for this ticker.');
    }
    return series;
  }

  function initRound() {
    // choose a start date and build initial 7-day window chart
    const startDate = randomStartDateWithinRange(state.dailySeries);
    if (!startDate) {
      throw new Error('Could not find a valid start date in the required window.');
    }
    const startIndex = state.dailySeries.findIndex(d => d.date === startDate);
    if (startIndex < 7) {
      throw new Error('Not enough historical data before start date.');
    }
    state.startIndex = startIndex;
    state.currentIndex = startIndex; // current date is the start date
    state.score = 0;
    state.inRound = true;
    state.round = 0;

    const windowData = state.dailySeries.slice(startIndex - 7, startIndex + 1);
    const labels = windowData.map(d => d.date);
    const data = windowData.map(d => d.close);
    buildChart(labels, data);
    updateInfoPanel();
    setButtonsEnabled(true);
    roundResult.textContent = '';
  }

  function advanceOneDayAndScore(guessUp) {
    // Compare next day's close to current day's close
    const nextIndex = state.currentIndex + 1;
    if (nextIndex >= state.dailySeries.length) {
      roundResult.textContent = 'No more data available.';
      setButtonsEnabled(false);
      return;
    }
    const prev = state.dailySeries[state.currentIndex];
    const next = state.dailySeries[nextIndex];
    const wentUp = next.close > prev.close;
    const correct = guessUp === wentUp;
    state.score += correct ? 1 : 0;
    state.currentIndex = nextIndex;
    state.round += 1;

    // Update chart by appending the next point
    if (state.chart) {
      state.chart.data.labels.push(next.date);
      state.chart.data.datasets[0].data.push(next.close);
      state.chart.update();
    }
    updateInfoPanel();
    roundResult.textContent = correct ? 'Correct! +1 point' : 'Incorrect. +0 points';

    // Check for game over at 5 rounds
    if (state.round >= 5) {
      setButtonsEnabled(false);
      const beat = state.score > state.highScore;
      if (beat) {
        state.highScore = state.score;
        saveHighScore();
      }
      roundResult.textContent = `Game Over after 5 rounds. Score: ${state.score}. ${beat ? 'New high score!' : 'High score remains ' + state.highScore}.`;
      btnNew.hidden = false;
    }
  }

  function resetGameUi() {
    setButtonsEnabled(false);
    infoScore.textContent = '0';
    roundResult.textContent = '';
    btnNew.hidden = true;
  }

  // Event Listeners
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    roundResult.textContent = '';
    resetGameUi();

    const raw = tickerInput.value.trim().toUpperCase();
    if (!raw) {
      errorMsg.textContent = 'Please enter a ticker symbol.';
      return;
    }
    // optimistic UI
    form.querySelector('button[type="submit"]').disabled = true;
    form.querySelector('button[type="submit"]').textContent = 'Loading…';
    try {
      const series = await fetchDailySeries(raw);
      state.symbol = raw;
      state.dailySeries = series;
      gameInfo.hidden = false;
      chartSection.hidden = false;
      infoSymbol.textContent = raw;
      applyBrandTheme(raw);
      loadHighScore();
      initRound();
    } catch (err) {
      console.error(err);
      errorMsg.textContent = err.message || 'Failed to load data.';
    } finally {
      form.querySelector('button[type="submit"]').disabled = false;
      form.querySelector('button[type="submit"]').textContent = 'Start Game';
    }
  });

  btnUp.addEventListener('click', () => {
    advanceOneDayAndScore(true);
  });

  btnDown.addEventListener('click', () => {
    advanceOneDayAndScore(false);
  });

  btnEnd.addEventListener('click', () => {
    setButtonsEnabled(false);
    roundResult.textContent = `Game ended. Final score: ${state.score}`;
    btnNew.hidden = false;
  });

  // API key persistence
  try {
    const existing = localStorage.getItem('av_api_key');
    if (existing) apiKeyInput.placeholder = 'Saved key in use';
  } catch (_) {}

  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      errorMsg.textContent = 'Enter an API key before saving.';
      return;
    }
    persistApiKey(key);
    errorMsg.textContent = 'API key saved locally.';
    apiKeyInput.value = '';
    apiKeyInput.placeholder = 'Saved key in use';
  });

  // New game: restart with current ticker and a fresh random start
  btnNew.addEventListener('click', () => {
    if (!state.symbol) return;
    try {
      initRound();
      btnNew.hidden = true;
    } catch (e) {
      errorMsg.textContent = e.message || 'Failed to start a new game.';
    }
  });
})();

