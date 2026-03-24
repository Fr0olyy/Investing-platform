export default function Profile() {
  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Настройки профиля</h1>
      </div>

      <div className="profile-form-card">
        <form>
          <div className="input-group">
            <label>Имя пользователя</label>
            <input type="text" defaultValue="Иван И." />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input type="email" defaultValue="ivan@example.com" disabled />
          </div>
          <div className="input-group">
            <label>Новый пароль</label>
            <input type="password" placeholder="Введите новый пароль" />
          </div>
          
          <div className="mt-4 mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" id="notifications" defaultChecked style={{ width: '18px', height: '18px' }} /> 
            <label htmlFor="notifications" style={{ cursor: 'pointer' }}>Получать email уведомления</label>
          </div>
          
          <button type="button" className="btn-primary full-width mt-4">Сохранить изменения</button>
        </form>
      </div>
    </div>
  );
}