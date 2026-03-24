import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Portfolio() {
  const [summary, setSummary] = useState(null);
  const [positions, setPositions] = useState([]);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) return; // Если нет токена, даже не пытаемся грузить

    Promise.all([
      apiClient('/portfolio/summary'),
      apiClient('/portfolio/positions')
    ])
    .then(([sumData, posData]) => {
      setSummary(sumData);
      setPositions(posData);
    })
    .catch(err => setError(err.message));
  }, [token]);

  // Красивая заглушка для неавторизованных
  if (!token) {
    return (
      <div className="page-content">
        <h1>Портфель</h1>
        <div className="card mt-4" style={{textAlign: 'center', padding: '40px'}}>
          <h2 style={{marginBottom: '10px'}}>Доступ закрыт</h2>
          <p className="text-muted" style={{marginBottom: '20px'}}>
            Чтобы просматривать свои активы и баланс, необходимо войти в систему.
          </p>
          <Link to="/login" className="btn-sidebar-login" style={{display: 'inline-block', width: 'auto', padding: '12px 24px'}}>
            Войти в аккаунт
          </Link>
        </div>
      </div>
    );
  }

  if (error) return <div className="page-content text-red">Ошибка: {error}</div>;
  if (!summary) return <div className="page-content">Загрузка портфеля...</div>;

  return (
    <div className="page-content">
      <h1>Портфель</h1>
      
      <div className="dashboard-grid">
        <div className="card">
          <p className="text-muted">Общая стоимость</p>
          <h2>{summary.total_value} ₽</h2>
          <p className={summary.pnl >= 0 ? 'text-green' : 'text-red'}>
            PnL: {summary.pnl} ₽
          </p>
          <p className="text-muted mt-4">Свободный кэш: {summary.cash} ₽</p>
        </div>
      </div>

      <div className="card mt-4">
        <h3>Открытые позиции</h3>
        <table className="market-table">
          <thead>
            <tr>
              <th>Тикер</th>
              <th>Кол-во</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => (
              <tr key={pos.ticker}>
                <td className="ticker">{pos.ticker}</td>
                <td>{pos.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}