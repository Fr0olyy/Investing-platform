import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function Market() {
  const [stocks, setStocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Состояния для окна покупки
  const [selectedStock, setSelectedStock] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [buyError, setBuyError] = useState('');
  const [buySuccess, setBuySuccess] = useState('');
  const [isBuying, setIsBuying] = useState(false);

  useEffect(() => {
    apiClient('/assets')
      .then(data => { setStocks(Array.isArray(data) ? data : []); setIsLoading(false); })
      .catch(err => { console.error(err); setIsLoading(false); });
  }, []);

  // Функция совершения сделки
  const confirmPurchase = async () => {
    setBuyError('');
    setBuySuccess('');
    setIsBuying(true);

    try {
      await apiClient('/trades/buy', {
        method: 'POST',
        body: JSON.stringify({ 
          ticker: selectedStock.ticker, 
          quantity: Number(quantity) 
        })
      });
      setBuySuccess(`Успешно! Вы купили ${quantity} шт. ${selectedStock.ticker}.`);
      // Закрываем окно через 2 секунды
      setTimeout(() => { setSelectedStock(null); setBuySuccess(''); }, 2000);
    } catch (err) {
      setBuyError(err.message);
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <div className="page-content">
      <h1>Рынок акций</h1>

      <div className="filters">
        <input 
          type="text" 
          placeholder="Поиск по тикеру или названию" 
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? <p>Загрузка данных...</p> : (
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
            {stocks.filter(s => (s.name||'').toLowerCase().includes(searchTerm.toLowerCase()) || (s.ticker||'').toLowerCase().includes(searchTerm.toLowerCase())).map((stock) => (
              <tr key={stock.ticker}>
                <td className="ticker"><b>{stock.ticker}</b></td>
                <td>{stock.name}</td>
                <td>{stock.current_price || stock.price} ₽</td>
                <td>
                  <button className="btn-buy" onClick={() => { setSelectedStock(stock); setQuantity(1); setBuyError(''); setBuySuccess(''); }}>
                    Купить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ВСПЛЫВАЮЩЕЕ ОКНО ПОКУПКИ */}
      {selectedStock && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 17, 32, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000}}>
          <div style={{backgroundColor: '#1E293B', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '350px'}}>
            <h2 style={{marginTop: 0}}>Покупка {selectedStock.ticker}</h2>
            <p style={{color: '#94A3B8'}}>Текущая цена: {selectedStock.current_price || selectedStock.price} ₽</p>

            {buyError && <div style={{backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '10px', borderRadius: '8px', marginBottom: '15px'}}>{buyError}</div>}
            {buySuccess && <div style={{backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '10px', borderRadius: '8px', marginBottom: '15px'}}>{buySuccess}</div>}

            <div style={{marginBottom: '20px'}}>
              <label style={{color: '#94A3B8', fontSize: '0.9rem'}}>Количество (шт.)</label>
              <input 
                type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
                style={{width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: 'white', boxSizing: 'border-box'}}
              />
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderTop: '1px solid #334155', paddingTop: '15px'}}>
              <span style={{color: '#94A3B8'}}>Итого:</span>
              <h3 style={{margin: 0}}>~{((selectedStock.current_price || selectedStock.price) * quantity).toFixed(2)} ₽</h3>
            </div>

            <div style={{display: 'flex', gap: '10px'}}>
              <button onClick={() => setSelectedStock(null)} style={{flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #94A3B8', backgroundColor: 'transparent', color: 'white', cursor: 'pointer'}}>Отмена</button>
              <button onClick={confirmPurchase} disabled={isBuying} style={{flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#3B82F6', color: 'white', cursor: 'pointer', fontWeight: 'bold'}}>
                {isBuying ? 'Покупка...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}