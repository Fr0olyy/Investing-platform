import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { day: '1', value: 985000 }, { day: '5', value: 992000 },
  { day: '10', value: 988000 }, { day: '15', value: 995000 },
  { day: '20', value: 1001000 }, { day: '25', value: 1015000 },
  { day: '30', value: 1025450 },
];

export default function Dashboard() {
  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Обзор портфеля</h1>
      </div>

      <div className="dashboard-grid">
        {/* Главный график */}
        <div className="card chart-card">
          <h2>1 025 450 ₽</h2>
          <p className="text-green">↗ +25 450 ₽ (2.54% сегодня)</p>
          <div style={{ height: 300, marginTop: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="day" stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" domain={['dataMin - 10000', 'dataMax + 10000']} />
                <Tooltip contentStyle={{ backgroundColor: '#0F172A', border: 'none' }} />
                <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Боковые виджеты */}
        <div className="dashboard-sidebar">
          <div className="card">
            <h3>Лидеры рынка</h3>
            <ul className="widget-list">
              <li><span>SBER</span> <span className="text-green">+5.83%</span></li>
              <li><span>YNDX</span> <span className="text-green">+4.20%</span></li>
              <li><span>OZON</span> <span className="text-green">+3.15%</span></li>
            </ul>
          </div>
          <div className="card mt-4">
            <h3>Новости</h3>
            <ul className="widget-list">
              <li>РБК: ЦБ сохранил ставку...</li>
              <li>VC.ru: IPO новой IT-компании...</li>
              <li>Интерфакс: Нефть растет...</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}