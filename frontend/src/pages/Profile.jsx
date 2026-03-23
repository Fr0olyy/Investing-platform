export default function Profile() {
  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Настройки профиля</h1>
      </div>

      <div className="card profile-form-card">
        <form className="auth-form">
          <div className="input-group">
            <label>Имя пользователя</label>
            <input type="text" defaultValue="Иван И." />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input type="email" defaultValue="ivan@example.com" />
          </div>
          <div className="input-group">
            <label>Новый пароль</label>
            <input type="password" placeholder="Введите новый пароль" />
          </div>
          <div className="toggle-group">
            <label>
              <input type="checkbox" defaultChecked /> Получать email уведомления
            </label>
          </div>
          <button type="button" className="btn-primary mt-4">Сохранить изменения</button>
        </form>
      </div>
    </div>
  );
}