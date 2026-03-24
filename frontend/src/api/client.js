const BASE_URL = 'http://localhost:8000/api/v1';

export const apiClient = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    let errMsg = 'Ошибка запроса к серверу';
    
    // Расшифровка ошибок FastAPI (убираем [object Object])
    if (errorData.detail) {
      if (typeof errorData.detail === 'string') {
        errMsg = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        // Если это ошибка валидации Pydantic (422)
        errMsg = errorData.detail.map(err => `${err.loc[err.loc.length - 1]}: ${err.msg}`).join(' | ');
      }
    }
    throw new Error(errMsg);
  }

  return response.json();
};