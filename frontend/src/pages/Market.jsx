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
import { useNavigate } from "react-router-dom";
import { api, authStorage } from "../api/client";

const formatMoney = (value) => `${Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

export default function Market() {
  const navigate = useNavigate();

  const [assets, setAssets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicker, setSelectedTicker] = useState("");

  const [assetDetails, setAssetDetails] = useState(null);
  const [candles, setCandles] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [modelMeta, setModelMeta] = useState(null);

  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [tradeSide, setTradeSide] = useState("BUY");

  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isTrading, setIsTrading] = useState(false);

  const [error, setError] = useState("");
  const [tradeMessage, setTradeMessage] = useState("");

  const loadAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    const payload = await api.assets.list();
    const list = Array.isArray(payload) ? payload : [];
    setAssets(list);
    if (!selectedTicker && list.length > 0) {
      setSelectedTicker(list[0].ticker);
    }
    setIsLoadingAssets(false);
  }, [selectedTicker]);

  const loadTickerBundle = useCallback(async (ticker) => {
    if (!ticker) return;
    setIsLoadingDetails(true);

    const [detailsResult, candlesResult, predictionResult, modelResult] = await Promise.allSettled([
      api.assets.details(ticker),
      api.assets.candles(ticker, 30),
      api.ml.prediction(ticker),
      api.ml.model(ticker),
    ]);

    setAssetDetails(detailsResult.status === "fulfilled" ? detailsResult.value : null);
    setCandles(candlesResult.status === "fulfilled" && Array.isArray(candlesResult.value) ? candlesResult.value : []);
    setPrediction(predictionResult.status === "fulfilled" ? predictionResult.value : null);
    setModelMeta(modelResult.status === "fulfilled" ? modelResult.value : null);
    setIsLoadingDetails(false);
  }, []);

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

  const filteredAssets = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return assets.filter(
      (asset) =>
        asset.ticker.toLowerCase().includes(lower) ||
        (asset.name || "").toLowerCase().includes(lower),
    );
  }, [assets, searchTerm]);

  const selectedAssetFromList = useMemo(
    () => assets.find((asset) => asset.ticker === selectedTicker),
    [assets, selectedTicker],
  );

  const chartData = useMemo(
    () =>
      candles.map((candle) => ({
        date: new Date(candle.timestamp).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
        close: Number(candle.close),
      })),
    [candles],
  );

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

    if (!tradeQuantity || tradeQuantity < 1) {
      setTradeMessage("Количество должно быть больше нуля.");
      return;
    }

    setIsTrading(true);
    setTradeMessage("");

    try {
      const payload = { ticker: selectedTicker, quantity: Number(tradeQuantity) };
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
    <div className="page-content">
      <div className="page-header">
        <h1>Рынок активов</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="dashboard-grid market-layout">
        <div className="card">
          <div className="filters">
            <input
              type="text"
              placeholder="Поиск по тикеру или названию"
              className="search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          {isLoadingAssets ? (
            <p className="text-muted">Загрузка списка активов...</p>
          ) : (
            <table className="market-table">
              <thead>
                <tr>
                  <th>Тикер</th>
                  <th>Название</th>
                  <th>Цена</th>
                  <th>Изм.</th>
                  <th>Прогноз</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => (
                  <tr
                    key={asset.ticker}
                    className={asset.ticker === selectedTicker ? "row-active" : ""}
                    onClick={() => setSelectedTicker(asset.ticker)}
                  >
                    <td className="ticker">{asset.ticker}</td>
                    <td>{asset.name}</td>
                    <td>{formatMoney(asset.current_price)}</td>
                    <td className={asset.change_percent >= 0 ? "text-green" : "text-red"}>
                      {asset.change_percent >= 0 ? "+" : ""}
                      {Number(asset.change_percent).toFixed(2)}%
                    </td>
                    <td>{asset.latest_prediction ? formatMoney(asset.latest_prediction) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          {isLoadingDetails ? (
            <p className="text-muted">Загрузка карточки актива...</p>
          ) : !assetDetails ? (
            <p className="text-muted">Выберите актив в таблице слева.</p>
          ) : (
            <>
              <h3>
                {assetDetails.ticker} — {assetDetails.name}
              </h3>
              <p className="text-muted">Сектор: {assetDetails.sector}</p>
              <p>Текущая цена: {formatMoney(assetDetails.latest_quote?.price)}</p>
              <p className={assetDetails.latest_quote?.change_percent >= 0 ? "text-green" : "text-red"}>
                Изменение: {assetDetails.latest_quote?.change_percent >= 0 ? "+" : ""}
                {Number(assetDetails.latest_quote?.change_percent || 0).toFixed(2)}%
              </p>

              {prediction ? (
                <div className="prediction-box">
                  <h4>ML-прогноз</h4>
                  <p>Прогнозная цена: {formatMoney(prediction.predicted_price)}</p>
                  <p className={prediction.impact_percent >= 0 ? "text-green" : "text-red"}>
                    Отклонение: {prediction.impact_percent >= 0 ? "+" : ""}
                    {Number(prediction.impact_percent).toFixed(2)}%
                  </p>
                  <p className="text-muted">Уверенность: {Number(prediction.confidence_score).toFixed(2)}</p>
                </div>
              ) : null}

              <div className="trade-box mt-4">
                <h4>Сделка</h4>
                <div className="trade-controls">
                  <select value={tradeSide} onChange={(event) => setTradeSide(event.target.value)}>
                    <option value="BUY">Покупка</option>
                    <option value="SELL">Продажа</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={tradeQuantity}
                    onChange={(event) => setTradeQuantity(Number(event.target.value))}
                  />
                </div>
                <button type="button" className="btn-primary" onClick={handleTrade} disabled={isTrading}>
                  {isTrading ? "Отправка..." : tradeSide === "BUY" ? "Купить" : "Продать"}
                </button>
                {tradeMessage && <p className="text-muted mt-4">{tradeMessage}</p>}
              </div>

              {chartData.length > 0 ? (
                <div className="mt-4" style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.3)" />
                      <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} />
                      <Tooltip formatter={(value) => [formatMoney(value), "Цена"]} />
                      <Line type="monotone" dataKey="close" stroke="#3B82F6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted mt-4">Недостаточно данных свечей.</p>
              )}

              {modelMeta ? (
                <div className="mt-4">
                  <p className="text-muted">Модель: {modelMeta.model_name}</p>
                  <p className="text-muted">Статус: {modelMeta.status}</p>
                </div>
              ) : null}

              {selectedAssetFromList?.lot_size ? (
                <p className="text-muted mt-4">Лот: {selectedAssetFromList.lot_size}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
