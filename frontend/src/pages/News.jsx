import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function News() {
  const [newsList, setNewsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchNews = async () => {
      setIsLoading(true);
      setError('');
      try {
        // Поскольку в API новости привязаны к тикеру, запрашиваем сразу для нескольких лидеров рынка
        const topTickers = ['SBER', 'GAZP', 'YDEX', 'LKOH'];
        
        // Делаем параллельные запросы к бэкенду
        const promises = topTickers.map(ticker => 
          apiClient(`/assets/${ticker}/news?limit=5`)
            .catch(() => []) // Если для какого-то тикера новостей нет, возвращаем пустой массив, чтобы не сломать остальные
        );
        
        const results = await Promise.all(promises);
        
        // Сливаем все массивы новостей в один большой список
        let combinedNews = [];
        results.forEach((tickerNews, index) => {
          if (Array.isArray(tickerNews)) {
            // Добавляем пометку, к какому тикеру относится новость (для красоты)
            const newsWithTicker = tickerNews.map(n => ({ ...n, related_ticker: topTickers[index] }));
            combinedNews = [...combinedNews, ...newsWithTicker];
          }
        });

        // Сортируем новости по дате публикации (от свежих к старым)
        // Если бэкенд отдает дату в поле published_at или time
        combinedNews.sort((a, b) => {
          const dateA = new Date(a.published_at || a.time || 0);
          const dateB = new Date(b.published_at || b.time || 0);
          return dateB - dateA;
        });

        setNewsList(combinedNews);
      } catch (err) {
        setError('Не удалось загрузить ленту новостей: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNews();
  }, []);

  // Фильтрация новостей по строке поиска
  const filteredNews = newsList.filter(item => {
    const titleMatch = (item.title || '').toLowerCase().includes(searchTerm.toLowerCase());
    const textMatch = (item.text || item.content || '').toLowerCase().includes(searchTerm.toLowerCase());
    return titleMatch || textMatch;
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Новости рынка</h1>
      </div>

      <div className="filters">
        <input 
          type="text" 
          placeholder="Поиск новостей..." 
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="filter-tags">
          <button className="tag active">Все</button>
          <button className="tag">Российский рынок</button>
          <button className="tag">Мировой рынок</button>
          <button className="tag">Криптовалюта</button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted mt-4">Загрузка свежих новостей...</p>
      ) : error ? (
        <p className="text-red mt-4">{error}</p>
      ) : filteredNews.length === 0 ? (
        <p className="text-muted mt-4">По вашему запросу новостей не найдено.</p>
      ) : (
        <div className="news-list mt-4">
          {filteredNews.map((item, index) => (
            // Бэкенд может отдавать id, если нет - используем index как ключ
            <div key={item.id || index} className="card news-card">
              <span className="text-muted text-sm" style={{fontSize: '0.8rem'}}>
                {item.source || 'Рыночная сводка'} • {item.published_at || item.time || 'Недавно'} • <b>{item.related_ticker}</b>
              </span>
              <h3 style={{margin: '8px 0'}}>{item.title}</h3>
              {/* Бэкенд может отдавать текст в поле text или content */}
              <p className="text-muted" style={{margin: 0}}>{item.text || item.content}</p>
            </div>
          ))}
        </div>
      )}
      
      {!isLoading && filteredNews.length > 0 && (
        <div style={{textAlign: 'center'}} className="mt-4">
          <button className="tag" onClick={() => alert('В демо-версии бэкенда показаны все доступные новости')}>Загрузить еще</button>
        </div>
      )}
    </div>
  );
}