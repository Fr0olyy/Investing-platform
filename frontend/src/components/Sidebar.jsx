import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Briefcase, TrendingUp, Newspaper, User, Settings } from 'lucide-react';

export default function Sidebar() {
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
        <NavLink to="/profile" className="user-profile-link">
          <div className="avatar">ИИ</div>
          <div className="user-info">
            <span className="user-name">Иван И.</span>
            <span className="user-email">ivan@example.com</span>
          </div>
          <Settings size={18} />
        </NavLink>
      </div>
    </aside>
  );
}