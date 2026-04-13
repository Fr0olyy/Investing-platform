const BASE_URL = 'http://127.0.0.1:8000/api/v1';

export const apiClient = async (endpoint, options = {}) => {
  let token = localStorage.getItem('token');

  // Супер-очистка: удаляем случайные кавычки в начале и конце, если они есть
  if (token) {
    token = token.replace(/^["']|["']$/g, '');
  }

  // Выводим в консоль браузера (F12) процесс для отладки
  console.log(`🚀 Запрос на: ${endpoint}`);
  console.log(`🔑 Прикрепленный токен:`, token ? `${token.substring(0, 15)}...` : 'ОТСУТСТВУЕТ');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Строго защищаем от отправки мусора
  if (token && token !== 'undefined' && token !== 'null' && token !== '[object Object]') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  if (!response.ok) {
    let errMsg = `Ошибка сервера (${response.status})`;
    try {
      const errorData = await response.json();
      console.error(`❌ Ошибка от бэкенда:`, errorData); // Покажет точную причину в консоли
      if (errorData.detail) {
        if (typeof errorData.detail === 'string') errMsg = errorData.detail;
        else if (Array.isArray(errorData.detail)) errMsg = errorData.detail.map(e => `${e.loc[e.loc.length - 1]}: ${e.msg}`).join(' | ');
        else errMsg = JSON.stringify(errorData.detail);
      }
    } catch (e) {
      // Игнорируем ошибки парсинга
    }
    throw new Error(errMsg);
  }

  return response.json();
};