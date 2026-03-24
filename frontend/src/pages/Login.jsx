import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      // Запрос к FastAPI для получения токена
      const params = new URLSearchParams();
      params.append('username', email);
      params.append('password', password);

      const res = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      if (!res.ok) throw new Error('Неверный email или пароль');

      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      navigate('/'); // Успех -> идем на главный экран
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Вход в платформу</h2>
        {error && <p className="text-red mb-4" style={{textAlign: 'center'}}>{error}</p>}
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Пароль</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary full-width mt-4">Войти</button>
        </form>
        <p className="text-center text-muted mt-4">
          Нет аккаунта? <Link to="/register" style={{color: '#3B82F6'}}>Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  );
}