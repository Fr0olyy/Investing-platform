const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
const TOKEN_KEY = "token";
const NETWORK_RETRY_COUNT = 2;
const NETWORK_RETRY_DELAY_MS = 450;

const sanitizeToken = (token) => {
  if (!token || typeof token !== "string") return null;
  const cleaned = token.replace(/^["']|["']$/g, "").trim();
  if (!cleaned || cleaned === "undefined" || cleaned === "null" || cleaned === "[object Object]") {
    return null;
  }
  return cleaned;
};

const parseResponseBody = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text ? { detail: text } : null;
};

const extractErrorMessage = (status, payload) => {
  const fallback = `Ошибка сервера (${status})`;
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  if (status === 403) return "Недостаточно прав. Это действие доступно только администратору.";
  if (status === 401) return "Нужно войти в аккаунт.";
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail.map((item) => `${item.loc?.[item.loc.length - 1] || "field"}: ${item.msg}`).join(" | ");
  }
  if (payload.message) return payload.message;
  return fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildBackendUnavailableMessage = (url) =>
  `Нет ответа от backend (${url}). Проверьте, что backend запущен и доступен на порту 8000.`;

const fetchWithRetry = async (url, options) => {
  let lastError = null;

  for (let attempt = 0; attempt <= NETWORK_RETRY_COUNT; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      lastError = error;
      if (attempt < NETWORK_RETRY_COUNT) {
        await sleep(NETWORK_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(buildBackendUnavailableMessage(url), { cause: lastError });
};

const extractTokenFromAuthPayload = (payload) => {
  return sanitizeToken(payload?.token?.access_token || payload?.access_token || payload?.token || payload?.jwt || null);
};

export const authStorage = {
  getToken() {
    return sanitizeToken(localStorage.getItem(TOKEN_KEY));
  },
  setToken(token) {
    const normalized = sanitizeToken(token);
    if (normalized) localStorage.setItem(TOKEN_KEY, normalized);
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

export const apiClient = async (endpoint, options = {}) => {
  const {
    method = "GET",
    body,
    headers: customHeaders = {},
    auth = true,
    signal,
  } = options;

  const headers = {
    Accept: "application/json",
    ...customHeaders,
  };

  const token = authStorage.getToken();
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetchWithRetry(url, {
    method,
    headers,
    body: body !== undefined && !isFormData && typeof body !== "string" ? JSON.stringify(body) : body,
    signal,
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    if (response.status === 401) {
      authStorage.clearToken();
    }
    throw new Error(extractErrorMessage(response.status, payload));
  }

  return payload;
};

export const api = {
  auth: {
    async register(credentials) {
      const payload = await apiClient("/auth/register", { method: "POST", body: credentials, auth: false });
      const token = extractTokenFromAuthPayload(payload);
      if (!token) throw new Error("Не удалось получить токен после регистрации.");
      authStorage.setToken(token);
      return payload.user;
    },
    async login(credentials) {
      const payload = await apiClient("/auth/login", { method: "POST", body: credentials, auth: false });
      const token = extractTokenFromAuthPayload(payload);
      if (!token) throw new Error("Не удалось получить токен после входа.");
      authStorage.setToken(token);
      return payload.user;
    },
    me() {
      return apiClient("/auth/me");
    },
    token(credentials) {
      const params = new URLSearchParams();
      params.set("username", credentials.email);
      params.set("password", credentials.password);
      return apiClient("/auth/token", {
        method: "POST",
        body: params.toString(),
        auth: false,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
    },
    logout() {
      authStorage.clearToken();
    },
  },
  assets: {
    list() {
      return apiClient("/assets", { auth: false });
    },
    details(ticker) {
      return apiClient(`/assets/${ticker}`, { auth: false });
    },
    candles(ticker, days = 30) {
      return apiClient(`/assets/${ticker}/candles?days=${days}`, { auth: false });
    },
    news(ticker, limit = 5) {
      return apiClient(`/assets/${ticker}/news?limit=${limit}`, { auth: false });
    },
  },
  portfolio: {
    summary() {
      return apiClient("/portfolio/summary");
    },
    positions() {
      return apiClient("/portfolio/positions");
    },
  },
  trades: {
    buy(payload) {
      return apiClient("/trades/buy", { method: "POST", body: payload });
    },
    sell(payload) {
      return apiClient("/trades/sell", { method: "POST", body: payload });
    },
    history() {
      return apiClient("/trades/history");
    },
  },
  ml: {
    prediction(ticker) {
      return apiClient(`/ml/predictions/${ticker}`, { auth: false });
    },
    model(ticker) {
      return apiClient(`/ml/models/${ticker}`, { auth: false });
    },
    scenario(payload) {
      return apiClient("/ml/scenario", { method: "POST", body: payload, auth: false });
    },
  },
  system: {
    health() {
      return apiClient("/system/health", { auth: false });
    },
    refreshMarket() {
      return apiClient("/system/market/refresh", { method: "POST" });
    },
    trainModels() {
      return apiClient("/system/ml/train", { method: "POST" });
    },
    refreshPredictions() {
      return apiClient("/system/ml/refresh", { method: "POST" });
    },
    refreshNews({ ticker, perAssetLimit } = {}) {
      const params = new URLSearchParams();
      if (ticker) params.set("ticker", ticker);
      if (Number.isFinite(perAssetLimit)) params.set("per_asset_limit", String(perAssetLimit));
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return apiClient(`/system/news/refresh${suffix}`, { method: "POST" });
    },
  },
};
