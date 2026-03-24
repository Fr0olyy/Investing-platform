# API документация на русском

## Общая информация

Базовый префикс API:

```text
/api/v1
```

Авторизация:

- используется JWT Bearer token;
- токен можно получить через `POST /api/v1/auth/login`;
- для Swagger можно использовать `POST /api/v1/auth/token`.

## 1. Authentication

### `POST /api/v1/auth/register`

Назначение:

- регистрация нового инвестора;
- автоматическое создание виртуального счета;
- возврат JWT-токена.

Пример запроса:

```json
{
  "email": "investor@example.com",
  "password": "securepass123"
}
```

### `POST /api/v1/auth/login`

Назначение:

- вход по email и паролю;
- возврат JWT-токена.

### `GET /api/v1/auth/me`

Назначение:

- вернуть текущего пользователя;
- требует `Authorization: Bearer <token>`.

## 2. Assets

### `GET /api/v1/assets`

Возвращает:

- список активов;
- текущую цену;
- процент изменения;
- последний кэшированный прогноз.

### `GET /api/v1/assets/{ticker}`

Возвращает:

- карточку актива;
- последнюю котировку;
- текущий прогноз;
- признак готовности ML-контейнера.

### `GET /api/v1/assets/{ticker}/candles`

Query params:

- `days` — количество дней истории.

### `GET /api/v1/assets/{ticker}/news`

Query params:

- `limit` — количество новостей.

## 3. Portfolio

### `GET /api/v1/portfolio/summary`

Возвращает:

- остаток денежных средств;
- стоимость инвестированной части;
- полную стоимость портфеля;
- текущий PnL;
- распределение по активам.

### `GET /api/v1/portfolio/positions`

Возвращает открытые позиции пользователя.

## 4. Trading

### `POST /api/v1/trades/buy`

Пример:

```json
{
  "ticker": "GAZP",
  "quantity": 5
}
```

### `POST /api/v1/trades/sell`

Пример:

```json
{
  "ticker": "GAZP",
  "quantity": 2
}
```

### `GET /api/v1/trades/history`

Возвращает историю сделок пользователя.

## 5. ML Sandbox

### `GET /api/v1/ml/predictions/{ticker}`

Возвращает:

- текущую цену;
- predicted price;
- impact percent;
- confidence score;
- drivers.

### `GET /api/v1/ml/models/{ticker}`

Возвращает:

- название модели;
- версию;
- статус;
- список признаков;
- метрики;
- путь до артефактов.

### `POST /api/v1/ml/scenario`

Назначение:

- сценарный расчет цены при пользовательских макрофакторах.

Пример:

```json
{
  "ticker": "GAZP",
  "factors": {
    "BRENT": 88.5,
    "USD_RUB": 97.2,
    "IMOEX": 3300,
    "KEY_RATE": 15.0,
    "RGBI": 109.3
  }
}
```

## 6. System

### `GET /api/v1/system/health`

Проверка доступности backend и БД.

### `POST /api/v1/system/market/refresh`

Ручное обновление рынка для разработки.

### `POST /api/v1/system/ml/refresh`

Ручной пересчет кэшированных прогнозов.
