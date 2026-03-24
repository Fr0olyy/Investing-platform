import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Market from './pages/Market';
import News from './pages/News';
import Register from './pages/Register';
import Login from './pages/Login';
import Profile from './pages/Profile';
import AssetSimulator from './pages/AssetSimulator';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Главный макет теперь пускает всех */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="news" element={<News />} />
          {/* Страницы, где реально нужен токен, сами покажут ошибку 401, если юзер не вошел */}
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="market" element={<Market />} />
          <Route path="profile" element={<Profile />} />
          <Route path="asset" element={<AssetSimulator />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;