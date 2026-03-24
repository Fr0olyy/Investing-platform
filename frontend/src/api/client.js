const BASE_URL = 'http://localhost:8000/api/v1';

export const apiClient = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Строгая проверка: прикрепляем токен только если он реально существует
  if (token && token !== 'undefined' && token !== 'null') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    let errMsg = errorData.detail || 'Ошибка сервера';
    
    if (Array.isArray(errorData.detail)) {
      errMsg = errorData.detail.map(err => `${err.loc[err.loc.length - 1]}: ${err.msg}`).join(' | ');
    }
    throw new Error(errMsg);
  }

  return response.json();
};