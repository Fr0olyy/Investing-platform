import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const formatMoney = (value) => `${Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

export default function Portfolio() {
  const [summary, setSummary] = useState(null);
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async ({ silent = false } = {}) => {
      if (!silent) setIsLoading(true);
      setError("");

      try {
        const [summaryPayload, positionsPayload, historyPayload] = await Promise.all([
          api.portfolio.summary(),
          api.portfolio.positions(),
          api.trades.history(),
        ]);
        if (!cancelled) {
          setSummary(summaryPayload);
          setPositions(Array.isArray(positionsPayload) ? positionsPayload : []);
          setHistory(Array.isArray(historyPayload) ? historyPayload : []);
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
  }, []);

  if (isLoading) {
    return <div className="page-content">Загрузка портфеля...</div>;
  }

  if (error) {
    return (
      <div className="page-content">
        <div className="error-message">{error}</div>
        <Link to="/market" className="inline-link">Перейти к рынку</Link>
      </div>
    );
  }

  if (!summary) {
    return <div className="page-content">Портфель недоступен.</div>;
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Портфель</h1>
      </div>

      <div className="stats-grid">
        <div className="card stat-card">
          <p className="text-muted">Общая стоимость</p>
          <h2>{formatMoney(summary.total_value)}</h2>
        </div>
        <div className="card stat-card">
          <p className="text-muted">Свободные средства</p>
          <h2>{formatMoney(summary.cash_balance)}</h2>
        </div>
        <div className="card stat-card">
          <p className="text-muted">Результат</p>
          <h2 className={summary.total_pnl >= 0 ? "text-green" : "text-red"}>{formatMoney(summary.total_pnl)}</h2>
          <p className="text-muted">{Number(summary.total_pnl_percent).toFixed(2)}%</p>
        </div>
      </div>

      <div className="card mt-4">
        <h3>Открытые позиции</h3>
        {positions.length ? (
          <table className="market-table mt-4">
            <thead>
              <tr>
                <th>Тикер</th>
                <th>Название</th>
                <th>Кол-во</th>
                <th>Средняя цена</th>
                <th>Текущая цена</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.ticker}>
                  <td className="ticker">
                    <Link to={`/market?ticker=${encodeURIComponent(position.ticker)}`} className="inline-link">
                      {position.ticker}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/market?ticker=${encodeURIComponent(position.ticker)}`} className="inline-link">
                      {position.name}
                    </Link>
                  </td>
                  <td>{position.quantity}</td>
                  <td>{formatMoney(position.average_price)}</td>
                  <td>{formatMoney(position.current_price)}</td>
                  <td className={position.unrealized_pnl >= 0 ? "text-green" : "text-red"}>
                    {formatMoney(position.unrealized_pnl)} ({Number(position.unrealized_pnl_percent).toFixed(2)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted mt-4">
            В портфеле пока нет позиций. <Link to="/market" className="inline-link">Купить активы</Link>
          </p>
        )}
      </div>

      <div className="card mt-4">
        <h3>История сделок</h3>
        {history.length ? (
          <table className="market-table mt-4">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тикер</th>
                <th>Сторона</th>
                <th>Кол-во</th>
                <th>Цена</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {history.map((trade) => (
                <tr key={trade.id}>
                  <td>{new Date(trade.created_at).toLocaleString("ru-RU")}</td>
                  <td className="ticker">{trade.ticker}</td>
                  <td className={trade.side === "BUY" ? "text-green" : "text-red"}>{trade.side}</td>
                  <td>{trade.quantity}</td>
                  <td>{formatMoney(trade.price)}</td>
                  <td>{formatMoney(trade.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted mt-4">Сделок пока нет.</p>
        )}
      </div>
    </div>
  );
}
