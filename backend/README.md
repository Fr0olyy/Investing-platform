# Backend инвестиционной платформы

## Что это

Это backend на **FastAPI** для учебной инвестиционной платформы. Он рассчитан на сценарий, где пользователь:

- регистрируется и получает виртуальный брокерский счет;
- видит список активов и актуальные котировки;
- смотрит свечной график и новости по активу;
- покупает и продает инструменты по рыночной цене;
- анализирует состояние портфеля и доходность;
- получает кэшированные прогнозы;
- запускает сценарный макро-анализ через подготовленный ML-контур.

Frontend при этом можно развивать независимо: API уже разделен по доменам и документирован через Swagger.

## Что реализовано

- FastAPI-приложение с модульной структурой `api / services / db / schemas / core`.
- Swagger UI и ReDoc с русскими описаниями endpoint-ов.
- JWT-аутентификация.
- Регистрация с автоматическим созданием портфеля и стартовым балансом `1 000 000 RUB`.
- Каталог активов, последние котировки, свечи и демо-новости.
- Операции `buy/sell` с обновлением денежных средств и позиций.
- Сводка по портфелю: cash, invested value, total value, pnl, allocation.
- Таблицы и endpoints под ML:
  - `ml_model_metadata`
  - `predictions`
  - `scenario_simulations`
- Фоновые задачи:
  - обновление рыночных данных;
  - пересчет placeholder-прогнозов.
- Docker и `docker-compose`.
- Smoke-тест для проверки базового сценария.

## Быстрый старт

### 1. Локальный запуск

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

После запуска:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Healthcheck: `http://localhost:8000/api/v1/system/health`

### 2. Запуск через Docker

```powershell
cd backend
copy .env.example .env
docker compose up --build
```

Поднимутся:

- `db` — PostgreSQL
- `backend` — FastAPI-сервис

## Структура проекта

```text
backend/
  app/
    api/
      dependencies.py
      router.py
      routes/
    core/
      config.py
      security.py
    db/
      database.py
      models.py
      seed.py
    schemas/
    services/
    main.py
  docs/
    API_RU.md
    DEVELOPMENT.md
  ml/
    artifacts/
    datasets/
    experiments/
  tests/
  Dockerfile
  docker-compose.yml
  requirements.txt
```

## Архитектура

### `app/main.py`

Точка входа. Создает FastAPI-приложение, подключает CORS, lifespan и все маршруты.

### `app/api`

HTTP-слой:

- принимает запросы;
- валидирует входные данные через Pydantic;
- отдает ответы;
- держит Swagger/OpenAPI описание.

### `app/services`

Бизнес-логика:

- `auth_service.py` — регистрация, вход, JWT;
- `market_service.py` — активы, котировки, свечи, новости;
- `portfolio_service.py` — расчет состояния портфеля;
- `trade_service.py` — покупка/продажа;
- `ml_service.py` — placeholder-прогнозы и сценарный анализ;
- `bootstrap_service.py` — старт приложения, seed и фоновые джобы.

### `app/db`

- `database.py` — подключение к БД;
- `models.py` — ORM-модели;
- `seed.py` — стартовые активы, котировки, макроиндикаторы, placeholder-модели.

### `app/schemas`

Pydantic-схемы запросов и ответов для API и Swagger.

## Основные бизнес-сценарии

### Регистрация и онбординг

1. Пользователь вызывает `POST /api/v1/auth/register`.
2. Backend создает запись в `users`.
3. Backend автоматически создает запись в `portfolios`.
4. На счет начисляется стартовый баланс.
5. Пользователь получает JWT-токен.

### Покупка актива

1. Пользователь берет актив из `GET /api/v1/assets`.
2. Вызывает `POST /api/v1/trades/buy`.
3. Backend проверяет наличие средств.
4. Создает сделку и обновляет позицию.
5. Деньги списываются с виртуального счета.

### Продажа актива

1. Пользователь вызывает `POST /api/v1/trades/sell`.
2. Backend проверяет количество в открытой позиции.
3. Обновляет или удаляет позицию.
4. Начисляет деньги на счет.

### Сценарный ML-анализ

1. Пользователь отправляет тикер и макрофакторы в `POST /api/v1/ml/scenario`.
2. Backend берет `ml_model_metadata`.
3. Считает сценарную цену через placeholder-логику.
4. Возвращает `predicted_price`, `impact_percent`, `drivers`.

Важно:

- Сейчас здесь **placeholder-реализация**, чтобы вы могли потом вставить свою ML-модель.
- Контракт API и таблицы уже готовы.

## Основные endpoint-ы

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/token`
- `GET /api/v1/auth/me`

### Assets

- `GET /api/v1/assets`
- `GET /api/v1/assets/{ticker}`
- `GET /api/v1/assets/{ticker}/candles`
- `GET /api/v1/assets/{ticker}/news`

### Portfolio

- `GET /api/v1/portfolio/summary`
- `GET /api/v1/portfolio/positions`

### Trading

- `POST /api/v1/trades/buy`
- `POST /api/v1/trades/sell`
- `GET /api/v1/trades/history`

### ML Sandbox

- `GET /api/v1/ml/predictions/{ticker}`
- `GET /api/v1/ml/models/{ticker}`
- `POST /api/v1/ml/scenario`

### System

- `GET /api/v1/system/health`
- `POST /api/v1/system/market/refresh`
- `POST /api/v1/system/ml/refresh`

## База данных

Ключевые таблицы:

- `users`
- `portfolios`
- `positions`
- `trades`
- `assets`
- `quotes`
- `candles`
- `news_articles`
- `macro_indicator_snapshots`
- `ml_model_metadata`
- `predictions`
- `scenario_simulations`

Схема создается автоматически через ORM при старте приложения.

## ML-контур

Сделано специально так, чтобы вы могли потом подключить свою ML-часть без перелома API.

Что уже подготовлено:

- место под артефакты: `ml/artifacts/`
- место под датасеты: `ml/datasets/`
- место под исследования: `ml/experiments/`
- таблица метаданных модели;
- таблица кэшированных прогнозов;
- таблица пользовательских сценарных расчетов;
- endpoint-ы для выдачи прогноза и сценарного расчета.

Что можно заменить позже:

- `app/services/ml_service.py`
- seed-параметры для placeholder-моделей;
- фоновые джобы переобучения.

## Swagger и документация API

Документация уже доступна в приложении:

- `/docs` — Swagger UI
- `/redoc` — ReDoc

Что добавлено для команды:

- русские описания разделов;
- русские описания endpoint-ов;
- поясняющие summary;
- примеры тел запросов для ключевых методов.

## Разработка

Подробная документация по разработке лежит здесь:

- [API_RU.md](./docs/API_RU.md)
- [DEVELOPMENT.md](./docs/DEVELOPMENT.md)

## Тестирование

Smoke-тест:

```powershell
.venv\Scripts\python -m pytest tests\test_api_smoke.py
```

Проверяется:

- подъем приложения;
- healthcheck;
- регистрация;
- получение токена;
- чтение профиля;
- чтение списка активов.

