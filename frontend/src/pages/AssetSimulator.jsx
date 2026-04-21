import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";

const DEFAULT_FACTORS = {
  BRENT: 88.5,
  USD_RUB: 97.2,
  IMOEX: 3300,
  KEY_RATE: 15,
  RGBI: 109.3,
};

const formatNumber = (value, digits = 2) => Number(value || 0).toFixed(digits);

export default function AssetSimulator() {
  const [assets, setAssets] = useState([]);
  const [ticker, setTicker] = useState("");

  const [prediction, setPrediction] = useState(null);
  const [modelMeta, setModelMeta] = useState(null);
  const [scenarioResult, setScenarioResult] = useState(null);

  const [factors, setFactors] = useState(DEFAULT_FACTORS);

  const [isLoading, setIsLoading] = useState(true);
  const [isScenarioLoading, setIsScenarioLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const selectedAsset = useMemo(() => assets.find((asset) => asset.ticker === ticker), [assets, ticker]);

  const forecastChartData = useMemo(() => {
    if (!prediction) return [];

    const points = [
      {
        stage: "Текущая цена",
        price: Number(prediction.current_price || 0),
      },
      {
        stage: "Базовый прогноз",
        price: Number(prediction.predicted_price || 0),
      },
    ];

    if (scenarioResult) {
      points.push({
        stage: "Сценарный прогноз",
        price: Number(scenarioResult.predicted_price || 0),
      });
    }

    return points.map((point) => {
      const base = Number(prediction.current_price || 0);
      const delta = base > 0 ? ((point.price - base) / base) * 100 : 0;
      return {
        ...point,
        delta,
      };
    });
  }, [prediction, scenarioResult]);

  const loadForTicker = useCallback(async (targetTicker) => {
    if (!targetTicker) return;

    const [predictionResult, modelResult] = await Promise.allSettled([
      api.ml.prediction(targetTicker),
      api.ml.model(targetTicker),
    ]);

    if (predictionResult.status === "fulfilled") {
      setPrediction(predictionResult.value);
    } else {
      setPrediction(null);
    }

    if (modelResult.status === "fulfilled") {
      setModelMeta(modelResult.value);
    } else {
      setModelMeta(null);
    }

    setScenarioResult(null);
  }, []);

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
    setFactors((prev) => ({ ...prev, [code]: Number(value) }));
  };

  const runScenario = async () => {
    if (!ticker) return;

    setIsScenarioLoading(true);
    setError("");

    try {
      const payload = await api.ml.scenario({ ticker, factors });
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
    <div className="page-content">
      <div className="page-header">
        <h1>ML-анализ актива</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      {isLoading ? (
        <p className="text-muted">Загрузка данных ML...</p>
      ) : (
        <>
          <div className="card">
            <div className="ml-toolbar">
              <div className="form-field ml-toolbar-main">
                <label htmlFor="ml-ticker">Выберите актив</label>
                <select id="ml-ticker" value={ticker} onChange={(event) => setTicker(event.target.value)}>
                  {assets.map((asset) => (
                    <option key={asset.ticker} value={asset.ticker}>
                      {asset.ticker} — {asset.name}
                    </option>
                  ))}
                </select>
              </div>

              <button type="button" className="btn-secondary" onClick={refreshPredictions} disabled={isRefreshing}>
                {isRefreshing ? "Обновляем..." : "Обновить прогнозы"}
              </button>
            </div>
          </div>

          <div className="stats-grid">
            <div className="card stat-card">
              <p className="text-muted">Текущая цена</p>
              <h2>{prediction ? `${formatNumber(prediction.current_price)} ₽` : "Нет данных"}</h2>
              {selectedAsset ? <p className="text-muted">{selectedAsset.name}</p> : null}
            </div>

            <div className="card stat-card">
              <p className="text-muted">Прогнозная цена</p>
              <h2>{prediction ? `${formatNumber(prediction.predicted_price)} ₽` : "Нет данных"}</h2>
              <p className={prediction?.impact_percent >= 0 ? "text-green" : "text-red"}>
                Изменение: {prediction ? `${prediction.impact_percent >= 0 ? "+" : ""}${formatNumber(prediction.impact_percent)}%` : "-"}
              </p>
            </div>

            <div className="card stat-card">
              <p className="text-muted">Модель</p>
              <h2>{modelMeta?.model_name || "Нет данных"}</h2>
              <p className="text-muted">Статус: {modelMeta?.status || "-"}</p>
            </div>
          </div>

          <div className="card">
            <h3>График прогноза цены</h3>
            {!prediction ? (
              <p className="text-muted mt-4">Нет данных прогноза для построения графика.</p>
            ) : (
              <div style={{ width: "100%", height: 310, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastChartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="stage" />
                    <YAxis tickFormatter={(value) => Number(value).toLocaleString("ru-RU")} />
                    <Tooltip
                      formatter={(value, _name, item) => [
                        `${Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ (${Number(item.payload.delta).toFixed(2)}%)`,
                        item.payload.stage,
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      name="Цена"
                      stroke="#3B82F6"
                      strokeWidth={3}
                      dot={{ r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <h3>Сценарный расчёт</h3>

              <div className="factor-grid mt-4">
                {Object.entries(factors).map(([code, value]) => (
                  <div key={code} className="form-field">
                    <label htmlFor={`factor-${code}`}>{code}</label>
                    <input
                      id={`factor-${code}`}
                      type="number"
                      step="0.1"
                      value={value}
                      onChange={(event) => handleFactorChange(code, event.target.value)}
                    />
                  </div>
                ))}
              </div>

              <button type="button" className="btn-primary" onClick={runScenario} disabled={isScenarioLoading}>
                {isScenarioLoading ? "Считаем..." : "Рассчитать сценарий"}
              </button>
            </div>

            <div className="card">
              <h3>Результат сценария</h3>
              {!scenarioResult ? (
                <p className="text-muted">Укажите факторы и нажмите кнопку расчёта.</p>
              ) : (
                <>
                  <p className="text-muted">Текущая цена: {formatNumber(scenarioResult.current_price)} ₽</p>
                  <h2>{formatNumber(scenarioResult.predicted_price)} ₽</h2>
                  <p className={scenarioResult.impact_percent >= 0 ? "text-green" : "text-red"}>
                    Отклонение: {scenarioResult.impact_percent >= 0 ? "+" : ""}
                    {formatNumber(scenarioResult.impact_percent)}%
                  </p>
                  <p className="text-muted">Уверенность модели: {formatNumber(scenarioResult.confidence_score)}</p>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Факторы влияния</h3>
            {prediction?.drivers?.length ? (
              <table className="market-table mt-4">
                <thead>
                  <tr>
                    <th>Код</th>
                    <th>Фактор</th>
                    <th>Вклад</th>
                    <th>Направление</th>
                  </tr>
                </thead>
                <tbody>
                  {prediction.drivers.map((driver) => (
                    <tr key={driver.code}>
                      <td className="ticker">{driver.code}</td>
                      <td>{driver.name}</td>
                      <td className={driver.contribution >= 0 ? "text-green" : "text-red"}>
                        {driver.contribution >= 0 ? "+" : ""}
                        {formatNumber(driver.contribution, 4)}
                      </td>
                      <td>{driver.direction === "positive" ? "Положительное" : "Отрицательное"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted mt-4">Данные о факторах пока отсутствуют.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
