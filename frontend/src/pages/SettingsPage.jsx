import { useState } from "react";
import { api } from "../api/client";

export default function SettingsPage() {
  const [isLightTheme, setIsLightTheme] = useState(localStorage.getItem("theme") === "light");

  const [serviceResult, setServiceResult] = useState("");
  const [serviceLoading, setServiceLoading] = useState("");

  const [oauthEmail, setOauthEmail] = useState("");
  const [oauthPassword, setOauthPassword] = useState("");
  const [oauthToken, setOauthToken] = useState("");
  const [oauthError, setOauthError] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);

  const toggleTheme = () => {
    const nextLight = !isLightTheme;
    setIsLightTheme(nextLight);

    if (nextLight) {
      localStorage.setItem("theme", "light");
      document.body.classList.add("light-theme");
    } else {
      localStorage.setItem("theme", "dark");
      document.body.classList.remove("light-theme");
    }
  };

  const runServiceAction = async (actionKey, action) => {
    setServiceLoading(actionKey);
    setServiceResult("");

    try {
      const response = await action();
      if (response?.message) {
        setServiceResult(`${response.message} (изменено записей: ${response.affected_records ?? "-"})`);
      } else if (response?.status) {
        setServiceResult(`Сервис: ${response.status}, БД: ${response.database}, среда: ${response.environment}`);
      } else {
        setServiceResult("Операция выполнена.");
      }
    } catch (error) {
      setServiceResult(`Ошибка: ${error.message}`);
    } finally {
      setServiceLoading("");
    }
  };

  const handleOAuthToken = async (event) => {
    event.preventDefault();
    setOauthLoading(true);
    setOauthError("");
    setOauthToken("");

    try {
      const payload = await api.auth.token({ email: oauthEmail, password: oauthPassword });
      setOauthToken(payload.access_token || "");
    } catch (error) {
      setOauthError(error.message);
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Настройки</h1>
      </div>

      <div className="card settings-card">
        <div className="settings-row">
          <div>
            <h3>Тема оформления</h3>
            <p className="text-muted">Выберите удобный режим отображения интерфейса.</p>
          </div>
          <button type="button" className="btn-primary" onClick={toggleTheme}>
            {isLightTheme ? "Включить тёмную тему" : "Включить светлую тему"}
          </button>
        </div>
      </div>

      <div className="card settings-card">
        <h3>Сервисные endpoint-ы backend</h3>
        <p className="text-muted">Здесь можно вызвать системные операции напрямую из фронтенда.</p>

        <div className="quick-actions mt-4">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => runServiceAction("health", () => api.system.health())}
            disabled={Boolean(serviceLoading)}
          >
            {serviceLoading === "health" ? "Проверяем..." : "Проверить health"}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => runServiceAction("market", () => api.system.refreshMarket())}
            disabled={Boolean(serviceLoading)}
          >
            {serviceLoading === "market" ? "Обновляем..." : "Обновить рынок"}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => runServiceAction("train", () => api.system.trainModels())}
            disabled={Boolean(serviceLoading)}
          >
            {serviceLoading === "train" ? "Обучаем..." : "Обучить ML-модели"}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => runServiceAction("refresh", () => api.system.refreshPredictions())}
            disabled={Boolean(serviceLoading)}
          >
            {serviceLoading === "refresh" ? "Пересчитываем..." : "Обновить ML-прогнозы"}
          </button>
        </div>

        {serviceResult && <p className="text-muted mt-4">{serviceResult}</p>}
      </div>

      <div className="card settings-card">
        <h3>OAuth2 token endpoint</h3>
        <p className="text-muted">Вызов `POST /api/v1/auth/token` (формат как в Swagger).</p>

        <form onSubmit={handleOAuthToken} className="mt-4">
          <div className="form-field">
            <label htmlFor="oauth-email">Email</label>
            <input
              id="oauth-email"
              type="email"
              required
              value={oauthEmail}
              onChange={(event) => setOauthEmail(event.target.value)}
            />
          </div>

          <div className="form-field mt-4">
            <label htmlFor="oauth-password">Пароль</label>
            <input
              id="oauth-password"
              type="password"
              required
              minLength={8}
              value={oauthPassword}
              onChange={(event) => setOauthPassword(event.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary mt-4" disabled={oauthLoading}>
            {oauthLoading ? "Получаем token..." : "Получить token"}
          </button>
        </form>

        {oauthError && <div className="error-message mt-4">{oauthError}</div>}
        {oauthToken && (
          <div className="card mt-4">
            <p className="text-muted">Полученный `access_token`:</p>
            <p style={{ wordBreak: "break-all", margin: 0 }}>{oauthToken}</p>
          </div>
        )}
      </div>
    </div>
  );
}
