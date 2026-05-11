import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const payload = await api.auth.me();
        if (!cancelled) setUser(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    api.auth.logout();
    navigate("/login", { replace: true });
  };

  if (isLoading) {
    return <div className="page-content">Загрузка профиля...</div>;
  }

  if (error) {
    return <div className="page-content"><div className="error-message">{error}</div></div>;
  }

  if (!user) {
    return <div className="page-content">Профиль недоступен.</div>;
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Профиль</h1>
      </div>

      <div className="card profile-card">
        <div className="profile-row"><span>ID</span><strong>{user.id}</strong></div>
        <div className="profile-row"><span>Email</span><strong>{user.email}</strong></div>
        <div className="profile-row"><span>Роль</span><strong>{user.role}</strong></div>
        <div className="profile-row"><span>Статус</span><strong>{user.is_active ? "Активен" : "Неактивен"}</strong></div>
        <div className="profile-row"><span>Создан</span><strong>{new Date(user.created_at).toLocaleString("ru-RU")}</strong></div>

        <button type="button" className="btn-danger" onClick={handleLogout}>
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}
