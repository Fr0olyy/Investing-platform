import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { apiClient } from '../api/client'; // Подключаем наш клиент

// Базовые исторические данные (пока для красоты, до подключения реальных свечей)
const baseData = [
  { day: '1', price: 250 }, { day: '2', price: 255 }, 
  { day: '3', price: 260 }, { day: '4', price: 258 }, 
  { day: '5', price: 265 } // Текущий день
];

export default function AssetSimulator() {
  const [keyRate, setKeyRate] = useState(16);
  const [oilPrice, setOilPrice] = useState(85);
  const [predictedPrice, setPredictedPrice] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Запрос к твоему FastAPI (ML-контур)
  const runSimulation = async () => {
    setIsLoading(true);
    try {
      const result = await apiClient('/ml/scenario', {
        method: 'POST',
        body: JSON.stringify({
          ticker: 'SBER', // В будущем тикер можно брать из URL
          macro_factors: {
            key_rate: keyRate,
            oil_price: oilPrice
          }
        })
      });
      // Берем расчетную цену из ответа сервера
      setPredictedPrice(result.predicted_price);
    } catch (err) {
      console.error("Ошибка ML симуляции:", err);
      alert("Не удалось получить прогноз от сервера");
    } finally {
      setIsLoading(false);
    }
  };

  // Формируем данные для графика: факт + прогноз (если он есть)
  const chartData = predictedPrice 
    ? [...baseData, { day: '6 (Прогноз)', price: predictedPrice }]
    : baseData;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Сбербанк (SBER) - Анализ и АI Прогноз</h1>
      </div>

      <div className="dashboard-grid">
        {/* График с прогнозом */}
        <div className="card chart-card">
          <h2>Прогнозная модель</h2>
          <p className="text-muted">Интерактивный расчет на базе машинного обучения</p>
          <div style={{ height: 350, marginTop: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="day" stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" domain={['dataMin - 20', 'dataMax + 20']} />
                <Tooltip contentStyle={{ backgroundColor: '#0F172A', border: 'none' }} />
                {predictedPrice && (
                  <ReferenceLine x="5" stroke="#EF4444" strokeDasharray="3 3" label="Сегодня" />
                )}
                <Line type="monotone" dataKey="price" stroke="#3B82F6" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Панель управления факторами */}
        <div className="dashboard-sidebar">
          <div className="card">
            <h3>Макроэкономические факторы</h3>
            <p className="text-muted text-sm mb-4">Измените параметры для пересчета прогноза</p>
            
            <div className="slider-group">
              <label>Ключевая ставка ЦБ: {keyRate}%</label>
              <input 
                type="range" min="10" max="20" step="0.5"
                value={keyRate} 
                onChange={(e) => setKeyRate(Number(e.target.value))}
                className="full-width"
              />
            </div>

            <div className="slider-group mt-4">
              <label>Цена на нефть Brent: ${oilPrice}</label>
              <input 
                type="range" min="60" max="120" step="1"
                value={oilPrice} 
                onChange={(e) => setOilPrice(Number(e.target.value))}
                className="full-width"
              />
            </div>
            
            {/* ВОТ ТУТ КНОПКА ЗАПУСКА СИМУЛЯЦИИ */}
            <button 
              className="btn-primary full-width mt-4" 
              onClick={runSimulation}
              disabled={isLoading}
            >
              {isLoading ? 'Считаем...' : 'Рассчитать прогноз'}
            </button>

            {predictedPrice && (
              <div className="mt-4 p-3 bg-dark rounded">
                <span className="text-muted text-sm">Прогнозная цена (T+1):</span>
                <h2 className="text-green mt-1">{predictedPrice.toFixed(2)} ₽</h2>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}