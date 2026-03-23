import { useState, useEffect } from 'react';
import { fetchMarketData } from '../api/mockApi';

export default function Market() {
  const [stocks, setStocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Состояния для модального окна (БП-6)
  const [selectedStock, setSelectedStock] = useState(null);
  const [lotCount, setLotCount] = useState(1);

  // Загрузка данных "с сервера"
  useEffect(() => {
    fetchMarketData().then((data) => {
      setStocks(data);
      setIsLoading(false);
    });
  }, []);

  const handleBuy = (stock) => {
    setSelectedStock(stock);
    setLotCount(1); // сброс лотов при новом открытии
  };

  const confirmPurchase = () => {
    alert(`Куплено ${lotCount} акций ${selectedStock.ticker} на сумму ${(selectedStock.price * lotCount).toFixed(2)} ₽`);
    // Здесь в будущем будет POST-запрос на бекенд
    setSelectedStock(null);
  };

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
        <div className="filter-tags">
          <button className="tag active">Все</button>
          <button className="tag">Лидеры роста</button>
          <button className="tag">IT Сектор</button> {/* Добавлен фильтр по отрасли (БП-3) */}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted mt-4">Загрузка данных с сервера...</p>
      ) : (
        <table className="market-table mt-4">
          <thead>
            <tr>
              <th>Тикер</th>
              <th>Название</th>
              <th>Цена</th>
              <th>Изменение</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {stocks.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((stock) => (
              <tr key={stock.id}>
                <td className="ticker">{stock.ticker}</td>
                <td>{stock.name}</td>
                <td>{stock.price} ₽</td>
                <td className={stock.isUp ? 'text-green' : 'text-red'}>
                  {stock.isUp ? '+' : ''}{stock.change}%
                </td>
                <td>
                  <button className="btn-buy" onClick={() => handleBuy(stock)}>Купить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Модальное окно покупки (БП-6) */}
      {selectedStock && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h2>Покупка {selectedStock.ticker}</h2>
            <p className="text-muted">Текущая цена: {selectedStock.price} ₽</p>
            
            <div className="input-group mt-4">
              <label>Количество лотов</label>
              <input 
                type="number" 
                min="1" 
                value={lotCount} 
                onChange={(e) => setLotCount(Number(e.target.value))}
              />
            </div>
            
            <div className="modal-total mt-4">
              <span>Итого:</span>
              <h3>{(selectedStock.price * lotCount).toFixed(2)} ₽</h3>
            </div>

            <div className="modal-actions mt-4">
              <button className="btn-secondary" onClick={() => setSelectedStock(null)}>Отмена</button>
              <button className="btn-primary" onClick={confirmPurchase}>Подтвердить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}