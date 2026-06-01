import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, authStorage } from "../api/client";

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

const toDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const formatDateLabel = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
};

const buildFlatCandles = (cashValue) => {
  const today = new Date();
  const candles = [];
  for (let i = 14; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateKey = date.toISOString().slice(0, 10);
    candles.push({
      date: dateKey,
      open: cashValue,
      high: cashValue,
      low: cashValue,
      close: cashValue,
    });
  }
  return candles;
};

const buildPortfolioCandles = (summary, trades, candlesByTicker, rangeDays = 30) => {
  if (!summary) return [];

  const cashNow = Number(summary.cash_balance || 0);
  const currentPositions = Array.isArray(summary.positions) ? summary.positions : [];
  const tradeList = Array.isArray(trades) ? trades : [];

  const tickers = Array.from(
    new Set([
      ...currentPositions.map((position) => position.ticker),
      ...tradeList.map((trade) => trade.ticker),
    ]),
  );

  if (tickers.length === 0) {
    return buildFlatCandles(cashNow);
  }

  const allDateKeys = new Set();
  tickers.forEach((ticker) => {
    const rows = Array.isArray(candlesByTicker[ticker]) ? candlesByTicker[ticker] : [];
    rows.forEach((row) => {
      const dateKey = toDateKey(row.timestamp);
      if (dateKey) allDateKeys.add(dateKey);
    });
  });

  const sortedDates = Array.from(allDateKeys).sort();
  const targetDates = sortedDates.slice(-rangeDays);

  if (targetDates.length === 0) {
    return buildFlatCandles(cashNow);
  }

  const priceByTickerAndDate = {};

  tickers.forEach((ticker) => {
    const rawRows = Array.isArray(candlesByTicker[ticker]) ? candlesByTicker[ticker] : [];
    const rawMap = {};

    rawRows.forEach((row) => {
      const key = toDateKey(row.timestamp);
      if (!key) return;
      rawMap[key] = {
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      };
    });

    let prevClose = null;
    const filled = {};

    targetDates.forEach((dateKey) => {
      if (rawMap[dateKey]) {
        filled[dateKey] = rawMap[dateKey];
        prevClose = rawMap[dateKey].close;
      } else if (prevClose !== null) {
        filled[dateKey] = {
          open: prevClose,
          high: prevClose,
          low: prevClose,
          close: prevClose,
        };
      } else {
        filled[dateKey] = null;
      }
    });

    priceByTickerAndDate[ticker] = filled;
  });

  const tradeBuckets = {};
  tradeList.forEach((trade) => {
    const key = toDateKey(trade.created_at);
    if (!key) return;
    if (!tradeBuckets[key]) tradeBuckets[key] = [];
    tradeBuckets[key].push(trade);
  });

  const quantities = {};
  currentPositions.forEach((position) => {
    quantities[position.ticker] = Number(position.quantity || 0);
  });

  let cash = cashNow;
  const reversedCandles = [];

  const calcPoint = (field, dateKey) => {
    let total = cash;

    tickers.forEach((ticker) => {
      const qty = Number(quantities[ticker] || 0);
      if (!qty) return;

      const row = priceByTickerAndDate[ticker]?.[dateKey];
      if (!row || row[field] == null) return;

      total += qty * Number(row[field]);
    });

    return total;
  };

  for (let i = targetDates.length - 1; i >= 0; i -= 1) {
    const dateKey = targetDates[i];

    const open = calcPoint("open", dateKey);
    const high = calcPoint("high", dateKey);
    const low = calcPoint("low", dateKey);
    const close = calcPoint("close", dateKey);

    reversedCandles.push({
      date: dateKey,
      open,
      high,
      low,
      close,
    });

    const dayTrades = tradeBuckets[dateKey] || [];

    dayTrades.forEach((trade) => {
      const ticker = trade.ticker;
      const quantity = Number(trade.quantity || 0);
      const totalAmount = Number(trade.total_amount || 0);

      if (trade.side === "BUY") {
        quantities[ticker] = Number(quantities[ticker] || 0) - quantity;
        cash += totalAmount;
      } else if (trade.side === "SELL") {
        quantities[ticker] = Number(quantities[ticker] || 0) + quantity;
        cash -= totalAmount;
      }
    });
  }

  return reversedCandles.reverse();
};

