import { useState } from 'react';
import { apiClient } from '../api/client';

export default function AssetSimulator() {
  const [brent, setBrent] = useState(88.5);
  const [keyRate, setKeyRate] = useState(15.0);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState('');

  const runSimulation = async () => {
    setError('');
    try {
      // Строгое соответствие примеру из API_RU.md
      const result = await apiClient('/ml/scenario', {
        method: 'POST',
        body: JSON.stringify({
          ticker: "GAZP",
          factors: {
            "BRENT": brent,
            "USD_RUB": 97.2,
            "IMOEX": 3300,
            "KEY_RATE": keyRate,
            "RGBI": 109.3
          }
        })
      });
      setPrediction(result);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page-content">
      <h1>Сценарный ML-анализ (GAZP)</h1>
      
      <div className="dashboard-grid">
        <div className="card">
          <h3>Макрофакторы</h3>
          <div className="slider-group mt-4">
            <label>Нефть BRENT: ${brent}</label>
            <input type="range" min="50" max="120" step="0.5" value={brent} onChange={e => setBrent(Number(e.target.value))} className="full-width"/>
          </div>
          <div className="slider-group mt-4">
            <label>Ключевая ставка: {keyRate}%</label>
            <input type="range" min="5" max="25" step="0.5" value={keyRate} onChange={e => setKeyRate(Number(e.target.value))} className="full-width"/>
          </div>
          
          <button className="btn-primary mt-4" onClick={runSimulation}>Рассчитать сценарий</button>
          {error && <p className="text-red mt-4">{error}</p>}
        </div>

        <div className="card">
          <h3>Результат прогноза</h3>
          {prediction ? (
            <div>
              <p className="text-muted">Расчетная цена:</p>
              <h2 className="text-green">{prediction.predicted_price} ₽</h2>
              <p>Влияние (Impact): {prediction.impact_percent}%</p>
            </div>
          ) : (
            <p className="text-muted">Настройте факторы и нажмите "Рассчитать"</p>
          )}
        </div>
      </div>
    </div>
  );
}