import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Portfolio() {
  const [summary, setSummary] = useState(null);
  const [positions, setPositions] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true); // Добавили состояние загрузки
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return; 
    }

    setIsLoading(true);
    Promise.all([
      apiClient('/portfolio/summary'),
      apiClient('/portfolio/positions')
    ])
    .then(([sumData, posData]) => {
      setSummary(sumData);
      // Железобетонная защита: убеждаемся, что positions это массив, иначе ставим пустой
      setPositions(Array.isArray(posData) ? posData : []);
    })
    .catch(err => {
      setError(err.message);
    })
    .finally(() => {
      setIsLoading(false);
    });
  }, [token]);

  // Заглушка для неавторизованных
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

  if (isLoading) return <div className="page-content"><p className="text-muted">Загрузка портфеля...</p></div>;
  if (error) return <div className="page-content"><div className="error-message">Ошибка: {error}</div></div>;
  if (!summary) return <div className="page-content"><p className="text-muted">Данные портфеля не найдены.</p></div>;

  return (
    <div className="page-content">
      <h1>Портфель</h1>
      
      <div className="dashboard-grid">
        <div className="card" style={{boxShadow: '0 10px 25px rgba(0,0,0,0.2)'}}>
          <p className="text-muted" style={{marginBottom: '8px'}}>Общая стоимость</p>
          {/* Красивое форматирование чисел с пробелами */}
          <h2 style={{fontSize: '2.5rem', margin: '0 0 10px 0'}}>
            {Number(summary.total_value || 0).toLocaleString('ru-RU')} ₽
          </h2>
          <p className={(summary.pnl || 0) >= 0 ? 'text-green' : 'text-red'} style={{fontWeight: 'bold'}}>
            PnL: {(summary.pnl || 0) >= 0 ? '+' : ''}{Number(summary.pnl || 0).toLocaleString('ru-RU')} ₽
          </p>
          
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span className="text-muted">Свободный кэш:</span> 
              <span style={{ color: 'white', fontWeight: 'bold' }}>{Number(summary.cash || 0).toLocaleString('ru-RU')} ₽</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-muted">В активах:</span> 
              <span style={{ color: 'white', fontWeight: 'bold' }}>{Number(summary.invested_value || 0).toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <h3>Открытые позиции</h3>
        
        {/* Если акций нет - показываем красивую подсказку вместо пустой таблицы */}
        {positions.length === 0 ? (
          <div style={{textAlign: 'center', padding: '30px 0'}}>
            <p className="text-muted">У вас пока нет купленных активов.</p>
            <Link to="/market" className="btn-primary" style={{display: 'inline-block', width: 'auto', marginTop: '10px', textDecoration: 'none'}}>
              Перейти на рынок
            </Link>
          </div>
        ) : (
          <table className="market-table mt-4">
            <thead>
              <tr>
                <th>Тикер</th>
                <th>Кол-во (шт.)</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, index) => (
                <tr key={pos.ticker || index}>
                  <td className="ticker"><b>{pos.ticker}</b></td>
                  <td>{pos.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

