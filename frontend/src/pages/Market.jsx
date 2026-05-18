import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, authStorage } from "../api/client";

const formatMoney = (value) => `${Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
const formatPercent = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}%`;
const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
};
const formatTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU");
};
const addDays = (value, days) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Number(days || 0));
  return date;
};
const compactQuoteHistory = (quotes) => {
  return quotes.reduce((items, quote) => {
    const previousQuote = items.at(-1);
    const sameSnapshot =
      previousQuote &&
      Number(previousQuote.price) === Number(quote.price) &&
      Number(previousQuote.change_percent) === Number(quote.change_percent);
    if (!sameSnapshot) {
      items.push(quote);
    }
    return items;
  }, []);
};
const getAccuracyPercent = (score) => {
  const value = Number(score || 0);
  return value <= 1 ? value * 100 : value;
};
const buildNewsHref = (item) => {
  if (item?.url && item.url.startsWith("http") && !item.url.includes("example.com")) {
    return item.url;
  }
  return `https://news.google.com/search?q=${encodeURIComponent(`${item?.ticker || ""} ${item?.title || ""}`)}`;
};

export default function Market() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [assets, setAssets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicker, setSelectedTicker] = useState(searchParams.get("ticker") || "");
  const [chartRangeDays, setChartRangeDays] = useState(Number(searchParams.get("days") || 30));
  const [forecastHorizonDays, setForecastHorizonDays] = useState(Number(searchParams.get("forecast") || 7));
  const [showForecastOnChart, setShowForecastOnChart] = useState(
    localStorage.getItem("showForecastOnMarketCharts") !== "false",
  );

  const [assetDetails, setAssetDetails] = useState(null);
  const [candles, setCandles] = useState([]);
  const [quoteHistory, setQuoteHistory] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [modelMeta, setModelMeta] = useState(null);
  const [assetNews, setAssetNews] = useState([]);

  const [tradeQuantity, setTradeQuantity] = useState("1");
  const [tradeSide, setTradeSide] = useState("BUY");
  const [activeSection, setActiveSection] = useState("overview");

  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isTrading, setIsTrading] = useState(false);

  const [error, setError] = useState("");
  const [tradeMessage, setTradeMessage] = useState("");

  const loadAssets = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoadingAssets(true);
    try {
      const payload = await api.assets.list();
      const list = Array.isArray(payload) ? payload : [];
      setAssets(list);
      setSelectedTicker((currentTicker) => currentTicker || list[0]?.ticker || "");
      return list;
    } finally {
      if (!silent) setIsLoadingAssets(false);
    }
  }, []);

  const loadTickerBundle = useCallback(async (ticker, { silent = false } = {}) => {
    if (!ticker) return;
    if (!silent) setIsLoadingDetails(true);

    const quoteLimit = chartRangeDays === 1 ? 720 : 240;
    const [detailsResult, candlesResult, quotesResult, predictionResult, modelResult, newsResult] = await Promise.allSettled([
      api.assets.details(ticker),
      api.assets.candles(ticker, chartRangeDays),
      api.assets.quotes(ticker, quoteLimit),
      api.ml.prediction(ticker, forecastHorizonDays),
      api.ml.model(ticker),
      api.assets.news(ticker, 6),
    ]);

    setAssetDetails(detailsResult.status === "fulfilled" ? detailsResult.value : null);
    setCandles(candlesResult.status === "fulfilled" && Array.isArray(candlesResult.value) ? candlesResult.value : []);
    setQuoteHistory(quotesResult.status === "fulfilled" && Array.isArray(quotesResult.value) ? quotesResult.value : []);
    setPrediction(predictionResult.status === "fulfilled" ? predictionResult.value : null);
    setModelMeta(modelResult.status === "fulfilled" ? modelResult.value : null);
    setAssetNews(newsResult.status === "fulfilled" && Array.isArray(newsResult.value) ? newsResult.value : []);
    if (!silent) setIsLoadingDetails(false);
  }, [chartRangeDays, forecastHorizonDays]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setError("");
      try {
        await loadAssets();
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, [loadAssets]);

  useEffect(() => {
    const tickerFromUrl = searchParams.get("ticker");
    const daysFromUrl = Number(searchParams.get("days") || chartRangeDays);
    const forecastFromUrl = Number(searchParams.get("forecast") || forecastHorizonDays);
    if (tickerFromUrl && tickerFromUrl !== selectedTicker) {
      setSelectedTicker(tickerFromUrl);
    }
    if ([1, 7, 30, 90, 180].includes(daysFromUrl) && daysFromUrl !== chartRangeDays) {
      setChartRangeDays(daysFromUrl);
    }
    if ([1, 7, 14, 30, 60, 90, 180].includes(forecastFromUrl) && forecastFromUrl !== forecastHorizonDays) {
      setForecastHorizonDays(forecastFromUrl);
    }
  }, [chartRangeDays, forecastHorizonDays, searchParams, selectedTicker]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTicker) return;

    const load = async () => {
      setError("");
      try {
        await loadTickerBundle(selectedTicker);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedTicker, loadTickerBundle]);

  useEffect(() => {
    const handleStorageChange = () => {
      setShowForecastOnChart(localStorage.getItem("showForecastOnMarketCharts") !== "false");
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("forecast-settings-changed", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("forecast-settings-changed", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!selectedTicker) return undefined;
    const timer = window.setInterval(() => {
      loadAssets({ silent: true }).catch(() => undefined);
      loadTickerBundle(selectedTicker, { silent: true }).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadAssets, loadTickerBundle, selectedTicker]);

  const filteredAssets = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return assets.filter(
      (asset) =>
        asset.ticker.toLowerCase().includes(lower) ||
        (asset.name || "").toLowerCase().includes(lower) ||
        (asset.sector || "").toLowerCase().includes(lower),
    );
  }, [assets, searchTerm]);

  const selectedAssetFromList = useMemo(
    () => assets.find((asset) => asset.ticker === selectedTicker),
    [assets, selectedTicker],
  );

  const forecastDate = useMemo(() => {
    const basis = prediction?.generated_at || assetDetails?.latest_quote?.recorded_at || Date.now();
    return addDays(basis, prediction?.horizon_days || 1);
  }, [assetDetails, prediction]);

  const chartData = useMemo(() => {
    let rows = [];

    if (chartRangeDays === 1) {
      rows = compactQuoteHistory(quoteHistory).map((quote) => ({
        date: formatTime(quote.recorded_at),
        actual: Number(quote.price),
        forecast: null,
        volume: Number(quote.volume || 0),
      }));
    } else {
      rows = candles.map((candle) => ({
        date: formatDate(candle.timestamp),
        actual: Number(candle.close),
        forecast: null,
        volume: Number(candle.volume || 0),
      }));
      const latestQuotePrice = Number(assetDetails?.latest_quote?.price || selectedAssetFromList?.current_price || 0);
      const lastActual = Number(rows.at(-1)?.actual || 0);
      if (latestQuotePrice > 0 && Math.abs(latestQuotePrice - lastActual) > 0.001) {
        rows.push({
          date: "Сейчас",
          actual: latestQuotePrice,
          forecast: null,
          volume: Number(assetDetails?.latest_quote?.volume || 0),
        });
      }
    }

    if (prediction && showForecastOnChart) {
      const currentPoint = rows.at(-1) || {
        date: "Сейчас",
        actual: Number(prediction.current_price || 0),
        forecast: null,
        volume: 0,
      };
      if (rows.length) {
        rows[rows.length - 1] = {
          ...currentPoint,
          forecast: Number(prediction.current_price || currentPoint.actual || 0),
        };
      } else {
        rows.push({
          ...currentPoint,
          forecast: Number(prediction.current_price || currentPoint.actual || 0),
        });
      }
      rows.push({
        date: `Прогноз +${prediction.horizon_days || forecastHorizonDays}д`,
        actual: null,
        forecast: Number(prediction.predicted_price || 0),
        volume: 0,
      });
    }

    return rows;
  }, [assetDetails, candles, chartRangeDays, forecastHorizonDays, prediction, quoteHistory, selectedAssetFromList, showForecastOnChart]);

  const datasetPreview = useMemo(
    () =>
      candles.slice(-6).map((candle) => ({
        date: formatDate(candle.timestamp),
        close: Number(candle.close),
        volume: Number(candle.volume || 0),
        prevClose: Number(candle.open || candle.close),
      })),
    [candles],
  );

  const metrics = modelMeta?.metrics && typeof modelMeta.metrics === "object" ? Object.entries(modelMeta.metrics) : [];
  const accuracy = getAccuracyPercent(prediction?.confidence_score);

  const handleSelectTicker = (ticker) => {
    setSelectedTicker(ticker);
    setSearchParams({ ticker, days: String(chartRangeDays), forecast: String(forecastHorizonDays) });
    setActiveSection("overview");
    setTradeMessage("");
  };

  const handleRangeChange = (days) => {
    const nextForecastHorizon = Math.min(180, Math.max(1, days));
    setChartRangeDays(days);
    setForecastHorizonDays(nextForecastHorizon);
    if (selectedTicker) {
      setSearchParams({ ticker: selectedTicker, days: String(days), forecast: String(nextForecastHorizon) });
    }
  };

  const handleForecastHorizonChange = (days) => {
    setForecastHorizonDays(days);
    if (selectedTicker) {
      setSearchParams({ ticker: selectedTicker, days: String(chartRangeDays), forecast: String(days) });
    }
  };

  const handleTrade = async () => {
    const token = authStorage.getToken();
    if (!token) {
      navigate("/login", { state: { from: "/market" } });
      return;
    }

    if (!selectedTicker) {
      setTradeMessage("Выберите тикер для сделки.");
      return;
    }

    const quantity = Number(tradeQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setTradeMessage("Количество должно быть больше нуля.");
      return;
    }

    setIsTrading(true);
    setTradeMessage("");

    try {
      const payload = { ticker: selectedTicker, quantity };
      const response = tradeSide === "BUY" ? await api.trades.buy(payload) : await api.trades.sell(payload);
      setTradeMessage(response.message || "Сделка выполнена.");

      await Promise.all([loadAssets(), loadTickerBundle(selectedTicker)]);
    } catch (err) {
      setTradeMessage(err.message);
    } finally {
      setIsTrading(false);
    }
  };

  return (
    <div className="page-content market-page">
      <div className="page-header hero-header animated-surface">
        <div>
          <p className="eyebrow">Live market cockpit</p>
          <h1>Рынок активов</h1>
          <p className="text-muted">
            Акции теперь открываются подробно: цена, изменение, график, прогноз, точность модели,
            обучающий датасет и реальные кликабельные новости. Данные обновляются автоматически каждые 8 секунд.
          </p>
        </div>
        <button type="button" className="btn-secondary glow-button" onClick={loadAssets} disabled={isLoadingAssets}>
          {isLoadingAssets ? "Обновляем..." : "Обновить рынок"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="market-shell">
        <aside className="card asset-browser">
          <div className="filters">
            <label className="form-field" htmlFor="asset-search">
              <span>Поиск акции</span>
              <input
                id="asset-search"
                type="text"
                placeholder="SBER, Газпром, sector..."
                className="search-input"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
          </div>

          {isLoadingAssets ? (
            <div className="skeleton-stack">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <div className="asset-card-list">
              {filteredAssets.map((asset) => (
                <button
                  type="button"
                  key={asset.ticker}
                  className={asset.ticker === selectedTicker ? "asset-tile active" : "asset-tile"}
                  onClick={() => handleSelectTicker(asset.ticker)}
                >
                  <span className="asset-tile-top">
                    <strong>{asset.ticker}</strong>
                    <span className={asset.change_percent >= 0 ? "market-pill up" : "market-pill down"}>
                      {formatPercent(asset.change_percent)}
                    </span>
                  </span>
                  <span>{asset.name}</span>
                  <span className="asset-tile-bottom">
                    <b>{formatMoney(asset.current_price)}</b>
                    <small>прогноз {asset.latest_prediction ? formatMoney(asset.latest_prediction) : "—"}</small>
                  </span>
                  <span className="open-asset-hint">Открыть подробную карточку →</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="asset-detail-zone">
          {isLoadingDetails ? (
            <div className="card detail-loading animated-surface">
              <div className="skeleton-stack wide">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : !assetDetails ? (
            <div className="card">
              <p className="text-muted">Выберите актив слева, чтобы открыть подробную карточку.</p>
            </div>
          ) : (
            <>
              <div className="card asset-hero-card animated-surface">
                <div>
                  <p className="eyebrow">{assetDetails.exchange} · {assetDetails.board}</p>
                  <h2>{assetDetails.ticker} — {assetDetails.name}</h2>
                  <p className="text-muted">{assetDetails.description || `${assetDetails.sector} · ${assetDetails.currency}`}</p>
                </div>
                <div className="asset-price-cluster">
                  <strong>{formatMoney(assetDetails.latest_quote?.price)}</strong>
                  <span className={assetDetails.latest_quote?.change_percent >= 0 ? "market-pill up" : "market-pill down"}>
                    {formatPercent(assetDetails.latest_quote?.change_percent)}
                  </span>
                  <small>
                    обновлено {formatDateTime(assetDetails.latest_quote?.recorded_at)}
                    {assetDetails.latest_quote?.source ? ` · ${assetDetails.latest_quote.source}` : ""}
                  </small>
                </div>
              </div>

              <div className="detail-tabs">
                {[
                  ["overview", "Обзор"],
                  ["forecast", "Прогноз"],
                  ["dataset", "ML-датасет"],
                  ["news", "Новости"],
                ].map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    className={activeSection === key ? "tab-button active" : "tab-button"}
                    onClick={() => setActiveSection(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeSection === "overview" && (
                <div className="dashboard-grid">
                  <div className="card">
                    <div className="section-heading-row">
                      <div>
                        <h3>Динамика цены</h3>
                        <p className="text-muted">
                          Синяя линия — {chartRangeDays === 1 ? "live-котировки за день" : "цена закрытия и актуальная цена"}
                          {showForecastOnChart
                            ? `, бирюзовая пунктирная линия — прогноз на ${prediction?.horizon_days || 7} дн.`
                            : ". Прогноз на графике выключен в настройках."}
                        </p>
                      </div>
                      <div className="range-switcher" aria-label="Период графика">
                        {[1, 7, 30, 90, 180].map((days) => (
                          <button
                            type="button"
                            key={days}
                            className={chartRangeDays === days ? "range-button active" : "range-button"}
                            onClick={() => handleRangeChange(days)}
                          >
                            {days === 1 ? "1д live" : `${days}д`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="forecast-control-row">
                      <span className="text-muted">Горизонт прогноза:</span>
                      <div className="range-switcher" aria-label="Горизонт прогноза">
                        {[1, 7, 14, 30, 60, 90, 180].map((days) => (
                          <button
                            type="button"
                            key={days}
                            className={forecastHorizonDays === days ? "range-button active" : "range-button"}
                            onClick={() => handleForecastHorizonChange(days)}
                          >
                            +{days}д
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="chart-panel">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                          <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                          <Tooltip formatter={(value) => [formatMoney(value), "Цена"]} />
                          <Area
                            type="monotone"
                            dataKey="actual"
                            name="Факт"
                            stroke="#38bdf8"
                            fill="rgba(56, 189, 248, 0.14)"
                            strokeWidth={3}
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="forecast"
                            name="Прогноз"
                            stroke="#22c55e"
                            strokeWidth={3}
                            strokeDasharray="8 6"
                            dot={{ r: 5 }}
                            connectNulls
                            hide={!showForecastOnChart}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="card stat-stack">
                    <div className="mini-stat">
                      <span>Горизонт прогноза</span>
                      <strong>{prediction?.horizon_days || 1} дн.</strong>
                      <small>до {forecastDate ? formatDateTime(forecastDate) : "—"}</small>
                    </div>
                    <div className="mini-stat">
                      <span>Точность / confidence</span>
                      <strong>{accuracy.toFixed(1)}%</strong>
                      <div className="confidence-bar">
                        <span style={{ width: `${Math.min(100, Math.max(0, accuracy))}%` }} />
                      </div>
                    </div>
                    <div className="mini-stat">
                      <span>Лот и сектор</span>
                      <strong>{selectedAssetFromList?.lot_size || assetDetails.lot_size} шт.</strong>
                      <small>{assetDetails.sector}</small>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "forecast" && (
                <div className="dashboard-grid">
                  <div className="card prediction-box premium-card">
                    <h3>ML-прогноз</h3>
                    {prediction ? (
                      <>
                        <p className="text-muted">{prediction.summary}</p>
                        <div className="forecast-kpi-grid">
                          <div>
                            <span>Сейчас</span>
                            <strong>{formatMoney(prediction.current_price)}</strong>
                          </div>
                          <div>
                            <span>Прогноз</span>
                            <strong>{formatMoney(prediction.predicted_price)}</strong>
                          </div>
                          <div>
                            <span>Изменение</span>
                            <strong className={prediction.impact_percent >= 0 ? "text-green" : "text-red"}>
                              {formatPercent(prediction.impact_percent)}
                            </strong>
                          </div>
                        </div>
                        <p className="text-muted">
                          Прогноз рассчитан {formatDateTime(prediction.generated_at)} на горизонт{" "}
                          <strong>{prediction.horizon_days} дн.</strong>; целевая дата —{" "}
                          <strong>{forecastDate ? formatDateTime(forecastDate) : "—"}</strong>.
                        </p>
                      </>
                    ) : (
                      <p className="text-muted">Прогноз пока недоступен.</p>
                    )}
                  </div>

                  <div className="card">
                    <h3>Драйверы модели</h3>
                    {prediction?.drivers?.length ? (
                      <div className="driver-bars">
                        {prediction.drivers.map((driver) => {
                          const power = Math.min(100, Math.abs(Number(driver.contribution || 0)) * 12);
                          return (
                            <div className="driver-bar-row" key={driver.code}>
                              <div>
                                <strong>{driver.code}</strong>
                                <span>{driver.name}</span>
                              </div>
                              <div className="driver-track">
                                <span
                                  className={driver.contribution >= 0 ? "up" : "down"}
                                  style={{ width: `${Math.max(8, power)}%` }}
                                />
                              </div>
                              <b className={driver.contribution >= 0 ? "text-green" : "text-red"}>
                                {driver.contribution >= 0 ? "+" : ""}
                                {Number(driver.contribution).toFixed(4)}
                              </b>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted">Драйверы пока отсутствуют.</p>
                    )}
                  </div>
                </div>
              )}

              {activeSection === "dataset" && (
                <div className="dashboard-grid">
                  <div className="card">
                    <h3>Датасет обучения</h3>
                    <p className="text-muted">
                      Модель обучается на свечах OHLCV и макрофакторах:{" "}
                      {(modelMeta?.feature_names || ["PREV_CLOSE", "BRENT", "USD_RUB", "IMOEX", "KEY_RATE", "RGBI"]).join(", ")}.
                    </p>
                    <table className="market-table mt-4">
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Close</th>
                          <th>Prev/Open</th>
                          <th>Volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datasetPreview.map((row) => (
                          <tr key={row.date}>
                            <td>{row.date}</td>
                            <td>{formatMoney(row.close)}</td>
                            <td>{formatMoney(row.prevClose)}</td>
                            <td>{row.volume.toLocaleString("ru-RU")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="card stat-stack">
                    <div className="mini-stat">
                      <span>Модель</span>
                      <strong>{modelMeta?.model_name || "—"}</strong>
                      <small>статус: {modelMeta?.status || "—"}</small>
                    </div>
                    <div className="mini-stat">
                      <span>Окно обучения</span>
                      <strong>{modelMeta?.training_window_start || "seed/mock"}</strong>
                      <small>до {modelMeta?.training_window_end || "текущих данных"}</small>
                    </div>
                    <div className="mini-stat">
                      <span>Метрики</span>
                      <strong>{metrics.length ? `${metrics.length} показ.` : "—"}</strong>
                      <div className="metric-chip-list">
                        {metrics.slice(0, 5).map(([key, value]) => (
                          <span key={key}>{key}: {String(value)}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "news" && (
                <div className="card">
                  <h3>Новости по {assetDetails.ticker}</h3>
                  <p className="text-muted">Карточки кликабельные: открывают оригинал новости или поиск Google News.</p>
                  <div className="news-grid mt-4">
                    {assetNews.length ? (
                      assetNews.map((item) => (
                        <a
                          key={`${item.title}-${item.published_at}`}
                          className="news-preview-card"
                          href={buildNewsHref({ ...item, ticker: assetDetails.ticker })}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>{item.source || "Источник"}</span>
                          <h4>{item.title}</h4>
                          <p>{item.summary}</p>
                          <small>{formatDateTime(item.published_at)} · открыть ↗</small>
                        </a>
                      ))
                    ) : (
                      <p className="text-muted">Новостей по активу пока нет.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="card trade-box">
                <h3>Быстрая сделка</h3>
                <div className="trade-controls">
                  <select value={tradeSide} onChange={(event) => setTradeSide(event.target.value)}>
                    <option value="BUY">Покупка</option>
                    <option value="SELL">Продажа</option>
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={tradeQuantity}
                    onChange={(event) => setTradeQuantity(event.target.value.replace(/\D/g, ""))}
                  />
                  <button type="button" className="btn-primary glow-button" onClick={handleTrade} disabled={isTrading}>
                    {isTrading ? "Отправка..." : tradeSide === "BUY" ? "Купить" : "Продать"}
                  </button>
                </div>
                {tradeMessage && <p className="text-muted mt-4">{tradeMessage}</p>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
