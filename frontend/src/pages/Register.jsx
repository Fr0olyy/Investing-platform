import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

const EMAIL_MAX_LENGTH = 254;
const LOCAL_PART_MIN_LENGTH = 3;
const BLOCKED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "localhost",
  "local",
  "test.com",
  "random.ru",
  "mailinator.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
]);
const WEAK_LOCAL_PARTS = new Set(["test", "user", "admin", "qwe", "asd", "random", "email", "mail"]);

const validateRegistrationEmail = (rawEmail) => {
  const normalizedEmail = rawEmail.trim().toLowerCase();
  const [localPart, domain, extra] = normalizedEmail.split("@");

  if (normalizedEmail.length > EMAIL_MAX_LENGTH) {
    return "Email слишком длинный. Максимум 254 символа.";
  }

  if (!localPart || !domain || extra !== undefined || !domain.includes(".")) {
    return "Введите реальный email с доменом, например name@gmail.com.";
  }

  if (localPart.length < LOCAL_PART_MIN_LENGTH || localPart.length > 64) {
    return "Часть email до @ должна быть от 3 до 64 символов.";
  }

  if (/^\d+$/.test(localPart) || WEAK_LOCAL_PARTS.has(localPart)) {
    return "Введите более реальный email, а не тестовый адрес.";
  }

  if (BLOCKED_EMAIL_DOMAINS.has(domain)) {
    return "Этот домен похож на тестовый. Укажите реальную почту.";
  }

  const domainLabels = domain.split(".");
  const topLevelDomain = domainLabels.at(-1) || "";
  if (domainLabels.some((label) => label.length < 1) || topLevelDomain.length < 2 || /^\d+$/.test(topLevelDomain)) {
    return "Домен email указан некорректно.";
  }

  return "";
};

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const emailError = validateRegistrationEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setIsLoading(true);

    try {
      await api.auth.register({ email, password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Регистрация</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              required
              maxLength={EMAIL_MAX_LENGTH}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="register-password">Пароль (минимум 8 символов)</label>
            <input
              id="register-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? "Создаем аккаунт..." : "Зарегистрироваться"}
          </button>
        </form>

        <p className="auth-switch">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
