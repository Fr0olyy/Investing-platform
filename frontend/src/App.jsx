import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Market from './pages/Market';
import News from './pages/News';
import Register from './pages/Register';
import Profile from './pages/Profile';
import AssetSimulator from './pages/AssetSimulator'; // 1. Импортируем новую страницу
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Страница регистрации идет без сайдбара */}
        <Route path="/register" element={<Register />} />
        
        {/* Все остальные страницы обернуты в Layout (с сайдбаром) */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="market" element={<Market />} />
          <Route path="news" element={<News />} />
          <Route path="profile" element={<Profile />} />
          <Route path="asset" element={<AssetSimulator />} /> {/* 2. Добавляем путь для симулятора */}
        </Route>
      </Routes>
    </Router>
  );
}

export default App;