function PortfolioCandleChart({ data }) {
  const width = 920;
  const height = 330;
  const margin = { top: 18, right: 16, bottom: 54, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  if (!data.length) return null;

  const values = data.map((item) => item.close);
  const minPrice = Math.min(...values);
  const maxPrice = Math.max(...values);
  const spread = Math.max(maxPrice - minPrice, 1);
  const paddedMin = minPrice - spread * 0.06;
  const paddedMax = maxPrice + spread * 0.06;

  const y = (price) => margin.top + ((paddedMax - price) / (paddedMax - paddedMin)) * innerHeight;
  const x = (index) => margin.left + (data.length === 1 ? innerWidth / 2 : (innerWidth * index) / (data.length - 1));
  const xLabelStep = Math.max(1, Math.ceil(data.length / 7));
  const points = data.map((item, index) => `${x(index)},${y(item.close)}`).join(" ");
  const areaPoints = `${margin.left},${height - margin.bottom} ${points} ${width - margin.right},${height - margin.bottom}`;

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = paddedMax - ((paddedMax - paddedMin) * index) / 4;
    return {
      value,
      y: y(value),
    };
  });

  return (
    <div className="portfolio-candle-wrapper">
      <svg viewBox={`0 0 ${width} ${height}`} className="portfolio-candle-svg" role="img" aria-label="Линейный график стоимости портфеля">
        <defs>
          <linearGradient id="portfolioLineGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="portfolioAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <g key={line.value}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={line.y}
              y2={line.y}
              className="candle-grid-line"
            />
            <text x={margin.left - 8} y={line.y + 4} textAnchor="end" className="candle-grid-label">
              {Math.round(line.value).toLocaleString("ru-RU")}
            </text>
          </g>
        ))}

        <polygon points={areaPoints} fill="url(#portfolioAreaGradient)" />
        <polyline points={points} fill="none" stroke="url(#portfolioLineGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

        {data.map((item, index) => {
          return (
            <g key={`${item.date}-${index}`}>
              <circle cx={x(index)} cy={y(item.close)} r={index === data.length - 1 ? 5 : 3} className="portfolio-line-point" />
              {index % xLabelStep === 0 || index === data.length - 1 ? (
                <text x={x(index)} y={height - 16} textAnchor="middle" className="candle-x-label">
                  {formatDateLabel(item.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <p className="candle-legend">
        Линия показывает итоговую стоимость портфеля: чем выше точка, тем больше стоимость средств.
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [assets, setAssets] = useState([]);
  const [portfolioTrades, setPortfolioTrades] = useState([]);
  const [tickerCandles, setTickerCandles] = useState({});
  const [dashboardRangeDays, setDashboardRangeDays] = useState(30);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const token = authStorage.getToken();

  useEffect(() => {
    let cancelled = false;

    const load = async ({ silent = false } = {}) => {
      if (!silent) setIsLoading(true);
      setError("");

      try {
        const assetsPayload = await api.assets.list();

        if (!cancelled) {
          setAssets(Array.isArray(assetsPayload) ? assetsPayload : []);
        }

        if (token) {
          const [summaryPayload, tradesPayload] = await Promise.all([
            api.portfolio.summary(),
            api.trades.history(),
          ]);

          const tradeArray = Array.isArray(tradesPayload) ? tradesPayload : [];
          const tickers = Array.from(
            new Set([
              ...(summaryPayload?.positions || []).map((position) => position.ticker),
              ...tradeArray.map((trade) => trade.ticker),
            ]),
          );

          const candleEntries = await Promise.all(
            tickers.map(async (ticker) => {
              try {
                const candles = await api.assets.candles(ticker, 180);
                return [ticker, Array.isArray(candles) ? candles : []];
              } catch {
                return [ticker, []];
              }
            }),
          );

          if (!cancelled) {
            setSummary(summaryPayload);
            setPortfolioTrades(tradeArray);
            setTickerCandles(Object.fromEntries(candleEntries));
          }
        } else if (!cancelled) {
          setSummary(null);
          setPortfolioTrades([]);
          setTickerCandles({});
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled && !silent) setIsLoading(false);
      }
    };

    load();
    const timer = window.setInterval(() => {
      load({ silent: true }).catch(() => undefined);
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  const topMovers = useMemo(() => {
    return [...assets]
      .sort((a, b) => Math.abs(b.change_percent || 0) - Math.abs(a.change_percent || 0))
      .slice(0, 5);
  }, [assets]);

  const portfolioCandles = useMemo(() => {
    return buildPortfolioCandles(summary, portfolioTrades, tickerCandles, dashboardRangeDays);
  }, [summary, portfolioTrades, tickerCandles, dashboardRangeDays]);

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Обзор платформы</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      {isLoading ? (
        <p className="text-muted">Загружаем данные...</p>
      ) : (
        <>
          <div className="stats-grid">
            <div className="card stat-card">
              <p className="text-muted">Доступные активы</p>
              <h2>{assets.length}</h2>
              <Link to="/market" className="inline-link">Открыть рынок</Link>
            </div>

            <div className="card stat-card">
              <p className="text-muted">Общая стоимость портфеля</p>
              <h2>{summary ? formatMoney(summary.total_value) : "Авторизуйтесь"}</h2>
              {summary ? (
                <p className={summary.total_pnl >= 0 ? "text-green" : "text-red"}>
                  Результат: {formatMoney(summary.total_pnl)} ({Number(summary.total_pnl_percent).toFixed(2)}%)
                </p>
              ) : (
                <Link to="/login" className="inline-link">Войти в аккаунт</Link>
              )}
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <div className="section-heading-row">
                <div>
                  <h3>Как ведут себя наши средства</h3>
                  <p className="text-muted">Понятная линия стоимости портфеля за выбранный период.</p>
                </div>
                <div className="range-switcher" aria-label="Период графика портфеля">
                  {[7, 30, 90, 180].map((days) => (
                    <button
                      type="button"
                      key={days}
                      className={dashboardRangeDays === days ? "range-button active" : "range-button"}
                      onClick={() => setDashboardRangeDays(days)}
                    >
                      {days}д
                    </button>
                  ))}
                </div>
              </div>
              {!summary ? (
                <p className="text-muted mt-4">Войдите в аккаунт, чтобы увидеть динамику средств.</p>
              ) : portfolioCandles.length === 0 ? (
                <p className="text-muted mt-4">Недостаточно данных для графика.</p>
              ) : (
                <PortfolioCandleChart data={portfolioCandles} />
              )}
            </div>

            <div className="card">
              <h3>Лидеры движения</h3>
              {topMovers.length === 0 ? (
                <p className="text-muted">Нет данных по рынку.</p>
              ) : (
                <ul className="widget-list">
                  {topMovers.map((asset) => (
                    <li key={asset.ticker}>
                      <span>
                        <Link to={`/market?ticker=${encodeURIComponent(asset.ticker)}`} className="inline-link">
                          <strong>{asset.ticker}</strong> {asset.name}
                        </Link>
                      </span>
                      <span className={asset.change_percent >= 0 ? "text-green" : "text-red"}>
                        {asset.change_percent >= 0 ? "+" : ""}
                        {Number(asset.change_percent).toFixed(2)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {summary && (
                <div className="mt-4">
                  <p className="text-muted">Свободный кэш</p>
                  <h3>{formatMoney(summary.cash_balance)}</h3>
                  <p className="text-muted">Позиций: {summary.positions_count}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
