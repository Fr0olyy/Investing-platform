const newsList = [
  { id: 1, source: 'РБК Инвестиции', time: '1 час назад', title: 'ЦБ РФ сохранил ключевую ставку на уровне 16%', text: 'Банк России принял решение сохранить ключевую ставку...' },
  { id: 2, source: 'Интерфакс', time: '2 часа назад', title: 'Нефть Brent превысила $85 за баррель', text: 'Цены на нефть продолжают расти на фоне геополитической...' },
  { id: 3, source: 'vc.ru', time: 'Вчера', title: 'Apple представила отчет за квартал', text: 'Apple отчиталась о финансовых результатах за второй...' },
];

export default function News() {
  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Новости рынка</h1>
      </div>

      <div className="filters">
        <input type="text" placeholder="Поиск новостей..." className="search-input full-width" />
        <div className="filter-tags mt-4">
          <button className="tag active">Все</button>
          <button className="tag">Российский рынок</button>
          <button className="tag">Мировой рынок</button>
          <button className="tag">Криптовалюта</button>
        </div>
      </div>

      <div className="news-list mt-4">
        {newsList.map((item) => (
          <div key={item.id} className="card news-card">
            <span className="text-muted text-sm">{item.source} • {item.time}</span>
            <h3>{item.title}</h3>
            <p className="text-muted">{item.text}</p>
          </div>
        ))}
      </div>
      
      <div className="text-center mt-4">
        <button className="tag">Загрузить еще</button>
      </div>
    </div>
  );
}