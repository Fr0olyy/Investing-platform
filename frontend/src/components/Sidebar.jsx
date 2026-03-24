import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Briefcase, TrendingUp, Newspaper, Settings } from 'lucide-react';

export default function Sidebar() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token'); // Проверяем авторизацию

  const handleLogout = (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    navigate('/');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h3>Брокерский счет</h3>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <LayoutDashboard size={20} /> Обзор
        </NavLink>
        <NavLink to="/portfolio" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <Briefcase size={20} /> Портфель
        </NavLink>
        <NavLink to="/market" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <TrendingUp size={20} /> Рынок
        </NavLink>
        <NavLink to="/news" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <Newspaper size={20} /> Новости
        </NavLink>
      </nav>
      
      <div className="sidebar-footer">
        {token ? (
          <NavLink to="/profile" className="user-profile-link">
            <div className="avatar">ИИ</div>
            <div className="user-info">
              <span className="user-name">Мой профиль</span>
              <span className="user-email" onClick={handleLogout} style={{cursor: 'pointer', color: '#EF4444'}}>Выйти</span>
            </div>
            <Settings size={18} />
          </NavLink>
        ) : (
          <NavLink to="/login" className="btn-sidebar-login">
            Войти / Регистрация
          </NavLink>
        )}
      </div>
    </aside>
  );
}