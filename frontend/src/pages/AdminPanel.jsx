import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU");
};

const overviewCards = [
  ["users_total", "Пользователи"],
  ["active_users", "Активные"],
  ["assets_total", "Активы"],
  ["trades_total", "Сделки"],
  ["positions_total", "Позиции"],
  ["predictions_total", "Прогнозы"],
];

export default function AdminPanel() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionKey, setActionKey] = useState("");

  const adminsCount = useMemo(() => users.filter((user) => user.role === "admin").length, [users]);

  const loadAdminData = async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    setError("");
    try {
      const [overviewPayload, usersPayload] = await Promise.all([
        api.admin.overview(),
        api.admin.users(),
      ]);
      setOverview(overviewPayload);
      setUsers(Array.isArray(usersPayload) ? usersPayload : []);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const runAction = async (key, label, action) => {
    setActionKey(key);
    setError("");
    setMessage("");
    try {
      const result = await action();
      setMessage(`${label}: ${result.message || "готово"} (${result.affected_records ?? 0})`);
      await loadAdminData({ silent: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionKey("");
    }
  };

  const updateUser = async (user, payload) => {
    setError("");
    setMessage("");
    try {
      const updated = await api.admin.updateUser(user.id, payload);
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`Пользователь ${updated.email} обновлён.`);
      await loadAdminData({ silent: true });
    } catch (err) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return <div className="page-content">Загрузка админ-панели...</div>;
  }

  return (
    <div className="page-content admin-page">
      <div className="page-header hero-header animated-surface">
        <div>
          <p className="eyebrow">Control center</p>
          <h1>Админ-панель</h1>
          <p className="text-muted">
            Управление пользователями, обновлением рынка, новостей и прогнозов из одного места.
          </p>
        </div>
        <button type="button" className="btn-secondary glow-button" onClick={() => loadAdminData()} disabled={isLoading}>
          Обновить панель
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="stats-grid">
        {overviewCards.map(([key, label]) => (
          <div className="card stat-card premium-card" key={key}>
            <p className="text-muted">{label}</p>
            <h2>{overview?.[key] ?? "—"}</h2>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="section-heading-row">
            <div>
              <h3>Состояние платформы</h3>
              <p className="text-muted">Фоновые задачи: {overview?.background_jobs ? "включены" : "выключены"}</p>
            </div>
            <span className="market-pill neutral">Администраторов: {adminsCount}</span>
          </div>
          <div className="admin-health-grid">
            <div>
              <span>Последняя котировка</span>
              <strong>{formatDateTime(overview?.latest_quote_at)}</strong>
            </div>
            <div>
              <span>Новости</span>
              <strong>{overview?.news_total ?? 0}</strong>
            </div>
            <div>
              <span>Активные пользователи</span>
              <strong>{overview?.active_users ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="card admin-actions-card">
          <h3>Быстрые действия</h3>
          <p className="text-muted">Операции запускаются от имени администратора.</p>
          <div className="admin-action-grid">
            <button
              type="button"
              className="btn-secondary"
              disabled={Boolean(actionKey)}
              onClick={() => runAction("market", "Рынок", api.system.refreshMarket)}
            >
              {actionKey === "market" ? "Обновляем..." : "Обновить рынок"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={Boolean(actionKey)}
              onClick={() => runAction("news", "Новости", () => api.system.refreshNews({ perAssetLimit: 10 }))}
            >
              {actionKey === "news" ? "Обновляем..." : "Обновить новости"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={Boolean(actionKey)}
              onClick={() => runAction("predictions", "Прогнозы", api.system.refreshPredictions)}
            >
              {actionKey === "predictions" ? "Считаем..." : "Пересчитать прогнозы"}
            </button>
            <button
              type="button"
              className="btn-primary glow-button"
              disabled={Boolean(actionKey)}
              onClick={() => runAction("train", "Обучение", api.system.trainModels)}
            >
              {actionKey === "train" ? "Обучаем..." : "Обучить модели"}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-heading-row">
          <div>
            <h3>Пользователи</h3>
            <p className="text-muted">Роли и доступы можно менять без перезапуска сервиса.</p>
          </div>
        </div>

        <table className="market-table mt-4">
          <thead>
            <tr>
              <th>Email</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Активность</th>
              <th>Создан</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>
                  <span className={user.role === "admin" ? "market-pill up" : "market-pill neutral"}>
                    {user.role === "admin" ? "Админ" : "Инвестор"}
                  </span>
                </td>
                <td>{user.is_active ? "Активен" : "Выключен"}</td>
                <td>{user.positions_count} поз. · {user.trades_count} сдел.</td>
                <td>{formatDateTime(user.created_at)}</td>
                <td>
                  <div className="admin-user-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => updateUser(user, { role: user.role === "admin" ? "investor" : "admin" })}
                    >
                      {user.role === "admin" ? "Снять админа" : "Сделать админом"}
                    </button>
                    <button
                      type="button"
                      className={user.is_active ? "btn-danger" : "btn-secondary"}
                      onClick={() => updateUser(user, { is_active: !user.is_active })}
                    >
                      {user.is_active ? "Отключить" : "Включить"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
