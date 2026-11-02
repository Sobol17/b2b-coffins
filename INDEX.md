# Карта проекта

Где находится код и с какого файла начать изменение. Карта отражает структуру
репозитория; правила работы находятся в `AGENTS.md`, контракты в `tech.md`.
Открывай нужный раздел, весь `tech.md` в начале задачи читать не требуется.

| Что ищем                             | Где читать                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Правила агента и Superpowers         | [AGENTS.md](AGENTS.md)                                                                       |
| Нужный раздел ядра                   | [Карта контрактов](AGENTS.md#что-читать-в-ядре)                                              |
| Окружение, запуск, проверки          | [docs/agent-workflow.md](docs/agent-workflow.md)                                             |
| Данные, секреты, git, границы задачи | [docs/guardrails.md](docs/guardrails.md)                                                     |
| Развёртывание и обновление стенда    | [docs/deploy.md](docs/deploy.md)                                                             |
| Инструкции пользователям             | [docs/guides/README.md](docs/guides/README.md), [docs/portal-guide.md](docs/portal-guide.md) |

## Корень репозитория

```text
src/                      приложение SvelteKit: сервер, страницы и компоненты
scripts/                  миграции, сид, CLI, генераторы и исходные фикстуры
tests/                    Vitest, fast-check, Playwright и их хелперы
drizzle/                  сгенерированные миграции SQLite и метаданные Drizzle
static/                   публичные иконки, шрифты, знак, PWA-манифест, robots.txt
ui/                       HTML-макеты экранов портала «Ангел»
docs/                     инструкции, эксплуатация и архив решений
docker/                   Caddyfile и entrypoint.sh контейнера приложения
.github/                  ручной workflow CI и шаблон PR
AGENTS.md                 рабочие инструкции и карта разделов tech.md
INDEX.md                  навигация по проекту
README.md                 краткий вход в проект
tech.md                   контракты приложения
package.json              команды, зависимости, версия pnpm, требование Node.js
pnpm-lock.yaml            зафиксированные зависимости
svelte.config.js          adapter-node, SvelteKit, CSP и настройки Svelte
vite.config.ts            Vite, Tailwind, проекты unit/domain для Vitest
playwright.config.ts      production preview, порт и окружение e2e
drizzle.config.ts         схема и каталог генерации миграций
tsconfig.json             strict-проверки TypeScript
eslint.config.js          ESLint и Svelte
prettier.config.js         форматирование кода
components.json           настройки генератора shadcn-svelte
Dockerfile, compose.yml    сборка и запуск приложения за Caddy
.env.example              пример локального окружения
.env.production.example   пример окружения стенда
```

Команды выполняются из корня. Пути рабочей БД и загруженных файлов задаются
через конфиг; локальные `data/` и результаты проверок игнорируются git.
`.claude/` и `.superpowers/` содержат локальное состояние инструментов.

## Входные точки приложения

| Файл                                                                   | За что отвечает                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [src/hooks.server.ts](src/hooks.server.ts)                             | Запуск воркера, сессия и actor, requestId, ошибки, заголовки безопасности |
| [src/app.d.ts](src/app.d.ts)                                           | Типы `App.Locals`                                                         |
| [src/app.html](src/app.html), [src/app.css](src/app.css)               | HTML-оболочка, подключение PWA, шрифты и токены                           |
| [src/routes/+page.server.ts](src/routes/+page.server.ts)               | Данные лендинга и переход вошедшего пользователя в свой контур            |
| [src/lib/server/config.ts](src/lib/server/config.ts)                   | Разбор окружения через Zod                                                |
| [src/lib/server/db/client.ts](src/lib/server/db/client.ts)             | Подключение SQLite, PRAGMA и типы БД/транзакции                           |
| [src/lib/server/db/schema/index.ts](src/lib/server/db/schema/index.ts) | Реэкспорт схем по доменам                                                 |
| [src/lib/server/auth/policy.ts](src/lib/server/auth/policy.ts)         | Действия и проверка прав                                                  |
| [src/lib/server/core/service.ts](src/lib/server/core/service.ts)       | BaseService и атомарная запись аудита                                     |
| [src/lib/server/core/errors.ts](src/lib/server/core/errors.ts)         | Доменные ошибки, публичный текст и HTTP-статусы                           |
| [src/service-worker.ts](src/service-worker.ts)                         | Push и переход по уведомлению                                             |

## Маршруты: src/routes/

Группы `(portal)`, `(crm)` и `(dev)` не входят в URL. Страница обычно состоит
из `+page.server.ts` и `+page.svelte`, HTTP-эндпоинт из `+server.ts`.

```text
(portal)/+layout.server.ts         guard контура контрагента
(portal)/portal/
  +page.server.ts, +page.svelte    главная портала
  catalog/                        категории, листинг, product/[productId], price-list.xlsx
  cart/                           черновик и отправка заявки
  requests/                       реестр и карточка [id]
  prices/                         цены агентства
  profile/                        профиль, notifications/
  staff/                          сотрудники контрагента
  support/                        обращения: реестр, new/, [id]
  search/                         подсказки поиска
  notifications/read/             отметка прочтения ленты
(crm)/+layout.server.ts            guard контура мастерской
(crm)/crm/
  +page.svelte                    главная роли
  board/, requests/               доска, реестр, новая заявка, карточка, экспорт
  shop/, delivery/                визиты станций и доставка
  catalog/, prices/               модели, варианты, опции, прайсы и скидки
  counterparties/                 контрагенты, индивидуальные цены и долг
  stock/                          позиции, движения и inventories/
  payroll/                        day/[date], staff/, works/, reports/, sheet.xlsx
  reports/                        sales/, counterparties/, stock/, funnel/, lost/, charity/
  finance/                        ручные операции, аналитика, export.xlsx
  support/, notifications/        обращения и личные уведомления
  settings/                       настройки, users/, dicts/, audit/, notifications/
api/
  health/                         здоровье БД и воркера
  files/, files/[id]/              загрузка и раздача файлов
  public/works/[id]/              публичная обложка опубликованной модели
  push/subscription/              подписка устройства
  stream/[topic]/                 SSE
login/, logout/, password/        доступ и смена/восстановление пароля
legal/                            публичные тексты terms, privacy, personal-data, cookies
(dev)/kitchen-sink/                витрина UI-примитивов
+error.svelte                     403, 404 и ошибка с requestId
```

Вкладки CRM и меню: `src/lib/crm/sections.ts`, `src/lib/crm/nav.ts`.
Матрица обхода CRM для проверки доступа: `tests/e2e/crm-surface.ts`.

## Сервер: src/lib/server/

Пути в таблице относительны к `src/lib/server/`. DTO фактически лежат рядом
с сервисами: `dto.ts`, `card.dto.ts`, `draft.dto.ts`, `registry.dto.ts`.

| Область                       | Каталог и основные точки                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Общий каркас                  | `core/`: service, repository, tx, errors, http, list, search                                                              |
| Авторизация                   | `auth/`: auth.service, session.service, policy, guard, password, cookies, rate-limit                                      |
| Схема                         | `db/schema/`: users, counterparties, catalog, pricing, requests, shop, stock, payroll, support, finance, system           |
| Каталог портала               | `catalog/`: catalog.service, catalog.repository, catalog-pricing, list-projector, visibility, price-list-export.service   |
| Контрагент, профиль, люди     | `counterparty/`, `profile/`, `staff/`                                                                                     |
| Цены портала                  | `pricing/`: personal-price, agency-pricing, agency-price.service                                                          |
| Черновик и заявки             | `request/`: draft.service, request-submit.service, request-registry.service, request-card.service, request-repeat.service |
| Статус и эффекты заявки       | `request/request-transition.service.ts`, `request/request-effects.ts`                                                     |
| Заявки CRM                    | `crm-request/`: создание, список, карточка, строки, приоритет, экспорт                                                    |
| Цех                           | `crm-shop/`: shop.service, shop-task.service, shop-flow, shop-dispatch, shop-lines                                        |
| Доставка и раздача склада     | `crm-delivery/`; `stock/`: stock-fill, loading.repository, stock-threshold                                                |
| Склад CRM                     | `crm-stock/`: stock-item, stock-move, inventory, stock-export                                                             |
| Каталог и прайсы CRM          | `crm-catalog/`, `crm-pricing/`; XLSX разбирает `crm-pricing/price-sheet.ts`                                               |
| Контрагенты CRM               | `crm-counterparty/`: карточка, доступ, индивидуальные цены и лента долга                                                  |
| Оплаты                        | `payment/`: payment-mark.service, counterparty-payment.service                                                            |
| Выплаты                       | `crm-payroll/`: дни и работы, состав исполнителей, неделя, закрытие, отчёт, экспорт                                       |
| Отчёты                        | `crm-reports/`: dashboard, sales, counterparty, funnel, lost, stock-turnover, charity, выгрузки                           |
| Финансы                       | `finance/`: finance-entry.service, finance-feed.repository, finance.service, finance-export.service                       |
| Обращения                     | `support/`: support-thread.service, support-posting.service и репозитории                                                 |
| Благотворительность и лендинг | `charity/`: banner, totals, freezer, подтверждения переводов; `landing/`                                                  |
| Уведомления                   | `notifications/`: feed, delivery, settings, matrix, push-template, push-message, push-subscription                        |
| Драйверы доставки             | `notifications/drivers/mail/`, `notifications/drivers/push/`: select, real/fake реализации                                |
| События и SSE                 | `events/`: bus, stream, sse; типы событий в `src/lib/types/events.ts` от корня                                            |
| Очередь                       | `queue/`: queue, worker, runtime, topics, job.repository, handlers/                                                       |
| Файлы                         | `files/`: storage, media.repository, file-access.service                                                                  |
| Сквозные сервисы              | `audit/`, `numbering/`, `settings/`, `dicts/`, `crm-user/`, `search/`, `logger.ts`                                        |

Регистрация джобов: `queue/handlers/index.ts`. Здесь подключены очистка сессий,
пересчёт фонда, fanout и dispatch уведомлений, проверка порога склада.
Payload и ключи идемпотентности: `queue/topics.ts`; запуск и health: `queue/runtime.ts`.

## Чистый домен: src/lib/domain/

| Каталог                         | Что искать                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `request/`                      | state-machine, guards, transition-flow, pricing, discount-rules, amendment, attachments, delivery, loading, registry, attention, item-options |
| `shop/`                         | stations и dispatch                                                                                                                           |
| `stock/`                        | allocation, balance, turnover                                                                                                                 |
| `payment/`                      | mark, debt, allocate                                                                                                                          |
| `payroll/`                      | calc                                                                                                                                          |
| `pricing/`                      | personal-price и agency-price                                                                                                                 |
| `report/`, `finance/`           | period, funnel, margin; summary                                                                                                               |
| `charity/`                      | rate, balance, document                                                                                                                       |
| `notification/`                 | delivery, link, matrix, template                                                                                                              |
| `support/`                      | awaiting, excerpt, recipients                                                                                                                 |
| `files/`, `numbering/`, `time/` | signature; numbering; zone                                                                                                                    |

## UI и общий код: src/lib/

```text
ui/                       примитивы приложения, index.ts, form-toast.ts
  base/                   компоненты shadcn-svelte
crm/                      компоненты разделов CRM, EntityList, ReportTable, SectionTabs
portal/                   компоненты портала: catalog, cart, requests, prices, profile,
                          staff, search, charity, landing
notifications/            колокольчик, лента, настройки, журнал, push в браузере
support/                  общий интерфейс веток и сообщений обращений
legal/                    тексты и компоненты публичных правовых страниц
types/                    общие типы, ActorContext, DTO и события
validation/               Zod-схемы входа по доменам
utils/                    format, money, props, placeholders, list-url, navigation,
                          local-path, cn и hooks/
```

Токены и шрифты: `src/app.css`; исходные макеты: `ui/`.
PWA-ресурсы: `static/manifest.webmanifest`, `static/icons/`, `static/brand/`.
Исходник знака и генератор иконок: `scripts/assets/brand-angel.jpg`, `scripts/icons.ts`.

## Тесты, CLI и эксплуатация

| Где                                        | Что находится                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `tests/domain/`                            | Примеры и property-based тесты чистой логики                                        |
| `tests/unit/`                              | Сервисы, репозитории, контракты, драйверы; `setup.ts` и `helpers/` изолируют SQLite |
| `tests/e2e/`                               | Сценарии ролей, приёмка, безопасность, UI и PWA; global-setup и хелперы             |
| `scripts/fixtures/`                        | Общие JSON-данные сида, каталог и исходные фото                                     |
| `scripts/seed.ts`, `scripts/seed/`         | Начальное наполнение и его модули                                                   |
| `scripts/seed-demo.ts`                     | Демо-заявки и уведомления поверх сида                                               |
| `scripts/admin.ts`, `scripts/admin/`       | CLI пользователей, контрагентов, прайсов, каталога, переходов и синхронизаций       |
| `scripts/migrate.ts`                       | Применение миграций                                                                 |
| `scripts/ui-add.ts`                        | Генератор shadcn-svelte и проверки результата                                       |
| `.github/workflows/ci.yml`                 | Ручной гейт без деплоя                                                              |
| `docker/entrypoint.sh`, `docker/Caddyfile` | Запуск контейнера с миграциями и HTTPS-прокси                                       |
| `docs/superpowers/`, `docs/plans/`         | Архив прежних решений и планов                                                      |

## Хочу изменить…

Пути в этой таблице указаны от корня репозитория. Начинай с нужного контракта
по карте в `AGENTS.md`.

| Задача                      | С чего начать                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Поле заявки                 | `tech.md` §5.6 и нужный тип §8 → `src/lib/server/db/schema/requests.ts` → Zod-схема → сервис → DTO → экран                           |
| Переход статуса             | `src/lib/domain/request/state-machine.ts` → `src/lib/server/auth/policy.ts` → `src/lib/server/request/request-transition.service.ts` |
| Порядок станций или досылку | `src/lib/domain/shop/` → `src/lib/server/crm-shop/shop-flow.ts`, `src/lib/server/crm-shop/shop-dispatch.ts` → `src/lib/crm/shop/`    |
| Расчёт или видимость цены   | `src/lib/domain/request/pricing.ts`, `src/lib/server/pricing/`, `src/lib/server/catalog/catalog-pricing.ts` и DTO домена             |
| Права или изоляцию          | `src/lib/types/roles.ts`, `src/lib/server/auth/policy.ts`, нужный repository; контракт §12, §19                                      |
| Меню или вкладки CRM        | `src/lib/crm/nav.ts`, `src/lib/crm/sections.ts`; оболочка `src/lib/ui/ContourShell.svelte`                                           |
| Общий UI-контрол            | `src/lib/ui/` → `src/routes/(dev)/kitchen-sink/` → использующий его экран                                                            |
| Событие или текст push      | `src/lib/types/events.ts`, `src/lib/server/events/`, `src/lib/server/notifications/`, `scripts/fixtures/notification-templates.json` |
| Джоб                        | `src/lib/server/queue/topics.ts` → обработчик → `src/lib/server/queue/handlers/index.ts`                                             |
| Фильтр реестра              | `src/lib/utils/list-url.ts`, `src/lib/server/core/list.ts`, query-схема и репозиторий раздела                                        |
| Переменную окружения        | `src/lib/server/config.ts`, примеры `.env`, при необходимости `compose.yml`                                                          |
| Правовой текст              | `src/lib/legal/docs.ts`, `src/routes/legal/`, настройки оператора                                                                    |

## Команды

```bash
pnpm dev                   # разработка; окружение в docs/agent-workflow.md
pnpm check                 # Svelte и TypeScript
pnpm lint                  # Prettier и ESLint
pnpm test:unit             # unit/domain без покрытия
pnpm test:e2e              # Playwright на production preview
pnpm build                 # production bundle; запуск: node build
pnpm db:generate           # генерация миграции из схемы
pnpm db:migrate            # применение миграций к выбранной БД
pnpm seed                  # базовый сид
pnpm seed:demo             # демо-данные поверх сида
pnpm admin <command>       # список команд в scripts/admin.ts
pnpm ui:add <component>    # добавление shadcn-примитива
```

Подготовка окружения и полный порядок проверок находятся в `docs/agent-workflow.md`.
При переносе модуля обновляй затронутый путь в этой карте.
