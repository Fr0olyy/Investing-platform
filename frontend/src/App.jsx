import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Market from './pages/Market';
import News from './pages/News';
import Profile from './pages/Profile';
import Login from './pages/Login';       // Импортируем Вход
import Register from './pages/Register'; // Импортируем Регистрацию
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Страницы авторизации (открываются на весь экран) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Основное приложение (с боковым меню) */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="market" element={<Market />} />
          <Route path="news" element={<News />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;