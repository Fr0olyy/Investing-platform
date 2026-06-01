import {
  Briefcase,
  Gauge,
  LineChart,
  LogOut,
  Newspaper,
  Settings,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, authStorage } from "../api/client";

export default function Sidebar() {
  const navigate = useNavigate();
  const token = authStorage.getToken();
  const [user, setUser] = useState(() => (authStorage.getToken() ? authStorage.getUser() : null));

  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;

    api.auth.me()
      .then((payload) => {
        if (!cancelled) setUser(payload);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleLogout = () => {
    api.auth.logout();
    setUser(null);
    navigate("/login");
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h3>Инвест-платформа</h3>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          <Gauge size={18} /> Обзор
        </NavLink>
        <NavLink to="/portfolio" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          <Briefcase size={18} /> Портфель
        </NavLink>
        <NavLink to="/market" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          <TrendingUp size={18} /> Рынок
        </NavLink>
        <NavLink to="/news" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          <Newspaper size={18} /> Новости
        </NavLink>
        <NavLink to="/ml" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          <LineChart size={18} /> Прогноз
        </NavLink>
        {user?.role === "admin" && (
          <NavLink to="/admin" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            <ShieldCheck size={18} /> Админ
          </NavLink>
        )}
      </nav>

      <div className="sidebar-footer">
        {token ? (
          <div className="user-profile-link">
            <div className="avatar">{user?.role === "admin" ? "AD" : "IN"}</div>
            <div className="user-info">
              <NavLink to="/profile" className="user-name-link">
                Профиль
              </NavLink>
              <button type="button" className="logout-link" onClick={handleLogout}>
                <LogOut size={14} /> Выйти
              </button>
            </div>
            <NavLink
              to="/settings"
              className={({ isActive }) => (isActive ? "settings-link active" : "settings-link")}
              title="Настройки"
              aria-label="Настройки"
            >
              <Settings size={16} />
            </NavLink>
          </div>
        ) : (
          <NavLink to="/login" className="btn-sidebar-login">
            Вход / Регистрация
          </NavLink>
        )}
      </div>
    </aside>
  );
}
