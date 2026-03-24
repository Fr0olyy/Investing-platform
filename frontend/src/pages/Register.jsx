import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '', full_name: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // 1. Отправляем данные на регистрацию
      await apiClient('/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      // 2. Сразу логинимся, чтобы получить токен
      const loginParams = new URLSearchParams();
      loginParams.append('username', formData.email);
      loginParams.append('password', formData.password);

      const loginRes = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginParams
      });
      
      if (!loginRes.ok) throw new Error('Ошибка входа после регистрации');

      const loginData = await loginRes.json();
      
      // 3. Сохраняем токен и идем в систему
      localStorage.setItem('token', loginData.access_token);
      navigate('/');
      
    } catch (err) {
      // Умная обработка ошибок (чиним [object Object])
      let errorMessage = "Произошла ошибка при регистрации";
      
      if (err.message) {
        if (typeof err.message === 'string') {
          errorMessage = err.message;
        } else if (Array.isArray(err.message)) {
          // Если FastAPI ругается на формат данных (422 Error)
          errorMessage = err.message.map(e => e.msg).join(', ');
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Создать аккаунт</h2>
        
        {/* Вывод понятной ошибки красным цветом */}
        {error && <div className="error-message">{error}</div>}
        
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Имя пользователя</label>
            <input 
              type="text" 
              required
              value={formData.full_name}
              onChange={e => setFormData({...formData, full_name: e.target.value})} 
            />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input 
              type="email" 
              required
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})} 
            />
          </div>
          <div className="input-group">
            <label>Пароль</label>
            <input 
              type="password" 
              required
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})} 
            />
          </div>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
        <p className="auth-footer text-center mt-4">
          Уже есть аккаунт? <Link to="/login" style={{color: '#3B82F6'}}>Войти</Link>
        </p>
      </div>
    </div>
  );
}