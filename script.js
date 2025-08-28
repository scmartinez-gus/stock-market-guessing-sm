// Stock Prediction Game
// Uses Alpha Vantage REAL data (no demo). API: TIME_SERIES_DAILY_ADJUSTED

(() => {
  const API_KEY = 'PXMXESAGXIQDGE9K';
  const BASE_URL = 'https://www.alphavantage.co/query';

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
  const roundResult = document.getElementById('round-result');
  const chartSection = document.getElementById('chart-section');
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
  };

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
    state.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Close Price ($)',
          data,
          borderColor: '#4f8cff',
          backgroundColor: 'rgba(79, 140, 255, 0.15)',
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
  }

  function setButtonsEnabled(enabled) {
    btnUp.disabled = !enabled;
    btnDown.disabled = !enabled;
  }

  async function fetchDailySeries(symbol) {
    const url = `${BASE_URL}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}&outputsize=full`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Network error: ${res.status}`);
    }
    const json = await res.json();
    if (json['Error Message']) {
      throw new Error('Invalid ticker symbol.');
    }
    if (json['Note']) {
      // API rate limit message
      throw new Error('API rate limit reached. Please wait and try again.');
    }
    const series = parseDailySeriesFromResponse(json);
    if (!series.length) {
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

    // Update chart by appending the next point
    if (state.chart) {
      state.chart.data.labels.push(next.date);
      state.chart.data.datasets[0].data.push(next.close);
      state.chart.update();
    }
    updateInfoPanel();
    roundResult.textContent = correct ? 'Correct! +1 point' : 'Incorrect. +0 points';
  }

  function resetGameUi() {
    setButtonsEnabled(false);
    infoScore.textContent = '0';
    roundResult.textContent = '';
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
  });
})();

