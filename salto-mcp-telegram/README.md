# Salto Telegram MCP Server

"Salto Telegram MCP" — это MCP-сервер на Node.js, предоставляющий ChatGPT инструменты для работы с Telegram Bot API: отправку сообщений и документов, чтение апдейтов и проверку статуса сервера. Сервер реализует протокол Model Context Protocol (MCP) через HTTP+SSE и готов к расширению CRM/Sheets.

## Возможности

- `telegram.send_message` — отправка HTML/Markdown сообщений в Telegram.
- `telegram.send_document` — загрузка файлов по URL или base64 и отправка в чат.
- `telegram.get_updates` — чтение свежих апдейтов бота по запросу.
- `telegram.get_chat` — разрешение `@username` → `chat_id`.
- `system.health` — проверка живости сервера.
- Журналирование через `pino`, таймауты/ретраи к Telegram и локальный rate-limit 25 rps.
- Ограничение чатов и авторизация через Bearer-токен.

## Структура проекта

```
salto-mcp-telegram/
  src/
    index.ts                 # запуск HTTP/MCP сервера
    mcp/                     # регистрация инструментов и схемы
    services/                # Telegram Bot API + обработка файлов
    utils/                   # окружение, логгер, rate-limit, ошибки
    http/                    # /healthz и /sse конечные точки
  test/                      # vitest + nock
  Dockerfile                 # multi-stage сборка
  docker-compose.yml         # сервис mcp + ngrok
  Makefile                   # npm обёртки
  postman_collection.json    # примеры запросов
```

## Требования

