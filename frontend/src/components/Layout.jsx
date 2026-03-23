import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import '../index.css'; // Подключаем стили

export default function Layout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Outlet /> {/* Здесь будут рендериться страницы */}
      </main>
    </div>
  );
}