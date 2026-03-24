import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await apiClient('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      // Умный поиск токена (FastAPI может вернуть его по-разному)
      const actualToken = data.access_token || data.token;
      
      if (!actualToken) {
        throw new Error("Сервер не прислал токен! Ответ: " + JSON.stringify(data));
      }

      localStorage.setItem('token', actualToken);
      navigate('/'); 
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
      <div className="auth-card" style={{backgroundColor: '#1E293B', padding: '40px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'}}>
        <h2 style={{textAlign: 'center', marginBottom: '24px', marginTop: 0}}>Вход в платформу</h2>
        
        {error && (
          <div style={{backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #EF4444', textAlign: 'center'}}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{marginBottom: '20px'}}>
            <label style={{color: '#94A3B8', fontSize: '0.9rem'}}>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: 'white', boxSizing: 'border-box', outline: 'none'}} />
          </div>
          <div style={{marginBottom: '20px'}}>
            <label style={{color: '#94A3B8', fontSize: '0.9rem'}}>Пароль</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={{width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: 'white', boxSizing: 'border-box', outline: 'none'}} />
          </div>
          <button type="submit" disabled={isLoading} style={{backgroundColor: '#3B82F6', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', width: '100%', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem'}}>
            {isLoading ? 'Загрузка...' : 'Войти'}
          </button>
        </form>
        <p style={{textAlign: 'center', marginTop: '20px', color: '#94A3B8'}}>
          Нет аккаунта? <Link to="/register" style={{color: '#3B82F6', textDecoration: 'none'}}>Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  );
}