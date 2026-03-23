import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const pieData = [
  { name: 'Акции', value: 75 },
  { name: 'Кэш', value: 25 },
];
const COLORS = ['#3B82F6', '#64748B'];

const myAssets = [
  { ticker: 'SBER', name: 'Сбербанк', count: 100, avgPrice: '250.50 ₽', currentPrice: '265.10 ₽', profit: '+1 460 ₽', isUp: true },
  { ticker: 'GAZP', name: 'Газпром', count: 50, avgPrice: '175.20 ₽', currentPrice: '170.80 ₽', profit: '-220 ₽', isUp: false },
  { ticker: 'AAPL', name: 'Apple Inc.', count: 5, avgPrice: '$150.00', currentPrice: '$155.30', profit: '+$26.50', isUp: true },
];

export default function Portfolio() {
  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Портфель</h1>
      </div>

      <div className="portfolio-stats">
        <div className="card stat-card">
          <p className="text-muted">Стоимость портфеля</p>
          <h2>1 025 450 ₽</h2>
          <p className="text-green">↗ +25 450 ₽ (2.54% сегодня)</p>
        </div>
        
        <div className="card chart-card-small">
          <p className="text-muted">Структура портфеля</p>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={40} outerRadius={55} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0F172A', border: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <h3>Мои активы</h3>
        <table className="market-table">
          <thead>
            <tr>
              <th>Тикер</th>
              <th>Название</th>
              <th>Кол-во</th>
              <th>Ср. цена</th>
              <th>Тек. цена</th>
              <th>Прибыль/Убыток</th>
            </tr>
          </thead>
          <tbody>
            {myAssets.map((asset) => (
              <tr key={asset.ticker}>
                <td className="ticker">{asset.ticker}</td>
                <td>{asset.name}</td>
                <td>{asset.count}</td>
                <td>{asset.avgPrice}</td>
                <td>{asset.currentPrice}</td>
                <td className={asset.isUp ? 'text-green' : 'text-red'}>{asset.profit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}