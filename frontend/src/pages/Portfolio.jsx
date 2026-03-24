import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { apiClient } from '../api/client';

const COLORS = ['#3B82F6', '#64748B'];

export default function Portfolio() {
  const [summary, setSummary] = useState(null);
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Делаем два запроса параллельно: за сводкой и за позициями
    Promise.all([
      apiClient('/portfolio/summary'),
      apiClient('/portfolio/positions')
    ])
    .then(([sumData, posData]) => {
      setSummary(sumData);
      setPositions(posData);
      setIsLoading(false);
    })
    .catch(err => {
      console.error("Ошибка загрузки портфеля:", err);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) return <div className="page-content"><h2>Загрузка портфеля...</h2></div>;
  if (!summary) return <div className="page-content"><h2>Ошибка доступа. Вы авторизованы?</h2></div>;

  // Динамические данные для диаграммы
  const pieData = [
    { name: 'В активах', value: summary.invested_value || 0 },
    { name: 'Кэш', value: summary.cash || 0 },
  ];

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Портфель</h1>
      </div>

      <div className="portfolio-stats">
        <div className="card stat-card">
          <p className="text-muted">Общая стоимость</p>
          <h2>{summary.total_value?.toFixed(2)} ₽</h2>
          <p className={summary.pnl >= 0 ? 'text-green' : 'text-red'}>
            {summary.pnl >= 0 ? '↗ +' : '↘ '} {summary.pnl?.toFixed(2)} ₽
          </p>
          <p className="text-muted text-sm mt-4">Свободный кэш: {summary.cash?.toFixed(2)} ₽</p>
        </div>
        
        <div className="card chart-card-small">
          <p className="text-muted">Структура</p>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={40} outerRadius={55} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: '#0F172A', border: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <h3>Мои активы</h3>
        {positions.length === 0 ? (
          <p className="text-muted mt-4">У вас пока нет купленных активов. Перейдите в раздел "Рынок", чтобы совершить первую сделку.</p>
        ) : (
          <table className="market-table">
            <thead>
              <tr>
                <th>Тикер</th>
                <th>Кол-во лотов</th>
                <th>Ср. цена покупки</th>
                <th>Текущая цена</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.ticker}>
                  <td className="ticker">{pos.ticker}</td>
                  <td>{pos.quantity}</td>
                  <td>{pos.average_price?.toFixed(2)} ₽</td>
                  <td>{pos.current_price?.toFixed(2)} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}