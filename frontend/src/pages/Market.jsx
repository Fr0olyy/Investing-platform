import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function Market() {
  const [stocks, setStocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    apiClient('/assets')
      .then(data => {
        // Защита от ошибки: убеждаемся, что пришел массив
        if (Array.isArray(data)) {
          setStocks(data);
        } else {
          setStocks([]);
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Ошибка загрузки активов:", err);
        setError("Не удалось загрузить данные рынка.");
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Рынок акций</h1>
      </div>

      <div className="filters">
        <input 
          type="text" 
          placeholder="Поиск по тикеру или названию" 
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="mt-4 text-muted">Загрузка данных...</p>
      ) : error ? (
        <p className="mt-4 text-red">{error}</p>
      ) : stocks.length === 0 ? (
        <p className="mt-4 text-muted">Активы не найдены.</p>
      ) : (
        <table className="market-table mt-4">
          <thead>
            <tr>
              <th>Тикер</th>
              <th>Название</th>
              <th>Цена</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {stocks
              .filter(s => (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (s.ticker || '').toLowerCase().includes(searchTerm.toLowerCase()))
              .map((stock) => (
              <tr key={stock.ticker || stock.id}>
                <td className="ticker">{stock.ticker}</td>
                <td>{stock.name}</td>
                <td>{stock.current_price || stock.price} ₽</td>
                <td>
                  <button className="btn-buy" onClick={() => alert('Покупка пока в разработке')}>Купить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}