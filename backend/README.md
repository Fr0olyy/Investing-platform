# Backend и ML для инвестиционной платформы

## Что это за проект

Это backend на **FastAPI** для учебной инвестиционной платформы, где пользователь работает не с реальными деньгами, а с виртуальным брокерским счетом, но при этом видит **настоящие рыночные данные** и может использовать **ML-модуль сценарного макро-анализа**.

Сервис решает сразу несколько задач:

- регистрация и аутентификация инвестора;
- автоматическое создание виртуального портфеля;
- получение реальных котировок компаний;
- хранение истории свечей;
- покупка и продажа активов;
- расчет PnL и структуры портфеля;
- обучение ML-моделей на исторических рядах;
- генерация прогнозов и сценарных расчетов.

## Что уже реализовано

### Backend

- FastAPI-приложение с маршрутизацией по доменам.
- Swagger UI и ReDoc.
- JWT Bearer authentication.
- SQLAlchemy ORM и автоматическое создание схемы БД.
- Каталог активов MOEX.
- Реальные котировки и исторические свечи.
- Портфель, позиции, сделки, история операций.
- Healthcheck и системные endpoint-ы для синхронизации рынка и ML.

### ML

- Сбор реальных данных по активу и макрофакторам.
- Построение обучающего датасета.
- Обучение линейной регрессии для каждого тикера.
- Сохранение артефактов модели через `joblib`.
- Сохранение метрик качества и коэффициентов модели в БД.
- Кэширование прогнозов.
- Сценарный расчет по пользовательским макрофакторам.
- Driver analysis на основе линейных вкладов факторов.

## Реальные API, которые используются

### 1. MOEX ISS

Используется для российских акций и индексов.

Текущее состояние актива:

```text
https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/{TICKER}.json
```

История актива:

```text
https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/{TICKER}.json
```

Текущее состояние индекса:

```text
https://iss.moex.com/iss/engines/stock/markets/index/securities/{SECID}.json
```

История индекса:

```text
https://iss.moex.com/iss/history/engines/stock/markets/index/securities/{SECID}.json
```

### 2. Банк России

Используется для курса USD/RUB и ключевой ставки.

Текущий курс:

```text
https://www.cbr.ru/scripts/XML_daily.asp
```

Исторический курс:

```text
https://www.cbr.ru/scripts/XML_dynamic.asp
```

История ключевой ставки:

```text
https://www.cbr.ru/eng/hd_base/KeyRate/
```

### 3. FRED

Используется для открытого ряда Brent:

```text
https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU
```

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
    integrations/
      market_data_client.py
    schemas/
    services/
      auth_service.py
      market_service.py
      portfolio_service.py
      trade_service.py
      ml_service.py
      bootstrap_service.py
    main.py
  docs/
    API_RU.md
    DEVELOPMENT.md
    TEAM_GUIDE_RU.md
    BACKEND_RU.md
    ML_RU.md
    MARKET_DATA_RU.md
  ml/
    artifacts/
    datasets/
    experiments/
  tests/
  Dockerfile
  docker-compose.yml
  requirements.txt
```

## Быстрый старт

### Локально

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

### Через Docker

```powershell
cd backend
copy .env.example .env
docker compose up --build
```

## Документация API

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

Swagger русифицирован:

- русские названия разделов;
- русские `summary` и `description`;
- примеры тел запросов для ключевых методов;
- описания полей в Pydantic-схемах.

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
- `POST /api/v1/system/ml/train`
- `POST /api/v1/system/ml/refresh`

## Как работает backend

### При старте приложения

1. Инициализируется база данных.
2. Создаются seed-активы, если база пустая.
3. Выполняется синхронизация рынка:
   - текущие котировки;
   - дневные свечи;
   - макроиндикаторы.
4. Если включено `ML_AUTO_TRAIN_ON_STARTUP=true`, происходит обучение моделей.
5. Формируется кэш прогнозов.

### При покупке актива

1. Пользователь отправляет тикер и количество.
2. Backend берет последнюю рыночную цену.
3. Проверяет достаточность виртуальных средств.
4. Создает сделку.
5. Обновляет cash balance и позицию.

### При сценарном анализе

1. Пользователь задает новые значения макрофакторов.
2. Backend берет текущую модель по тикеру.
3. В модель подается:
   - текущая цена актива как `PREV_CLOSE`;
   - пользовательские макрофакторы.
4. Возвращается сценарная цена, impact и drivers.

## Как работает ML

Модель обучается отдельно для каждого тикера.

### Входные признаки

- `PREV_CLOSE`
- `BRENT`
- `USD_RUB`
- `IMOEX`
- `KEY_RATE`
- `RGBI`

### Целевая переменная

- цена закрытия актива на следующий торговый день.

### Алгоритм

- `LinearRegression` из `scikit-learn`.

### Почему выбран именно этот базовый вариант

- легко объяснить команде;
- быстро обучается;
- хорошо подходит как baseline;
- позволяет интерпретировать влияние факторов через коэффициенты;
- не требует сложной инфраструктуры.

### Что сохраняется после обучения

- сериализованный `.joblib`-артефакт;
- метрики `r2`, `mae`, `rmse`;
- коэффициенты модели;
- baseline-средние признаков;
- обучающее окно;
- датасет в `ml/datasets/`.

## Тестирование

Smoke-тест:

```powershell
.venv\Scripts\python -m pytest tests\test_api_smoke.py
```

Проверка синтаксиса:

```powershell
.venv\Scripts\python -m compileall app
```

## Подробная документация для команды

- [TEAM_GUIDE_RU.md](./docs/TEAM_GUIDE_RU.md)
- [BACKEND_RU.md](./docs/BACKEND_RU.md)
- [ML_RU.md](./docs/ML_RU.md)
- [MARKET_DATA_RU.md](./docs/MARKET_DATA_RU.md)
- [API_RU.md](./docs/API_RU.md)
- [DEVELOPMENT.md](./docs/DEVELOPMENT.md)

## Что еще важно

- Новости пока остаются demo-заглушкой.
- Котировки и макрофакторы уже реальные.
- Если внешний API недоступен, backend старается не падать и использует fallback-данные, чтобы приложение оставалось рабочим.
