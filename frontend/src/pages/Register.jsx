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
      // 1. Регистрация
      await apiClient('/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      // 2. Сразу логинимся
      const loginData = await apiClient('/auth/login', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      
      const actualToken = loginData.access_token || loginData.token;
      if (!actualToken) {
        throw new Error("Сервер не прислал токен! Ответ: " + JSON.stringify(loginData));
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
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%'}}>
      <div style={{backgroundColor: '#1E293B', padding: '40px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'}}>
        <h2 style={{textAlign: 'center', marginBottom: '24px', marginTop: 0}}>Создать аккаунт</h2>
        
        {error && (
          <div style={{backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #EF4444', textAlign: 'center'}}>
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