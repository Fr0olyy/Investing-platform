import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";

const DEFAULT_FACTORS = {
  BRENT: "88.5",
  USD_RUB: "97.2",
  IMOEX: "3300",
  KEY_RATE: "15",
  RGBI: "109.3",
};

const DEFAULT_FEATURES = ["PREV_CLOSE", "BRENT", "USD_RUB", "IMOEX", "KEY_RATE", "RGBI"];
const formatNumber = (value, digits = 2) => Number(value || 0).toFixed(digits);
const formatMoney = (value) => `${Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
const parseFactorValue = (value) => Number(String(value).replace(",", "."));
const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
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
const getAccuracyPercent = (score) => {
  const value = Number(score || 0);
  return value <= 1 ? value * 100 : value;
};

export default function AssetSimulator() {
  const [assets, setAssets] = useState([]);
  const [ticker, setTicker] = useState("");

  const [prediction, setPrediction] = useState(null);
  const [modelMeta, setModelMeta] = useState(null);
  const [scenarioResult, setScenarioResult] = useState(null);
  const [candles, setCandles] = useState([]);
  const [forecastHorizonDays, setForecastHorizonDays] = useState(7);

  const [factors, setFactors] = useState(DEFAULT_FACTORS);

  const [isLoading, setIsLoading] = useState(true);
  const [isScenarioLoading, setIsScenarioLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const selectedAsset = useMemo(() => assets.find((asset) => asset.ticker === ticker), [assets, ticker]);
  const features = modelMeta?.feature_names?.length ? modelMeta.feature_names : DEFAULT_FEATURES;
  const accuracy = getAccuracyPercent(prediction?.confidence_score);
  const forecastDate = addDays(prediction?.generated_at, prediction?.horizon_days || 1);
  const metrics = modelMeta?.metrics && typeof modelMeta.metrics === "object" ? Object.entries(modelMeta.metrics) : [];

  const forecastChartData = useMemo(() => {
    const history = candles.slice(-35).map((candle) => ({
      stage: formatDate(candle.timestamp),
      history: Number(candle.close),
      forecast: null,
      scenario: null,
    }));

    if (!prediction) return history;

    const current = Number(prediction.current_price || history.at(-1)?.history || 0);
    if (history.length) {
      history[history.length - 1] = {
        ...history.at(-1),
        forecast: current,
        scenario: scenarioResult ? current : null,
      };
    } else {
      history.push({
        stage: "Сейчас",
        history: current,
        forecast: current,
        scenario: scenarioResult ? current : null,
      });
    }
    history.push({
      stage: `+${prediction.horizon_days || 1}д`,
      history: null,
      forecast: Number(prediction.predicted_price || 0),
      scenario: scenarioResult ? Number(scenarioResult.predicted_price || 0) : null,
    });

    return history;
  }, [candles, prediction, scenarioResult]);

  const datasetRows = useMemo(
    () =>
      candles.slice(-10).map((candle, index, rows) => {
        const prevRow = rows[index - 1];
        const prevClose = Number(prevRow?.close || candle.open || candle.close);
        return {
          date: formatDate(candle.timestamp),
          prevClose,
          close: Number(candle.close || 0),
          volume: Number(candle.volume || 0),
          target: Number(candle.close || 0) - prevClose,
        };
      }),
    [candles],
  );

  const driverChartData = useMemo(() => {
    const drivers = prediction?.drivers?.length ? prediction.drivers : [];
    return drivers.map((driver) => ({
      code: driver.code,
      contribution: Number(driver.contribution || 0),
      absContribution: Math.abs(Number(driver.contribution || 0)),
      direction: driver.direction,
    }));
  }, [prediction]);

  const loadForTicker = useCallback(async (targetTicker) => {
    if (!targetTicker) return;

    const [predictionResult, modelResult, candlesResult] = await Promise.allSettled([
      api.ml.prediction(targetTicker, forecastHorizonDays),
      api.ml.model(targetTicker),
      api.assets.candles(targetTicker, 180),
    ]);

    setPrediction(predictionResult.status === "fulfilled" ? predictionResult.value : null);
    setModelMeta(modelResult.status === "fulfilled" ? modelResult.value : null);
    setCandles(candlesResult.status === "fulfilled" && Array.isArray(candlesResult.value) ? candlesResult.value : []);
    setScenarioResult(null);
  }, [forecastHorizonDays]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const assetsPayload = await api.assets.list();
      const list = Array.isArray(assetsPayload) ? assetsPayload : [];
      setAssets(list);

      const nextTicker = ticker || list[0]?.ticker || "";
      setTicker(nextTicker);

      if (nextTicker) {
        await loadForTicker(nextTicker);
      }
    } catch (err) {
      setError(err.message);
      setAssets([]);
      setPrediction(null);
      setModelMeta(null);
      setCandles([]);
    } finally {
      setIsLoading(false);
    }
  }, [loadForTicker, ticker]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!ticker) return;

    const timer = setTimeout(() => {
      loadForTicker(ticker).catch((err) => setError(err.message));
    }, 50);

    return () => clearTimeout(timer);
  }, [loadForTicker, ticker]);

  const handleFactorChange = (code, value) => {
    setFactors((prev) => ({ ...prev, [code]: value }));
  };

  const runScenario = async () => {
    if (!ticker) return;

    setIsScenarioLoading(true);
    setError("");

    try {
      const parsedFactors = Object.fromEntries(
        Object.entries(factors).map(([code, value]) => [code, parseFactorValue(value)]),
      );

      const invalidFactor = Object.entries(parsedFactors).find(([, value]) => !Number.isFinite(value));
      if (invalidFactor) {
        setError(`Заполните корректное значение для ${invalidFactor[0]}.`);
        return;
      }

      const payload = await api.ml.scenario({ ticker, factors: parsedFactors });
      setScenarioResult(payload);
    } catch (err) {
      setError(err.message);
      setScenarioResult(null);
    } finally {
      setIsScenarioLoading(false);
    }
  };

  const refreshPredictions = async () => {
    setIsRefreshing(true);
    setError("");

    try {
      await api.system.refreshPredictions();
      await loadForTicker(ticker);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="page-content ml-page">
      <div className="page-header hero-header animated-surface">
        <div>
          <p className="eyebrow">Explainable AI forecast</p>
          <h1>ML-анализ актива</h1>
          <p className="text-muted">
            Здесь видно, на какой срок сделан прогноз, какая confidence-точность у модели,
            какие признаки использовались и на каких свечах строится датасет.
          </p>
        </div>
        <button type="button" className="btn-secondary glow-button" onClick={refreshPredictions} disabled={isRefreshing}>
          {isRefreshing ? "Обновляем..." : "Пересчитать прогнозы"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {isLoading ? (
        <div className="card">
          <p className="text-muted">Загрузка данных ML...</p>
        </div>
      ) : (
        <>
          <div className="card ml-toolbar-card">
            <div className="ml-toolbar">
              <div className="form-field ml-toolbar-main">
                <label htmlFor="ml-ticker">Выберите актив для прогноза</label>
                <select id="ml-ticker" value={ticker} onChange={(event) => setTicker(event.target.value)}>
                  {assets.map((asset) => (
                    <option key={asset.ticker} value={asset.ticker}>
                      {asset.ticker} — {asset.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ml-model-badge">
                <span>{modelMeta?.model_name || "Модель не выбрана"}</span>
                <strong>{modelMeta?.status || "—"}</strong>
              </div>
            </div>
            <div className="forecast-control-row">
              <span className="text-muted">Горизонт прогноза:</span>
              <div className="range-switcher" aria-label="Горизонт ML-прогноза">
                {[1, 7, 14, 30, 60, 90, 180].map((days) => (
                  <button
                    type="button"
                    key={days}
                    className={forecastHorizonDays === days ? "range-button active" : "range-button"}
                    onClick={() => setForecastHorizonDays(days)}
                  >
                    +{days}д
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="card stat-card premium-card">
              <p className="text-muted">Текущая цена</p>
              <h2>{prediction ? formatMoney(prediction.current_price) : "Нет данных"}</h2>
              {selectedAsset ? <p className="text-muted">{selectedAsset.name}</p> : null}
            </div>

            <div className="card stat-card premium-card">
              <p className="text-muted">Прогнозная цена</p>
              <h2>{prediction ? formatMoney(prediction.predicted_price) : "Нет данных"}</h2>
              <p className={prediction?.impact_percent >= 0 ? "text-green" : "text-red"}>
                {prediction ? `${prediction.impact_percent >= 0 ? "+" : ""}${formatNumber(prediction.impact_percent)}%` : "-"}
              </p>
            </div>

            <div className="card stat-card premium-card">
              <p className="text-muted">Горизонт и точность</p>
              <h2>{prediction ? `${prediction.horizon_days} дн.` : "—"}</h2>
              <p className="text-muted">до {forecastDate ? formatDateTime(forecastDate) : "—"}</p>
              <div className="confidence-bar">
                <span style={{ width: `${Math.min(100, Math.max(0, accuracy))}%` }} />
              </div>
              <p className="text-muted">confidence: {accuracy.toFixed(1)}%</p>
            </div>
          </div>

          <div className="card">
            <div className="section-heading-row">
              <div>
                <h3>График прогноза цены</h3>
                <p className="text-muted">
                  Факт строится по свечам, базовый прогноз и сценарий вынесены в будущую точку на горизонт модели.
                </p>
              </div>
              <span className="market-pill up">generated {formatDateTime(prediction?.generated_at)}</span>
            </div>
            <div className="chart-panel large">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastChartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="stage" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                  <Tooltip formatter={(value) => [formatMoney(value), "Цена"]} />
                  <Line
                    type="monotone"
                    dataKey="history"
                    name="История"
                    stroke="#38bdf8"
                    strokeWidth={3}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Базовый прогноз"
                    stroke="#22c55e"
                    strokeDasharray="8 6"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="scenario"
                    name="Сценарий"
                    stroke="#f59e0b"
                    strokeDasharray="4 5"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <h3>Сценарный расчёт</h3>
              <p className="text-muted">Меняйте макрофакторы и сравнивайте сценарный прогноз с базовым.</p>

              <div className="factor-grid mt-4">
                {Object.entries(factors).map(([code, value]) => (
                  <div key={code} className="form-field">
                    <label htmlFor={`factor-${code}`}>{code}</label>
                    <input
                      id={`factor-${code}`}
                      type="text"
                      inputMode="decimal"
                      value={value}
                      onChange={(event) => handleFactorChange(code, event.target.value)}
                    />
                  </div>
                ))}
              </div>

              <button type="button" className="btn-primary glow-button" onClick={runScenario} disabled={isScenarioLoading}>
                {isScenarioLoading ? "Считаем..." : "Рассчитать сценарий"}
              </button>
            </div>

            <div className="card premium-card">
              <h3>Результат сценария</h3>
              {!scenarioResult ? (
                <p className="text-muted">Укажите факторы и нажмите кнопку расчёта.</p>
              ) : (
                <>
                  <p className="text-muted">Текущая цена: {formatMoney(scenarioResult.current_price)}</p>
                  <h2>{formatMoney(scenarioResult.predicted_price)}</h2>
                  <p className={scenarioResult.impact_percent >= 0 ? "text-green" : "text-red"}>
                    Отклонение: {scenarioResult.impact_percent >= 0 ? "+" : ""}
                    {formatNumber(scenarioResult.impact_percent)}%
                  </p>
                  <p className="text-muted">confidence: {getAccuracyPercent(scenarioResult.confidence_score).toFixed(1)}%</p>
                </>
              )}
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <h3>Влияние признаков</h3>
              {driverChartData.length ? (
                <div className="chart-panel">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={driverChartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="code" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                      <Tooltip formatter={(value, name) => [formatNumber(value, 4), name]} />
                      <Bar dataKey="absContribution" name="Абс. вклад" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted">Данные о факторах пока отсутствуют.</p>
              )}
            </div>

            <div className="card">
              <h3>Метрики модели</h3>
              <div className="metric-chip-list large">
                {metrics.length ? (
                  metrics.map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)
                ) : (
                  <span>Метрики пока не сохранены</span>
                )}
              </div>
              <p className="text-muted mt-4">Артефакт: {modelMeta?.artifact_path || "не указан"}</p>
              <p className="text-muted">
                Обучение: {modelMeta?.training_window_start || "seed"} → {modelMeta?.training_window_end || "текущие данные"}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="section-heading-row">
              <div>
                <h3>Датасет, на котором обучается модель</h3>
                <p className="text-muted">
                  Последние строки свечей OHLCV. Признаки модели: {features.join(", ")}.
                </p>
              </div>
              <span className="market-pill neutral">{candles.length} свечей загружено</span>
            </div>

            <table className="market-table mt-4">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>PREV_CLOSE</th>
                  <th>CLOSE target</th>
                  <th>Volume</th>
                  <th>Δ target</th>
                </tr>
              </thead>
              <tbody>
                {datasetRows.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{formatMoney(row.prevClose)}</td>
                    <td>{formatMoney(row.close)}</td>
                    <td>{row.volume.toLocaleString("ru-RU")}</td>
                    <td className={row.target >= 0 ? "text-green" : "text-red"}>
                      {row.target >= 0 ? "+" : ""}
                      {formatMoney(row.target)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
