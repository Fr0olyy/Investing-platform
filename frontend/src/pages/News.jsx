import { useEffect, useMemo, useState } from "react";
import { api, authStorage } from "../api/client";

const NEWS_PER_TICKER = 10;

export default function News() {
  const [assets, setAssets] = useState([]);
  const [allNews, setAllNews] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState("ВСЕ");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const isAdmin = currentUser?.role === "admin";

  const loadNews = async () => {
    setIsLoading(true);
    setError("");

    try {
      const assetsPayload = await api.assets.list();
      const assetList = Array.isArray(assetsPayload) ? assetsPayload : [];
      setAssets(assetList);

      const newsResults = await Promise.allSettled(
        assetList.map((asset) => api.assets.news(asset.ticker, NEWS_PER_TICKER)),
      );

      const merged = [];

      newsResults.forEach((result, index) => {
        if (result.status !== "fulfilled" || !Array.isArray(result.value)) return;

        const ticker = assetList[index]?.ticker;
        const name = assetList[index]?.name;

        result.value.forEach((item, itemIndex) => {
          merged.push({
            id: `${ticker}-${item.published_at}-${itemIndex}`,
            ticker,
            assetName: name,
            title: item.title,
            summary: item.summary,
            source: item.source,
            sentiment: item.sentiment,
            url: item.url,
            publishedAt: item.published_at,
          });
        });
      });

      merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      setAllNews(merged);
    } catch (err) {
      setError(err.message);
      setAllNews([]);
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNews();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentUser = async () => {
      if (!authStorage.getToken()) {
        setCurrentUser(null);
        return;
      }

      try {
        const user = await api.auth.me();
        if (!cancelled) setCurrentUser(user);
      } catch {
        if (!cancelled) setCurrentUser(null);
      }
    };

    loadCurrentUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefreshFromSource = async () => {
    setIsRefreshing(true);
    setError("");
    try {
      const ticker = selectedTicker === "ВСЕ" ? undefined : selectedTicker;
      await api.system.refreshNews({ ticker, perAssetLimit: NEWS_PER_TICKER });
      await loadNews();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredNews = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return allNews.filter((item) => {
      const byTicker = selectedTicker === "ВСЕ" || item.ticker === selectedTicker;
      const bySearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.summary.toLowerCase().includes(query) ||
        item.source.toLowerCase().includes(query);

      return byTicker && bySearch;
    });
  }, [allNews, selectedTicker, searchText]);

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Новости рынка</h1>
      </div>

      <div className="card">
        <div className="news-toolbar">
          <div className="form-field">
            <label htmlFor="news-search">Поиск по заголовку, описанию или источнику</label>
            <input
              id="news-search"
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Например: газ, ставка, индекс"
            />
          </div>

          <div className="news-filters-row">
            <div className="form-field">
              <label htmlFor="news-ticker">Тикер</label>
              <select
                id="news-ticker"
                value={selectedTicker}
                onChange={(event) => setSelectedTicker(event.target.value)}
              >
                <option value="ВСЕ">Все</option>
                {assets.map((asset) => (
                  <option key={asset.ticker} value={asset.ticker}>
                    {asset.ticker} — {asset.name}
                  </option>
                ))}
              </select>
            </div>

            <button type="button" className="btn-secondary" onClick={loadNews} disabled={isLoading || isRefreshing}>
              Перезагрузить ленту
            </button>
            {isAdmin ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleRefreshFromSource}
                disabled={isLoading || isRefreshing}
              >
                {isRefreshing ? "Обновляем..." : "Обновить из источников"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {isLoading ? <p className="text-muted">Загрузка новостей...</p> : null}
      {error ? <div className="error-message">{error}</div> : null}

      {!isLoading && !error && (
        <div className="news-list">
          {filteredNews.length === 0 ? (
            <div className="card">
              <p className="text-muted">По выбранным фильтрам новостей не найдено.</p>
            </div>
          ) : (
            filteredNews.map((item) => (
              <article key={item.id} className="card news-card">
                <div className="news-meta">
                  <span>
                    <strong>{item.ticker}</strong> — {item.assetName}
                  </span>
                  <span>{new Date(item.publishedAt).toLocaleString("ru-RU")}</span>
                </div>

                <h3>{item.title}</h3>
                <p>{item.summary}</p>

                <div className="news-footer">
                  <span>Источник: {item.source}</span>
                  <span className={`sentiment sentiment-${item.sentiment.toLowerCase()}`}>
                    Тональность: {item.sentiment}
                  </span>
                </div>

                <a className="inline-link" href={item.url} target="_blank" rel="noreferrer">
                  Открыть оригинал новости
                </a>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
