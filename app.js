// Global State
const state = {
    currentSymbol: 'BTC',
    currentName: 'Bitcoin',
    currentIcon: '₿',
    ws: null,
    priceData: {},
    historicalData: {},
    startTime: Date.now(),
    dataPointsCount: 0,
    lastUpdateTime: Date.now(),
    alerts: [],
    theme: 'light',
    lastLivePrice: null
};

// Cryptocurrency mapping for Binance
const cryptoMapping = {
    'BTC': 'btcusdt',
    'ETH': 'ethusdt',
    'ADA': 'adausdt',
    'DOT': 'dotusdt',
    'SOL': 'solusdt',
    'BNB': 'bnbusdt',
    'XRP': 'xrpusdt',
    'DOGE': 'dogeusdt',
    'LTC': 'ltcusdt'
};

// Initialize application
function init() {
    updateTime();
    setInterval(updateTime, 1000);
    setupCryptoSelector();
    setupThemeToggle();
    setupExportButton();
    setupSearchPanel();
    connectWebSocket();
    fetchAllCryptoData();
    setInterval(() => fetchAllCryptoData(), 30000);
    updateSystemHealth();
    setInterval(updateSystemHealth, 1000);
    setupPriceVisibilityWatcher();

    addAlert('System initialized successfully', 'success');
}

// Update current time
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const el = document.getElementById('currentTime');
    if (el) el.textContent = timeString;
}

// Setup crypto selector buttons
function setupCryptoSelector() {
    const buttons = document.querySelectorAll('.crypto-btn');
    let lastHiddenBtn = document.querySelector('.crypto-btn.active');

    // Hide the default active button on load
    if (lastHiddenBtn) {
        lastHiddenBtn.style.display = "none";
    }

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {

            // Show previously hidden button
            if (lastHiddenBtn && lastHiddenBtn !== btn) {
                lastHiddenBtn.style.display = "flex";
            }

            // Hide current selected button
            btn.style.display = "none";
            lastHiddenBtn = btn;

            // Normal selection logic
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            state.currentSymbol = btn.dataset.symbol;
            state.currentName = btn.dataset.name;
            state.currentIcon = btn.dataset.icon;

            updatePriceDisplay();
            addAlert(`Switched to ${state.currentName}`, 'info');
        });
    });
}


// Connect to Binance WebSocket
function connectWebSocket() {
    try {
        const streams = Object.values(cryptoMapping).map(s => `${s}@ticker`).join('/');
        const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

        state.ws = new WebSocket(wsUrl);

        state.ws.onopen = () => {
            updateConnectionStatus('connected');
            addAlert('WebSocket connected', 'success');
        };

        state.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.data) {
                    handleTickerUpdate(data.data);
                }
            } catch (e) {
                console.error('Invalid WS message', e);
            }
        };

        state.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus('disconnected');
            addAlert('WebSocket error - using fallback data', 'warning');
        };

        state.ws.onclose = () => {
            updateConnectionStatus('disconnected');
            addAlert('WebSocket disconnected - reconnecting...', 'warning');
            setTimeout(connectWebSocket, 5000);
        };
    } catch (err) {
        console.error('connectWebSocket error', err);
    }
}

// Handle ticker updates from WebSocket
function handleTickerUpdate(data) {
    const symbol = data.s.replace('USDT', '');

    state.priceData[symbol] = {
        price: parseFloat(data.c),
        high24h: parseFloat(data.h),
        low24h: parseFloat(data.l),
        volume24h: parseFloat(data.v),
        priceChange24h: parseFloat(data.p),
        priceChangePercent24h: parseFloat(data.P),
        lastUpdate: Date.now()
    };

    state.dataPointsCount++;
    state.lastUpdateTime = Date.now();

    if (symbol === state.currentSymbol) {
        // capture previous live price, then update stored lastLivePrice
        const previous = state.lastLivePrice;
        state.lastLivePrice = state.priceData[symbol].price;
        updatePriceDisplay(previous);
    }

    updateTopMovers();
    detectAnomalies(symbol);
}

