import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Briefcase, TrendingUp, Newspaper, Settings, LogIn, LogOut } from 'lucide-react';

export default function Sidebar() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token'); // Проверяем, вошел ли пользователь

  const handleLogout = (e) => {
    e.stopPropagation(); // Чтобы не кликнулся родительский блок
    localStorage.removeItem('token');
    navigate('/'); // Кидаем на главную
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
          /* Если авторизован - показываем профиль */
          <div className="user-profile-link" onClick={() => navigate('/profile')} style={{cursor: 'pointer'}}>
            <div className="avatar">ИИ</div>
            <div className="user-info">
              <span className="user-name">Мой профиль</span>
              <span className="user-email text-muted" onClick={handleLogout} style={{display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px'}}>
                <LogOut size={12} /> Выйти
              </span>
            </div>
            <Settings size={18} />
          </div>
        ) : (
          /* Если НЕ авторизован - показываем кнопку входа */
          <NavLink to="/login" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', textDecoration: 'none', padding: '12px' }}>
            <LogIn size={20} /> Войти / Регистрация
          </NavLink>
        )}
      </div>
    </aside>
  );
}