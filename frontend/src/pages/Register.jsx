import { Link } from 'react-router-dom';

export default function Register() {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Создать аккаунт</h2>
        <p>Присоединяйтесь к нашей инвестиционной платформе</p>
        <form className="auth-form">
          <div className="input-group">
            <label>Имя</label>
            <input type="text" placeholder="Иван Иванов" />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input type="email" placeholder="ivan@example.com" />
          </div>
          <div className="input-group">
            <label>Пароль</label>
            <input type="password" placeholder="••••••••" />
          </div>
          <button type="submit" className="btn-primary">Зарегистрироваться</button>
        </form>
        <p className="auth-footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}