// Fetch data from CoinGecko as fallback
async function fetchAllCryptoData() {
    try {
        const ids = 'bitcoin,ethereum,cardano,polkadot,solana,binancecoin,ripple,dogecoin,matic-network,litecoin';
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24h_vol=true&include_24h_change=true&include_24h_high=true&include_24h_low=true`
        );
        const data = await response.json();

        const mapping = {
            'bitcoin': 'BTC',
            'ethereum': 'ETH',
            'cardano': 'ADA',
            'polkadot': 'DOT',
            'solana': 'SOL',
            'binancecoin': 'BNB',
            'ripple': 'XRP',
            'dogecoin': 'DOGE',
            'matic-network': 'MATIC',
            'litecoin': 'LTC'
        };

        Object.keys(data).forEach(id => {
            const symbol = mapping[id];
            if (symbol) {
                state.priceData[symbol] = {
                    price: data[id].usd,
                    high24h: data[id].usd_24h_high || data[id].usd * 1.05,
                    low24h: data[id].usd_24h_low || data[id].usd * 0.95,
                    volume24h: data[id].usd_24h_vol || 0,
                    priceChange24h: data[id].usd * (data[id].usd_24h_change / 100),
                    priceChangePercent24h: data[id].usd_24h_change || 0,
                    lastUpdate: Date.now()
                };
            }
        });

        // When fallback fetch runs, it may not know previous tick — pass null
        updatePriceDisplay(null);
        updateTopMovers();
    } catch (error) {
        console.error('Error fetching CoinGecko data:', error);
    }
}

// Update price display
function updatePriceDisplay(previousPrice) {
    const data = state.priceData[state.currentSymbol];
    if (!data) return;

    const priceIconEl = document.getElementById('priceIcon');
    const nameEl = document.getElementById('priceCryptoName');
    const symbolEl = document.getElementById('priceCryptoSymbol');
    const currentPriceEl = document.getElementById('currentPrice');
    const priceArrowEl = document.getElementById('priceArrow');
    const priceChangeEl = document.getElementById('priceChange');

    if (priceIconEl) priceIconEl.textContent = state.currentIcon;
    if (nameEl) nameEl.textContent = state.currentName;
    if (symbolEl) symbolEl.textContent = `${state.currentSymbol}/USDT`;

    // Ensure elements exist
    if (!currentPriceEl || !priceArrowEl || !priceChangeEl) return;

    // Remove any previous price-pulse and arrow state but keep positive/negative removed first,
    // we'll set classes based on live tick below.
    currentPriceEl.classList.remove('price-pulse');
    priceArrowEl.classList.remove('neutral', 'positive', 'negative');
    currentPriceEl.classList.remove('positive', 'negative');

    // Add pulse animation for any price change
    currentPriceEl.classList.add('price-pulse');

    // Live tick logic (Option A): Only use previousPrice for coloring.
    // If previousPrice is provided and not null, set color/arrow based on tick movement.
    // Otherwise (initial render), fall back to showing neutral arrow and color based on 24h percent (optional).
    const rawPrice = data.price;
    if (previousPrice !== undefined && previousPrice !== null) {
        if (rawPrice > previousPrice) {
            currentPriceEl.classList.add('positive');
            priceArrowEl.classList.add('positive');
            priceArrowEl.textContent = '↗';
        } else if (rawPrice < previousPrice) {
            currentPriceEl.classList.add('negative');
            priceArrowEl.classList.add('negative');
            priceArrowEl.textContent = '↘';
        } else {
            // unchanged tick
            priceArrowEl.classList.add('neutral');
            priceArrowEl.textContent = '→';
        }
    } else {
        // No previous tick available — initial state:
        // We'll set a neutral arrow; optionally color by 24h percent
        priceArrowEl.classList.add('neutral');
        priceArrowEl.textContent = '→';
        // (Optional) fallback color by 24h change for initial load:
        if (data.priceChangePercent24h > 0) {
            currentPriceEl.classList.add('positive');
        } else if (data.priceChangePercent24h < 0) {
            currentPriceEl.classList.add('negative');
        }
    }

    // Set displayed formatted price
    currentPriceEl.textContent = formatPrice(rawPrice);

    // Update price change display (24h)
    const changePercent = data.priceChangePercent24h;
    const changeAmount = data.priceChange24h;
    priceChangeEl.className = 'price-change ' + (changePercent >= 0 ? 'positive' : 'negative');
    const changeValueEl = priceChangeEl.querySelector('.change-value');
    const changeAmountEl = priceChangeEl.querySelector('.change-amount');
    if (changeValueEl) changeValueEl.textContent = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
    if (changeAmountEl) changeAmountEl.textContent = `${changePercent >= 0 ? '+' : ''}${formatPrice(changeAmount)}`;

    // Stats
    const highEl = document.getElementById('high24h');
    const lowEl = document.getElementById('low24h');
    const volEl = document.getElementById('volume24h');
    if (highEl) highEl.textContent = formatPrice(data.high24h);
    if (lowEl) lowEl.textContent = formatPrice(data.low24h);
    if (volEl) volEl.textContent = formatVolume(data.volume24h);

    // Update other panels
    updateMarketMicrostructure(data);
    updateVolatilityMetrics(data);
    updateRiskIndicators(data);
    document.getElementById("footerLivePrice").textContent = formatPrice(data.price);
    // === Footer Live Price Color ===
    const footerPriceEl = document.getElementById("footerLivePrice");
    footerPriceEl.classList.remove("footer-price-green", "footer-price-red");

    if (previousPrice !== null && previousPrice !== undefined) {
        if (data.price > previousPrice) {
            footerPriceEl.classList.add("footer-price-green");
        } else if (data.price < previousPrice) {
            footerPriceEl.classList.add("footer-price-red");
        }
    }

}


// Update market microstructure metrics
function updateMarketMicrostructure(data) {
    if (!data) return;
    const priceRange = data.high24h - data.low24h || 1;
    const pricePosition = (data.price - data.low24h) / priceRange;

    const ofi = (pricePosition - 0.5) * 100;
    const ofiValueEl = document.getElementById('ofiValue');
    const ofiBarEl = document.getElementById('ofiBar');
    if (ofiValueEl) ofiValueEl.textContent = ofi.toFixed(2);
    if (ofiBarEl) {
        ofiBarEl.style.width = `${Math.abs(ofi)}%`;
        ofiBarEl.style.background = ofi >= 0 ? 'var(--color-success)' : 'var(--color-error)';
    }

    const volumeSlope = data.priceChangePercent24h * 2;
    const volumeSlopeEl = document.getElementById('volumeSlope');
    const volumeSlopeBarEl = document.getElementById('volumeSlopeBar');
    if (volumeSlopeEl) volumeSlopeEl.textContent = volumeSlope.toFixed(2);
    if (volumeSlopeBarEl) {
        volumeSlopeBarEl.style.width = `${Math.min(Math.abs(volumeSlope), 100)}%`;
        volumeSlopeBarEl.style.background = volumeSlope >= 0 ? 'var(--color-success)' : 'var(--color-error)';
    }

    const bidAsk = pricePosition * 100;
    const bidAskEl = document.getElementById('bidAskImbalance');
    const bidAskBarEl = document.getElementById('bidAskBar');
    if (bidAskEl) bidAskEl.textContent = bidAsk.toFixed(2);
    if (bidAskBarEl) bidAskBarEl.style.width = `${Math.max(0, Math.min(bidAsk, 100))}%`;
}

// Update volatility metrics
function updateVolatilityMetrics(data) {
    if (!data) return;
    const priceRange = data.high24h - data.low24h || 1;
    const avgPrice = (data.high24h + data.low24h) / 2 || data.price || 1;
    const volatility24h = (priceRange / avgPrice) * 100;

    const vol1h = volatility24h / 24;
    const vol4h = volatility24h / 6;

    const vol1hEl = document.getElementById('vol1h');
    const vol1hGaugeEl = document.getElementById('vol1hGauge');
    const vol4hEl = document.getElementById('vol4h');
    const vol4hGaugeEl = document.getElementById('vol4hGauge');
    const vol24hEl = document.getElementById('vol24h');
    const vol24hGaugeEl = document.getElementById('vol24hGauge');

    if (vol1hEl) vol1hEl.textContent = `${vol1h.toFixed(2)}%`;
    if (vol1hGaugeEl) vol1hGaugeEl.style.width = `${Math.min(vol1h * 10, 100)}%`;

    if (vol4hEl) vol4hEl.textContent = `${vol4h.toFixed(2)}%`;
    if (vol4hGaugeEl) vol4hGaugeEl.style.width = `${Math.min(vol4h * 10, 100)}%`;

    if (vol24hEl) vol24hEl.textContent = `${volatility24h.toFixed(2)}%`;
    if (vol24hGaugeEl) vol24hGaugeEl.style.width = `${Math.min(volatility24h * 10, 100)}%`;
}

// Update risk indicators
function updateRiskIndicators(data) {
    if (!data) return;
    const volatility = ((data.high24h - data.low24h) / (data.price || 1)) * 100;

    let riskLevel, riskScore;
    if (volatility < 3) {
        riskLevel = 'Low';
        riskScore = 25;
    } else if (volatility < 7) {
        riskLevel = 'Medium';
        riskScore = 50;
    } else {
        riskLevel = 'High';
        riskScore = 75;
    }

    const marketRiskEl = document.getElementById('marketRisk');
    const marketRiskScoreEl = document.getElementById('marketRiskScore');
    if (marketRiskEl) marketRiskEl.textContent = riskLevel;
    if (marketRiskScoreEl) marketRiskScoreEl.textContent = `${riskScore}%`;

    const liquidityScore = Math.min((data.volume24h / 1000000) * 10, 100);
    const liquidityScoreEl = document.getElementById('liquidityScore');
    const liquidityScoreValueEl = document.getElementById('liquidityScoreValue');
    let liquidityLevel;
    if (liquidityScore > 70) {
        liquidityLevel = 'High';
    } else if (liquidityScore > 40) {
        liquidityLevel = 'Medium';
    } else {
        liquidityLevel = 'Low';
    }

    if (liquidityScoreEl) liquidityScoreEl.textContent = liquidityLevel;
    if (liquidityScoreValueEl) liquidityScoreValueEl.textContent = `${liquidityScore.toFixed(0)}%`;
}
// Robust watcher: show footer price when >1/3 of .price-card is hidden
function setupPriceVisibilityWatcher() {
    const priceCard = document.querySelector('.price-card');
    const footerBox = document.getElementById('footerLivePriceBox');

    console.log('[watcher] init');

    if (!priceCard) {
        console.warn('[watcher] .price-card not found in DOM');
        return;
    }
    if (!footerBox) {
        console.warn('[watcher] #footerLivePriceBox not found in DOM');
        return;
    }

    // helper to show/hide
    const showFooter = (show) => {
        footerBox.style.display = show ? 'flex' : 'none';
    };

    // Use IntersectionObserver if available
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            const entry = entries[0];
            if (!entry) return;
            const ratio = entry.intersectionRatio; // 0..1
            // debug
            // console.log('[watcher] intersectionRatio', ratio);
            // Show footer when visible < 0.66 (i.e., more than 1/3 hidden)
            showFooter(ratio < 0.66);
        }, {
            threshold: [0, 0.33, 0.66, 1]
        });

        observer.observe(priceCard);
        console.log('[watcher] using IntersectionObserver');
        return;
    }

    // Fallback: on scroll/resize compute visible ratio
    console.log('[watcher] IntersectionObserver not supported, using scroll fallback');

    const computeAndApply = () => {
        const rect = priceCard.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        // If completely off-screen above or below, ratio = 0
        if (rect.bottom <= 0 || rect.top >= viewportHeight) {
            showFooter(true);
            return;
        }

        // Visible height is intersection between rect and viewport
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, viewportHeight);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const totalHeight = rect.height || 1;
        const visibleRatio = visibleHeight / totalHeight;

        // debug
        // console.log('[watcher-fallback] visibleRatio', visibleRatio);

        showFooter(visibleRatio < 0.66);
    };

    // run immediately and on scroll/resize (debounce small)
    computeAndApply();
    let t = null;
    window.addEventListener('scroll', () => {
        if (t) clearTimeout(t);
        t = setTimeout(computeAndApply, 60);
    }, { passive: true });
    window.addEventListener('resize', () => {
        if (t) clearTimeout(t);
        t = setTimeout(computeAndApply, 60);
    });
}

// Detect market anomalies
function detectAnomalies(symbol) {
    const data = state.priceData[symbol];
    if (!data) return;

    const container = document.getElementById('anomalyContainer');
    if (!container) return;

    if (Math.abs(data.priceChangePercent24h) > 10) {
        const anomaly = document.createElement('div');
        anomaly.className = 'anomaly-item status--warning';
        anomaly.innerHTML = `
      <span class="anomaly-icon">⚠️</span>
      <span class="anomaly-text">${symbol}: High volatility detected (${data.priceChangePercent24h.toFixed(2)}%)</span>
    `;
        container.innerHTML = '';
        container.appendChild(anomaly);

        if (symbol === state.currentSymbol) {
            addAlert(`High volatility detected for ${symbol}`, 'warning');
        }
    } else if (Math.abs(data.priceChangePercent24h) > 5) {
        const anomaly = document.createElement('div');
        anomaly.className = 'anomaly-item status--info';
        anomaly.innerHTML = `
      <span class="anomaly-icon">ℹ️</span>
      <span class="anomaly-text">${symbol}: Moderate price movement (${data.priceChangePercent24h.toFixed(2)}%)</span>
    `;
        container.innerHTML = '';
        container.appendChild(anomaly);
    } else {
        // clear if no anomaly
        // keep existing content if you prefer; here we'll leave "Monitoring..."
    }
}

// Update top movers
function updateTopMovers() {
    const movers = Object.entries(state.priceData)
        .map(([symbol, data]) => ({ symbol, change: data.priceChangePercent24h }))
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, 5);

    const container = document.getElementById('moversContainer');
    if (!container) return;

    container.innerHTML = movers.map(mover => `
    <div class="mover-item">
      <span class="mover-symbol">${mover.symbol}</span>
      <span class="mover-change ${mover.change >= 0 ? 'positive' : 'negative'}">
        ${mover.change >= 0 ? '+' : ''}${mover.change.toFixed(2)}%
      </span>
    </div>
  `).join('');
}

// Update connection status
function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    statusEl.className = `connection-status ${status}`;
    const txt = statusEl.querySelector('.status-text');
    if (txt) txt.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
}

// Update system health
function updateSystemHealth() {
    const now = Date.now();

    const freshness = Math.floor((now - state.lastUpdateTime) / 1000);
    const freshnessEl = document.getElementById('dataFreshness');
    if (freshnessEl) freshnessEl.textContent = `${freshness}s`;

    const latency = state.ws && state.ws.readyState === WebSocket.OPEN ?
        Math.floor(Math.random() * 50 + 20) : 0;
    const latencyEl = document.getElementById('latency');
    if (latencyEl) latencyEl.textContent = `${latency}ms`;

    const dataPointsEl = document.getElementById('dataPoints');
    if (dataPointsEl) dataPointsEl.textContent = state.dataPointsCount;

    const connectionStatus = state.ws && state.ws.readyState === WebSocket.OPEN ? 'Active' : 'Inactive';
    const footerConnectionEl = document.getElementById('footerConnection');
    if (footerConnectionEl) footerConnectionEl.textContent = connectionStatus;
}

// Add alert to alert center
function addAlert(message, type = 'info') {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    state.alerts.unshift({ message, type, time: timeStr });
    if (state.alerts.length > 10) state.alerts.pop();

    const container = document.getElementById('alertsContainer');
    if (!container) return;

    container.innerHTML = state.alerts.map(alert => `
    <div class="alert-item status--${alert.type}">
      <span class="alert-time">${alert.time}</span>
      <span class="alert-message">${alert.message}</span>
    </div>
  `).join('');
}

// Setup theme toggle
function setupThemeToggle() {
    const themeBtn = document.getElementById('themeToggle');
    if (!themeBtn) return;
    themeBtn.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', state.theme);
        themeBtn.querySelector('.fab-icon').textContent = state.theme === 'light' ? '🌙' : '☀️';
        addAlert(`Theme changed to ${state.theme}`, 'info');
    });
}

// Setup export button
function setupExportButton() {
    const exportBtn = document.getElementById('exportBtn');
    if (!exportBtn) return;
    exportBtn.addEventListener('click', () => {
        const data = {
            timestamp: new Date().toISOString(),
            currentSymbol: state.currentSymbol,
            priceData: state.priceData,
            alerts: state.alerts
        };

        // Create PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();

        // Title
        pdf.setFontSize(18);
        pdf.text("Crypto View", 10, 15);

        // Subtitle
        pdf.setFontSize(12);
        pdf.text(`Generated: ${new Date().toLocaleString()}`, 10, 25);
        pdf.text(`Crypto: ${state.currentSymbol}`, 10, 35);

        // Price Info
        pdf.setFontSize(14);
        pdf.text("Price Data:", 10, 50);

        pdf.setFontSize(12);
        pdf.text(`Current Price: ${formatPrice(state.priceData[state.currentSymbol].price)}`, 10, 60);
        pdf.text(`24h High: ${formatPrice(state.priceData[state.currentSymbol].high24h)}`, 10, 70);
        pdf.text(`24h Low: ${formatPrice(state.priceData[state.currentSymbol].low24h)}`, 10, 80);
        pdf.text(`24h Volume: ${formatVolume(state.priceData[state.currentSymbol].volume24h)}`, 10, 90);

        // Alerts
        pdf.setFontSize(14);
        pdf.text("Recent Alerts:", 10, 110);

        let yPos = 120;
        state.alerts.forEach(alert => {
            pdf.setFontSize(11);
            pdf.text(`• [${alert.time}] ${alert.message}`, 10, yPos);
            yPos += 8;
        });

        // Save file
        pdf.save(`crypto-report-${Date.now()}.pdf`);


        addAlert('Data exported successfully', 'success');
    });
}

// ----------------- UNIVERSAL SEARCH: replace setupSearchPanel() with this -----------------
function setupSearchPanel() {
    const searchBtn = document.getElementById('searchBtn');
    const searchPanel = document.getElementById('searchPanel');
    const closeBtn = document.getElementById('closeSearch');
    const searchInput = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResults');

    if (!searchBtn || !searchPanel || !closeBtn || !searchInput || !resultsContainer) return;

    // Build a static list of "metric" items to search (id = DOM id to jump to)
    const metricsIndex = [
        { id: 'ofiValue', title: 'Order Flow Imbalance', type: 'metric' },
        { id: 'volumeSlope', title: 'Volume Slope', type: 'metric' },
        { id: 'bidAskImbalance', title: 'Bid-Ask Imbalance', type: 'metric' },
        { id: 'vol1h', title: '1h Volatility', type: 'metric' },
        { id: 'vol4h', title: '4h Volatility', type: 'metric' },
        { id: 'vol24h', title: '24h Volatility', type: 'metric' },
        { id: 'moversContainer', title: 'Top Movers', type: 'metric' },
        { id: 'anomalyContainer', title: 'Anomaly Detection', type: 'metric' },
        { id: 'alertsContainer', title: 'Alert Center', type: 'metric' },
        { id: 'marketRisk', title: 'Market Risk', type: 'metric' },
        { id: 'liquidityScore', title: 'Liquidity Score', type: 'metric' }
    ];

    // State for keyboard navigation
    let flatResults = []; // flattened array of {type, key, title, action}
    let activeIndex = -1;

    // open / close handlers
    const open = () => {
        searchPanel.classList.add('active');
        searchInput.value = '';
        renderEmpty();
        searchInput.focus();
        flatResults = [];
        activeIndex = -1;
    };
    const close = () => {
        searchPanel.classList.remove('active');
        searchInput.blur();
        flatResults = [];
        activeIndex = -1;
    };

    searchBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    // keyboard shortcuts: Ctrl/Cmd+K to open, Esc to close
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (searchPanel.classList.contains('active')) {
                close();
            } else {
                open();
            }
        }
        if (e.key === 'Escape' && searchPanel.classList.contains('active')) {
            close();
        }
    });

    // Debounce helper
    function debounce(fn, wait = 180) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), wait);
        };
    }

    // Build search index each time (coins + metrics + alerts)
    function buildIndex() {
        const coins = Object.keys(state.priceData || {}).map(symbol => {
            const d = state.priceData[symbol] || {};
            const name = (d.name || symbol); // if you add name in data, good
            const subtitle = d.price ? formatPrice(d.price) : '--';
            return {
                type: 'coin',
                key: symbol,
                title: `${symbol}`,
                subtitle,
                score: 0
            };
        });

        // Alerts (recent)
        const alerts = (state.alerts || []).slice(0, 20).map((a, idx) => ({
            type: 'alert',
            key: `alert-${idx}`,
            title: a.message,
            subtitle: a.time
        }));

        const metrics = metricsIndex.map(m => ({
            type: m.type,
            key: m.id,
            title: m.title,
            subtitle: 'Metric panel'
        }));

        return { coins, alerts, metrics };
    }

    // Perform search: simple case-insensitive substring match; boost exact symbol matches
    function performSearch(query) {
        if (!query || !query.trim()) {
            renderEmpty();
            flatResults = [];
            return;
        }
        const q = query.trim().toLowerCase();
        const { coins, alerts, metrics } = buildIndex();

        const coinMatches = coins
            .map(c => {
                const score = c.title.toLowerCase() === q ? 100 : (c.title.toLowerCase().includes(q) ? 60 : (c.subtitle && c.subtitle.toLowerCase().includes(q) ? 40 : 0));
                return {...c, score };
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20);

        const metricMatches = metrics
            .map(m => ({...m, score: m.title.toLowerCase().includes(q) ? 50 : 0 }))
            .filter(r => r.score > 0)
            .slice(0, 10);

        const alertMatches = alerts
            .map(a => ({...a, score: a.title.toLowerCase().includes(q) ? 30 : 0 }))
            .filter(r => r.score > 0)
            .slice(0, 10);

        renderGroupedResults(coinMatches, metricMatches, alertMatches);
    }

    // Render nothing / placeholder
    function renderEmpty() {
        resultsContainer.innerHTML = `<div class="search-result-empty">Type to search coins, metrics, alerts... (Try "BTC" or "Volume")</div>`;
    }

    // Render grouped results and build flatResults for keyboard nav
    function renderGroupedResults(coins, metrics, alerts) {
        flatResults = [];
        activeIndex = -1;
        let html = '';

        if (coins.length) {
            html += `<div class="search-group"><div class="search-group-title">Coins</div>`;
            coins.forEach(c => {
                const idx = flatResults.length;
                flatResults.push({ type: 'coin', key: c.key, title: c.title });
                html += `<div class="search-result-item" data-idx="${idx}" data-type="coin" data-key="${c.key}">
                            <div class="sr-left"><strong>${c.title}</strong></div>
                            <div class="sr-right">${c.subtitle || ''}</div>
                         </div>`;
            });
            html += `</div>`;
        }

        if (metrics.length) {
            html += `<div class="search-group"><div class="search-group-title">Metrics & Panels</div>`;
            metrics.forEach(m => {
                const idx = flatResults.length;
                flatResults.push({ type: 'metric', key: m.key, title: m.title });
                html += `<div class="search-result-item" data-idx="${idx}" data-type="metric" data-key="${m.key}">
                            <div class="sr-left">${m.title}</div>
                            <div class="sr-right">Panel</div>
                         </div>`;
            });
            html += `</div>`;
        }

        if (alerts.length) {
            html += `<div class="search-group"><div class="search-group-title">Alerts</div>`;
            alerts.forEach(a => {
                const idx = flatResults.length;
                flatResults.push({ type: 'alert', key: a.key, title: a.title });
                html += `<div class="search-result-item" data-idx="${idx}" data-type="alert" data-key="${a.key}">
                            <div class="sr-left">${a.title}</div>
                            <div class="sr-right">${a.subtitle || ''}</div>
                         </div>`;
            });
            html += `</div>`;
        }

        if (!html) html = `<div class="search-result-empty">No results</div>`;
        resultsContainer.innerHTML = html;

        // attach click handlers
        resultsContainer.querySelectorAll('.search-result-item').forEach(node => {
            node.addEventListener('click', () => {
                const idx = Number(node.dataset.idx);
                if (!Number.isNaN(idx)) {
                    activateResult(idx);
                }
            });
        });
    }

    // Activate a result by index (perform the jump / selection)
    function activateResult(idx) {
        const r = flatResults[idx];
        if (!r) return;
        if (r.type === 'coin') {
            // selects the crypto (reuses existing selectCrypto)
            selectCrypto(r.key);
            close();
        } else if (r.type === 'metric') {
            // scroll into view and highlight
            const el = document.getElementById(r.key);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                flashElement(el);
            } else {
                // try to scroll to parent panel by mapping ids -> panels if needed
                const panel = document.querySelector(`#${r.key}`) || document.querySelector('.panel');
                if (panel) {
                    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    flashElement(panel);
                }
            }
            close();
        } else if (r.type === 'alert') {
            // show alert center and highlight the alert (we'll just open the panel and flash)
            const alertsPanel = document.getElementById('alertsContainer');
            if (alertsPanel) {
                alertsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                flashElement(alertsPanel);
            }
            close();
        }
    }

    // keyboard nav in results (up/down/enter)
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (flatResults.length === 0) return;
            activeIndex = Math.min(activeIndex + 1, flatResults.length - 1);
            updateActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (flatResults.length === 0) return;
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActive();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) activateResult(activeIndex);
        }
    });

    function updateActive() {
        resultsContainer.querySelectorAll('.search-result-item').forEach(n => n.classList.remove('active'));
        if (activeIndex >= 0) {
            const node = resultsContainer.querySelector(`.search-result-item[data-idx="${activeIndex}"]`);
            if (node) {
                node.classList.add('active');
                // ensure visible
                node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    // Helper: brief highlight animation for target elements
    function flashElement(el) {
        if (!el) return;
        el.classList.add('search-flash');
        setTimeout(() => el.classList.remove('search-flash'), 1600);
    }

    // Wire search typing -> debounced search
    const debouncedSearch = debounce((q) => {
        performSearch(q);
    }, 140);

    searchInput.addEventListener('input', (e) => {
        const q = e.target.value;
        if (!q) {
            renderEmpty();
            flatResults = [];
            return;
        }
        debouncedSearch(q);
    });

    // initial placeholder
    renderEmpty();
}
// ----------------- END UNIVERSAL SEARCH -----------------



// Select cryptocurrency from search
function selectCrypto(symbol) {
    const btn = document.querySelector(`[data-symbol="${symbol}"]`);
    if (btn) {
        btn.click();
        const panel = document.getElementById('searchPanel');
        if (panel) panel.classList.remove('active');
    }
}

// Utility: Format price
function formatPrice(price) {
    const symbol = state.currentSymbol;

    // Coins that should always show 4 decimals
    const fourDecimalCoins = ["DOT", "SOL", "BNB", "XRP", "LTC"];

    if (fourDecimalCoins.includes(symbol)) {
        return `$${Number(price).toFixed(4)}`;
    }

    // Default formatting rules
    if (price >= 1000) {
        return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (price >= 1) {
        return `$${price.toFixed(2)}`;
    } else {
        return `$${price.toFixed(6)}`;
    }
}


// Utility: Format volume
function formatVolume(volume) {
    if (volume === null || volume === undefined || Number.isNaN(volume)) return '--';
    const v = Number(volume);
    if (v >= 1e9) {
        return `$${(v / 1e9).toFixed(2)}B`;
    } else if (v >= 1e6) {
        return `$${(v / 1e6).toFixed(2)}M`;
    } else if (v >= 1e3) {
        return `$${(v / 1e3).toFixed(2)}K`;
    }
    return `$${v.toFixed(2)}`;
}

// Utility: Format uptime
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Make selectCrypto global
window.selectCrypto = selectCrypto;

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}