- Node.js 20 LTS
- npm 9+
- Активный Telegram Bot Token
- (опционально) [ngrok](https://ngrok.com/) для публикации локального сервера

## Быстрый старт (локально)

1. **Создайте бота через @BotFather** и сохраните `TELEGRAM_BOT_TOKEN`.
2. **Подготовьте окружение**:

   ```bash
   cd salto-mcp-telegram
   cp .env.example .env
   # отредактируйте .env и пропишите TELEGRAM_BOT_TOKEN
   npm ci
   npm run build
   npm run start
   ```

3. **Проверьте здоровье сервера**:

   ```bash
   curl http://localhost:8787/healthz
   # => {"ok":true,"uptimeSec":1,"version":"0.2.0"}
   ```

4. **Опубликуйте сервер через ngrok**:

   ```bash
   ngrok http 8787
   # запомните HTTPS адрес вида https://xxxxx.ngrok.io
   ```

5. **Подключите MCP в ChatGPT**:
   - Режим разработчика → «Новый коннектор (MCP)»
   - Имя: `Salto Telegram MCP`
   - URL MCP-сервера: `https://xxxxx.ngrok.io/sse`
   - Аутентификация: «Нет» или `API Key (Bearer)` (если установлен `AUTH_BEARER`)
   - Отметьте «Я доверяю этому приложению» и сохраните.

6. **Протестируйте в чате**:

   ```
   Отправь в Telegram сообщение "Тест от MCP" в чат @mychannel.
   ```

   Ассистент выполнит `telegram.get_chat`, затем `telegram.send_message`.

### Проверка JSON-RPC через curl

1. Откройте SSE-подключение и дождитесь события `endpoint`:

   ```bash
   curl -N -H "Accept: text/event-stream" "http://localhost:8787/sse?sessionId=cli-1"
   # event: endpoint
   # data: /messages?sessionId=<SERVER_SESSION_ID>
   ```

2. В отдельном терминале отправьте JSON-RPC запрос к полученному endpoint:

   ```bash
   curl -i -X POST "http://localhost:8787/messages?sessionId=<SERVER_SESSION_ID>" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"system.health","arguments":{}}}'
   ```

3. В первом окне появится `event: message` с ответом инструмента.

### Полезные команды

| Команда | Назначение |
| ------- | ---------- |
| `npm run dev` | Запуск с автоматической перезагрузкой (tsx) |
| `npm run lint` | ESLint + Prettier проверка |
| `npm run test` | Vitest с моками Telegram Bot API |
| `npm run build` | Компиляция TypeScript в `dist/` |
| `npm run start` | Запуск собранного сервера |
| `make dev` | Те же команды через Makefile |

## Переменные окружения

| Переменная | Описание |
| ---------- | -------- |
| `TELEGRAM_BOT_TOKEN` | Токен бота из @BotFather (обязательно). |
| `TELEGRAM_BOT_USERNAME` | Имя бота с `@` — используется в подсказках об ошибках. |
| `ALLOWED_CHAT_IDS` | Запятая-разделённый список разрешённых чатов. Пусто → без ограничений. |
| `PORT` | Порт HTTP сервера (по умолчанию 8787). |
| `AUTH_BEARER` | (Опция) токен для авторизации клиента через заголовок `Authorization: Bearer ...`. |
| `ALLOW_LEGACY_BODY` | Разрешить упрощённый формат `{tool, arguments}` для диагностики (true по умолчанию в dev/test). |
| `LOG_LEVEL` | Уровень логов pino (`info` по умолчанию, `debug` в dev). |

## Описание инструментов MCP

| Инструмент | Назначение | Схема ввода |
| ---------- | ---------- | ----------- |
| `telegram.send_message` | Отправка текстового сообщения. | `chat_id` (string), `text` (string, min 1), `parse_mode` (`Markdown`, `MarkdownV2`, `HTML`, default `HTML`), `disable_web_page_preview` (bool, default `true`), `disable_notification` (bool, default `false`). |
| `telegram.send_document` | Отправка документа/файла. | `chat_id` (string), `file` (string: URL или data URI), `filename` (string, default `document.pdf`), `caption` (string, optional). |
| `telegram.get_updates` | Получение апдейтов через polling. | `offset` (int), `timeout` (int, default `0`), `limit` (int, default `50`, max `100`). |
| `telegram.get_chat` | Информация о чате. | `chat_id_or_username` (string). |
| `system.health` | Проверка живости. | `{}`. |

Все входные данные валидируются через `zod`. При ошибках возвращается читаемое сообщение и HTTP статус.

## Диагностика

- `GET /sessions` — список активных MCP-сессий (доступен в dev/test окружении).
- `GET /tools` — быстрый список зарегистрированных инструментов.

## Ограничения и безопасность

- Таймаут обращения к Telegram — 15 секунд, 2 повторные попытки при сетевых/5xx ошибках.
- Rate-limit 25 запросов в секунду на уровне приложения.
- Ограничение на размер документа — 15 МБ.
- Список разрешённых чатов (`ALLOWED_CHAT_IDS`) блокирует все остальные запросы.
- Санитайз HTML/MarkdownV2 для защиты от небезопасного контента.

## Обработка ошибок Telegram

- Все ошибки возвращаются в формате `{ ok: false, status, code, message }`.
- `TELEGRAM_CHAT_NOT_FOUND` подсказывает, как подключить бота к чату и рекомендует использовать числовой `chat_id`.
- `TELEGRAM_FORBIDDEN` сообщает, что бот не может написать пользователю, и напоминает нажать **Start** в диалоге с ботом.
- Ошибка превышения размера документа имеет код `TELEGRAM_DOCUMENT_TOO_LARGE`.

## Docker

1. Соберите и поднимите сервис:

   ```bash
   docker compose up --build
   ```

2. Файл `docker-compose.yml` запускает два сервиса:
   - `mcp` — MCP сервер на порту 8787.
   - `ngrok` — пробрасывает туннель (ожидает `NGROK_AUTHTOKEN` в окружении).

   После запуска откройте `http://localhost:4040` и возьмите публичный URL для настройки коннектора.

## Postman коллекция

В `postman_collection.json` находятся примеры:

- `GET /healthz`
- `GET /sse` + `POST /messages` (c заготовкой MCP JSON-RPC запроса)

Импортируйте коллекцию и подставьте собственный `sessionId` при работе с SSE.

## Тестирование

```bash
npm run lint
npm run test
```

Тесты используют `vitest` и `nock`, мокируя Telegram Bot API и проверяя цепочку `get_chat → send_message`.

## Расширение (TODO)

- [ ] Добавить инструменты `crm.bitrix24.create_deal` и `sheets.google.append_row`.
- [ ] Поддержать `telegram.send_media_group` для галерей.
- [ ] Локальное хранилище `alias → chat_id` в `db.json`.

## Примеры промптов для ChatGPT

- «Отправь в Telegram сообщение “Расклад по КП: 50 000 ₽ в месяц” в чат @salto_marketing.»
- «Пришли PDF “audit.pdf” в чат -100123456789.»
- «Проверь новые апдейты и выведи последние 3 сообщения.»

## Лицензия

MIT.
