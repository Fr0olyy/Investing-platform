import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // 1. Создаем пользователя
      await apiClient('/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      // 2. Сразу логинимся
      const data = await apiClient('/auth/login', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      
      console.log("📦 ПОЛНЫЙ ОТВЕТ СЕРВЕРА ПРИ РЕГИСТРАЦИИ:", data);

      // Супер-экстрактор
      let token = null;
      if (typeof data === 'string') {
          token = data;
      } else {
          const possibleToken = data?.access_token || data?.token || data?.jwt;
          if (typeof possibleToken === 'string') {
              token = possibleToken;
          } else if (typeof possibleToken === 'object' && possibleToken !== null) {
              token = possibleToken.access_token || possibleToken.token;
          }
      }

      if (!token || typeof token !== 'string') {
        throw new Error("Токен имеет неизвестный формат! Откройте консоль (F12).");
      }

      localStorage.setItem('token', token);
      navigate('/'); 
      
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%'}}>
      <div style={{backgroundColor: '#1E293B', padding: '40px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'}}>
        <h2 style={{textAlign: 'center', marginBottom: '24px', marginTop: 0}}>Создать аккаунт</h2>
        
        {error && (
          <div style={{backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #EF4444', textAlign: 'center', wordBreak: 'break-all'}}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom: '20px'}}>
            <label style={{color: '#94A3B8', fontSize: '0.9rem'}}>Email</label>
            <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: 'white', boxSizing: 'border-box', outline: 'none'}} />
          </div>
          <div style={{marginBottom: '20px'}}>
            <label style={{color: '#94A3B8', fontSize: '0.9rem'}}>Пароль (минимум 8 символов)</label>
            <input type="password" required minLength="8" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} style={{width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: 'white', boxSizing: 'border-box', outline: 'none'}} />
          </div>
          <button type="submit" disabled={isLoading} style={{backgroundColor: '#3B82F6', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', width: '100%', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem'}}>
            {isLoading ? 'Загрузка...' : 'Зарегистрироваться'}
          </button>
        </form>
        <p style={{textAlign: 'center', marginTop: '20px', color: '#94A3B8'}}>
          Уже есть аккаунт? <Link to="/login" style={{color: '#3B82F6', textDecoration: 'none'}}>Войти</Link>
        </p>
      </div>
    </div>
  );
}