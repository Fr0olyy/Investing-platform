import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Profile() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Запрашиваем реального пользователя у бэкенда
    apiClient('/auth/me')
      .then(data => setUser(data))
      .catch(() => {
        // Если токен сломан - выкидываем на форму входа
        localStorage.removeItem('token');
        navigate('/login');
      });
  }, [navigate]);

  if (!user) return <div className="page-content">Загрузка данных профиля...</div>;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Настройки профиля</h1>
      </div>

      <div style={{backgroundColor: '#1E293B', padding: '30px', borderRadius: '12px', maxWidth: '400px', marginTop: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'}}>
        
        <div style={{marginBottom: '20px'}}>
          <label style={{color: '#94A3B8', fontSize: '0.9rem'}}>Ваш Email</label>
          <input 
            type="email" 
            value={user.email} 
            disabled 
            style={{width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: '#94A3B8', boxSizing: 'border-box'}} 
          />
        </div>
        
        <div style={{marginBottom: '20px'}}>
          <label style={{color: '#94A3B8', fontSize: '0.9rem'}}>ID пользователя</label>
          <input 
            type="text" 
            value={user.id || 'Неизвестно'} 
            disabled 
            style={{width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: '#94A3B8', boxSizing: 'border-box'}} 
          />
        </div>

        <button 
          onClick={() => {
            localStorage.removeItem('token');
            navigate('/');
          }}
          style={{backgroundColor: '#EF4444', color: 'white', padding: '12px', borderRadius: '8px', border: 'none', width: '100%', cursor: 'pointer', fontWeight: 'bold'}}
        >
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}