import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const navigate = useNavigate();

  // Состояние для переключения темы
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    // При загрузке страницы проверяем, какая тема была сохранена ранее
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      setIsLightMode(true);
    }

    // Загружаем данные пользователя
    apiClient('/auth/me')
      .then(data => {
        setUser(data);
        setIsLoading(false);
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login');
      });
  }, [navigate]);

  const handleSave = (e) => {
    e.preventDefault();
    setSaveMessage('Настройки успешно сохранены!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Функция переключения темы
  const toggleTheme = () => {
    if (isLightMode) {
      document.body.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    }
    setIsLightMode(!isLightMode);
  };

  if (isLoading) return <div className="page-content" style={{textAlign: 'center', marginTop: '50px'}}>Загрузка данных профиля...</div>;

  return (
    // Добавили flex-центрирование всей страницы
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', paddingBottom: '40px' }}>
      
      {/* Шапка: Заголовок и кнопка темы */}
      <div style={{ width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Настройки</h1>
        <button 
          onClick={toggleTheme}
          style={{
            backgroundColor: isLightMode ? '#E5E7EB' : '#334155',
            color: isLightMode ? '#111827' : '#F8FAFC',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: '0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {isLightMode ? '🌙 Тёмная' : '☀️ Светлая'}
        </button>
      </div>

      {/* Карточка профиля */}
      <div style={{
        backgroundColor: 'var(--bg-card, #1E293B)', 
        padding: '30px', 
        borderRadius: '12px', 
        width: '100%', 
        maxWidth: '500px', 
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        boxSizing: 'border-box'
      }}>
        
        <form onSubmit={handleSave}>
          <div style={{marginBottom: '20px'}}>
            <label style={{color: 'var(--text-muted, #94A3B8)', fontSize: '0.9rem', display: 'block', marginBottom: '8px'}}>ID пользователя в системе</label>
            <input 
              type="text" value={user.id || 'Неизвестно'} disabled 
              style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: 'var(--bg-main, #0F172A)', color: 'var(--text-muted, #94A3B8)', boxSizing: 'border-box'}} 
            />
          </div>
          
          <div style={{marginBottom: '20px'}}>
            <label style={{color: 'var(--text-muted, #94A3B8)', fontSize: '0.9rem', display: 'block', marginBottom: '8px'}}>Ваш Email</label>
            <input 
              type="email" value={user.email} disabled 
              style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: 'var(--bg-main, #0F172A)', color: 'var(--text-muted, #94A3B8)', boxSizing: 'border-box'}} 
            />
          </div>

          <div style={{marginBottom: '20px'}}>
            <label style={{color: 'var(--text-muted, #94A3B8)', fontSize: '0.9rem', display: 'block', marginBottom: '8px'}}>Новый пароль</label>
            <input 
              type="password" placeholder="Введите новый пароль"
              style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: 'var(--bg-main, #0F172A)', color: 'var(--text-main, white)', boxSizing: 'border-box', outline: 'none'}} 
            />
          </div>

          <div style={{marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px'}}>
            <input type="checkbox" id="notify" defaultChecked style={{width: '18px', height: '18px', accentColor: '#3B82F6', cursor: 'pointer'}} />
            <label htmlFor="notify" style={{color: 'var(--text-main, white)', cursor: 'pointer'}}>Получать email уведомления о сделках</label>
          </div>

          {saveMessage && (
            <div style={{backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '12px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', border: '1px solid #10B981'}}>
              {saveMessage}
            </div>
          )}

          <button type="submit" style={{backgroundColor: '#3B82F6', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', width: '100%', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: '0.2s'}}>
            Сохранить изменения
          </button>
        </form>

        {/* Разделитель с классом для изменения цвета в светлой теме */}
        <div className="profile-divider" style={{marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #334155'}}>
          <button 
            type="button" 
            onClick={() => { localStorage.removeItem('token'); navigate('/login'); }}
            style={{backgroundColor: 'transparent', color: '#EF4444', padding: '14px', borderRadius: '8px', border: '1px solid #EF4444', width: '100%', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: '0.2s'}}
          >
            Выйти из аккаунта
          </button>
        </div>

      </div>
    </div>
  );
}