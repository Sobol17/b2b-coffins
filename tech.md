# tech.md — ядро проекта

**Проект:** B2B-портал + CRM для столярной мастерской (производство гробов)
**Версия ядра:** v2.1
**Дата:** 29.10.2026
**Статус:** каркас и этап 1 (портал) закрыты; в этапе 2 (CRM) влиты C1–C8, C10, C12, C13, C15, C17, C18; C14 закрывается частями, C19 (станции цеха) в работе, C16 не начат (§14)
**Владелец файла:** Sobol17 (тимлид и единственный разработчик)
**Источник требований:** `TZ_B2B_CRM_stolyarka_v06.md`

Файл описывает систему такой, какая она сейчас. Правка контракта меняет свой раздел и поднимает версию в шапке. Истории решений здесь нет: она в `git log -p tech.md` и в дизайнах `docs/superpowers/specs/`. Что убрано из системы насовсем, перечислено в §21.

## 1. Что строим

Мастерская из 7–8 человек принимает заявки от ритуальных агентств по телефону и в мессенджерах. Система переносит этот поток в одно приложение: контрагент оформляет заявку сам из каталога со своими ценами, заявка проходит шесть статусов до оплаты, склад и еженедельные выплаты бригаде считаются по тем же данным.

Ядро домена — одна сквозная сущность **Заявка** (`request`). Отдельных «заказов», «производственных заданий» и «отгрузок» нет. Прогресс работы — это статус заявки.

Два логических контура в одном приложении:

- `/portal` — контрагенты: каталог, оформление заявки, статусы, свои цены для показа клиенту, баннер пожертвований, обращения;
- `/crm` — сотрудники мастерской: доска заявок, цех, доставка, склад, выплаты, отчёты, финансы, обращения.

## 2. Стадии и данные

| Стадия | Слайсы | Состояние |
|---|---|---|
| Каркас | K1–K5, K7 | закрыт |
| Этап 1. Портал | P1–P14 | закрыт 19.09.2026 |
| Этап 2. CRM | C1–C8, C10, C12–C18 | открыты C14 и C16 |

Домен, схема БД и машина состояний общие для обоих контуров. Этапы делят интерфейсы, а не доменный слой.

Данные, которые не заводят через интерфейс, приходят сидом и CLI:

1. `scripts/seed.ts` наполняет роли, справочники, каталог, контрагентов, прайсы и пользователей из `scripts/fixtures/*.json`. Повторный запуск безопасен.
2. `pnpm seed:demo` (`scripts/seed-demo.ts`, логика в `scripts/seed/demo.ts`) поверх сида заводит демо-заявки контрагента «Ритуал-Сервис» во всех статусах и ленту уведомлений. Заявки идут через сервисы приложения от имени учёток сида, поэтому номер, история, события и движения появляются как в приложении. Метка `externalNumber` вида `ДЕМО-n` делает повтор пустым. В e2e команда не участвует.
3. `pnpm admin <command>` (`scripts/admin.ts`) работает на стенде без UI. Каждая команда идемпотентна:

| Команда | Что делает |
|---|---|
| `user:create` | учётная запись |
| `counterparty:create` | контрагент с первым `cp_admin`, лимит из `counterparty.staff_limit_default` |
| `price:import` | позиции прайс-листа из файла, тем же разбором, что импорт в CRM |
| `catalog:import --file <json> [--hide-others]` | модели и варианты по артикулу одной транзакцией. Себестоимость и скрытие из CRM повтор не трогает, `--hide-others` снимает с публикации модели вне файла. Поле `photos` модели: пути к JPEG, PNG, WebP рядом с файлом, первое фото обложка; фото получает только модель без фото, битый файл останавливает импорт до транзакции. Прайс мастерской лежит в `scripts/fixtures/catalog-angel.json` |
| `request:transition` | переход заявки через машину состояний |
| `payroll:backfill-crews` | исполнителями старых записей работ становится весь состав их дня |
| `notifications:sync` | вставляет из фикстур недостающие правила и шаблоны, правку руководителя не трогает |
| `roles:sync` | роли из `scripts/fixtures/roles.json` |
| `stock:cost-backfill` | переносит себестоимость варианта в его складскую позицию, если у позиции 0 |
| `shop:sync` | прогон досылки цеха §20.4 и автоматических шагов `in_work -> ready`: так заявки, принятые до станций, получают задания |

---

## 3. Стек

| Слой | Технология | Комментарий |
|---|---|---|
| Fullstack-фреймворк | SvelteKit 2 + Svelte 5 (руны) | SSR, form actions, API-роуты, `adapter-node` |
| Язык | TypeScript 5, `strict: true` | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` включены |
| ORM и миграции | Drizzle ORM + drizzle-kit | Миграции только генерацией из схемы |
| БД | SQLite через `better-sqlite3` | WAL, `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL` |
| Валидация | Zod | Одна схема на форму и на API, переиспользуется клиентом и сервером |
| Стили | Tailwind CSS 4 | Токены дизайна в CSS-переменных |
| UI-база | shadcn-svelte (bits-ui) | Единственная UI-база на оба контура: CRM целиком и базовые компоненты портала. Примитивы кастомизируются, свои с нуля не пишем. Среда компонентов ограничена списком: `bits-ui`, `@internationalized/date`, `tailwind-variants`, `clsx`, `tailwind-merge`, `@lucide/svelte`, `tw-animate-css`. Не тянем `vaul-svelte`, `svelte-sonner`, `mode-watcher`, `@tanstack/table-core`, `formsnap`, `sveltekit-superforms`, `layerchart`: `Drawer` собирается на `sheet`, `Toast` на рунном сторе §9, `DataTable` на серверной пагинации §4.3, формы на form actions и Zod §15.3 |
| Фоновые задачи | Внутрипроцессный воркер + таблица `job_queue` | Транзакционный outbox, ретраи, идемпотентность |
| Реальное время | SSE (`/api/stream/:topic`) | Счётчик пожертвований, доска заявок |
| Импорт таблиц | `exceljs` (XLSX), `papaparse` (CSV) | Выгрузки XLSX, импорт прайса командой CLI |
| Пароли | `@node-rs/argon2` (argon2id) | Политика сложности в `lib/server/auth/policy.ts` |
| Почта | `nodemailer` за интерфейсом `MailDriver` | Фейк с первого дня. Только письма доступа: временный пароль и восстановление пароля; о событиях почта не сообщает |
| Web Push | `web-push`, VAPID | Драйвер `PushDriver` за тем же интерфейсом, реальный и фейк. Провайдер один, внешний сервис пушей не подключаем |
| Логи | `pino` в stdout | Структурные, с `requestId`, без ПДн |
| Тесты | Vitest, Playwright, fast-check | Юнит, e2e по ролям, property-based на домене |
| Линт | ESLint + Prettier + `svelte-check` | Гейт перед мёрджем (§11.1) |
| PWA | `manifest.webmanifest` + push-only service worker (`src/service-worker.ts`) | Установка на домашний экран и приём Web Push. Кеширования и офлайн-режима нет, отдельный PWA-плагин не тянем |
| Запуск | `adapter-node`, `node build` | Локально командой `pnpm build && node build`, на стенде в Docker-образе |
| Поставка | Docker, Docker Compose, Caddy 2 | Один VPS: контейнер `app` и контейнер `caddy` с автоматическим TLS. CD нет |

Запрещено без правки этого файла: менять БД, добавлять внешние сервисы, тянуть UI-библиотеку помимо shadcn-svelte, вводить клиентский стейт-менеджер.

---

## 4. Архитектура

### 4.1 Слои

```
route (+page.server.ts, +server.ts)   тонкий: парсит вход, зовёт сервис, мапит DTO
  -> policy                            проверка прав на действие
  -> service                           бизнес-правила, транзакции, публикация событий
  -> repository                        доступ к данным, никаких правил
  -> drizzle
```

Правила слоёв:

- Роут не содержит бизнес-логики и не обращается к Drizzle напрямую.
- Сервис не знает про `RequestEvent`, `cookies` и `FormData`. На вход получает валидированный DTO и `ActorContext`.
- Репозиторий не решает, можно ли действие. Он только читает и пишет.
- Транзакцию открывает сервис. Репозиторий принимает опциональный `tx` и работает в нём.
- События публикуются внутри той же транзакции через outbox (`job_queue`), не через прямой вызов почты.

### 4.2 ООП: базовые классы

Домен пишем классами, а не россыпью функций. Наследование от базовых типов даёт единый контракт и убирает копипасту.

```ts
// src/lib/server/core/repository.ts
export abstract class BaseRepository<TTable extends SQLiteTable> {
  protected constructor(protected readonly table: TTable) {}
  protected db(tx?: Tx): Db { return tx ?? database; }
  // Shared list pipeline: filters -> sort -> server pagination.
  protected async paginate<T>(q: PaginateQuery<T>, tx?: Tx): Promise<Page<T>> { /* ... */ }
}

// src/lib/server/core/service.ts
export abstract class BaseService {
  protected constructor(protected readonly ctx: ActorContext) {}
  protected assert(allowed: boolean, action: string): void {
    if (!allowed) throw new ForbiddenError(action);
  }
}

// src/lib/server/core/errors.ts
export class AppError extends Error { constructor(readonly code: ErrorCode, msg: string, readonly meta?: object) { super(msg); } }
export class ValidationError extends AppError {}
export class ForbiddenError extends AppError {}
export class NotFoundError extends AppError {}
export class ConflictError extends AppError {}   // invalid status transition, closed payroll week
```

`hooks.server.ts` ловит `AppError` и мапит код в HTTP-статус: `ValidationError` 422, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, остальное 500 без текста наружу.

### 4.3 DRY: где переиспользуем

| Что | Где живёт | Правило |
|---|---|---|
| Пайплайн реестра (фильтры, сортировка, серверная пагинация, экспорт XLSX) | `lib/server/core/list.ts` + `lib/ui/DataTable.svelte` | Новый реестр не пишет свой SQL-пагинатор |
| Сортировка и фильтры реестра из адреса | `listQueryOf`, `filtersOf` в `lib/utils/list-url.ts` | Роут не разбирает `searchParams` реестра сам |
| Zod-схемы | `lib/validation/<домен>.ts` | Одна схема на форму, API и тест |
| Машина состояний заявки | `lib/domain/request/state-machine.ts` | Единственный источник правды о переходах для сервера и UI |
| Проекции DTO по ролям | `lib/server/dto/<домен>.ts` | Цены вырезаются здесь, не в компоненте |
| Форматирование денег, дат, номеров | `lib/utils/format.ts` | Никакого `toFixed(2)` по месту |
| Аудит | `lib/server/audit/audit.service.ts` | Пишется декоратором сервиса, а не вручную в каждом методе |

### 4.4 Структура папок

```
src/
  hooks.server.ts                 сессия, actor, requestId, обработка AppError, security headers
  service-worker.ts               обработчики push и notificationclick, без кеширования
  app.d.ts                        App.Locals: actor, requestId
  lib/
    domain/                       чистая логика без БД и IO, покрыта property-based тестами
      request/state-machine.ts    статусы, переходы, guard-ы
      request/pricing.ts          суммы позиций, скидки, округление
      charity/rate.ts             расчёт отчисления
      payroll/calc.ts             доля дня, недельный свод, границы периода
      stock/balance.ts            свёртка движений в остаток
    server/                       только сервер, в браузер не попадает
      core/                       repository.ts, service.ts, errors.ts, list.ts, tx.ts
      db/
        client.ts                 подключение, PRAGMA
        schema/                   *.ts по доменам, реэкспорт в index.ts
      auth/                       session.service.ts, password.ts, policy.ts, rate-limit.ts
      <домен>/                    <домен>.repository.ts, <домен>.service.ts, dto.ts
      queue/                      queue.ts, worker.ts, handlers/*.ts
      events/                     bus.ts, catalog.ts
      notifications/              service.ts, drivers/{mail,push}/{real,fake}.ts, templates/
      numbering/                  numbering.ts, numbering.repository.ts
      files/                      storage.ts, validate.ts, image.ts
      audit/                      audit.service.ts
      landing/                    landing.service.ts, landing.repository.ts: лендинг гостя
      payment/                    отметки оплаты, сторно, оплата общего долга
      crm-<раздел>/               серверная часть раздела CRM: request, shop, delivery, stock, payroll,
                                  counterparty (counterparty-price.*: индивидуальные цены), catalog,
                                  pricing (price-sheet.ts: разбор XLSX прайса), reports, user
      dicts/, settings/, finance/, support/, charity/
      config.ts                   единый разбор env через Zod
    types/                        общие TypeScript-типы (см. §8)
    ui/                           примитивы (см. §9)
    crm/                          экраны CRM по разделам; nav.ts (меню и плитки), sections.ts (вкладки),
                                  labels.ts (подписи ролей), EntityList, SectionTabs
    portal/                       экраны и витринные компоненты портала
    notifications/                лента, переключатели и журнал, общие для обоих контуров
    validation/                   Zod-схемы
    utils/                        format.ts, money.ts, dates.ts, props.ts
    legal/                        docs.ts (список документов), LegalDocument, OperatorDetails, CookieNotice
  routes/
    +page.server.ts               гость видит лендинг (§18.5), вошедший уходит в свой контур
    (portal)/                     контур контрагента, адреса /portal/*
      +layout.server.ts           guard: только роли портала
      portal/
        catalog/ , cart/ , requests/ , prices/ , profile/ , staff/ , charity/
        search/                   GET +server.ts: подсказки поиска в шапке
        notifications/read/       POST +server.ts: отметка прочтения ленты
    (crm)/                        контур мастерской, адреса /crm/*
      +layout.server.ts           guard: только роли CRM
      crm/
        board/ , requests/ , catalog/ , counterparties/ , stock/ , payroll/ , settings/
        reports/                  дашборд; sales/, counterparties/, stock/, funnel/, lost/, charity/, у каждого export.xlsx
        shop/                     станции цеха: списки визитов, визит [id]
        delivery/                 доставка: погрузка по строкам, «Доставлено», заявки в работе для плана
        notifications/            личная лента, переключатели и журнал; read/ отмечает прочтение
        support/                  обращения контрагентов: реестр и переписка
        finance/                  финансы руководителя: форма, аналитика, лента; export.xlsx
    api/
      stream/[topic]/+server.ts   SSE
      files/[id]/+server.ts       раздача файлов с проверкой прав
      public/works/[id]/+server.ts  обложка опубликованной модели гостю
      health/+server.ts
    login/ , logout/ , password/
    legal/                        публичные документы: terms/, personal-data/, privacy/, cookies/
    +error.svelte                 страница ошибки: 403, 404, сбой с requestId
static/
  manifest.webmanifest            имя, иконки, display, shortcuts
  icons/                          192, 512, maskable
drizzle/                          сгенерированные миграции, руками не правим
scripts/                          seed.ts, seed-demo.ts, admin.ts, admin/catalog.ts, fixtures/
tests/
  unit/ , domain/ , e2e/ , fixtures/
```

Имя файла и класса совпадают: `request.service.ts` экспортирует `RequestService`.

---

## 5. Схема БД (Drizzle, SQLite)

Общие правила:

- Первичный ключ `id integer primary key autoincrement`, кроме таблиц с натуральным ключом (`settings`).
- Деньги — целые копейки, суффикс `_minor`, тип `integer`. `real` под деньги запрещён.
- Даты — `integer` в режиме `timestamp` (UTC). Отображение в таймзоне организации из `settings`.
- Мягкое удаление через `deleted_at`, где история важна (пользователи, контрагенты, каталог).
- Все внешние ключи объявлены явно, `foreign_keys=ON` включён на подключении.
- Миграции генерирует только тимлид командой `pnpm db:generate`. Файлы в `drizzle/` руками не редактируются.

### 5.1 Общие хелперы

```ts
// src/lib/server/db/schema/_shared.ts
import { integer, text } from 'drizzle-orm/sqlite-core';

export const pk = () => integer('id').primaryKey({ autoIncrement: true });
export const ts = (name: string) => integer(name, { mode: 'timestamp' });
export const createdAt = () => ts('created_at').notNull().$defaultFn(() => new Date());
export const updatedAt = () => ts('updated_at').notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date());
export const money = (name: string) => integer(name).notNull().default(0); // minor units
```

### 5.2 Пользователи и доступ

```ts
export const users = sqliteTable('users', {
  id: pk(),
  email: text('email').notNull(),
  login: text('login'),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  scope: text('scope', { enum: ['portal', 'crm'] }).notNull(),
  counterpartyId: integer('counterparty_id').references(() => counterparties.id), // null for crm scope
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: ts('locked_until'),
  lastLoginAt: ts('last_login_at'),
  timezone: text('timezone').notNull().default('Europe/Moscow'),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: ts('deleted_at')
}, (t) => ({
  emailUq: uniqueIndex('users_email_uq').on(t.email),
  cpIdx: index('users_counterparty_idx').on(t.counterpartyId)
}));

export const roles = sqliteTable('roles', {
  id: pk(),
  code: text('code', { enum: ROLE_CODES }).notNull(),   // see §8 RoleCode
  title: text('title').notNull()
}, (t) => ({ codeUq: uniqueIndex('roles_code_uq').on(t.code) }));

export const userRoles = sqliteTable('user_roles', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' })
}, (t) => ({ pkUq: primaryKey({ columns: [t.userId, t.roleId] }) }));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),                          // 32-byte random, stored hashed
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  ip: text('ip'), userAgent: text('user_agent'),
  createdAt: createdAt()
}, (t) => ({ userIdx: index('sessions_user_idx').on(t.userId) }));

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: pk(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt()
}, (t) => ({ tokenUq: uniqueIndex('prt_token_uq').on(t.tokenHash) }));

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),        // `${action}:${ip}` or `${action}:${userId}`
  hits: integer('hits').notNull().default(0),
  windowStart: ts('window_start').notNull(),
  blockedUntil: ts('blocked_until')
});
```

### 5.3 Контрагенты

```ts
export const counterparties = sqliteTable('counterparties', {
  id: pk(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  inn: text('inn'), kpp: text('kpp'),
  address: text('address'),
  phone: text('phone'), email: text('email'),
  priceListId: integer('price_list_id').references(() => priceLists.id),   // personal list of this counterparty
  // The region the personal prices were prefilled from. Not personal, not base.
  regionPriceListId: integer('region_price_list_id').references(() => priceLists.id),
  discountPercent: integer('discount_percent').notNull().default(0),   // 0..100, integer percent
  settlementScheme: text('settlement_scheme', { enum: ['on_fact', 'weekly', 'monthly'] }).notNull().default('on_fact'),
  managerId: integer('manager_id').references(() => users.id),
  staffLimit: integer('staff_limit').notNull().default(10),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: ts('deleted_at')
}, (t) => ({ nameIdx: index('cp_name_idx').on(t.name) }));

export const deliveryAddresses = sqliteTable('delivery_addresses', {
  id: pk(),
  counterpartyId: integer('counterparty_id').notNull().references(() => counterparties.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  address: text('address').notNull(),
  contactName: text('contact_name'), contactPhone: text('contact_phone'),
  lat: real('lat'), lon: real('lon'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  deletedAt: ts('deleted_at'), createdAt: createdAt()
});

export const contracts = sqliteTable('contracts', {
  id: pk(),
  counterpartyId: integer('counterparty_id').notNull().references(() => counterparties.id, { onDelete: 'cascade' }),
  number: text('number').notNull(),
  signedAt: ts('signed_at'), validUntil: ts('valid_until'),
  fileId: integer('file_id').references(() => media.id),
  createdAt: createdAt()
});
```

### 5.4 Каталог

```ts
export const products = sqliteTable('products', {
  id: pk(),
  sku: text('sku').notNull(),
  title: text('title').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  description: text('description'),
  isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: ts('deleted_at')
}, (t) => ({ skuUq: uniqueIndex('products_sku_uq').on(t.sku) }));

export const categories = sqliteTable('categories', {
  id: pk(), title: text('title').notNull(),
  parentId: integer('parent_id'), sortOrder: integer('sort_order').notNull().default(0)
});

// Variant = size + material. Price and stock hang on the variant.
export const productVariants = sqliteTable('product_variants', {
  id: pk(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  sizeCode: text('size_code').notNull(),
  materialId: integer('material_id').notNull().references(() => dictItems.id),
  lengthMm: integer('length_mm'), widthMm: integer('width_mm'), heightMm: integer('height_mm'),
  weightG: integer('weight_g'),
  basePriceMinor: money('base_price_minor'),
  costPriceMinor: money('cost_price_minor'),          // legacy: the cost lives in stock_items; read only by `stock:cost-backfill`
  stockItemId: integer('stock_item_id').references(() => stockItems.id),
  isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: ts('deleted_at')
}, (t) => ({ skuUq: uniqueIndex('variants_sku_uq').on(t.sku), prodIdx: index('variants_product_idx').on(t.productId) }));

// Options: the colour of the product, the only choice besides the size.
export const options = sqliteTable('options', {
  id: pk(),
  kind: text('kind', { enum: ['color'] }).notNull(),
  title: text('title').notNull(),
  priceDeltaMinor: integer('price_delta_minor').notNull().default(0),
  stockItemId: integer('stock_item_id').references(() => stockItems.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
});

// Compatibility matrix: which options are allowed for a variant.
export const productOptions = sqliteTable('product_options', {
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  optionId: integer('option_id').notNull().references(() => options.id, { onDelete: 'cascade' }),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false)
}, (t) => ({ pkUq: primaryKey({ columns: [t.variantId, t.optionId] }) }));

// Single dictionary table for materials, finishes, fabrics, work types, refusal reasons, etc.
export const dictItems = sqliteTable('dict_items', {
  id: pk(),
  dict: text('dict', { enum: DICT_CODES }).notNull(),   // see §8 DictCode
  code: text('code').notNull(),
  title: text('title').notNull(),
  extra: text('extra', { mode: 'json' }).$type<Record<string, unknown>>(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
}, (t) => ({ dictCodeUq: uniqueIndex('dict_code_uq').on(t.dict, t.code) }));

export const media = sqliteTable('media', {
  id: pk(),
  path: text('path').notNull(),                 // relative to FILES_DIR, never client-controlled
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'), height: integer('height'),
  ownerScope: text('owner_scope', { enum: ['product', 'request', 'contract', 'import', 'charity'] }).notNull(),
  ownerId: integer('owner_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  createdAt: createdAt()
}, (t) => ({ ownerIdx: index('media_owner_idx').on(t.ownerScope, t.ownerId) }));
```

### 5.5 Цены

```ts
export const priceLists = sqliteTable('price_lists', {
  id: pk(), title: text('title').notNull(),
  isBase: integer('is_base', { mode: 'boolean' }).notNull().default(false),
  // A list of one counterparty's individual prices: never offered as a region.
  isPersonal: integer('is_personal', { mode: 'boolean' }).notNull().default(false),
  validFrom: ts('valid_from'), validTo: ts('valid_to'),
  createdAt: createdAt(), updatedAt: updatedAt()
});

export const priceListItems = sqliteTable('price_list_items', {
  id: pk(),
  priceListId: integer('price_list_id').notNull().references(() => priceLists.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  priceMinor: money('price_minor')
}, (t) => ({ uq: uniqueIndex('pli_uq').on(t.priceListId, t.variantId) }));

// Agency price (P7): the counterparty shows it to its own client. Display only, never part of a request sum.
export const counterpartyProductPrices = sqliteTable('counterparty_product_prices', {
  id: pk(),
  counterpartyId: integer('counterparty_id').notNull().references(() => counterparties.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  priceMinor: money('price_minor'),
  updatedById: integer('updated_by_id').notNull().references(() => users.id),
  updatedAt: updatedAt()
}, (t) => ({ uq: uniqueIndex('cpp_uq').on(t.counterpartyId, t.productId) }));

export const discountRules = sqliteTable('discount_rules', {
  id: pk(),
  counterpartyId: integer('counterparty_id').references(() => counterparties.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').references(() => categories.id),
  percent: integer('percent').notNull(),
  validFrom: ts('valid_from'), validTo: ts('valid_to')
});
```

Индивидуальные цены контрагента пишутся только в лист, который не базовый, действует сейчас и назначен одному этому контрагенту. Иначе сервис заводит новый лист «Индивидуальные цены: <название>», копирует в него позиции прежнего небазового листа и меняет `counterparties.price_list_id`. Выбор листа и план правок делает `lib/domain/pricing/personal-price.ts`: цена 0 удаляет позицию, неизменная цена в план не попадает.

Региональный прайс это лист с `is_base = false` и `is_personal = false`, его выбирают в `counterparties.region_price_list_id`. Регион только предзаполняет личный лист: при заведении контрагента и при смене региона у контрагента без своего листа сервис копирует позиции региона в новый лист с `is_personal = true`. Уже заведённые личные цены смена региона не трогает, их заменяет кнопка «Заполнить из прайса» (`PersonalListFiller.fill(..., overwrite = true)`). Цена строки берётся по цепочке: личный лист, действующий региональный, действующий базовый, `base_price_minor`. Пустое личное поле значит цену региона.

### 5.6 Заявка (ядро)

```ts
export const requests = sqliteTable('requests', {
  id: pk(),
  number: text('number').notNull(),                       // from numbering_sequences
  counterpartyId: integer('counterparty_id').references(() => counterparties.id),  // null = stock request
  isStockRequest: integer('is_stock_request', { mode: 'boolean' }).notNull().default(false),
  createdById: integer('created_by_id').notNull().references(() => users.id),
  managerId: integer('manager_id').references(() => users.id),
  status: text('status', { enum: REQUEST_STATUSES }).notNull().default('draft'),
  priority: text('priority', { enum: ['normal', 'urgent'] }).notNull().default('normal'),
  deliveryAddressId: integer('delivery_address_id').references(() => deliveryAddresses.id),
  deliveryAt: ts('delivery_at'),                          // hard deadline, frozen at draft -> new
  deceasedName: text('deceased_name'),                    // personal data of a third party
  externalNumber: text('external_number'),                // counterparty own order number
  comment: text('comment'),
  itemsTotalMinor: money('items_total_minor'),
  discountMinor: money('discount_minor'),
  totalMinor: money('total_minor'),
  paidMinor: money('paid_minor'),
  charityRateBp: integer('charity_rate_bp'),              // basis points, frozen on delivery
  charityAmountMinor: integer('charity_amount_minor'),    // frozen on delivery, never recalculated
  submittedAt: ts('submitted_at'), acceptedAt: ts('accepted_at'),
  readyAt: ts('ready_at'), deliveredAt: ts('delivered_at'), paidAt: ts('paid_at'),
  createdAt: createdAt(), updatedAt: updatedAt()
}, (t) => ({
  numberUq: uniqueIndex('requests_number_uq').on(t.number),
  cpStatusIdx: index('requests_cp_status_idx').on(t.counterpartyId, t.status),
  statusIdx: index('requests_status_idx').on(t.status, t.priority),
  createdIdx: index('requests_created_idx').on(t.createdAt)
}));

export const requestItems = sqliteTable('request_items', {
  id: pk(),
  requestId: integer('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id),
  qty: integer('qty').notNull(),
  unitPriceMinor: money('unit_price_minor'),              // frozen at accept
  lineTotalMinor: money('line_total_minor'),
  engraving: text('engraving'),
  comment: text('comment')
}, (t) => ({ reqIdx: index('request_items_request_idx').on(t.requestId) }));

export const requestItemOptions = sqliteTable('request_item_options', {
  itemId: integer('item_id').notNull().references(() => requestItems.id, { onDelete: 'cascade' }),
  optionId: integer('option_id').notNull().references(() => options.id),
  priceDeltaMinor: integer('price_delta_minor').notNull().default(0)
}, (t) => ({ pkUq: primaryKey({ columns: [t.itemId, t.optionId] }) }));

export const requestStatusHistory = sqliteTable('request_status_history', {
  id: pk(),
  requestId: integer('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status', { enum: REQUEST_STATUSES }),
  toStatus: text('to_status', { enum: REQUEST_STATUSES }).notNull(),
  actorId: integer('actor_id').references(() => users.id),   // null = system transition
  reasonId: integer('reason_id').references(() => dictItems.id),
  comment: text('comment'),
  createdAt: createdAt()
}, (t) => ({ reqIdx: index('rsh_request_idx').on(t.requestId, t.createdAt) }));

export const paymentMarks = sqliteTable('payment_marks', {
  id: pk(),
  requestId: integer('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  amountMinor: money('amount_minor'),
  paidAt: ts('paid_at').notNull(),
  method: text('method', { enum: ['cash', 'bank', 'card', 'offset'] }).notNull(),
  comment: text('comment'),
  reversalOfId: integer('reversal_of_id'),          // set on a row that cancels an earlier mark
  createdById: integer('created_by_id').notNull().references(() => users.id),
  createdAt: createdAt()
}, (t) => ({ reqIdx: index('pm_request_idx').on(t.requestId) }));

export const comments = sqliteTable('comments', {
  id: pk(),
  requestId: integer('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  isInternal: integer('is_internal', { mode: 'boolean' }).notNull().default(false), // hidden from portal
  createdAt: createdAt()
}, (t) => ({ reqIdx: index('comments_request_idx').on(t.requestId, t.createdAt) }));
```

Правка заявки после запуска в работу (состав, приоритет) пишет строку `request_status_history` с `from_status = to_status` и обязательным комментарием. Переходом такая строка не считается, в портал не отдаётся.

Отгрузка заявки контрагента: адрес, срок и ФИО умершего обязательны, самовывоза в системе нет. Три колонки остаются nullable, потому что у заявки на склад (`isStockRequest = true`) нет ни контрагента, ни адреса, ни умершего, а фиктивные значения ради `notNull` были бы ложью в данных. Обязательность держит guard `deliveryFilled` на переходе `draft -> new` (§6.2) и Zod на форме корзины.

### 5.7 Склад

```ts
export const stockItems = sqliteTable('stock_items', {
  id: pk(),
  kind: text('kind', { enum: ['product', 'component'] }).notNull(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  unitId: integer('unit_id').notNull().references(() => dictItems.id),   // dict = 'unit'
  minThreshold: integer('min_threshold').notNull().default(0),
  costPriceMinor: money('cost_price_minor'),          // cost of one unit, owner and manager only; the margin reads it
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
}, (t) => ({ codeUq: uniqueIndex('stock_items_code_uq').on(t.code) }));

// Balance is never stored. It is the sum of moves. Append-only table.
export const stockMoves = sqliteTable('stock_moves', {
  id: pk(),
  stockItemId: integer('stock_item_id').notNull().references(() => stockItems.id),
  optionId: integer('option_id').references(() => options.id),   // colour of a product position, null for a component
  qty: integer('qty').notNull(),                    // signed: + income, - outcome
  type: text('type', { enum: STOCK_MOVE_TYPES }).notNull(),
  requestId: integer('request_id').references(() => requests.id),
  requestItemId: integer('request_item_id').references(() => requestItems.id),   // loaded line of a request, null elsewhere
  reversalOfId: integer('reversal_of_id'),          // set when compensating a previous move
  reasonId: integer('reason_id').references(() => dictItems.id),
  comment: text('comment'),
  actorId: integer('actor_id').references(() => users.id),
  occurredAt: ts('occurred_at').notNull(),
  createdAt: createdAt()
}, (t) => ({
  itemIdx: index('stock_moves_item_idx').on(t.stockItemId, t.occurredAt),
  reqIdx: index('stock_moves_request_idx').on(t.requestId),
  reqItemIdx: index('stock_moves_request_item_idx').on(t.requestItemId)
}));

export const inventories = sqliteTable('inventories', {
  id: pk(),
  kind: text('kind', { enum: ['product', 'component'] }).notNull().default('component'),   // one open draft per kind; the default only lets SQLite add the column
  status: text('status', { enum: ['draft', 'applied'] }).notNull().default('draft'),
  comment: text('comment'),
  createdById: integer('created_by_id').notNull().references(() => users.id),
  appliedAt: ts('applied_at'), createdAt: createdAt()
});

export const inventoryLines = sqliteTable('inventory_lines', {
  id: pk(),
  inventoryId: integer('inventory_id').notNull().references(() => inventories.id, { onDelete: 'cascade' }),
  stockItemId: integer('stock_item_id').notNull().references(() => stockItems.id),
  optionId: integer('option_id').references(() => options.id),   // colour of a product position, null for a component
  expectedQty: integer('expected_qty').notNull(),                // refreshed from the balance when the inventory is applied
  actualQty: integer('actual_qty').notNull()
});
```

### 5.8 Персонал и выплаты

```ts
export const staff = sqliteTable('staff', {
  id: pk(),
  fullName: text('full_name').notNull(),
  position: text('position'),
  userId: integer('user_id').references(() => users.id),    // optional system account
  hiredAt: ts('hired_at'), firedAt: ts('fired_at'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt()
});

export const workTypes = sqliteTable('work_types', {
  id: pk(),
  title: text('title').notNull(),
  rateMinor: money('rate_minor'),                      // price of one unit of the work
  roleCode: text('role_code', { enum: WORK_ROLES }),   // shop role of the work, null for a general one
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt()
}, (t) => ({ uq: uniqueIndex('work_types_title_uq').on(t.title) }));

export const workDays = sqliteTable('work_days', {
  id: pk(),
  workDate: ts('work_date').notNull(),                 // start of the calendar day in org.timezone
  totalMinor: money('total_minor'),                    // sum of the entries
  createdById: integer('created_by_id').notNull().references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt()
}, (t) => ({ uq: uniqueIndex('work_days_uq').on(t.workDate) }));

export const workDayStaff = sqliteTable('work_day_staff', {
  id: pk(),
  workDayId: integer('work_day_id').notNull().references(() => workDays.id, { onDelete: 'cascade' }),
  staffId: integer('staff_id').notNull().references(() => staff.id)
}, (t) => ({ uq: uniqueIndex('work_day_staff_uq').on(t.workDayId, t.staffId) }));

export const workEntries = sqliteTable('work_entries', {
  id: pk(),
  workDayId: integer('work_day_id').notNull().references(() => workDays.id, { onDelete: 'cascade' }),
  workTypeId: integer('work_type_id').notNull().references(() => workTypes.id),
  qty: integer('qty').notNull(),
  rateMinor: money('rate_minor'),                      // frozen price at entry time
  amountMinor: money('amount_minor')
});                                                    // one work may come in several entries, one per crew

// Who did the entry: its amount is split among them only, each one is present that day.
export const workEntryStaff = sqliteTable('work_entry_staff', {
  id: pk(),
  workEntryId: integer('work_entry_id').notNull().references(() => workEntries.id, { onDelete: 'cascade' }),
  staffId: integer('staff_id').notNull().references(() => staff.id)
}, (t) => ({ uq: uniqueIndex('work_entry_staff_uq').on(t.workEntryId, t.staffId) }));

export const payrollPeriods = sqliteTable('payroll_periods', {
  id: pk(),
  startsOn: ts('starts_on').notNull(), endsOn: ts('ends_on').notNull(),
  status: text('status', { enum: ['open', 'calculated', 'paid'] }).notNull().default('open'),
  closedById: integer('closed_by_id').references(() => users.id),
  closedAt: ts('closed_at'), createdAt: createdAt()
}, (t) => ({ uq: uniqueIndex('payroll_periods_uq').on(t.startsOn) }));

export const payrollLines = sqliteTable('payroll_lines', {
  id: pk(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  staffId: integer('staff_id').notNull().references(() => staff.id),
  daysWorked: integer('days_worked').notNull().default(0),
  accruedMinor: money('accrued_minor'),
  adjustmentMinor: integer('adjustment_minor').notNull().default(0),
  adjustmentComment: text('adjustment_comment'),
  payoutMinor: money('payout_minor'),
  paidAt: ts('paid_at'), paidComment: text('paid_comment')
}, (t) => ({ uq: uniqueIndex('payroll_lines_uq').on(t.periodId, t.staffId) }));
```

### 5.9 Благотворительность, нумерация, сквозное

```ts
export const charityTransfers = sqliteTable('charity_transfers', {
  id: pk(),
  amountMinor: money('amount_minor'),              // negative on a reversal row
  transferredAt: ts('transferred_at').notNull(),
  documentRef: text('document_ref'),
  comment: text('comment'),
  // Set on a row that cancels an earlier transfer; the original is never edited.
  reversalOfId: integer('reversal_of_id').references((): AnySQLiteColumn => charityTransfers.id),
  createdById: integer('created_by_id').notNull().references(() => users.id),
  createdAt: createdAt()
});

// Read model for the public banner. Rebuilt by a job, never the source of truth.
export const charityTotals = sqliteTable('charity_totals', {
  scope: text('scope').primaryKey(),         // 'all' | 'year:2026' | 'cp:12'
  amountMinor: money('amount_minor'),
  requestCount: integer('request_count').notNull().default(0),
  updatedAt: updatedAt()
});

export const numberingSequences = sqliteTable('numbering_sequences', {
  key: text('key').primaryKey(),             // 'request'
  prefix: text('prefix').notNull().default(''),
  period: text('period', { enum: ['none', 'year', 'month'] }).notNull().default('year'),
  periodKey: text('period_key').notNull().default(''),
  lastValue: integer('last_value').notNull().default(0)
});

export const notificationTemplates = sqliteTable('notification_templates', {
  id: pk(),
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  channel: text('channel', { enum: ['push', 'max'] }).notNull(),
  subject: text('subject'), body: text('body').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
}, (t) => ({ uq: uniqueIndex('nt_uq').on(t.eventKey, t.channel) }));

export const notificationRules = sqliteTable('notification_rules', {
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  roleCode: text('role_code', { enum: ROLE_CODES }).notNull(),
  channel: text('channel', { enum: ['push', 'max'] }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true)
}, (t) => ({ pkUq: primaryKey({ columns: [t.eventKey, t.roleCode, t.channel] }) }));

export const userNotificationPrefs = sqliteTable('user_notification_prefs', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  channel: text('channel', { enum: ['push', 'max'] }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull()
}, (t) => ({ pkUq: primaryKey({ columns: [t.userId, t.eventKey, t.channel] }) }));

export const notifications = sqliteTable('notifications', {
  id: pk(),
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channel: text('channel', { enum: ['push', 'max'] }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ['queued', 'sent', 'failed'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  sentAt: ts('sent_at'), createdAt: createdAt()
}, (t) => ({ userIdx: index('notifications_user_idx').on(t.userId, t.createdAt) }));

// The in-app feed of the bell. One row per (user, event), whatever channels the matrix picked:
// a channel row would show the same event twice. The unique index makes the fanout job idempotent.
export const notificationFeed = sqliteTable('notification_feed', {
  id: pk(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  entityId: integer('entity_id').notNull(),
  readAt: ts('read_at'),
  createdAt: createdAt()
}, (t) => ({
  userIdx: index('feed_user_idx').on(t.userId, t.createdAt),
  uq: uniqueIndex('feed_uq').on(t.userId, t.eventKey, t.entityId)
}));

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: pk(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(), auth: text('auth').notNull(),
  createdAt: createdAt(), lastUsedAt: ts('last_used_at'),
  // Set by dispatch on 404 or 410 from the push service; session.cleanup deletes the row.
  expiredAt: ts('expired_at')
}, (t) => ({ endpointUq: uniqueIndex('push_endpoint_uq').on(t.endpoint) }));

export const jobQueue = sqliteTable('job_queue', {
  id: pk(),
  topic: text('topic', { enum: JOB_TOPICS }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status', { enum: ['pending', 'running', 'done', 'failed', 'dead'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  visibleAt: ts('visible_at').notNull(),
  lockedAt: ts('locked_at'), lockedBy: text('locked_by'),
  lastError: text('last_error'),
  createdAt: createdAt(), finishedAt: ts('finished_at')
}, (t) => ({
  idemUq: uniqueIndex('job_idem_uq').on(t.topic, t.idempotencyKey),
  pollIdx: index('job_poll_idx').on(t.status, t.visibleAt)
}));

export const auditLog = sqliteTable('audit_log', {
  id: pk(),
  actorId: integer('actor_id').references(() => users.id),
  action: text('action').notNull(),                   // 'request.accept', 'payroll.close'
  entity: text('entity').notNull(), entityId: integer('entity_id'),
  before: text('before', { mode: 'json' }).$type<Record<string, unknown>>(),
  after: text('after', { mode: 'json' }).$type<Record<string, unknown>>(),
  ip: text('ip'), requestId: text('request_id'),
  createdAt: createdAt()
}, (t) => ({ entIdx: index('audit_entity_idx').on(t.entity, t.entityId, t.createdAt) }));

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedById: integer('updated_by_id').references(() => users.id),
  updatedAt: updatedAt()
});
```

Ключи `settings`: `org.requisites`, `org.timezone`, `charity.rate_bp`, `charity.fund`, `charity.transfer_media_id`, `counterparty.staff_limit_default`, `payroll.week_closing_day`, `notifications.enabled`.

Форма `charity.rate_bp`: целое число базисных пунктов от 0 до 10000. Форма `charity.fund`: `{ title: string; url?: string }`. Форма `charity.transfer_media_id`: положительное целое, `media.id` файла подтверждения перевода с `owner_scope = 'charity'`. Форма `notifications.enabled`: `boolean`, `false` останавливает разворот любых событий в уведомления.

Форма `org.requisites`: `{ name: string; inn?: string; kpp?: string; ogrn?: string; address?: string; phone?: string; email?: string; bank?: string; bik?: string; account?: string }`. ИНН 10 или 12 цифр, КПП и БИК по 9 цифр, ОГРН 13 цифр или ОГРНИП 15 цифр, расчётный счёт 20 цифр. Гостю уходят телефон, адрес и оператор: название, ИНН, ОГРН, почта (`OrgService.publicContacts`). КПП, банк, БИК и счёт с сервера не уходят. Форма `counterparty.staff_limit_default`: целое от 1 до 1000, лимит нового контрагента при создании.

Нумерация в CRM: правятся `prefix` (до 10 символов) и `period` ключа `request`. Сохранение пересчитывает `periodKey` на текущий период и ставит `lastValue` равным наибольшему номеру той же формы среди `requests.number`, поэтому возврат к прежнему префиксу или периоду не выдаёт занятый номер. Правило живёт в `resumeSequence` рядом с `nextNumber`.

### 5.10 Обращения

```ts
export const SUPPORT_THREAD_STATUSES = ['open', 'closed'] as const;
export const SUPPORT_SIDES = ['portal', 'crm'] as const;

export const supportThreads = sqliteTable('support_threads', {
  id: pk(),
  counterpartyId: integer('counterparty_id').notNull().references(() => counterparties.id),
  createdById: integer('created_by_id').notNull().references(() => users.id),
  requestId: integer('request_id').references(() => requests.id),
  subject: text('subject').notNull(),
  status: text('status', { enum: SUPPORT_THREAD_STATUSES }).notNull().default('open'),
  // Denormalized from the newest message: the lists sort and mark «whose turn» without a join.
  lastMessageAt: ts('last_message_at').notNull(),
  lastMessageSide: text('last_message_side', { enum: SUPPORT_SIDES }).notNull(),
  closedAt: ts('closed_at'),
  closedById: integer('closed_by_id').references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt()
}, (t) => ({
  cpIdx: index('support_threads_cp_idx').on(t.counterpartyId, t.lastMessageAt),
  authorIdx: index('support_threads_author_idx').on(t.createdById, t.lastMessageAt),
  statusIdx: index('support_threads_status_idx').on(t.status, t.lastMessageAt)
}));

export const supportMessages = sqliteTable('support_messages', {
  id: pk(),
  threadId: integer('thread_id').notNull().references(() => supportThreads.id),
  authorId: integer('author_id').notNull().references(() => users.id),
  // The author's contour at the time of writing: a scope change later must not flip old messages.
  side: text('side', { enum: SUPPORT_SIDES }).notNull(),
  body: text('body').notNull(),
  createdAt: createdAt()
}, (t) => ({ threadIdx: index('support_messages_thread_idx').on(t.threadId, t.createdAt) }));
```

Инварианты:

- `support_threads.request_id`, если задан, указывает на заявку того же `counterparty_id` не в статусе `draft`; сотрудник контрагента привязывает только свою заявку;
- у обращения есть хотя бы одно сообщение: ветка и первое сообщение пишутся одной транзакцией;
- `last_message_at` и `last_message_side` равны полям самого нового сообщения ветки;
- `closed_at` и `closed_by_id` заданы тогда и только тогда, когда `status = 'closed'`;
- строки не удаляются, сообщения не правятся. Вложений, флагов брака и рекламаций у обращения нет.

### 5.11 Финансы

```ts
export const FINANCE_KINDS = ['income', 'expense'] as const;

// Manual entries of the owner. Order payments, payroll payouts and fund transfers are read from
// their own tables and never copied here.
export const financeEntries = sqliteTable('finance_entries', {
  id: pk(),
  kind: text('kind', { enum: FINANCE_KINDS }).notNull(),
  amountMinor: integer('amount_minor').notNull(),          // > 0, the kind gives the sign
  occurredAt: ts('occurred_at').notNull(),                 // start of the calendar day in org.timezone
  comment: text('comment').notNull(),
  createdById: integer('created_by_id').notNull().references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: ts('deleted_at')
}, (t) => ({ occurredIdx: index('finance_entries_occurred_idx').on(t.occurredAt) }));
```

Инварианты:

- `amount_minor` больше нуля и не больше `FINANCE_ENTRY_MAX_MINOR`;
- `occurred_at` это начало календарного дня в `org.timezone`, не позже сегодняшнего на момент записи;
- строка с `deleted_at` в ленту, аналитику и выгрузку не попадает, правке и повторному удалению не поддаётся (404).

Лента финансов собирается из четырёх источников: `payment_marks` (доход, знак суммы как есть), `payroll_lines` с `paid_at` и `payout_minor > 0` (расход в день отметки), `charity_transfers` (расход, сторно уменьшает его) и `finance_entries` без `deleted_at`. Доход и расход считаются по источнику, а не по знаку строки.

---

### 5.12 Цех

```ts
// src/lib/server/db/schema/shop.ts
// A visit of one request to one station. It holds «Взять в работу» and «Выполнено»; its jobs are the pieces.
export const shopTasks = sqliteTable('shop_tasks', {
  id: pk(),
  requestId: integer('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  station: text('station', { enum: WORK_ROLES }).notNull(),
  takenAt: ts('taken_at'),
  takenById: integer('taken_by_id').references(() => users.id),
  completedAt: ts('completed_at'),
  completedById: integer('completed_by_id').references(() => users.id),   // null when the dispatch emptied it
  createdAt: createdAt()
}, (t) => ({
  stationIdx: index('shop_tasks_station_idx').on(t.station, t.completedAt),
  requestIdx: index('shop_tasks_request_idx').on(t.requestId)
}));

// Pieces of one request line the stations make. The job rides from visit to visit until the upholsterer.
export const shopJobs = sqliteTable('shop_jobs', {
  id: pk(),
  requestItemId: integer('request_item_id').notNull().references(() => requestItems.id, { onDelete: 'cascade' }),
  taskId: integer('task_id').notNull().references(() => shopTasks.id),   // the current visit, the last one once finished
  qty: integer('qty').notNull(),
  doneQty: integer('done_qty').notNull().default(0),                     // pieces done at the current station
  finishedAt: ts('finished_at'),
  productionMoveId: integer('production_move_id').references(() => stockMoves.id),
  createdAt: createdAt(), updatedAt: updatedAt()
}, (t) => ({
  itemIdx: index('shop_jobs_item_idx').on(t.requestItemId, t.finishedAt),
  taskIdx: index('shop_jobs_task_idx').on(t.taskId)
}));
```

Инварианты:

- открытый визит (`completed_at` пуст) у пары «заявка, станция» один;
- задание без `finished_at` открыто и принадлежит открытому визиту; на пару «строка, визит» открыто одно задание, пришедшие штуки прибавляются к нему;
- `0 ≤ done_qty ≤ qty`, `qty > 0`;
- `finished_at` и `production_move_id` заданы вместе, только у задания, которое прошло обивщика; движение `production` пишется без `request_id` и `request_item_id`: колонка `request_item_id` у движения значит погрузку (§6.2, инвариант 9);
- визит, у которого досылка сняла все задания, закрывается с пустым `completed_by_id`.

## 6. Машина состояний заявки

Единственный источник правды — `src/lib/domain/request/state-machine.ts`. Сервер проверяет переход через неё, UI через неё же решает, какие кнопки рисовать. Дублировать правила в компонентах запрещено.

### 6.1 Статусы

| Код | Название | Смысл |
|---|---|---|
| `draft` | Черновик | Портальный черновик, контрагент собирает состав. В реестрах CRM не показывается |
| `new` | Заявка | Отправлена контрагентом либо заведена менеджером |
| `in_work` | В работе | Менеджер принял, состав и цена зафиксированы |
| `ready` | Готов к выдаче | Изделие готово и упаковано |
| `delivered` | Доставлен | Водитель передал контрагенту |
| `awaiting_payment` | Ожидает оплаты | Платёж не поступил либо поступил частично |
| `paid` | Оплачено | Заявка закрыта |
| `cancelled` | Отменена | Терминальный |
| `rejected` | Отклонена | Терминальный |

Брак, переделка, приостановка и отказ при доставке в системе не учитываются. Цех и водитель решают эти вопросы вне приложения, поэтому в схеме нет ни таблицы брака, ни флагов, ни переходов под них. Обратных переходов в потоке нет вообще: заявка идёт только вперёд, а мимо основного потока уходит в `cancelled` или `rejected`.

### 6.2 Таблица переходов

```ts
export const TRANSITIONS: readonly Transition[] = [
  { from: 'draft',  to: 'new',       roles: ['cp_admin','cp_employee','manager','owner'], ownOnly: true,
    guards: ['deliveryFilled'] },
  { from: 'new',    to: 'in_work',   roles: ['manager','owner'], guards: ['pricesFixed','stockLinked'],
    effects: ['audit','emit:request.accepted'] },
  { from: 'new',    to: 'cancelled', roles: ['cp_admin','cp_employee','manager','owner'], ownOnly: true,
    effects: ['emit:request.cancelled'] },
  { from: 'new',    to: 'rejected',  roles: ['manager','owner'], requiresReason: true,
    effects: ['emit:request.rejected'] },
  { from: 'in_work', to: 'ready',    roles: ['system'], auto: true,
    guards: ['stockCovered'], effects: ['emit:request.ready'] },
  { from: 'ready',  to: 'delivered', roles: ['driver','manager','owner'],
    guards: ['fullyLoaded'], effects: ['freezeCharity','emit:request.delivered'] },
  { from: 'delivered', to: 'awaiting_payment', roles: ['system'], auto: true },
  { from: 'awaiting_payment', to: 'paid', roles: ['system'], auto: true,
    guards: ['fullyPaid'], effects: ['emit:request.paid'] }
] as const;
```

Инварианты, покрытые property-based тестами:

1. Движение только вперёд. Обратных переходов нет: пара, у которой целевой статус стоит в основном потоке раньше исходного, в таблице не встречается.
2. Каждый переход пишет строку в `request_status_history` в той же транзакции.
3. `charityAmountMinor` заполняется ровно один раз, в момент первого перехода в `delivered`, и дальше не меняется ни при смене ставки, ни при правке цен.
4. Складское движение пишется в транзакции своего действия: отметки выпуска (C5), погрузки или её снятия (C6). Провал движения откатывает действие. Переход статуса движений не пишет: списание со склада делает погрузка.
5. `in_work -> ready` делает только система, автоматическим шагом в транзакции действия, которое покрыло заявку: приём, «Выполнено» обивщика, складское движение, смена приоритета, правка состава (§20.4). Guard `stockCovered`: у заявки контрагента `allocateStock` наполняет каждую строку целиком, у заявки на склад станции сделали каждую строку целиком (сумма `qty` её заданий с `finished_at` не меньше `qty` строки). Исполнителей у заявки нет: станцию ведёт вся роль, заявку в `ready` доставляет любой водитель.
10. Заявка уходит в `in_work`, только если вариант каждой строки связан со складской позицией: это guard `stockLinked`. Иначе сделанное станциями некуда положить.
6. Заявка на склад (`isStockRequest = true`) не порождает благотворительное отчисление и не имеет контрагента.
7. Автоматический шаг берётся в транзакции действия, которое открыло ему дорогу, и только если его guard-ы прошли. Действие — либо ручной переход, либо отметка оплаты из C7. Человек автоматический шаг не инициирует: роль `system` недоступна ни одному пользователю. Шаги идут цепочкой, пока очередной guard не остановит её, поэтому доставка с принятыми наличными доходит до `paid` одним действием водителя, а доставка с оплатой по счёту останавливается на `awaiting_payment` до отметки. Guard `fullyPaid` держит покрытую заявку в `awaiting_payment`, пока у контрагента есть долг по другим заявкам. Отметка, которая гасит последний долг, проводит автоматический шаг для всех ждущих заявок контрагента в своей транзакции (`settleCounterparty`).
8. Заявка контрагента уходит из `draft` только с заполненными `deliveryAddressId`, `deliveryAt` и `deceasedName`: это guard `deliveryFilled`. Заявка на склад (`isStockRequest = true`) его не требует. `deliveryAt` замораживается на этом переходе вместе с ценами и дальше не меняется ни одним переходом: срок сдвигается только отменой и новой заявкой.
9. Заявка контрагента уходит в `delivered` только погруженной целиком: это guard `fullyLoaded`. Погружено по строке равно минус сумме движений склада с её `request_item_id`. Заявка на склад его не требует.

Коды guard-ов: `stockCovered`, `pricesFixed`, `fullyPaid`, `deliveryFilled`, `fullyLoaded`, `stockLinked` (`GUARD_CODES` в `lib/types/request.ts`). Коды эффектов: `audit`, `freezeCharity`, `emit:request.accepted`, `emit:request.cancelled`, `emit:request.rejected`, `emit:request.ready`, `emit:request.delivered`, `emit:request.paid` (`EFFECT_CODES`).

### 6.3 Компенсация вместо удаления

Ошибочное складское движение не удаляется и не правится. Сервис пишет обратное движение с `reversalOfId` и типом `reversal`, а рядом верную строку. Остаток остаётся суммой всех строк, история операций читаема. Статус заявки компенсация не двигает: смена статуса назад запрещена инвариантом 1.

---

## 7. Контракты очереди и событий

### 7.1 Транзакционный outbox

Сервис не отправляет письмо и не собирает экспорт по месту. Он вставляет строку в `job_queue` внутри своей транзакции. Воркер `lib/server/queue/worker.ts` опрашивает таблицу раз в секунду, берёт задачу через `UPDATE ... WHERE status='pending' AND visible_at <= now` и выполняет хендлер.

```ts
export interface JobHandler<T> {
  readonly topic: JobTopic;
  readonly schema: ZodType<T>;          // payload is validated before the handler runs
  handle(payload: T, ctx: JobContext): Promise<void>;
}
```

Правила:

- **Идемпотентность обязательна.** `idempotencyKey` уникален по `(topic, key)`. Повторная постановка той же задачи не создаёт вторую строку. Хендлер, запущенный дважды, даёт ровно один эффект. На каждый хендлер пишется тест «выполнить дважды, проверить один эффект».
- Ретраи: экспоненциальный бэкофф `2^attempts` секунд, `maxAttempts = 5`, после исчерпания статус `dead` и запись в лог с уровнем error. Payload, который не прошёл схему хендлера, и топик без хендлера бросают `InvalidPayloadError`: задача сразу уходит в `dead` без ретраев.
- Payload содержит только идентификаторы и минимум данных. Тело письма собирается в хендлере из БД на момент отправки.
- Задача не запускает другую задачу напрямую, только через постановку в очередь.

### 7.2 Топики

| Топик | Payload | Ключ идемпотентности | Эффект |
|---|---|---|---|
| `notification.dispatch` | `{ notificationId: number }` | `notification:{id}` | Отправка одного уведомления в один канал, отметка `sent`/`failed` |
| `notification.fanout` | `{ eventKey: EventKey, entityId: number }` | `fanout:{eventKey}:{entityId}` | Разворачивает событие в строки `notifications` по матрице ролей и личным настройкам и в строки `notification_feed` по одной на адресата |
| `charity.recount` | `{ scope: string }` | `charity:{scope}:{requestId}` | Пересборка `charity_totals`, публикация в SSE-топик `charity` |
| `stock.threshold.check` | `{ stockItemId: number }` | `threshold:{id}:{yyyymmdd}` | Сравнение остатка позиции (все цвета вместе) с порогом, событие `stock.below_threshold`; ставит движение, оставившее остаток ниже порога |
| `session.cleanup` | `{}` | `cleanup:{yyyymmdd}` | Удаление протухших сессий, токенов, мёртвых push-подписок |

### 7.3 Доменные события

```ts
export const EVENT_KEYS = [
  'request.submitted', 'request.accepted', 'request.ready', 'request.delivered',
  'request.cancelled', 'request.rejected',
  'request.payment_marked', 'request.paid',
  'stock.below_threshold', 'payroll.week_closed',
  'support.opened', 'support.message_posted', 'support.closed',
  'shop.task_arrived'
] as const;
```

Публикация: `bus.emit(eventKey, entityId, tx)` вставляет `notification.fanout` в очередь. Прямой вызов почты из сервиса запрещён.

Матрица «событие × роль × канал» лежит в `notification_rules` и наполняется сидом. Персональные настройки пользователя перекрывают правило роли.

Правила разворота (`lib/domain/notification/matrix.ts`):

- пара «событие, канал» существует для пользователя, только если правило называет одну из его ролей; значение по умолчанию включено, если хотя бы одно такое правило включено;
- личная настройка из `user_notification_prefs` перекрывает значение по умолчанию; сохранение формы пишет строку на каждую предложенную пару, пару вне предложения сервер отклоняет;
- к заявке человек портала относится как `cp_admin` всегда и как `cp_employee`, только если он автор заявки; заявка на склад в портал не пишет;
- человек мастерской (активная учётная запись контура CRM) относится к событию всеми своими ролями; у заявки на склад роль `driver` не считается, остальные роли мастерской получают её события по правилам; `stock.below_threshold` и `payroll.week_closed` идут только мастерской;
- инициатор действия из адресатов не исключается: payload fanout актора не несёт;
- живой канал один, `push`; `max` оживает в C16, почта о событиях не сообщает;
- fanout создаёт строку `notifications` канала `push` только человеку, у которого есть подписка без `expired_at`, и только если у события есть активный шаблон;
- dispatch собирает текст из шаблона и БД на момент отправки и шлёт его на все живые подписки человека;
- строка `notification_feed` пишется каждому адресату события, человеку портала и человеку мастерской, в той же транзакции, что и строки `notifications`. Адресат считается той же матрицей ролей, но без учёта каналов и личных настроек: фид в приложении выключить нельзя, настройки управляют пушем и МАКС;
- `notifications.payload` хранит `{ entityId }`, текст письма собирается в `notification.dispatch` из БД на момент отправки.

Переменные шаблона привязаны к событию (`EVENT_TEMPLATE_VARIABLES`). События заявки: `{{number}}`, `{{status}}` (подпись из `lib/ui/status.ts`), `{{url}}`, `{{counterparty}}`, `{{externalNumber}}`. `stock.below_threshold`: `{{item}}` (название позиции), `{{code}}`, `{{balance}}`, `{{threshold}}`, `{{unit}}`, `{{url}}`. `payroll.week_closed`: `{{period}}` (границы недели в `org.timezone`), `{{url}}`. `{{url}}` это `ORIGIN` плюс путь по адресату: `/portal/requests/{id}` человеку портала, `/crm/requests/{id}` человеку мастерской с правом `request.read.any`, `/crm/delivery` остальным людям мастерской, `/crm/stock/{id}` у события склада, `/crm/payroll?week={дата начала}` у события выплат. Подстановка идёт в один проход, значение с фигурными скобками не раскрывается. Денежных переменных нет. Переменная вне набора своего события роняет сид и отклоняется при сохранении шаблона в CRM. Фикстура держит по одному шаблону push на событие, сид вставляет отсутствующий шаблон и не перетирает правку руководителя. В `PushMessage.url` уходит тот же путь без `ORIGIN`.

Событие цеха. `shop.task_arrived` несёт id визита (`shop_tasks.id`) и публикуется только при создании визита: штуки, пришедшие в открытый визит, события не дают. Адресаты это активные люди мастерской, у которых есть роль станции визита; к событию они относятся только этой ролью. Правила `push` есть у `carpenter`, `grinder`, `painter`, `upholsterer`. Переменные шаблона: `{{number}}` (номер заявки), `{{station}}` (подпись роли из `ROLE_TITLE`), `{{priority}}` («срочная» или «обычная»), `{{url}}`. Ссылка `/crm/shop/{id визита}`. Строка колокольчика отдаёт `entityId` равным id визита и `requestNumber` его заявки, `requestId` пуст.

События обращений. `support.opened` и `support.closed` несут id обращения, `support.message_posted` id сообщения, поэтому каждое сообщение даёт ровно один разворот. Первое сообщение обращения отдельного `support.message_posted` не даёт. Адресатов считает `supportRecipients` (`lib/domain/support/recipients.ts`) по стороне автора действия: действие портала идёт активным людям мастерской, действие мастерской идёт каждому `cp_admin` контрагента и автору обращения; если `cp_admin` пишет в обращение сотрудника или закрывает его, автор обращения тоже получает событие. Автор действия не получает событие никогда: это исключение из правила «инициатор из адресатов не исключается». Автора fanout читает из `support_messages.author_id`, `support_threads.created_by_id` или `closed_by_id`. Роли дальше режет матрица: правила `push` есть у `manager` и `owner` на все три события и у `cp_admin` и `cp_employee` на `support.message_posted` и `support.closed`. Переменные шаблонов: `{{thread}}` (номер обращения), `{{subject}}`, `{{counterparty}}`, `{{author}}` (ФИО автора действия), `{{url}}`; у `support.opened` и `support.message_posted` ещё `{{excerpt}}`, начало текста до 100 символов, обрезанное по слову. Ссылка `/portal/support/{id обращения}` человеку портала и `/crm/support/{id обращения}` человеку мастерской. На стенд новые правила и шаблоны приходят командой `pnpm admin notifications:sync`: она вставляет только отсутствующие строки фикстур и не трогает правку руководителя.

### 7.4 SSE

`GET /api/stream/:topic`, топики `charity` (публичный, без ПДн) и `requests` (только CRM, только сводные счётчики). Транспорт делается в каркасе (слайс K5), слайсы только подписываются.

```ts
type StreamMessage =
  | { topic: 'charity'; totalMinor: number; yearMinor: number; requestCount: number }
  | { topic: 'requests'; byStatus: Record<RequestStatus, number> };
```

---

## 8. Общие типы

Живут в `src/lib/types/`, реэкспорт через `index.ts`. Слайс не объявляет свой параллельный тип для той же сущности.

```ts
// roles.ts
export const ROLE_CODES = ['owner','manager','carpenter','grinder','painter','upholsterer','driver','cp_admin','cp_employee'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
export const CRM_ROLES = ['owner','manager','carpenter','grinder','painter','upholsterer','driver'] as const;   // manager is shown as «Администратор»
// Shop roles in the order a coffin passes them before the warehouse; a work type may belong to one.
export const WORK_ROLES = ['carpenter','grinder','painter','upholsterer'] as const;
export type WorkRole = (typeof WORK_ROLES)[number];
export const PORTAL_ROLES = ['cp_admin','cp_employee'] as const;

// actor.ts — passed into every service, built once in hooks.server.ts
export interface ActorContext {
  readonly userId: number;
  readonly roles: readonly RoleCode[];
  readonly scope: 'portal' | 'crm';
  readonly counterpartyId: number | null;   // row-level filter for portal users
  readonly canSeePrices: boolean;           // false for cp_employee, the shop roles (WORK_ROLES), driver
  readonly canSeeCost: boolean;             // owner and manager
  readonly requestId: string;               // correlation id for logs and audit
}

// request.ts
export const REQUEST_STATUSES = ['draft','new','in_work','ready','delivered','awaiting_payment','paid','cancelled','rejected'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface Transition {
  readonly from: RequestStatus; readonly to: RequestStatus;
  readonly roles: readonly (RoleCode | 'system')[];
  readonly ownOnly?: boolean;
  readonly requiresReason?: boolean; readonly auto?: boolean;
  readonly guards?: readonly GuardCode[]; readonly effects?: readonly EffectCode[];
}

// Role-projected DTO. Price fields are optional by type, so a missing check fails at compile time.
export interface RequestListItemDto {
  id: number; number: string; status: RequestStatus; priority: 'normal' | 'urgent';
  counterpartyName: string | null; itemCount: number; unitCount: number;
  firstItemTitle: string | null; authorName: string | null; externalNumber: string | null;
  createdAt: string; submittedAt: string | null; readyAt: string | null; deliveredAt: string | null;
  totalMinor?: number; paidMinor?: number; charityAmountMinor?: number;
}

// Portal draft (P4). Money keys only for a role with prices; the stored sums are computed for every role.
export interface DraftItemDto {
  id: number; productId: number; variantId: number; productTitle: string; sku: string; sizeCode: string; materialTitle: string;
  coverMediaId: number | null; qty: number; options: { id: number; kind: string; title: string }[];
  unitPriceMinor?: number;               // variant price plus option surcharges, one piece
  lineTotalMinor?: number;
  agencyUnitPriceMinor?: number;         // shown to both portal roles, never summed into the draft (P7)
}
export interface DraftDto {
  id: number; number: string; items: DraftItemDto[]; unitCount: number;
  deliveryAddressId: number | null; deliveryAt: string | null; deceasedName: string | null; comment: string | null;
  addresses: DeliveryAddressDto[]; updatedAt: string;
  itemsTotalMinor?: number; discountPercent?: number; discountMinor?: number; totalMinor?: number;
}
export interface SubmittedRequestDto { id: number; number: string; status: RequestStatus; }
export interface LastRequestDto { id: number; number: string; submittedAt: string | null; itemCount: number; unitCount: number; totalMinor?: number; }

// Portal registry and card of a sent request (P6). Drafts never show up here: the cart owns them.
export const REQUEST_SORTS = ['submittedAt','number','total'] as const;   // total: ignored for a price-blind role
export interface RequestFilters {
  statuses?: RequestStatus[];            // empty means every status the actor may see
  from?: string; to?: string;            // ISO dates, closed window over submittedAt
}
export interface RequestListPageDto extends Page<RequestListItemDto> {
  countsByStatus: Record<RequestStatus, number>;   // chips of the registry, counted before paging
}
export interface RequestItemDto {
  id: number; productId: number; productTitle: string; sku: string; sizeCode: string; materialTitle: string;
  qty: number; engraving: string | null; comment: string | null;
  options: { id: number; kind: string; title: string }[];
  unitPriceMinor?: number; lineTotalMinor?: number; agencyUnitPriceMinor?: number;
}
export interface RequestHistoryStepDto {
  id: number; fromStatus: RequestStatus | null; toStatus: RequestStatus;
  actorName: string | null;              // null for an automatic step of tech.md 6.2
  reasonTitle: string | null; comment: string | null; createdAt: string;
}
export interface RequestCommentDto { id: number; authorName: string; isMine: boolean; body: string; createdAt: string; }
export interface RequestAttachmentDto { id: number; name: string; mime: string; sizeBytes: number; createdAt: string; }
export interface RequestCardDto {
  id: number; number: string; status: RequestStatus; priority: 'normal' | 'urgent';
  createdAt: string; submittedAt: string | null; externalNumber: string | null; comment: string | null;
  authorName: string | null; deliveryAddress: string | null; deliveryAt: string | null; deceasedName: string | null;
  items: RequestItemDto[]; unitCount: number;
  history: RequestHistoryStepDto[]; comments: RequestCommentDto[]; attachments: RequestAttachmentDto[];
  targets: RequestStatus[];              // moves the actor may ask for, guards aside (tech.md 6.2)
  itemsTotalMinor?: number; discountPercent?: number; discountMinor?: number; totalMinor?: number; paidMinor?: number;
  charityAmountMinor?: number;           // frozen on delivery (P8), role with prices only
}

// notifications.ts — personal settings and the delivery log of a portal user (P9).
export const NOTIFICATION_CHANNELS = ['push','max'] as const;      // mail carries access letters only
export const LIVE_CHANNELS = ['push'] as const;            // max joins in C16
export const NOTIFICATION_STATUSES = ['queued','sent','failed'] as const;
export interface NotificationPrefDto { eventKey: EventKey; channel: NotificationChannel; enabled: boolean; isDefault: boolean; }
export interface NotificationLogItemDto {
  id: number; eventKey: EventKey; channel: NotificationChannel; status: NotificationStatus; attempts: number;
  requestId: number | null; requestNumber: string | null;   // null when the row points outside the actor's counterparty
  createdAt: string; sentAt: string | null;                  // the driver error never leaves the server
}
export interface NotificationSettingsDto { prefs: NotificationPrefDto[]; log: Page<NotificationLogItemDto>; }
// The bell of the portal header. The feed is not a channel: a user cannot switch it off.
export interface NotificationFeedItemDto {
  id: number; eventKey: EventKey; requestId: number | null; requestNumber: string | null;
  entityId: number | null; entityLabel: string | null;   // stock item or payroll week of a workshop event, null elsewhere
  isRead: boolean; createdAt: string;
}
export interface NotificationBellDto { unread: number; items: NotificationFeedItemDto[]; }

// crm-notifications.ts — the matrix the owner reads (C12). The seed writes it.
export interface NotificationRuleCellDto { eventKey: EventKey; roleCode: RoleCode; channel: NotificationChannel; enabled: boolean; isLive: boolean; }

// push.ts — devices, templates and the owner's delivery log (C15).
export const DELIVERY_FAILURES = ['expired','driver'] as const;
export interface PushStateDto { publicKey: string; deviceCount: number; }   // empty key: push is not configured
export interface NotificationTemplateDto {
  eventKey: EventKey; channel: NotificationChannel; title: string; body: string; isActive: boolean;
  variables: readonly string[];                               // EVENT_TEMPLATE_VARIABLES of the event
}
export interface NotificationTemplatePreviewDto { title: string; body: string; }
export interface NotificationDeliveryDto extends NotificationLogItemDto {
  userId: number; userName: string; failure: DeliveryFailure | null;   // the code only, never the driver answer
}
// validation/push.ts
// pushSubscriptionSchema  = strictObject({ endpoint: https url, p256dh: string, auth: string })
// pushUnsubscribeSchema   = strictObject({ endpoint: https url })
// pushTemplateSchema      = strictObject({ eventKey, title: 1..80, body: 1..200, isActive: boolean })
// deliveryFiltersSchema   = object({ eventKey?: EventKey, status?: NotificationStatus })

// landing.ts — what a guest may see on `/` (P13). No article, price or stock leaves the catalog.
export const LANDING_WORKS_LIMIT = 9;
export interface LandingWorkDto { coverMediaId: number; title: string; }
export interface LandingCharityDto { fundTitle: string; fundUrl: string | null; ratePercent: number; }
// The operator of the site for the footer and the legal pages. Bank details never leave the server.
export interface PublicOperator { name: string; inn: string | null; ogrn: string | null; email: string | null; }
export interface PublicContacts { phone: string | null; address: string | null; operator: PublicOperator | null; }

// search.ts — hints of the portal header search. No price key for any role: a hint only leads to a page.
export const SITE_SEARCH_LIMITS = { categories: 5, products: 6 } as const;
export interface SiteSearchDto {
  categories: { id: number; title: string }[];
  products: { id: number; sku: string; title: string }[];
}

// charity.ts — donation banner of the portal home (P8). `public` keys are the fund's public figures.
export interface CharityBannerDto {
  fundTitle: string; fundUrl: string | null;
  publicTotalMinor: number; publicYearMinor: number; publicRequestCount: number;
  ownTotalMinor?: number;                // scope cp:{id}; hidden from a price-blind role, it reveals the purchase volume
  transferDocumentUrl: string | null;    // /api/files/[id] of the transfer confirmation, every portal role
}
// The transfer confirmation in the fund block of the CRM settings.
export interface CharityDocumentDto { url: string; sizeBytes: number; uploadedAt: string; }

// list.ts — one shape for every registry in the app
export interface ListQuery<F = Record<string, unknown>> {
  page: number; perPage: number; sort?: string; dir?: 'asc' | 'desc';
  search?: string; filters?: F;
}
export interface Page<T> { rows: T[]; total: number; page: number; perPage: number; }

// catalog.ts — role projections of the catalog (P1). Price keys are optional and never selected for a price-blind role.
export const OPTION_KINDS = ['color'] as const;
export const CATALOG_SORTS = ['sortOrder','title','price'] as const;   // price: personal price; a price-blind role sorts by the agency price, models without one go last
export interface CatalogFilters {                                        // one variant has to satisfy all filters at once (P3)
  categoryId?: number; materialIds?: number[]; colorOptionIds?: number[];
  lengthFromMm?: number; lengthToMm?: number;   // the storefront shows no stock
}
export interface CategoryDto { id: number; title: string; parentId: number | null; productCount: number; minPriceMinor?: number; agencyMinPriceMinor?: number; }
export interface CategoryGroupDto { category: CategoryDto; children: CategoryDto[]; showcase: ProductListItemDto[]; }
export interface CatalogFacetsDto {
  materials: { id: number; title: string; productCount: number }[]; colors: { id: number; title: string }[];
  lengthMm: { min: number | null; max: number | null };
}
export interface ProductListItemDto {
  id: number; sku: string; title: string; categoryId: number | null; coverMediaId: number | null; variantCount: number;
  materialTitles: string[]; lengthsMm: number[];   // no stock on the storefront
  minPriceMinor?: number;
  agencyPriceMinor?: number;             // price of the counterparty for its own client (P7), one per model
}
export interface OptionDto { id: number; kind: OptionKind; title: string; isDefault: boolean; priceDeltaMinor?: number; }
export interface VariantDto {
  id: number; sku: string; sizeCode: string; materialTitle: string;
  lengthMm: number | null; widthMm: number | null; heightMm: number | null; weightG: number | null;
  options: OptionDto[];                  // compatibility matrix of the variant
  priceMinor?: number;                   // base price in P1, personal price from P2
  costPriceMinor?: number;               // owner only
}
export interface ProductDto {
  id: number; sku: string; title: string; description: string | null;
  categoryId: number | null; categoryTitle: string | null; mediaIds: number[]; variants: VariantDto[];
  agencyPriceMinor?: number;             // one per model: the size and the options never move it (P7)
}

// counterparty.ts — counterparty card and portal staff (P2). Money and the discount only for a role with prices.
export const STAFF_STATUSES = ['active','invited','disabled'] as const;   // derived, never stored
export interface ContactDto { fullName: string; phone: string | null; email: string; }
export interface CounterpartySummaryDto { name: string; manager: ContactDto | null; }
// Requisites and the contract discount are not on the portal card: the CRM card (C3) keeps them.
export interface CounterpartyCardDto {
  id: number; name: string;
  contract: { number: string; signedAt: string | null; validUntil: string | null } | null;
  manager: ContactDto | null; staffPreview: (ContactDto & { role: PortalRole })[]; staffCount: number; staffLimit: number;
  debtMinor?: number; yearPurchasesMinor?: number; yearDeliveries?: number;
}
export interface StaffMemberDto {
  id: number; fullName: string; email: string; phone: string | null; role: PortalRole;
  status: StaffStatus; lastLoginAt: string | null; isSelf: boolean;
}
export interface StaffPageDto extends Page<StaffMemberDto> { activeCount: number; staffLimit: number; }
export interface CreatedStaffDto { member: StaffMemberDto; temporaryPassword: string; mailSent: boolean; }

// crm.ts — workshop accounts, dictionaries, settings and the audit journal (C1). Owner only.
export type CrmRole = (typeof CRM_ROLES)[number];
export interface CrmUserDto {
  id: number; fullName: string; email: string; phone: string | null;
  roles: CrmRole[]; status: StaffStatus; lastLoginAt: string | null; isSelf: boolean;
}
export interface CrmUserFilters { role?: CrmRole; status?: StaffStatus; }
export interface CreatedCrmUserDto { user: CrmUserDto; temporaryPassword: string; mailSent: boolean; }
export interface DictItemDto { id: number; dict: DictCode; code: string; title: string; sortOrder: number; isActive: boolean; }
export interface DictItemFilters { dict: DictCode; }
export interface AuditFilters { actor?: string; action?: string; entity?: string; from?: string; to?: string; }
export interface AuditEntryDto {
  id: number; createdAt: string; actorName: string | null; action: string; entity: string; entityId: number | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null; ip: string | null;
}
export const NUMBERING_PERIODS = ['none','year','month'] as const;
export interface NumberingDto { key: 'request'; prefix: string; period: NumberingPeriod; nextPreview: string; }
export interface OrgRequisitesDto {
  name: string; inn?: string; kpp?: string; address?: string; phone?: string; email?: string;
  bank?: string; bik?: string; account?: string;
}
export interface CrmSettingsDto {
  requisites: OrgRequisitesDto | null; timezone: string; numbering: NumberingDto;
  charityRateBp: number | null; charityFund: { title: string; url?: string } | null; staffLimitDefault: number;
}

// crm-catalog.ts — management projections (C2). Dates are ISO strings in server responses.
export interface CrmCategoryDto { id: number; title: string; parentId: number | null; sortOrder: number; }
export interface CrmMediaDto { id: number; sortOrder: number; isCover: boolean; }
export interface CrmOptionDto {
  id: number; kind: 'color'; title: string; priceDeltaMinor: number;
  stockItemId: number | null; isActive: boolean;
}
export interface CrmVariantDto {
  id: number; productId: number; sku: string; sizeCode: string; materialId: number;
  lengthMm: number | null; widthMm: number | null; heightMm: number | null; weightG: number | null;
  basePriceMinor: number; costPriceMinor?: number; stockItemId: number | null;
  isPublished: boolean; isDeleted: boolean;
  options: { optionId: number; isDefault: boolean }[];
}
export interface CrmProductDto {
  id: number; sku: string; title: string; categoryId: number | null; description: string | null;
  isPublished: boolean; isDeleted: boolean; sortOrder: number;
  media: CrmMediaDto[]; variants: CrmVariantDto[];
}
export interface CrmProductListItemDto {
  id: number; sku: string; title: string; categoryId: number | null;
  isPublished: boolean; isDeleted: boolean; variantCount: number; coverMediaId: number | null;
}
export interface CrmPriceListDto {
  id: number; title: string; isBase: boolean; validFrom: string | null; validTo: string | null;
  items: { variantId: number; priceMinor: number }[];
}
export interface CrmDiscountRuleDto {
  id: number; counterpartyId: number | null; categoryId: number | null;
  percent: number; validFrom: string | null; validTo: string | null;
}
export interface CrmCatalogChoicesDto {
  materials: { id: number; title: string }[];
  stockProducts: { id: number; code: string; title: string }[];
  stockComponents: { id: number; code: string; title: string }[];
  variants: { id: number; sku: string; productTitle: string }[];
}
export interface CrmPricingChoicesDto { counterparties: { id: number; name: string }[]; }

// crm-counterparty.ts — the counterparty card of the workshop (C3). Money keys only for a role with prices.
export const PAYMENT_METHODS = ['cash','bank','card','offset'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export interface CrmCounterpartyFilters { managerId?: number; scheme?: SettlementScheme; hasDebt?: boolean; }
export interface CrmCounterpartyListItemDto {
  id: number; name: string; inn: string | null; managerName: string | null;
  settlementScheme: SettlementScheme; staffCount: number; isActive: boolean;
  debtMinor?: number;
}
// Debt of a request: max(0, totalMinor - sum of its payment marks), statuses delivered and awaiting_payment.
export interface CrmCounterpartyDebtDto { debtMinor: number; openCount: number; }
export interface CrmContractDto extends ContractDto { id: number; }
export interface CrmDeliveryAddressDto extends DeliveryAddressDto { contactName: string | null; contactPhone: string | null; }
export interface CrmCounterpartyCardDto {
  id: number; name: string; legalName: string | null; inn: string | null; kpp: string | null;
  address: string | null; phone: string | null; email: string | null;
  regionPriceListId: number | null; discountPercent: number; settlementScheme: SettlementScheme;
  managerId: number | null; staffLimit: number; notes: string | null; isActive: boolean;
  contracts: CrmContractDto[]; addresses: CrmDeliveryAddressDto[];
  users: StaffMemberDto[];               // isSelf is always false: a workshop actor has no portal account
  debt?: CrmCounterpartyDebtDto;
}
export interface CrmPaymentMarkDto {
  id: number; requestId: number; requestNumber: string; amountMinor: number;
  paidAt: string; method: PaymentMethod; comment: string | null; createdByName: string;
  reversalOfId: number | null;           // a reversal row carries the negated amount of the mark it cancels
  isReversed: boolean;                   // a later row cancelled this mark
}
export interface CrmCounterpartyChoicesDto {
  managers: { id: number; fullName: string }[]; priceLists: { id: number; title: string }[];   // regional lists only
}
export interface CreatedCounterpartyDto { counterpartyId: number; access: CreatedStaffDto; }
// Tab «Цены» of the card: a role with prices only. personalPriceMinor null means the chain decides.
// basePriceMinor is the chain without the personal list: region, base list, variant price.
export interface CounterpartyPriceFilters { search?: string; categoryId?: number; }
export interface CounterpartyPriceRowDto {
  variantId: number; productTitle: string; categoryTitle: string; sku: string; sizeCode: string;
  basePriceMinor: number; personalPriceMinor: number | null;
}
export interface CounterpartyPriceSaveResult { updated: number; cleared: number; }
// A payment against the whole debt: how many requests it reached and how many it closed.
export interface CounterpartyPaymentResult { amountMinor: number; requestCount: number; closedCount: number; }
// The request history of the card reuses Page<RequestListItemDto>, drafts excluded.

// crm-request.ts — board, registry and card of the workshop (C4). Money keys only for a role with prices.
export const BOARD_STATUSES = ['new','in_work','ready','delivered','awaiting_payment','paid'] as const;
export const BOARD_COLUMN_LIMIT = 50;
export const BOARD_PAID_DAYS = 7;                   // the paid column keeps the last week only
export const ATTENTION_FLAGS = ['payment_overdue'] as const;   // no_assignee left with the assignees
export type AttentionFlag = (typeof ATTENTION_FLAGS)[number];
export const CRM_REQUEST_SORTS = ['submittedAt','number','deliveryAt','total'] as const;   // total: role with prices only
export const CRM_REQUEST_EXPORT_LIMIT = 5000;
export interface CrmRequestFilters {
  status?: RequestStatus;                // registry only: the board has a column per status
  counterpartyId?: number; stockOnly?: boolean;
  priority?: RequestPriority; flag?: AttentionFlag;
  from?: string; to?: string;            // ISO dates, closed window over submittedAt in org.timezone
}
export interface CrmRequestListItemDto extends RequestListItemDto {
  counterpartyId: number | null; isStockRequest: boolean; deliveryAt: string | null;
  flags: AttentionFlag[];
  stations: WorkRole[];                  // stations holding open jobs of the request, in shop order
}
export interface CrmBoardColumnDto { status: RequestStatus; total: number; cards: CrmRequestListItemDto[]; }
export interface CrmBoardDto { columns: CrmBoardColumnDto[]; }
// free: `new`, the whole request is repriced; controlled: `in_work`, frozen prices and a comment; closed: later.
export const ITEMS_EDIT_MODES = ['free','controlled','closed'] as const;
export type ItemsEditMode = (typeof ITEMS_EDIT_MODES)[number];
export interface CrmRequestCardDto extends Omit<RequestCardDto, 'comments' | 'supportThreads'> {
  counterpartyId: number | null; counterpartyName: string | null; isStockRequest: boolean;
  flags: AttentionFlag[]; itemsEdit: ItemsEditMode;
  canMarkPayment: boolean;               // awaiting_payment, a counterparty request, the right request.payment.mark, a rest above zero
  payments?: CrmPaymentMarkDto[];        // newest first, role with prices only
  dueMinor?: number;                     // max(0, totalMinor - sum of the marks); 0 for a stock request
  shop: CrmLineShopDto[];                // one per line while the request is in_work, empty otherwise
}
export interface CrmRequestChoicesDto {
  counterparties: { id: number; name: string }[];
  variants: { id: number; sku: string; productTitle: string; sizeCode: string; materialTitle: string; options: { id: number; title: string }[] }[];
  refusalReasons: { id: number; title: string }[];
}
export interface CreatedCrmRequestDto { id: number; number: string; }

// crm-shop.ts — the shop stations (C19). A visit is a request at a station; a job is the pieces of a line there.
// No money keys, no counterparty, no address and no deceased name for any role.
export const SHOP_TASK_LIMIT = 50;                  // visits shown per station and list, the number search reaches the rest
export const SHOP_JOB_MAX = 999;                    // pieces in one job, the line limit of the cart
export interface ShopTaskListItemDto {
  id: number; requestId: number; number: string; station: WorkRole; priority: RequestPriority;
  isStockRequest: boolean; deliveryAt: string | null; takenAt: string | null;
  unitCount: number; doneCount: number;              // pieces of the visit and pieces done at this station
}
export interface ShopStationDto {
  station: WorkRole;
  fresh: ShopTaskListItemDto[];                       // not taken yet, in station order (§20.4)
  taken: ShopTaskListItemDto[];
  total: number;                                     // open visits of the station matching the search
}
export interface ShopDto { stations: ShopStationDto[]; }   // the actor's stations; manager and owner get all four
export interface ShopPositionDto {                   // a stock position of a product: the variant plus its colour; delivery reuses it
  variantId: number; optionId: number | null;
  productTitle: string; sku: string; sizeCode: string; materialTitle: string; colorTitle: string | null;
}
export interface ShopJobDto extends ShopPositionDto {
  id: number; itemId: number;
  engraving: string | null; comment: string | null;
  qty: number; doneQty: number;
}
export interface ShopTaskDto {
  id: number; requestId: number; number: string; station: WorkRole; priority: RequestPriority;
  isStockRequest: boolean; deliveryAt: string | null; comment: string | null;
  takenAt: string | null; takenByName: string | null; completedAt: string | null;
  jobs: ShopJobDto[];
  canTake: boolean;                                  // open and not taken
  canComplete: boolean;                              // open, has jobs, every job done to the piece
}
// The shop side of a request line on the CRM card and of a card on the board.
export interface CrmLineShopDto {
  itemId: number;
  fromStockQty: number;                              // pieces allocateStock gives the line now
  stations: { station: WorkRole; qty: number; doneQty: number }[];   // open jobs, in shop order
  madeQty: number;                                   // pieces that passed the upholsterer
  heldBy: string[];                                  // numbers of requests ahead in fillOrder that hold this position
}

// crm-delivery.ts — the delivery screen (C6). The driver takes cash, so an assembled request carries its sums.
export const DELIVERY_LIST_LIMIT = 50;              // requests per list; the nearest deadlines come first
export const DELIVERED_DAYS = 7;                     // the delivered block looks this many days back
export interface DeliveryLineDto extends ShopPositionDto {
  itemId: number; qty: number; loadedQty: number;
  loadableQty: number;                               // pieces the shelf holds for the rest of the line, 0 outside `ready`
}
export interface DeliveryStopDto {
  id: number; number: string; status: 'in_work' | 'ready'; priority: RequestPriority;
  counterpartyName: string; externalNumber: string | null; deceasedName: string | null; deliveryAt: string | null;
  address: string | null; contactName: string | null; contactPhone: string | null;
  navigationUrl: string | null;                      // Yandex Maps: by coordinates, else by the address text
  unitCount: number; loadedCount: number; lines: DeliveryLineDto[];
  canDeliver: boolean;                               // every line loaded: guard fullyLoaded of tech.md 6.2
  totalMinor?: number;                               // `ready` only; cash at the door covers it whole, there is no prepayment
}
// Handed over in the last DELIVERED_DAYS by `delivered_at`, the newest first; no money keys.
export interface DeliveredStopDto {
  id: number; number: string; counterpartyName: string; deceasedName: string | null; address: string | null;
  deliveredAt: string; unitCount: number; status: 'delivered' | 'awaiting_payment' | 'paid';
}
export interface DeliveryDto {
  ready: DeliveryStopDto[]; readyTotal: number; planned: DeliveryStopDto[]; plannedTotal: number;
  delivered: DeliveredStopDto[]; deliveredTotal: number;
}

// crm-stock.ts — the warehouse (C8). Balance is the sum of moves, every figure opens into its moves. The only money key is the item cost for canSeeCost.
export const STOCK_KINDS = ['product', 'component'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];
export const MANUAL_MOVE_TYPES = ['purchase', 'adjustment'] as const;   // what the move form writes and what a reversal may cancel
export type ManualMoveType = (typeof MANUAL_MOVE_TYPES)[number];
export const INVENTORY_STATUSES = ['draft', 'applied'] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
export const STOCK_MOVE_MAX = 100000;               // units in one manual move or one inventory line
export const STOCK_COST_MAX_MINOR = 1_000_000_000;   // cost of one unit: 10 000 000 roubles
export interface StockFilters { kind?: StockKind; belowThreshold?: boolean; negative?: boolean; activeOnly?: boolean; }
export interface StockRowDto {
  id: number; kind: StockKind; code: string; title: string; unitId: number; unitTitle: string;
  minThreshold: number; isActive: boolean;
  balance: number;                                   // sum of every move of the item, all colours of a product together
  isBelowThreshold: boolean;                         // minThreshold > 0 and balance < minThreshold
  isNegative: boolean;                               // any position of the item is below zero
  costPriceMinor?: number;                           // cost of one unit, canSeeCost only
}
export interface StockPositionDto { optionId: number | null; colorTitle: string | null; balance: number; }
export interface StockMoveDto {
  id: number; occurredAt: string; type: StockMoveType; qty: number;
  optionId: number | null; colorTitle: string | null;
  requestId: number | null; requestNumber: string | null;
  reasonTitle: string | null; comment: string | null; actorName: string | null;
  reversalOfId: number | null; isReversed: boolean;
  canReverse: boolean;                               // a manual move not yet reversed, the right stock.manage
}
export interface StockCardDto extends StockRowDto {
  positions: StockPositionDto[];                     // one row for a component, a row per colour for a product
  colors: { id: number; title: string }[];           // colours the move form offers: the matrix of the variant, empty for a component
  canManage: boolean;
}                                                    // the journal comes apart as ListResult<StockMoveDto>
export interface StockChoicesDto { units: { id: number; title: string }[]; reasons: { id: number; title: string }[]; canSeeCost: boolean; }
export interface InventoryRowDto {
  id: number; kind: StockKind; status: InventoryStatus; comment: string | null;
  createdByName: string; createdAt: string; appliedAt: string | null;
  lineCount: number; diffCount: number;              // lines where the count differs from the books
}
export interface InventoryLineDto {
  id: number; stockItemId: number; optionId: number | null;
  code: string; title: string; colorTitle: string | null; unitTitle: string;
  expectedQty: number;                               // a draft shows the live balance, an applied one the frozen figure
  actualQty: number;
}
export interface InventoryCardDto extends InventoryRowDto { lines: InventoryLineDto[]; canManage: boolean; }

// crm-payroll.ts — staff, work prices, day sheets and the weekly payroll (C10). Read by payroll.read only.
export const PAYROLL_PERIOD_STATUSES = ['open', 'calculated', 'paid'] as const;
export type PayrollPeriodStatus = (typeof PAYROLL_PERIOD_STATUSES)[number];
export const PAYROLL_QTY_MAX = 10_000;                  // units of one work in a day
export const PAYROLL_RATE_MAX_MINOR = 100_000_000;      // 1 000 000 roubles per unit
export const PAYROLL_ADJUSTMENT_MAX_MINOR = 100_000_000;
export const PAYROLL_SHARE_STEP_MINOR = 100;            // a worker's day pay is whole roubles, rounded down
export const PAYROLL_REPORT_MAX_DAYS = 366;
export interface StaffDto { id: number; fullName: string; position: string | null; isActive: boolean; hasAccount: boolean; }
export interface WorkTypeDto { id: number; title: string; rateMinor: number; roleCode: WorkRole | null; isActive: boolean; }   // listed in WORK_ROLES order, general works last
export interface WorkEntryDto { workTypeId: number; title: string; qty: number; rateMinor: number; amountMinor: number; staffIds: number[]; }
export interface WorkDayStaffDto { id: number; fullName: string; position: string | null; present: boolean; }
export interface WorkDayDto {
  date: string;                                        // 'YYYY-MM-DD' in org.timezone
  weekStartsOn: string;
  periodStatus: PayrollPeriodStatus;
  canEdit: boolean;                                    // the period is open and the actor holds payroll.manage
  canCopyPrevious: boolean;                            // nobody is marked yet and an earlier marked day exists
  staff: WorkDayStaffDto[];                            // active staff plus whoever is already on the day
  workTypes: WorkTypeDto[];                            // active ones plus those already on the day
  entries: WorkEntryDto[];
  presentCount: number; totalMinor: number;
  shares: { staffId: number; shareMinor: number }[];   // one per present worker, 0 for one in no crew
}
export interface PayrollDayCellDto { date: string; presentCount: number; totalMinor: number; }
export interface PayrollLineDto {
  id: number | null;                                   // null until the line is stored
  staffId: number; fullName: string; position: string | null;
  daysWorked: number; accruedMinor: number;
  adjustmentMinor: number; adjustmentComment: string | null;
  payoutMinor: number;                                 // accruedMinor + adjustmentMinor, never below zero
  paidAt: string | null; paidComment: string | null;
}
export interface PayrollWeekDto {
  periodId: number | null;                             // null until the first day or adjustment of the week
  startsOn: string; endsOn: string;                    // 'YYYY-MM-DD', both inside the week
  status: PayrollPeriodStatus; closedAt: string | null; closedByName: string | null;
  days: PayrollDayCellDto[];                           // seven cells, a day nobody marked has zeros
  lines: PayrollLineDto[];                             // open: active staff plus anyone with a day or an adjustment; closed: the frozen lines
  totalPayoutMinor: number; canManage: boolean;
}
export interface PayrollReportDto {
  from: string; to: string;
  staff: { staffId: number; fullName: string; daysWorked: number; accruedMinor: number }[];
  works: { workTypeId: number; title: string; qty: number; amountMinor: number }[];
  worksTotalMinor: number; accruedTotalMinor: number;  // they differ by the rounding remainder
}

// crm-reports.ts — the owner's reports and the fund registry (C13). Read by reports.read only.
export const REPORT_MAX_DAYS = 366;
export const REPORT_PRESETS = ['week', 'month', 'quarter', 'year'] as const;
export const SALES_GROUPS = ['counterparty', 'model', 'period'] as const;
export const SALES_BUCKETS = ['day', 'week', 'month'] as const;
export const LOST_STATUSES = ['cancelled', 'rejected'] as const;
export const FUNNEL_STAGES = ['new', 'in_work', 'ready', 'delivered', 'paid'] as const;
export const CHARITY_TRANSFER_MAX_MINOR = 10_000_000_000; // 100 000 000 roubles
export type ReportPreset = (typeof REPORT_PRESETS)[number];
export type SalesGroup = (typeof SALES_GROUPS)[number];
export type SalesBucket = (typeof SALES_BUCKETS)[number];
export type LostStatus = (typeof LOST_STATUSES)[number];
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** 'YYYY-MM-DD' in org.timezone, both inclusive. */
export interface ReportRangeDto {
  from: string;
  to: string;
}

export interface SalesTotalsDto {
  requestCount: number;
  qty: number;
  itemsTotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  paidMinor: number; // paid so far on these requests
}
export interface SalesByCounterpartyRowDto extends SalesTotalsDto {
  counterpartyId: number;
  title: string;
}
export interface SalesByModelRowDto {
  modelId: number;
  title: string;
  requestCount: number;
  qty: number;
  linesTotalMinor: number; // sum of line totals, before the request discount
}
export interface SalesByPeriodRowDto extends SalesTotalsDto {
  bucketFrom: string;
  bucketTo: string;
}
export type SalesRowsDto =
  | { group: 'counterparty'; rows: SalesByCounterpartyRowDto[] }
  | { group: 'model'; rows: SalesByModelRowDto[] }
  | { group: 'period'; bucket: SalesBucket; rows: SalesByPeriodRowDto[] };
// By counterparty with the margin: cost = qty × today's stock item cost, margin = total - cost.
export interface MarginTotalsDto {
  requestCount: number; qty: number; totalMinor: number; costMinor: number; marginMinor: number;
  marginBp: number | null;                           // share of the margin in the total, null for a total of zero
  paidMinor: number; uncostedQty: number;            // pieces whose stock item has no cost
}
export interface CounterpartyMarginRowDto extends MarginTotalsDto { counterpartyId: number; title: string; }
export interface CounterpartyRequestRowDto extends Omit<MarginTotalsDto, 'requestCount'> {
  requestId: number; number: string; status: RequestStatus; deliveredAt: string;
}
export interface CounterpartyReportDto {
  range: ReportRangeDto; counterpartyId: number | null; totals: MarginTotalsDto;
  rows: CounterpartyMarginRowDto[];                  // the highest margin first
  requests: CounterpartyRequestRowDto[];             // of the chosen counterparty, the newest delivery first; empty without one
}
export type SalesReportDto = SalesRowsDto & {
  range: ReportRangeDto;
  counterpartyId: number | null;
  totals: SalesTotalsDto;
};

export interface StockTurnoverRowDto {
  stockItemId: number;
  optionId: number | null;
  code: string;
  title: string;
  optionTitle: string | null;
  unitTitle: string;
  openingQty: number;
  incomeQty: number;
  outcomeQty: number;
  closingQty: number;
  shippedQty: number; // shipments net of their reversals
  turnoverDays: number | null; // null when nothing was shipped
}
export interface StockTurnoverReportDto {
  range: ReportRangeDto;
  kind: StockKind | null;
  rows: StockTurnoverRowDto[];
}

export interface FunnelStageDto {
  stage: FunnelStage;
  count: number;
  shareOfPreviousBp: number | null; // null on the first stage and after an empty one
  shareOfFirstBp: number | null;
}
export interface FunnelReportDto {
  range: ReportRangeDto;
  stages: FunnelStageDto[];
  cancelledCount: number;
  rejectedCount: number;
}

export interface LostRequestRowDto {
  requestId: number;
  number: string;
  status: LostStatus;
  at: string; // moment of the terminal transition
  counterpartyId: number | null;
  counterpartyTitle: string | null;
  reasonTitle: string | null;
  comment: string | null;
  totalMinor: number;
}
export interface LostReasonRowDto {
  reasonId: number | null;
  title: string;
  count: number;
  totalMinor: number;
}
export interface LostReportDto {
  range: ReportRangeDto;
  status: LostStatus | null;
  cancelledCount: number;
  rejectedCount: number;
  totalMinor: number;
  reasons: LostReasonRowDto[];
  page: Page<LostRequestRowDto>;
}

export interface CharityTransferDto {
  id: number;
  amountMinor: number;
  transferredOn: string; // 'YYYY-MM-DD' in org.timezone
  documentRef: string | null;
  comment: string | null;
  createdByName: string;
  createdAt: string;
  reversalOfId: number | null; // this row cancels another one
  isReversed: boolean; // another row cancels this one
}
export interface CharityAccrualRowDto {
  counterpartyId: number;
  title: string;
  requestCount: number;
  amountMinor: number;
}
export interface CharityReportDto {
  range: ReportRangeDto;
  accruedAllMinor: number; // equals the banner's all-time figure
  transferredAllMinor: number;
  remainderMinor: number;
  accruedInRangeMinor: number;
  transferredInRangeMinor: number;
  accruals: CharityAccrualRowDto[];
  transfers: Page<CharityTransferDto>;
  canManage: boolean;
}

export interface DashboardDto {
  range: ReportRangeDto;
  sales: SalesTotalsDto;
  debtMinor: number; // current debt of all counterparties
  statusCounts: Record<Exclude<RequestStatus, 'draft'>, number>; // as of now
  payrollAccruedMinor: number; // accrued to the crew for days of the range
  charityAccruedInRangeMinor: number;
  charityRemainderMinor: number;
  belowThresholdCount: number;
  topCounterparties: SalesByCounterpartyRowDto[]; // five by totalMinor
  topModels: SalesByModelRowDto[]; // five by linesTotalMinor
}
// validation/crm-reports.ts
// reportRangeSchema            = object({ from, to }): 'YYYY-MM-DD', from <= to, not longer than REPORT_MAX_DAYS
// salesReportSchema            = range + { group: SalesGroup = 'counterparty', bucket: SalesBucket = 'month', counterpartyId?: id }
// stockTurnoverSchema          = range + { kind?: StockKind }
// lostReportSchema             = range + { status?: LostStatus }; the registry page comes from parseListQuery
// charityTransferSchema        = object({ amountMinor: 1..CHARITY_TRANSFER_MAX_MINOR, transferredOn, documentRef?: ..100, comment?: ..500 })
// charityTransferReverseSchema = object({ transferId: id, comment: 1..500 })
// The fund report takes reportRangeSchema; the service refuses a transfer dated after today in org.timezone.

// money.ts — branded type, blocks accidental mixing with plain numbers
export type Minor = number & { readonly __brand: 'minor' };

// dicts.ts
export const DICT_CODES = ['material','finish','fabric','hardware','unit','refusal_reason','stock_move_reason','transport'] as const;
export const STOCK_MOVE_TYPES = ['production','shipment','adjustment','inventory','reversal','purchase'] as const;
export const JOB_TOPICS = ['notification.dispatch','notification.fanout','charity.recount','stock.threshold.check','session.cleanup'] as const;

// finance.ts — the owner's money page. Read and written by finance.manage only.
export const FINANCE_KINDS = ['income', 'expense'] as const;
export const FINANCE_SOURCES = ['order_payment', 'manual_income', 'payroll', 'charity', 'manual_expense'] as const;
export const FINANCE_ENTRY_MAX_MINOR = 10_000_000_000;   // 100 000 000 roubles
export const FINANCE_COMMENT_MAX = 500;
export type FinanceKind = (typeof FINANCE_KINDS)[number];
export type FinanceSource = (typeof FINANCE_SOURCES)[number];
export interface FinanceFilters { from: string; to: string; kind: FinanceKind | null; source: FinanceSource | null; }
/** One line of the feed. signedMinor is positive for money in, negative for money out. */
export interface FinanceOperationDto {
  key: string;                            // `${source}:${id}`, unique across sources
  source: FinanceSource; kind: FinanceKind;
  occurredOn: string;                     // 'YYYY-MM-DD' in org.timezone
  signedMinor: number;
  title: string; detail: string | null;
  href: string | null;                    // the source screen; null for a manual entry
  manualId: number | null;                // set for a manual entry only: edit and delete use it
}
export interface FinanceSourceTotalDto { source: FinanceSource; signedMinor: number; count: number; }
export interface FinanceBucketDto { from: string; to: string; incomeMinor: number; expenseMinor: number; }
export interface FinanceSummaryDto {
  range: ReportRangeDto;
  incomeMinor: number; expenseMinor: number; netMinor: number;   // expense is money out, net = income - expense
  bySource: FinanceSourceTotalDto[];      // all five sources, zeros included, in FINANCE_SOURCES order
  bucket: SalesBucket;                    // 'day' up to 31 days, 'week' up to 92, else 'month'
  buckets: FinanceBucketDto[];            // contiguous, empty buckets included
}
export interface FinancePageDto { filters: FinanceFilters; summary: FinanceSummaryDto; feed: Page<FinanceOperationDto>; }

// support.ts
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];
export type SupportSide = (typeof SUPPORT_SIDES)[number];
export const SUPPORT_SUBJECT_MIN = 3, SUPPORT_SUBJECT_MAX = 120, SUPPORT_BODY_MAX = 4000, SUPPORT_EXCERPT_MAX = 100;
export interface SupportThreadListItemDto {
  id: number; subject: string; status: SupportThreadStatus;
  awaiting: SupportSide | null;          // whose turn to answer; null when closed
  counterpartyName: string; authorName: string;
  requestId: number | null; requestNumber: string | null;
  lastMessageAt: string; createdAt: string;
}
export interface SupportMessageDto {
  id: number; side: SupportSide; authorName: string;
  authorRole: string;                    // role title: «Администратор мастерской», «Сотрудник»
  isMine: boolean; body: string; createdAt: string;
}
export interface SupportThreadDto extends SupportThreadListItemDto {
  counterpartyId: number; closedAt: string | null; closedByName: string | null;
  canPost: boolean; canClose: boolean;   // open and the actor passes the fence
  messages: SupportMessageDto[];
}
export interface SupportThreadFilters { status?: SupportThreadStatus; awaiting?: SupportSide; counterpartyId?: number; q?: string }
export interface SupportRequestOptionDto { id: number; number: string; status: RequestStatus }
// No price on any support dto: a request is its number and status.
// RequestCardDto.supportThreads: SupportThreadListItemDto[], threads about the request the reader may open.
// NotificationFeedItemDto of a support event: entityId is the thread id, entityLabel the subject.

// validation/support.ts
// supportOpenSchema    = object({ subject: trim 3..120, body: trim 1..4000, requestId?: id ('' -> undefined) })
// supportPostSchema    = object({ body: trim 1..4000 })
// supportFiltersSchema = object({ status?, awaiting?, counterpartyId?, q?: ..100 }); an unknown value is dropped
```

### 8.1 Проекции по ролям

Цены не прячутся в компоненте. Сервис возвращает DTO, собранный маппером под `ActorContext`:

```ts
// src/lib/server/dto/request.dto.ts
export class RequestDtoMapper {
  // Price fields are attached only when the actor is allowed to see them.
  static toListItem(row: RequestRow, ctx: ActorContext): RequestListItemDto {
    const base = { id: row.id, number: row.number, status: row.status, /* ... */ };
    return ctx.canSeePrices ? { ...base, totalMinor: row.totalMinor, paidMinor: row.paidMinor } : base;
  }
}
```

Правило: `select` для роли без цен не тянет закупочные колонки из БД. Цена агентства закупочной не считается: контрагент задал её сам и показывает своему клиенту, поэтому она приходит обеим ролям портала в ключах с префиксом `agency`. Публичные цифры фонда (§7.4) приходят любой роли в ключах с префиксом `public`. Проверка в e2e: в ответе сервера для `cp_employee` нет ключа с подстрокой `Minor` без префикса `agency` или `public`. Водитель слеп к ценам везде, кроме экрана доставки: там он получает `totalMinor` и `dueMinor` заявки в `ready`, потому что принимает наличные.

---

## 9. UI-примитивы

База — shadcn-svelte поверх Tailwind, одна на оба контура: CRM собирается на ней целиком, портал берёт из неё базовые компоненты и добавляет свои витринные (карточка модели, конфигуратор позиции, баннер пожертвований). Вторую UI-библиотеку не тянем.

Примитивы собираются в каркасе (слайс K4) командой `pnpm ui:add <component>` и дальше живут в репозитории как обычный код: правим стили под токены проекта, не форкаем и не переписываем с нуля. Рендерятся в `routes/(dev)/kitchen-sink`. Слайс не пишет свой `<table>` и свою модалку.

| Компонент | Ключевые пропсы |
|---|---|
| `Button` | `variant: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size: 'sm'\|'md'\|'lg'\|'touch'`, `loading`, `disabled` |
| `TouchButton` | обёртка `Button` с `size='touch'`, минимум 44×44 px, для цеха и водителя |
| `Input` / `Textarea` / `NumberInput` | `label`, `placeholder` (обязателен), `error`, `hint`, `required`, `bind:value` |
| `MoneyInput` | `bind:valueMinor`, `placeholder` (обязателен), ввод в целых рублях, хранение в копейках, `blankZero?`: 0 рисуется пустым полем, пустое поле даёт 0 |
| `Select` / `Combobox` | `options: {value,label}[]`, `placeholder` (обязателен, без общего «Выберите значение»), `bind:value`, `searchable` |
| `Checkbox` / `Switch` / `RadioGroup` | `label`, `bind:checked`; у `Checkbox` ещё `name` и `value` для отправки в форме |
| `DatePicker` / `DateRangePicker` | `bind:value: string`, ISO-строки, `placeholder` по умолчанию «Выберите дату» и «Выберите период» |
| `FileUpload` | `accept`, `maxSizeMb`, `multiple`, `fields` (доп. поля формы, например владелец файла), `onUploaded(mediaId)` |
| `FileInput` | `name`, `accept`, `label`, `hint`, `error`, `required`: файл уходит с формой action в `multipart/form-data`, без коллекции загрузок |
| `DataTable` | `columns`, `rows`, `total`, `query: ListQuery`, `onQueryChange`, `exportUrl`, серверная пагинация; на ширине телефона строка рисуется карточкой: первая колонка заголовком, остальные парами «подпись: значение», пустые пары скрыты, DOM один |
| `FilterBar` | `fields` (у каждого поля свой `placeholder`), `bind:filters`, сохранение в URL, `pageKey?` (ключ страницы, который сбрасывает смена фильтра, по умолчанию `page`); на телефоне поля открывает кнопка «Фильтры: N» |
| `Modal` / `Drawer` / `ConfirmDialog` | `open`, `title`, `onClose`, `{#snippet body()}` |
| `Toast` (`toast.success/error/info/warning`) | глобальный стор на рунах; `(title, { description?, durationMs?, action?: { label, href } })`, `durationMs: 0` держит тост до закрытия, наведение и фокус ставят таймер на паузу, повтор того же текста перезапускает тост вместо копии, в стопке не больше четырёх. Исход form action показывает `withToast({ success?, reset?, pending?, onSuccess? })` из `lib/ui/form-toast.ts`: успех своим текстом, `formError` сервера текстом ошибки, ошибки полей фразой «Проверьте поля формы», обрыв связи отдельной фразой |
| `StatusBadge` | `status: RequestStatus`, палитра и подпись из одного словаря |
| `Card` / `Tabs` / `Breadcrumbs` / `Pagination` | базовые |
| `EmptyState` / `Skeleton` / `Spinner` / `ErrorState` | `title`, `description`, `action` |
| `KanbanBoard` / `KanbanColumn` / `KanbanCard` | `columns: RequestStatus[]`, `onDrop(id, status)`, `totals?` (счётчик колонки, когда карточек больше, чем показано); у `KanbanItem` необязательные `href` (карточка открывается ссылкой) и `tags` (короткие метки: срочно, флаги внимания) |
| `AnimatedCounter` | `valueMinor`, анимация досчёта, для баннера пожертвований |
| `PhotoGallery` / `PhotoUploader` | `mediaIds`, `editable` |
| `PriceCell` | `valueMinor?`, рисует прочерк, когда значение не пришло |
| `Stepper` | история статусов заявки |
| `ContourShell` | `variant: 'crm'\|'portal'`, `title`, `userName`, `roles`, `links`, `accountHref`, `cart`, `bell?: Snippet` (колокольчик уведомлений в обоих контурах), `footerCaption`, `search?: Snippet` (поиск в шапке портала), `sidebarOpen?` (вариант `crm`: состояние бокового меню из куки), `footerLinks?` (ссылки на документы в подвале). Вариант `crm` на телефоне рисует нижнюю панель `CrmBottomBar`: «Главная», три первых раздела роли и «Ещё», которая открывает шторку меню; высоту панели знает переменная `--shell-bottom-inset`, по ней отступают контент и тосты. `ShellLink`: `href`, `label`, `group?`, `icon?` |
| `Sidebar` | shadcn `sidebar` в `lib/ui/base/sidebar`, используется только оболочкой CRM через `ContourShell` |
| `BrandMark` | `alt?`, `class?`: знак мастерской рядом с надписью в шапке портала (от `sm`), лендинга, боковом меню CRM и в полосе установки; без `alt` декоративный |
| `InstallBanner` | без пропсов: полоса установки над шапкой, её рисует `ContourShell` в обоих вариантах; в standalone и после крестика пусто |
| `InstallPrompt` | без пропсов: кнопка «Установить приложение» по `beforeinstallprompt`, на iOS инструкция «Поделиться, На экран Домой», в standalone пусто |

Токены: цвета, радиусы, тени и шкала отступов в `src/app.css` как CSS-переменные. Хардкод цвета в компоненте слайса — повод для отката.

Вес. Кит импортируется одной бочкой `lib/ui/index.ts`, поэтому бочка обязана оставаться tree-shakeable: `src/lib/ui/package.json` объявляет `"sideEffects": false`, и ни один модуль папки не заводит побочный эффект на верхнем уровне. Блок `<style>` в примитиве запрещён отдельно от правила про токены: его CSS выкинет сборщик. Тяжёлая половина контрола, которая живёт за триггером, грузится динамическим импортом на первое открытие через `LazyComponent` из `lib/ui/lazy.svelte.ts`: так устроены календарь `DatePicker`, календарь диапазона `DateRangePicker` и палитра команд `Combobox`. Новый примитив, который тянет свою библиотеку и открывается по клику, собирается так же.

Добавление компонента реестра идёт командой `pnpm ui:add <component>`. Она зовёт генератор, затем `pnpm format` и `pnpm check` и печатает список правок, без которых сгенерированный код не проходит тайпчек проекта: необязательный проп пробрасывается через `definedProps` из `lib/utils/props.ts`, биндинг календарного корня приводится к `never` с комментарием причины, слишком широкая поверхность пропсов заменяется явным списком. Ослаблять `tsconfig.json` под генератор запрещено.

---

## 10. Стратегия тестов

Тесты привязаны к слайсу и PR. Отдельной сущности «тесты на стадию» нет. Слайс мёрджится только с тестами.

**Главное правило: тест выводится из критериев приёмки задачи, а не из реализации.** Сначала читаем критерии, пишем тест на контракт, потом код. Тест, который повторяет структуру кода, подтверждает баги вместе с поведением.

Обязательные типы на слайс:

1. **Контрактные на стыках.** Payload джоба и события валидируется Zod-схемой из этого файла. Фейковые драйверы почты и push проверяют вход и падают на мусоре. Ответ сервера для роли без цен проверяется на отсутствие ценовых полей.
2. **Идемпотентность джобов.** Каждый хендлер прогоняется дважды с тем же payload. Эффект ровно один: одно письмо, один экспорт, одно складское движение.
3. **Путь ошибки.** Фейк умеет возвращать ошибку и таймаут (`failOnce`, `hangOnce` у фейков почты и push). Проверяем ретрай, бэкофф, переход в `dead`, отсутствие частичного эффекта.
4. **Property-based (fast-check) на чистой логике.** `domain/request/state-machine`, `domain/request/pricing`, `domain/stock/balance`, `domain/payroll/calc`, `domain/charity/rate`. Генерируем входы, проверяем инварианты из §6.2.
5. **E2E по ролям (Playwright).** На каждый слайс с UI: сценарий целевой роли плюс негативный сценарий чужой роли (прямая ссылка на чужой объект даёт 403).

Фикстуры общие: `tests/fixtures/` использует тот же сид, что и `scripts/seed.ts`. Разные данные в тестах и в деве не заводим. Команда `webServer` в Playwright накатывает миграции до старта сервера: воркер очереди читает `job_queue` при запуске, а `globalSetup` выполняется позже.

Порог покрытия: доменный слой `src/lib/domain/**` не ниже 90% строк, гейт §11.1 падает ниже порога. Остальное покрытием не меряем.

---

## 11. Инфраструктура и владение

| Область | Правило |
|---|---|
| Миграции | Генерируются `pnpm db:generate` из `schema/`. Руками файлы в `drizzle/` не правим. Применяются командой `pnpm db:migrate` перед запуском |
| Сид | `scripts/seed.ts`, идемпотентный, безопасен для повторного запуска. Один набор фикстур для дева, тестов и фейков. Демо-заявки и уведомления заводит отдельная команда `pnpm seed:demo` после сида, повторный запуск ничего не добавляет |
| Конфиг | Единый модуль `src/lib/server/config.ts`, разбор `process.env` через Zod, падение на старте при нехватке переменной: `MAIL_DRIVER=smtp` требует `SMTP_HOST` и `MAIL_FROM`, `PUSH_DRIVER=webpush` требует ключи VAPID и `VAPID_SUBJECT`. Прямое обращение к `process.env` вне этого модуля запрещено |
| Секреты | Только в `.env`, в репозиторий не коммитятся. `.env.example` содержит все ключи с пустыми значениями |
| Файлы | Каталог `FILES_DIR` рядом с БД, вне репозитория. Имя файла на диске генерирует сервер, оригинальное имя хранится в БД. Раздача только через `/api/files/[id]` с проверкой прав |
| Логи | `pino` в stdout, поля `requestId`, `userId`, `route`, `durationMs`. Пароли, токены, email в логи не пишем |
| Health | `GET /api/health` проверяет БД и воркер и отдаёт `queue: { workerRunning, pending, running, dead }`. Используется смоук-тестом CI и мной после запуска сборки |
| Примитивы UI | Компонент реестра добавляется командой `pnpm ui:add <component>`: генератор, затем `pnpm format` и `pnpm check`. Правки под тайпчек делаются в самом компоненте, `tsconfig.json` не ослабляется |
| Поставка | `Dockerfile` собирает образ, `compose.yml` поднимает `app` и `caddy` на одном VPS. `app` на старте выполняет `pnpm db:migrate`, затем `node build`. Caddy принимает 80 и 443, выпускает сертификат для `APP_DOMAIN` и проксирует в `app:3000`. База и файлы лежат в томе `app-data`. Порядок работ в `docs/deploy.md` |
| Стенд | Ключи стенда в `.env` на сервере, шаблон `.env.production.example`. `ORIGIN`, `DATABASE_PATH`, `FILES_DIR`, `PORT`, `ADDRESS_HEADER`, `XFF_DEPTH` и `BODY_SIZE_LIMIT` задаёт `compose.yml`. CLI, сид и миграции запускаются внутри контейнера, поэтому `tsx` стоит в зависимостях рантайма |

`.env.example`:

```
NODE_ENV=development
PORT=3000
ORIGIN=http://localhost:3000
DATABASE_PATH=./data/app.db
FILES_DIR=./data/files
SESSION_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:
MAIL_DRIVER=fake
PUSH_DRIVER=fake
LOG_LEVEL=info
```

### 11.1 CI

Гейт перед мёрджем, без деплоя: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm check` (svelte-check + tsc), `pnpm test:unit`, `pnpm test:e2e`, `pnpm build`, прогон миграций на временном файле SQLite, запуск сида и смоук-запрос `/api/health` на собранной сборке.

Пока разработчик один, гейт прогоняется локально, а workflow `.github/workflows/ci.yml` запускается вручную (`workflow_dispatch`) на тех же шагах. Автоматический запуск на PR возвращается, когда в работу входит второй человек.

CD нет. Мёрдж в `main` ничего не разворачивает, стенд обновляется вручную командой `docker compose up -d --build` (`docs/deploy.md`). В коде по-прежнему нет допущений о конкретном хостинге: пути к БД и файлам берутся из конфига, а не из констант.

Мёрдж в `main` только через PR после зелёного гейта. Работаю один, поэтому self-review по чек-листу §13.3 обязателен, апрув формальный.

---

## 12. Безопасность

Требования обязательны к каждому слайсу, не выносятся в отдельную задачу «сделать безопасность в конце».

- **Аутентификация.** Пароли argon2id (`memoryCost >= 19456`, `timeCost >= 2`). Сессия на сервере, в куку кладём случайный идентификатор, в БД его хеш. Кука `httpOnly`, `secure`, `sameSite=lax`, срок 30 дней с продлением. Смена пароля и блокировка убивают все сессии пользователя. Пока учётная запись должна сменить временный пароль, чтение уходит на `/password/change`, а запись получает 403. Адрес возврата после входа (`redirectTo`) принимается только как путь этого хоста, `//host` и `/\host` отбрасываются (`lib/utils/local-path.ts`).
- **Права.** Проверка на сервере на каждое действие и каждый переход статуса, а не только на отрисовку экрана. Роут проверяет право до разбора формы. Единая точка: `PolicyService.can(actor, action, subject)`, матрица и экраны в §19. Скрытие кнопки в UI защитой не считается.
- **Row-level.** Каждый репозиторий портального домена принимает `counterpartyId` из `ActorContext` и подмешивает его в `where`. Метод без этого фильтра не проходит ревью. Работник мастерской без `request.read.any` видит заявки только в статусах, из которых его роль делает переход. Экран доставки по праву `delivery.work` показывает заявки контрагентов в `ready` и, только на чтение, в `in_work`.
- **Цены.** Роль `cp_employee` не получает ценовые поля из БД. Проверяется e2e-тестом на теле ответа, а не глазами.
- **ПДн третьего лица.** `requests.deceased_name` видно всем, кому видна заявка, но не подставляется в шаблоны уведомлений и не уходит в SSE. `{{excerpt}}` обращения это текст, который человек написал сам; содержимое пуша шифруется ключами подписки, сервис доставки его не читает.
- **Публичная поверхность.** Гостю без сессии отвечает только `GET /api/public/works/[id]`: обложка опубликованной модели, 404 на скрытую, черновую и удалённую. Остальные файлы идут через `/api/files/[id]` с правом `catalog.read`. Страницы `/legal/*` открыты гостю и показывают из настроек только название оператора, ИНН, ОГРН, телефон, адрес и почту.
- **Валидация.** Весь вход через Zod на сервере, включая `FormData`, query-параметры и содержимое импортируемых XLSX. Клиентская валидация только для UX.
- **CSRF.** Form actions SvelteKit проверяют origin. Мутации через `+server.ts` требуют заголовка `x-requested-with` и совпадения origin. Обе проверки делает `requireOwnCall` из `lib/server/core/http.ts`, эндпоинт своей проверки не пишет.
- **Rate limiting.** Логин, восстановление пароля, создание сотрудника контрагента, отправка заявки, загрузка файла, сообщение обращения (`support.post`). Счётчики в `rate_limits`, окно и лимит в конфиге.
- **Загрузка файлов.** Белый список MIME, проверка сигнатуры файла, лимит размера, генерация имени сервером, запрет исполняемых расширений, хранение вне webroot. Сигнатуры лежат в `lib/domain/files/signature.ts` и общие для вложений заявки и фото каталога. XLSX регионального прайса проверяется по сигнатуре ZIP и в хранилище не попадает.
- **SQL.** Только Drizzle-построитель. Конкатенация строк в SQL запрещена, сырой SQL только через параметризованный `sql` с плейсхолдерами.
- **Заголовки.** `hooks.server.ts` ставит CSP без `unsafe-eval`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, HSTS.
- **Аудит.** Все изменяющие действия пишутся в `audit_log` через декоратор сервиса. ПДн в логи не попадают.
- **Ошибки.** Наружу отдаём код и нейтральный текст. Стек и детали только в лог. Текст отказа в форме и тосте берётся из `userMessage` (`lib/server/core/errors.ts`): сообщения `ValidationError` и `ConflictError` пишут сервисы по-русски, остальные коды получают фиксированную фразу без внутренних имён действий.

---

## 13. Правила кода и работы

### 13.1 Код

- TypeScript strict. `any` запрещён, `unknown` с последующим сужением разрешён. `@ts-expect-error` только с комментарием и ссылкой на причину.
- Домен в `lib/domain/**` чистый: без импортов БД, `fs`, `fetch` и SvelteKit. Так он тестируется property-based.
- Сервисы и репозитории — классы, наследники `BaseService` и `BaseRepository`. Функции-одиночки только для чистых утилит.
- Метод сервиса делает одно действие и возвращает DTO, а не строку БД.
- Транзакция открывается в сервисе, репозиторий получает `tx` параметром.
- Максимум 250 строк на файл и 40 на функцию. Не влезает, значит слой выбран неверно.
- Дублирование третий раз выносится в `lib/server/core` или `lib/utils`. Два раза терпим, три исправляем.
- `exactOptionalPropertyTypes` включён: необязательный проп не передаётся значением `undefined`. Проброс идёт через `definedProps` из `lib/utils/props.ts`, а не условным спредом на каждом месте.
- Именование: сущности единственным числом (`RequestService`), таблицы множественным (`requests`), булевы поля с `is`/`has`/`can`.
- Деньги считаем в целых копейках. Округление одно на всё приложение: `roundHalfUp` в `lib/utils/money.ts`.
- Интерфейс и XLSX показывают суммы в целых рублях без копеек: `formatMinor` округляет при выводе, в данных копейки остаются.
- Даты в UTC, конвертация в таймзону организации только на выводе.
- Никаких TODO в мёрдж-коммите. Не сделано — issue, а не комментарий в коде.

### 13.2 Комментарии

Английский. Кратко и по делу. Комментарий объясняет **почему**, а не пересказывает код.

```ts
// Freeze the rate here: changing settings later must not move the public counter.
const rateBp = await this.settings.getNumber('charity.rate_bp');

// BAD: increment counter by one
counter += 1;
```

Комментируем: неочевидные бизнес-правила, обходы ограничений SQLite, места с намеренной денормализацией, инварианты транзакции. Закомментированный код в PR не оставляем.

JSDoc только на публичных методах сервисов и на функциях домена: одна строка назначения, `@throws` для доменных ошибок.

### 13.3 Коммиты и PR

Язык всего: английский. Коммиты, заголовки и тела PR, комментарии в коде.

Формат коммита — Conventional Commits, всегда:

```
type(scope): summary
```

- `type` из закрытого набора: `feat | fix | test | refactor | chore | docs`.
- `scope` — домен или слайс: `auth`, `catalog`, `request`, `stock`, `payroll`, `portal`, `crm`, `queue`, `ui`, `ci`.
- `summary` в императиве, со строчной буквы, без точки в конце, до 50 символов.
- Тело только когда нужно объяснить *почему*. Что сделано, видно в диффе.

Примеры:

```
feat(request): add state machine guards for assignee
fix(stock): reverse a wrong move instead of deleting it
test(payroll): cover weekly close against business sample
refactor(catalog): extract price projection into dto mapper
```

**Коммиты по ходу работы, маленькими логическими шагами.** Не сваливать слайс одним коммитом в конце. Каждый коммит по возможности проходит тайпчек.

**Автор коммитов фиксирован.** Настройка репозитория один раз:

```bash
git config user.name  "Sobol17"
git config user.email "sobolinskiii@mail.ru"
```

**Следов нейросети в истории нет.** Запрещено в сообщении коммита, в теле PR и в комментариях кода:

- трейлеры `Co-Authored-By: Claude ...` и любые другие соавторы;
- строки вида `Generated with ...`, ссылки на инструменты генерации;
- эмодзи-роботы и любые эмодзи;
- фразы «as an AI», «I generated», упоминания модели и промпта.

Перед `git commit` проверяю сообщение на эти маркеры. Флаг `--author` не используется, автор берётся из конфига репозитория.

PR: заголовок содержит идентификатор задачи и краткую суть (`S-P4: request draft and submit`). Тело короткое: что делает слайс, какие контракты и типы затрагивает, чем покрыт тестами.

Проза в PR и в документации по правилам `stop-slop`: активный залог, конкретика, без филлеров, без em-dash.

### 13.4 CONTRACT GAP

Не хватает таблицы, поля, типа, топика или пропса примитива — **СТОП**. Код с выдуманным контрактом не пишется. Сессия выдаёт блок:

```
CONTRACT GAP
Нужно: <таблица/поле/тип/топик>
Зачем: <какой сценарий слайса блокируется>
Предлагаемая форма: <точное определение в терминах Drizzle/TS>
Влияние: <какие слайсы затронет>
```

Дальше: правлю нужный раздел `tech.md`, поднимаю версию в шапке, генерирую миграцию. Работа продолжается на локальной заглушке до апдейта ядра. Заглушка в мёрдж не попадает.

### 13.5 Definition of Done одной задачи

Задача = один вертикальный слайс = один PR. Готово, когда:

1. `pnpm lint`, `pnpm check`, `pnpm build` зелёные;
2. тесты написаны из критериев приёмки задачи: контрактный на стыке, идемпотентность для каждого нового джоба, путь ошибки, property-based для новой чистой логики, e2e для UI по целевой и по чужой роли;
3. серверная проверка прав и row-level фильтр на месте, цены не утекают роли без цен;
4. новые действия пишутся в `audit_log`, новые переходы — в `request_status_history`;
5. UI собран из примитивов `lib/ui`, свои цвета и таблицы не заведены;
6. миграция сгенерирована из схемы и прогнана на чистой БД плюс на копии дев-базы;
7. `tech.md` обновлён, если слайс менял контракт, версия бампнута;
8. коммиты по конвенции, автор Sobol17, следов нейросети нет;
9. сценарий DoD слайса продемонстрирован на локальной сборке (`pnpm build && node build`), а не только в дев-режиме.

---

## 14. Дорожная карта слайсов

Слайс это сквозной кусок «данные → сервер → права → UI → тест», пригодный к демонстрации. Закрытый слайс описан разделами контракта, здесь от него остаётся строка.

### 14.1 Закрытые слайсы

| Слайс | Что дал | Где описано |
|---|---|---|
| K1–K5 | Сборка, схема и сид, вход и права, UI-кит, очередь, события, драйверы за фейками, эталонная вертикаль `portal/profile` | §3–§13, §19 |
| K7 | Визуальная система «Ангел», оболочка портала, лендинг | §18 |
| P1–P7 | Каталог, контрагенты и прайсы, витрина, черновик и отправка, машина состояний, мои заявки, цены агентства | §5, §6, §20.1 |
| P8 | Баннер пожертвований | §20.2 |
| P9, P12 | Уведомления портала, лента и колокольчик | §7.3, §20.14 |
| P10, P11 | Чистка профиля, обязательная отгрузка | §5.6, §20.1 |
| P13, P14 | Лендинг: работы, фонд, небесный фон | §18.2, §20.2 |
| C1 | Пользователи мастерской, справочники, настройки, журнал | §20.15 |
| C2 | Каталог и прайсы в CRM | §20.8 |
| C3 | Контрагенты | §20.7 |
| C4 | Доска и реестр заявок | §20.3 |
| C5 | Цех по позициям | §20.4 |
| C6 | Доставка и погрузка | §20.5 |
| C7 | Оплата и закрытие | §20.6 |
| C8 | Склад | §20.9 |
| C10 | Выплаты | §20.10 |
| C12, C15 | Уведомления CRM, PWA и Web Push | §7.3, §17, §20.14 |
| C13 | Отчёты | §20.11 |
| C17 | Обращения контрагентов | §5.10, §20.13 |
| C18 | Финансы | §5.11, §20.12 |

### 14.2 Открытые слайсы

**C14. Стабилизация и приёмка.** Закрывается частями. Сделано: сквозное e2e семи ролей (`tests/e2e/acceptance.e2e.ts`), аудит безопасности (`tests/e2e/crm-audit.e2e.ts` по правам `tests/e2e/crm-surface.ts`, `tests/e2e/security-audit.e2e.ts`), инструкции по ролям (`docs/guides/`, `docs/portal-guide.md`), правки UX пилота, каталог и фото на стенде через `catalog:import`. Осталось:

- [ ] нагрузочная проверка реестров на 10 тыс. заявок и 50 тыс. движений;
- [ ] первичное наполнение справочников и видов работ;
- [ ] сквозной сценарий на реальных данных стенда, контрольный пример по выплатам, акт приёмки.

**DoD:** сквозной сценарий отработан всеми ролями на реальных данных, контрольный пример по выплатам сходится до копейки, акт приёмки подписан.

**C19. Станции цеха.** Дизайн `docs/superpowers/specs/2026-10-29-shop-stations-design.md`, план `docs/superpowers/plans/2026-10-29-shop-stations.md`. Таблицы §5.12, автоматический `in_work -> ready` и guard `stockLinked` §6.2, событие `shop.task_arrived` §7.3, право `shop.work` §19, правила §20.4. Уходят очередь выпуска по позициям, «Сделано N» и «Заявка собрана».
**DoD:** администратор принимает заявку, столяр получает пуш и видит её в «Новых», берёт в работу, отмечает и нажимает «Выполнено»; заявка проходит шлифовщика, маляра и обивщика и становится «Готов к выдаче» без администратора; срочная заявка забирает гроб у обычной, у обычной строка появляется у столяра; шлифовщик по ссылке на визит столяра получает 403.

**C16. Бот МАКС.** Драйвер канала `max` на Bot API: привязка чата к пользователю, отправка по матрице §7.3, лог доставки и ретраи тем же `notification.dispatch`. Привязка чата открывает разрыв контракта и поднимается блоком CONTRACT GAP в начале слайса. Канал становится живым, то есть входит в `LIVE_CHANNELS`.
**DoD:** пользователь привязывает чат один раз и получает событие ботом, отказ бота виден в логе доставки и уходит в ретрай, повторная отправка того же уведомления второго сообщения не создаёт.

### 14.3 Соответствие релизам исходного ТЗ

| Релиз | Слайсы |
|---|---|
| R1. Приём заявок | K1–K5, K7, P1–P7 |
| R2. Портал целиком | P8–P14 |
| R3. Производство и доставка | C1–C7 |
| R4. Склад, выплаты, отчётность, PWA | C8, C10, C12–C18 |

---

## 15. SvelteKit и Svelte 5: пять практик с наибольшей отдачей

Порядок по влиянию на результат. Эти пять пунктов закрывают большую часть ошибок, которые всплывают на ревью в проектах на Svelte 5.

### 15.1 Руны: `$derived` вместо `$effect`

`$effect` нужен для синхронизации с внешним миром: подписка на SSE, `IntersectionObserver`, таймер. Вычисление данных из данных делает `$derived`. Расчёт суммы черновика через `$effect` даёт лишние перерисовки, гонки при быстром вводе и цикл, когда эффект пишет в то же состояние, которое читает.

```svelte
<script lang="ts">
  import { calcDraftTotal } from '$lib/domain/request/pricing';
  let { items }: { items: DraftItem[] } = $props();

  // Derived state stays in sync automatically and runs once per change.
  const totalMinor = $derived(calcDraftTotal(items));
  const hasBlockedCombo = $derived(items.some((i) => !i.isCompatible));

  // Effect only for the outside world: live charity counter over SSE.
  $effect(() => {
    const es = new EventSource('/api/stream/charity');
    es.onmessage = (e) => (charity = JSON.parse(e.data));
    return () => es.close();
  });
</script>
```

Ещё две вещи из той же группы: `$state.raw` для больших массивов, которые заменяются целиком (строки реестра на 500 позиций, журнал движений), потому что глубокая реактивность на них стоит дорого; и `$derived.by(() => { ... })` для многострочного вычисления вместо промежуточного `$state`.

### 15.2 Состояние классами в `.svelte.ts`

Стор проекта — обычный класс с полями `$state`. Это ложится на требование ООП, тестируется без монтирования компонента и переиспользуется между портальным черновиком и CRM-корзиной.

```ts
// src/lib/portal/draft.svelte.ts
export class DraftStore {
  items = $state<DraftItem[]>([]);
  readonly totalMinor = $derived(calcDraftTotal(this.items));

  add(item: DraftItem): void {
    const existing = this.items.find((i) => i.key === item.key);
    if (existing) existing.qty += item.qty;
    else this.items.push(item);
  }
}
```

Инстанс кладём в контекст (`setContext`/`getContext`), а не в модульную переменную. Модульный синглтон на сервере переживает запрос и утекает между пользователями. Это прямая дыра в изоляции контрагентов, а не стилистика.

### 15.3 Form actions плюс одна Zod-схема на форму, API и тест

Мутации через form actions и `use:enhance`. Ручной `fetch` в `onclick` теряет прогрессивное улучшение, повторные отправки и обработку ошибок, которые фреймворк даёт бесплатно.

```ts
// src/routes/(portal)/requests/[id]/+page.server.ts
import { submitRequestSchema } from '$lib/validation/request';

export const actions = {
  submit: async ({ request, locals, params }) => {
    const parsed = submitRequestSchema.safeParse(Object.fromEntries(await request.formData()));
    if (!parsed.success) return fail(422, { errors: parsed.error.flatten().fieldErrors });

    const service = new RequestService(locals.actor);
    // Service owns the transition rules; the route stays thin.
    const dto = await service.submit(Number(params.id), parsed.data);
    return { dto };
  }
} satisfies Actions;
```

Та же `submitRequestSchema` валидирует форму на клиенте и служит контрактным тестом payload. Три копии правил «поле обязательно» не заводим.

### 15.4 Серверная граница и проекции ролей вместо скрытия в разметке

Всё, что читает БД или секреты, лежит в `$lib/server/**`. Vite физически не пустит этот импорт в клиентский бандл, поэтому граница держится сборкой, а не дисциплиной. Данные грузим в `+page.server.ts`, а не в универсальном `+page.ts`: универсальный `load` выполняется и в браузере, и его результат целиком уезжает в HTML.

```ts
// src/routes/(portal)/catalog/+page.server.ts
export const load: PageServerLoad = async ({ locals, url }) => {
  const service = new CatalogService(locals.actor);
  // Prices are attached inside the service by actor role, not filtered in the template.
  return { page: await service.list(parseListQuery(url)) };
};
```

`{#if actor.canSeePrices}` в разметке — это косметика. Цена, попавшая в `data`, уже уехала в HTML и видна в исходнике страницы. Сокрытие делает `select`, потом маппер DTO, и только потом шаблон.

### 15.5 Сниппеты, типизированные роуты и strict-проверка

`{#snippet}` и `{@render}` заменяют слоты и убирают копипасту в таблицах и модалках: колонка описывается один раз, рендер строки передаётся параметром.

```svelte
<DataTable {columns} {rows} {total} query={q} onQueryChange={setQ}>
  {#snippet cell(row, col)}
    {#if col.key === 'status'}<StatusBadge status={row.status} />
    {:else if col.key === 'total'}<PriceCell valueMinor={row.totalMinor} />
    {:else}{row[col.key]}{/if}
  {/snippet}
</DataTable>
```

Рядом два дешёвых страховочных механизма: `resolve('/crm/requests/[id]', { id })` вместо строковой сборки URL, чтобы переименование роута ломало сборку, а не прод; и `svelte-check` со `strict` в гейте §11.1, который ловит `data` без нужного поля и необязательные ценовые поля, использованные без проверки.

### 15.6 Антипаттерны, за которые откатываю PR

- `$effect`, который пишет в `$state`, прочитанный в том же эффекте;
- модульный синглтон со стейтом пользователя в серверном модуле;
- `+page.ts` вместо `+page.server.ts` там, где грузятся данные из БД;
- `fetch` в обработчике клика вместо form action при обычной мутации;
- скрытие цены только в разметке;
- свой `<table>` с пагинацией вместо `DataTable`;
- бизнес-правило, продублированное в компоненте и в сервисе;
- `await` подряд там, где два независимых запроса грузятся параллельно через `Promise.all`.

---

## 16. Нефункциональные требования

| Категория | Требование | Как проверяем |
|---|---|---|
| Производительность | Отклик реестра не выше 1 с при 10 тыс. заявок и 50 тыс. движений, экспорт отчёта не выше 5 с | Нагрузочный прогон в C14 на сгенерированных данных |
| Нагрузка | 20 одновременных пользователей, 200 контрагентов, 5 тыс. заявок в год | Один процесс, SQLite WAL |
| Доступность | 99% в рабочее время, обновления вне смен | Healthcheck контейнера на `/api/health`, `restart: unless-stopped` |
| Целостность | Остаток равен сумме движений, движение и статус в одной транзакции | Property-based и e2e |
| Совместимость | Актуальные Chrome, Edge, Safari, Firefox, мобильные через браузер и установленную PWA | Playwright на трёх движках плюс ручная установка на Android и iOS |
| Адаптивность | Портал, цеховой и водительский экраны, standalone-режим PWA | E2E в мобильном вьюпорте |
| Вес страницы | Страница грузит только те примитивы, которые рендерит. Кит целиком не приходит ни на один экран | E2E `ui-bundle`: на `/login` в ответах нет календаря и палитры команд, на `kitchen-sink` они приходят только после открытия контрола |
| Доступность (a11y) | Контраст, тач-цели не меньше 44 px, работа с клавиатуры в CRM | Проверка в K4 и C14 |
| Наблюдаемость | Структурные логи, health-check, метрики очереди | `/api/health` отдаёт длину очереди и число `dead` |
| Данные | Файл БД и каталог файлов лежат вне репозитория и задаются конфигом, на стенде в томе `app-data`. Бэкап ручной, через API `backup` SQLite | Команда в `docs/deploy.md` |

---

## 17. PWA

Приложение поставляется как PWA. Отдельного мобильного клиента нет: цех, водитель и контрагент ставят приложение на домашний экран и работают из standalone-окна. Вторая причина — Web Push, без которого водитель не узнает о готовности заявки.

Объём PWA в текущей реализации ровно два пункта: **установка на домашний экран и приём push**. Офлайн-режима нет. Service worker ничего не кеширует, `offline.html` нет, фоновой синхронизации и очереди отложенных действий нет. Без сети приложение ведёт себя как обычный сайт: запрос падает, экран показывает стандартное состояние ошибки из `ErrorState`.

Отдельный PWA-плагин не подключаем: SvelteKit собирает `src/service-worker.ts` сам.

### 17.1 Манифест

`static/manifest.webmanifest`, подключается в `src/app.html`:

```json
{
  "name": "Ангел: заявки мастерской",
  "short_name": "Ангел",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#d0e2f5",
  "theme_color": "#1c2b48",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Мои заявки", "url": "/portal/requests" },
    { "name": "Каталог", "url": "/portal/catalog" },
    { "name": "Цех", "url": "/crm/shop" },
    { "name": "Доставка", "url": "/crm/delivery" }
  ]
}
```

Имя приложения «Ангел»: его же несёт `apple-mobile-web-app-title` в `src/app.html`, потому что iOS берёт подпись значка со страницы. Знак один: картинка заказчика, ангел у гроба на чёрном поле, исходник `scripts/assets/brand-angel.jpg`. `scripts/icons.ts` режет из неё три иконки манифеста (маскируемая с полями под круг лаунчера), `icons/apple-touch-icon.png` на 180 px, `favicon.png` (кадр головы с нимбом: вся сцена во вкладке не читается) и `brand/mark.png` для примитива `BrandMark`. Файлы коммитятся, сборка скрипт не запускает.

Манифест один на оба контура. `start_url` ведёт на `/`, дальше сервер редиректит по scope пользователя из `ActorContext`. Ярлык на чужой контур пользователь всё равно не откроет: guard вернёт 403.

### 17.2 Service worker

Service worker существует только ради push. Обработчиков `fetch` в нём нет, и это правило, а не упущение: пустой SW не может отдать устаревшую страницу и не может сохранить чужие цены на устройстве.

```ts
// src/service-worker.ts
// Push-only worker: no fetch handler, no caches. Offline mode is out of scope.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icons/icon-192.png', tag: data.tag, data: { url: data.url }
  }));
});

// Deep-link straight into the request card instead of the app root.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data.url));
});
```

`skipWaiting` здесь безопасен: воркер не управляет отдачей файлов, поэтому мгновенная замена версии не перезагружает страницу под руками у столяра.

**Cache Storage не используется вообще.** Ни оболочка, ни данные, ни картинки. Проверяется e2e: после логина, работы с каталогом и выхода `caches.keys()` возвращает пустой список. Появление кеша в этой проверке означает, что кто-то добавил `fetch`-обработчик в обход §17.

### 17.3 Push

Подписка создаётся на реальных VAPID-ключах и хранится в `push_subscriptions`. Мёртвая подписка получает `expired_at` в `notification.dispatch`, когда сервис доставки отвечает 404 или 410; строки с меткой удаляет джоб `session.cleanup`.

Payload push-уведомления не содержит цен, персональных данных и состава заявки: только номер, короткий текст и ссылку. Уведомление видно на заблокированном экране, а телефон в цехе лежит на верстаке.

### 17.4 Установка

Полоса `InstallBanner` над шапкой обоих контуров предлагает установку на каждом экране: кнопка «Установить» по `beforeinstallprompt`, на iOS два шага Safari. Крестик запоминается на устройстве в `localStorage` и полосу больше не показывает. Кнопка «Установить приложение» появляется по событию `beforeinstallprompt` в портале и на цеховом с водительским экранами. Safari на iOS событие не даёт, поэтому там показываем короткую инструкцию «Поделиться, На экран Домой». Факт установки определяем через `display-mode: standalone` и по нему прячем кнопку.

### 17.5 Тесты

- Playwright: манифест отдаётся, валиден и содержит обязательные поля;
- Playwright: service worker регистрируется, после сессии с логином и выходом `caches.keys()` пуст;
- юнит: сборка payload push-уведомления не содержит ценовых полей и ПДн;
- ручная проверка установки и получения push на Android Chrome и iOS Safari.

---

## 18. Макеты портала

### 18.1 Источник и статус

Папка `ui/` хранит десять макетов «Ангел» в виде самораспаковывающихся HTML, каждый открывается в браузере. Макет задаёт внешний вид, раскладку и тексты интерфейса. Данные, поля, права и поведение задают §5–§8. Элемент макета без контракта не реализуется, пока разрыв не закрыт по §13.4. Такие элементы перечислены в §18.6.

Правила переноса:

- макет не копируется в код: инлайновые стили, hex-цвета, `sc-raw-table`, самописные степперы и радио заменяются примитивами `lib/ui` и токенами `app.css`;
- макеты нарисованы под десктоп 1440 px, мобильную раскладку слайс выводит сам: боковые колонки уходят под контент, сетка карточек сжимается до одной-двух колонок, требование §16 «Адаптивность» остаётся в силе;
- сущность в интерфейсе называется «Заявка» (§1, §6.1). Слова «заказ» и «поставка» из макета заменяются, подписи статусов берутся из `lib/ui/status.ts`, а не из тегов макета;
- цена, сумма, скидка и задолженность рисуются только для роли с `canSeePrices`, у `cp_employee` на их месте `PriceCell` с прочерком или блок не рисуется целиком (§8.1);
- контакты менеджера, реквизиты мастерской и телефоны берутся из данных (`counterparties.managerId`, `settings.org.requisites`), а не из текста макета.

### 18.2 Токены палитры «Ангел»

Палитра небесная из пяти цветов заказчика: насыщенное голубое поле на основе Baby Blue Eyes, белые панели без рамки и тени, акцент midnight blue, Platinum и два светлых голубых для заливок. Поле нарочно насыщенное: бледный оттенок на слабом экране выгорает в серый. Одна палитра на оба контура: CRM берёт те же токены, у неё своих макетов нет. Значения живут в `@theme` файла `src/app.css`, семантические имена из K4 сохраняются, чтобы примитивы не переписывались. Hex-значения макетов в `ui/` устарели, раскладку и тексты макеты по-прежнему задают.

Цвета заказчика: Cool Cerulean `#8eb1d1`, Baby Blue Eyes `#a7c7e7`, midnight blue `#1c2b48`, Platinum `#e8ecef`, light blue grey `#c4d8e5`. Светлые четыре на белом дают контраст 1.5–2.2, поэтому текстом не бывают: они только заливают поверхность, текст на них midnight (6.3–11.9).

| Роль | Значение | Токен `app.css` |
|---|---|---|
| Поле страницы | `#d0e2f5`: Baby Blue Eyes, осветлённый до светлоты 89 % при насыщенности 65 % | `--color-surface` → `--color-brand-150` |
| Панель, карточка | `#ffffff` | `--color-surface-raised` |
| Врезка, поле ввода, степпер | `#eef4fa` | `--color-surface-muted` |
| Серый чип, кнопка в карточке | `#e8ecef`, hover `#c4d8e5` | `--color-chip`, `--color-chip-hover` |
| Основной текст | `#1c2b48` midnight | `--color-fg` |
| Второстепенный текст | `#3f4d63`, 6.5 на поле | `--color-fg-muted` |
| Подпись, плейсхолдер, артикул | `#4d5b70`, 6.9 на белом | `--color-fg-faint` |
| Разделитель | `#1c2b48` на 10 % | `--color-border` |
| Контур будущего шага | `#8eb1d1` Cool Cerulean | `--color-border-strong` |
| Акцент (заливка) | `#1c2b48`, hover `#253a5c`, active `#121d33` | `--color-brand`, `--color-brand-hover`, `--color-brand-active` |
| Ссылка, активный пункт, акцентная цифра | `#2f4f7f` (6.2 на поле, 8.3 на белом), hover `#1c2b48` | `--color-link`, `--color-link-hover`  |
| Мягкий акцент (баннер, тег «Заявка», тост) | фон `#e6f0fb`, текст `#1c2b48` | `--color-tone-info-soft`, `--color-tone-info` |
| Тег «В работе» | фон `#c4d8e5`, текст `#1c2b48` | `--color-tone-progress-soft`, `--color-tone-progress` |
| Тег «Готов к выдаче» | фон `#b9dcae`, текст `#1f3d1b`, контраст 8.0 | `--color-tone-ready-soft`, `--color-tone-ready` |
| Выделение текста, фон аватара | `#8eb1d1`, `#c4d8e5` | `--color-brand-400`, `--color-brand-200` |
| Успех (тег «Оплачено») | фон `#e9f0e6`, текст `#3f5c3a` | `--color-tone-success-soft`, `--color-tone-success` |
| Опасное действие (отмена, отключение) | текст `#8a3b2f` | `--color-danger` |

Фон лендинга собран слоем `LandingSky`: поле рисует вертикальный градиент `--color-brand-300` → `--color-brand-150` → `--color-brand-100`, облака рисует SVG белым `--color-surface-raised` под радиальным градиентом с плотностью 0.16, 0.24 и 0.3 по трём планам. Своих цветов слой не заводит и в палитру ничего не добавляет. Вектор взят, чтобы иллюстрация не рассыпалась на ретине; мягкий край даёт радиальный градиент, а не `feGaussianBlur`: фильтр на весь экран дороже, а результат тот же. Полей два, широкое и узкое, они переключаются на `sm`: `preserveAspectRatio="xMidYMid slice"` срезает у телефона две трети широкого поля вместе с облаками. Анимации нет. Портал и CRM слой не получают, под ними остаётся ровная заливка `--color-surface`.

Юнит `visual-tokens` проверяет контраст текстовых пар по WCAG AA. `text-brand` красит текст только на светлой заливке (инициалы в аватаре). Текст на белом и на поле берёт `text-link` либо `text-fg`: иначе ссылка сливается с основным текстом.

Шкалы для редких мест, где семантического токена не хватает: акцент `--color-brand-100…900` и промежуточная `--color-brand-150` под поле (`#e6f0fb`, `#d0e2f5`, `#c4d8e5`, `#a7c7e7`, `#8eb1d1`, `#40679b`, `#2f4f7f`, `#253a5c`, `#1c2b48`, `#121d33`), холодный нейтральный `--color-neutral-100…900` (`#eef4fa`, `#e8ecef`, `#dde3e8`, `#c5ced7`, `#9aa6b4`, `#4d5b70`, `#3f4d63`, `#36435a`, `#1c2b48`), серо-голубой второй акцент `--color-mist-100…900` (`#f0f4f7`, `#e2e9ef`, `#c4d8e5`, `#a9bccb`, `#8b9fb1`, `#6f8aa3`, `#4f6a84`, `#3a5068`, `#26374b`). `brand-500` держит контраст 4.4 на поле и годится только для крупного текста от 24 px (акцентное слово лендинга, номера шагов). Тона статусов `--color-tone-*` перенастраиваются на эти шкалы, кроме тонов предупреждения, успеха, опасности и «Готов к выдаче»: они зелёные, жёлтые и красные вне шкал. Словарь тонов в `status.ts` не меняется.

| Шкала | Значения макета | Токен |
|---|---|---|
| Радиусы | 8 px мелкие элементы, 14 px врезка и фото, 18 px панель и карточка, 999 px кнопка, чип, поле, тег | `--radius-sm`, `--radius-inset`, `--radius-card`, `--radius-pill` |
| Отступы | 4, 8, 12, 16, 24, 40 px | шкала Tailwind с шагом 4 px: `1`, `2`, `3`, `4`, `6`, `10` |
| Тени | панели плоские, тени только у оверлеев | `--shadow-card: none`, `--shadow-overlay` по `--shadow-lg` макета |
| Высоты | основная кнопка 52 px, чип и поле 44 px, кнопка в карточке 42 px, компактный чип 38 px | `size` у `Button`: `lg` 52, `md` 44, `sm` 38; `--spacing-touch` 44 px не меняется |
| Ширина | контейнер 1440 px, поля 24 px | `max-w-[--container-shell]`, `px-6` |

### 18.3 Типографика

Текст набран Barlow 400/500, заголовки, цифры и цены Barlow Condensed 600 (класс `.num` макета). Кегли: заголовок страницы 36–44 px, лендинг 64 px, секция 26–34 px, блок 22 px, текст 15 px, мелкий 13–13.5 px, подпись-капитель 11.5–12 px с разрядкой 0.08–0.12 em.

Гарнитуры Barlow и Barlow Condensed не содержат кириллицы: в файлах макета подключены только наборы latin, latin-ext и vietnamese, поэтому русский текст в макетах фактически рисуется системным шрифтом. Внешний сервис шрифтов запрещён §3 и CSP (`font-src 'self'`), поэтому файлы woff2 лежат в `static/fonts/` и подключаются `@font-face` в `static/fonts/fonts.css`. Файл ссылается из `src/app.html` вместе с `preload` латинских начертаний. В `app.css` гарнитуры не объявляются: в dev Vite пересоздаёт этот стиль, и браузер перерисовывал бы текст запасным шрифтом. Выбор кириллической гарнитуры открыт, см. §18.7.

### 18.4 Элементы макета и примитивы

| Элемент макета | Примитив `lib/ui` | Правило |
|---|---|---|
| Кнопка-пилюля `.btn-primary` | `Button variant="primary" size="lg"` | Одна основная кнопка на панель |
| Серый чип `.pill`, кнопка «В корзину» `.btn-buy` | `Button variant="secondary"` | Активный чип фильтра переключается в `primary` |
| Ссылка-действие «Все заявки →» | `Button variant="ghost"` либо ссылка с цветом `brand` | |
| Белая панель `.panel` | `Card` | Без рамки и тени |
| Врезка `.inset` | `Card` с классами токенов `bg-surface-muted rounded-inset` | |
| Таблицы `sc-raw-table`, строки `.trow`, `.srow` | `DataTable` | Свой `<table>` запрещён §15.6 |
| Тег статуса | `StatusBadge` | Подпись из `status.ts` |
| Тег роли, остатка | `Badge` | |
| Поле `.input`, `.fld`, выпадающий список | `Input`, `Select` | |
| Счётчик количества | `NumberInput` | |
| Радио-карточки «Доставка / Самовывоз» | `RadioGroup` | |
| Чекбоксы фильтра | `Checkbox` | |
| Боковая панель фильтров | `FilterBar` | Значения фильтров живут в URL |
| Нумерация страниц `.pg` | `Pagination` | |
| Хлебные крошки | `Breadcrumbs` | |
| Галерея 4 миниатюры + фото | `PhotoGallery` | |
| Модалки создания и подтверждения | `Modal`, `Drawer`, `ConfirmDialog` | |
| Карточка модели в сетке, конфигуратор позиции | витринные компоненты портала в `src/lib/portal/` (§9) | Собираются из `Card`, `PriceCell`, `Button` |
| Шапка, подвал, боковое меню профиля | `ContourShell` в варианте портала | Слайс K7 |
| Поиск в шапке | `Command.Dialog` в `src/lib/portal/search/`, передаётся в `ContourShell` сниппетом `search` | Грузится на первое открытие. Разделы из меню роли, группы и модели с `GET /portal/search`. Без цен |

### 18.5 Экраны, роуты и слайсы

| Макет | Роут | Роли | Слайс | Что берём из макета |
|---|---|---|---|---|
| Лендинг | `/` | гость | K7 | Шапка с чипом телефона и кнопкой «Вход для контрагентов» на `/login`, первый экран, постоянные факты (срок изготовления, регион доставки), товарные группы текстом, «Производство», «Как мы работаем», подвал. Кнопки «Стать контрагентом» и «Запросить условия» открывают `mailto:` и `tel:` из `org.requisites`. Примеры работ: до девяти обложек опубликованных моделей с названием через `GET /api/public/works/[id]` (P13). Блок благотворительного проекта: название фонда, ссылка и ставка отчисления процентом, собранных сумм гостю нет (P13). Счётчики каталога и остатка гостю не показываются: кроме обложек и названий, данные каталога наружу не отдаются. Фон: слой неба с облаками из §18.2, вектор, без анимации (P14) |
| Документы | `/legal`, `/legal/terms`, `/legal/personal-data`, `/legal/privacy`, `/legal/cookies` | гость и все роли | C14 | Макета нет: шапка и подвал лендинга, хлебные крошки, текст документа, блок «Реквизиты оператора» из `org.requisites`, дата редакции из `lib/legal/docs.ts` |
| Главная портала | `/portal` | `cp_admin`, `cp_employee` | P6, блоки дополняют P2, P4, P8 | Заголовок с именем контрагента и договором (P2). Три показателя: заявки в работе с суммой для `cp_admin`, ближайшая готовность по `readyAt`, скидка `discountPercent` (P2). Панели «Собрать заявку» и «Повторить заявку» (P4). Таблица активных заявок `new…awaiting_payment` и закрытых за три месяца (P6). Баннер пожертвований в макете отсутствует, P8 ставит его под показателями |
| Каталог | `/portal/catalog` | обе | P3, P7 | Группы верхнего уровня `categories` с подкатегориями, число артикулов, «от N ₽» по закупочной цене для `cp_admin` и по цене агентства для `cp_employee` (P7), кнопка «Скачать прайс-лист XLSX» только для `cp_admin` |
| Листинг товаров | `/portal/catalog/[categoryId]` | обе | P3, P7 | Фильтры: материал (`dict_items` `material`), цвет (`options` `color`), длина (`lengthMm`). Сортировка, число на странице, выбранные фильтры чипами, сетка карточек с артикулом, названием и ценой. Наличие не показывается. Из P7: карточка показывает цену агентства, у `cp_admin` под ней закупочная серым, сотрудник сортирует по цене агентства |
| Карточка товара | `/portal/catalog/product/[productId]` | обе | P3 просмотр, P4 добавление, P7 цена | Галерея `media`, характеристики из полей варианта и справочника материалов, описание, выбор размера (`sizeCode` варианта) и цвета из `options` по матрице `product_options`, других опций нет, цена за штуку, количество, «Добавить в заявку» (P4), похожие позиции той же категории. Из P7: цена агентства на модель, у `cp_admin` рядом закупочная серым |
| Корзина | `/portal/cart` | обе | P4, P7 | Черновик заявки: строки с вариантом и опциями, цена и сумма строки для `cp_admin`, количество, удаление, очистка. Отгрузка (P11): адрес из `delivery_addresses`, дата и время доставки, ФИО умершего, все четыре поля обязательны; самовывоза нет. Комментарий необязателен. Поле «Ваш номер заявки» не рисуется. Итог: позиции, изделия, сумма, скидка по договору, к оплате (только `cp_admin`). Из P7: в строке цена агентства за штуку, суммы строки и итога в ценах агентства не считаются. «Оформить заявку» выполняет `draft -> new` |
| Мои заявки | `/portal/requests` | обе | P6 | Раскладка профиля с боковым меню, строки-карточки: номер, дата, статус, первая позиция, число позиций и изделий, сумма для `cp_admin`, автор (`createdById`) для администратора. Чипы статусов с числами, поиск по номеру, сортировка. Фильтр периода из DoD P6 добавляется, в макете его нет. «Новая заявка» ведёт в каталог |
| Заявка (детальная) | `/portal/requests/[id]` | обе | P6, P7, P8 | Показатели: позиции, сумма (`cp_admin`), статус. Состав заявки `DataTable`, комментарий, параметры отгрузки (адрес, срок, ФИО умершего, P11) и скидка, «Повторить заявку» (P4), «Отменить заявку» для `new -> cancelled` (P5), карточка менеджера. Из DoD P6 добавляются `Stepper` истории статусов, переписка с менеджером (`comments` без `isInternal`, только на чтение; рядом обращения по заявке и кнопка «Написать по заявке») и вложения, из P7 цена агентства в строке состава, из P8 строка «в фонд с этой заявки» |
| Чат | `/portal/support`, `/portal/support/new`, `/portal/support/[id]` | обе | C17 | Макета нет, экраны собраны в раскладке профиля: список обращений `DataTable` с состоянием «Ждёт ответа мастерской», «Есть ответ», «Закрыто», форма нового обращения с темой, заявкой и текстом, переписка с формой ответа и закрытием |
| Уведомления | `/portal/profile/notifications` | обе | P9 | Макета нет, экран собран в раскладке профиля: переключатели уведомлений по парам «событие, канал», которые предлагает матрица роли, и журнал отправок `DataTable` с событием, номером заявки, каналом и статусом доставки. Текст ошибки драйвера не показывается. Из P12: канал `max` в списке переключателей, полный список фида и отметка прочтения; фид выключить нельзя, поэтому переключателя у него нет |
| Профиль контрагента | `/portal/profile` | обе | K5 аккаунт, P2 карточка | K5: раскладка профиля и блок «Мой аккаунт» с формой ФИО и телефона, эталонная вертикаль. P2: название, договор (`contracts`), показатели задолженности и закупки за год для `cp_admin`, превью трёх сотрудников, менеджер. Реквизиты и плитка скидки из профиля убраны в P10: реквизиты ведёт менеджер в C3, скидка осталась в корзине и в карточке заявки |
| Мои цены | `/portal/prices` | `cp_admin`, у `cp_employee` 403 | P7 | `DataTable` моделей каталога: артикул, название, категория, закупочная цена «от N ₽» серым, поле своей цены на `MoneyInput`. Поиск и фильтр категории через `FilterBar`, серверная пагинация, сохранение страницы одной формой. Пустое поле означает, что цена не задана: сотрудник видит прочерк |
| Мои сотрудники | `/portal/staff` | `cp_admin`, у `cp_employee` 403 | P2 | `DataTable` с выбором строк: ФИО и email, роль (`cp_admin` «Администратор», `cp_employee` «Сотрудник»), телефон, последний вход (`lastLoginAt`), статус (активен; приглашён при `mustChangePassword` и пустом `lastLoginAt`; отключён при `isActive = false`). Поиск, фильтры роли и статуса, «Добавить сотрудника» с временным паролем письмом, «Сменить роль», «Отключить», счётчик «N из `staffLimit`» |

Навигация шапки портала: «Главная», «Каталог», «Заявки», колокольчик уведомлений со счётчиком непрочитанного (P12). Пункт «Доставка» из макета не рисуется, экрана под него нет. Боковое меню профиля: «Профиль», «Мои сотрудники» и «Мои цены» только для `cp_admin`, «Мои заявки», «Уведомления» (P9), под ними отдельной строкой «Выйти». В шапке и мобильном меню портала кнопки выхода нет. Подвал: контакты менеджера, ссылки «Условия поставки» и «Помощь» не рисуются до появления страниц.

### 18.6 Разрывы контракта, которые открывают макеты

Элементы ниже есть на макетах, но не рисуются: контракта под них нет. Любой из них заводится только блоком CONTRACT GAP по решению владельца. Колонка «Где всплывает» называет слайс, экран которого несёт элемент на макете.

| № | Элемент макета | Чего нет в контракте | Где всплывает |
|---|---|---|---|
| 1 | «Мои заявки» как запросы на нестандартное изделие, образцы и изменение условий, статусы «Согласовано» и «Отклонено», срок ответа менеджера | Отдельной сущности запроса нет, §1 оставляет одну сущность «Заявка» | P6 |
| 2 | Ступени цены «от 50 шт», «от 100 шт» | Таблицы ступеней цены от объёма | P3, P4 |
| 3 | «Под заказ, срок 4 дня», «Срок производства 3 дня», «Готовность заявки 20 июня» | Срока изготовления варианта и плановой даты готовности заявки | P3, P4, P6 |
| 4 | Цветные свотчи фильтра и выбора цвета | Значения цвета (hex) у `options` | P3 |
| 5 | Позиции вне каталога и услуги в составе заявки («по чертежу», «упаковка усиленная») | `request_items.variantId` обязателен | P4 |
| 6 | «Добавить по артикулам», «В спецификацию», «Запросить образец», «Отправить запрос» | Сценариев нет в объёме P3 и P4 | P3, P4 |
| 7 | Стоимость доставки и порог бесплатной доставки | Полей стоимости доставки | P4 |
| 8 | ОГРН, банк, расчётный счёт контрагента | Полей в `counterparties` | P2 |
| 9 | Должность сотрудника и роль «Наблюдатель» с правом только смотреть | Поля должности у `users` и роли в `ROLE_CODES` | P2 |
| 10 | Прогрессивная скидка «до 5 % от 1 500 000 ₽ в квартал» | Скидка только фиксированным `discountPercent` и `discount_rules` | P2 |
| 11 | Меню действий строки «⋯» | Примитива меню действий в §9 | P2 |
| 12 | Архив заявок старше шести месяцев | Архива нет, закрывается фильтром периода | P6 |
| 13 | Форма «Стать контрагентом» с сохранением заявки гостя | Таблицы обращений гостей | K7 |

### 18.7 Открытые вопросы

1. **Кириллическая гарнитура.** Вариант А: Barlow и Barlow Condensed для цифр и латиницы, кириллица на системном шрифте, как фактически выглядит макет. Вариант Б: пара с кириллицей и близким характером под свободной лицензией, например Fira Sans и Fira Sans Condensed. Сейчас действует вариант А, выбор другой гарнитуры ждёт решения владельца.

---

## 19. Роли и права

### 19.1 Роли

| Код | Подпись (`ROLE_TITLE`) | Контур | Цены | Себестоимость |
|---|---|---|---|---|
| `owner` | Руководитель | CRM | да | да |
| `manager` | Администратор | CRM | да | да |
| `carpenter` | Столяр | CRM | нет | нет |
| `grinder` | Шлифовщик | CRM | нет | нет |
| `painter` | Маляр | CRM | нет | нет |
| `upholsterer` | Обивщик | CRM | нет | нет |
| `driver` | Водитель | CRM | только экран доставки | нет |
| `cp_admin` | Администратор контрагента | портал | да | нет |
| `cp_employee` | Сотрудник контрагента | портал | нет | нет |

- `manager` это один человек, который ходит по складу, следит за работами и ведёт заявки. Код роли остаётся `manager`, потому что на нём стоят матрица прав, правила уведомлений и учётные записи. В портале он называется «администратор мастерской», чтобы его не путали с администратором контрагента.
- Роли цеха идут в порядке, в котором изделие проходит мастерскую: столяр, шлифовщик, маляр, обивщик, затем склад. Порядок задаёт `WORK_ROLES`, тот же порядок держат `ROLE_CODES` и `CRM_ROLES`.
- Контур учётной записи `crm`, если у неё есть хотя бы одна роль CRM (`PolicyService.scopeOf`).
- `canSeePrices` ложен, если среди ролей есть роль из `PRICE_BLIND_ROLES` (`cp_employee`, роли цеха, `driver`). `canSeeCost` истинен у `owner` и `manager`. `cp_admin` видит весь контрагент, `cp_employee` только свои заявки и обращения (`seesWholeCounterparty`).
- Новые роли приходят на стенд командой `pnpm admin roles:sync` из `scripts/fixtures/roles.json`.

### 19.2 Матрица прав

Решает только `GRANTS` в `lib/server/auth/policy.ts`. Роут и сервис вызывают `PolicyService.can` до разбора формы. Скрытая ссылка защитой не считается.

| Действие | Роли | Что открывает |
|---|---|---|
| `portal.access` | `cp_admin`, `cp_employee` | контур `/portal` |
| `crm.access` | все роли CRM | контур `/crm`, главная, личные уведомления |
| `catalog.read` | все, кроме `driver` | каталог, фото товаров через `/api/files/[id]`, поиск портала |
| `catalog.manage` | `owner`, `manager` | каталог и прайсы CRM, черновые и удалённые позиции |
| `catalog.cost.read` | `owner`, `manager` | себестоимость в каталоге |
| `request.create` | `owner`, `manager`, `cp_admin`, `cp_employee` | корзина портала, заведение заявки в CRM |
| `request.read.own` | `owner`, роли цеха, `driver`, `cp_admin`, `cp_employee` | свои заявки в пределах §19.3 |
| `request.read.any` | `owner`, `manager` | доска, реестр, карточка заявки CRM |
| `request.assign` | `owner`, `manager` | правка состава и приоритета на карточке CRM |
| `request.payment.mark` | `owner`, `manager` | отметка и сторно оплаты, оплата общего долга |
| `counterparty.manage` | `owner`, `manager` | контрагенты CRM, индивидуальные цены |
| `counterparty.staff.manage` | `owner`, `manager`, `cp_admin` | люди контрагента |
| `prices.manage` | `cp_admin` | «Мои цены» портала |
| `stock.read` | `owner`, `manager`, роли цеха | склад на чтение |
| `stock.manage` | `owner`, `manager` | движения, позиции, инвентаризации |
| `shop.work` | `owner`, `manager`, роли цеха | экран цеха и визиты: роль цеха только своей станции, `owner` и `manager` всех |
| `delivery.work` | `owner`, `manager`, `driver` | экран доставки, погрузка, «Доставлено» |
| `payroll.read`, `payroll.manage` | `owner`, `manager` | выплаты |
| `reports.read` | `owner` | отчёты |
| `charity.manage` | `owner` | перечисления в фонд |
| `settings.manage` | `owner` | настройки, пользователи, справочники, уведомления, документ фонда |
| `audit.read` | `owner` | журнал |
| `support.own` | `cp_admin`, `cp_employee` | обращения портала |
| `support.any` | `owner`, `manager` | обращения CRM |
| `finance.manage` | `owner` | финансы |

`owner` получает все действия, кроме `portal.access`, `prices.manage` и `support.own`: контур портала принадлежит контрагентам, а цена агентства это число контрагента.

### 19.3 Видимость заявок

- Портал: `cp_admin` видит все отправленные заявки своего контрагента, `cp_employee` только свои. Черновик в реестры не попадает.
- Работник мастерской без `request.read.any` видит отправленные заявки только в статусах, из которых его роль делает переход §6.2 (`reachableStatuses` в `state-machine.ts`). Водитель видит заявки в `ready`.
- Роль цеха видит заявку только как визит своей станции на экране цеха, и только поля `ShopTaskDto`. Визит чужой станции отвечает 403. Человек с двумя ролями цеха видит обе станции.
- Доска, реестр и карточка CRM отвечают 403 водителю и ролям цеха.

### 19.4 Экраны CRM

Права разделов повторяет `tests/e2e/crm-surface.ts`: аудит C14 обходит каждый экран, выгрузку и form action всеми ролями, роут без строки прав роняет прогон.

| Роут | Читают | Меняют | Что на экране |
|---|---|---|---|
| `/crm` | все роли CRM | | плитки разделов роли |
| `/crm/board` | `owner`, `manager` | | доска заявок §20.3 |
| `/crm/requests`, `/new`, `/[id]`, `/export.xlsx` | `owner`, `manager` | | реестр, заведение, карточка §20.3 |
| `/crm/shop`, `/[id]` | `owner`, `manager`, роли цеха (визит своей станции) | | станции цеха §20.4 |
| `/crm/delivery` | `owner`, `manager`, `driver` | | доставка §20.5 |
| `/crm/support`, `/[id]` | `owner`, `manager` | | обращения §20.13 |
| `/crm/stock`, `/[id]`, `/inventories`, `/inventories/[id]`, выгрузки | `owner`, `manager`, роли цеха | `owner`, `manager` | склад §20.9 |
| `/crm/payroll`, `/day/[date]`, `/staff`, `/works`, `/reports`, `/sheet.xlsx` | `owner`, `manager` | | выплаты §20.10 |
| `/crm/reports` и вкладки `sales`, `counterparties`, `stock`, `funnel`, `lost`, `charity`, у каждой `export.xlsx` | `owner` | | отчёты §20.11 |
| `/crm/finance`, `/export.xlsx` | `owner` | | финансы §20.12 |
| `/crm/catalog`, `/[id]`, `/categories`, `/options`, `/crm/prices`, `/[id]` | `owner`, `manager` | | каталог и прайсы §20.8 |
| `/crm/counterparties`, `/new`, `/[id]` | `owner`, `manager` | | контрагенты §20.7 |
| `/crm/notifications`, `POST /read` | все роли CRM | | личная лента и переключатели §20.14 |
| `/crm/settings`, `/users`, `/dicts`, `/notifications`, `/notifications/templates`, `/notifications/log`, `/audit` | `owner` | | §20.15 |

Боковое меню CRM собрано в группы: «Работа» (Доска, Заявки, Цех, Доставка, Обращения), «Учёт» (Склад, Выплаты, Отчёты, Финансы), «Продажи» (Каталог, Прайсы и скидки, Контрагенты), «Администрирование» (Пользователи, Справочники, Уведомления, Настройки, Журнал). Список разделов и подписи плиток главной живут в одном `crmNav` (`lib/crm/nav.ts`), флаги навигации считает `(crm)/+layout.server.ts`.

---

## 20. Правила разделов

Раздел держит правила, которые не видны из схемы §5 и типов §8. Слайс, который меняет правило, правит его здесь.

### 20.1 Портал

**Каталог.** Черновые и удалённые позиции видит только `catalog.manage`, скрытая модель или вариант отвечает порталу 404 вместе с фото. Категории образуют дерево по `parent_id`, раздел включает подкатегории. Фильтры листинга: материал, цвет, длина; все условия проверяются одним вариантом модели. Обложка модели это первое фото по `(sort_order, id)`. Опция изделия одна, цвет (`OPTION_KINDS = ['color']`), цвет цену не меняет. Наличие на складе витрина не показывает, параметр адреса `inStock` игнорируется. Сортировка по цене идёт по минимальной персональной цене модели; у роли без цен она игнорируется, чтобы порядок не выдавал цены, а у `cp_employee` идёт по цене агентства, модель без неё в конце. Прайс-лист XLSX `/portal/catalog/price-list.xlsx` отдаётся синхронно и только роли с ценами, цена пишется целым числом с форматом `#,##0`.

**Поиск в шапке.** Поле «Поиск» (на телефоне лупа) и Ctrl/Cmd+K открывают палитру с тремя группами: разделы меню роли, группы каталога и до шести моделей. Разделы подбираются в браузере по началу слова и синонимам, группы и модели отдаёт `GET /portal/search?q=` (`SiteSearchService`, право `catalog.read`, `q` от 2 до 64 символов). Ответ `SiteSearchDto` ценовых ключей не несёт.

**Текстовый поиск.** Весь поиск приложения идёт через `containsText` из `lib/server/core/search.ts`: регистр не важен и для кириллицы (SQLite-функция `unicode_lower`), `%` и `_` во вводе ищутся как обычные символы. `like` напрямую в репозиториях не пишется.

**Черновик и отправка.** Черновик один на пользователя в своём контрагенте и получает номер из `numbering_sequences` при создании: формат `{prefix}{period}-{00001}`, период считается в `org.timezone`, новый период начинает счёт с единицы. Опции позиции только из матрицы варианта, без повторов и не больше одной каждого вида. Одинаковые позиции складываются, в строке не больше 999 штук. Суммы черновика считаются и хранятся для любой роли, DTO отдаёт их только роли с ценами. Отправка `draft -> new` проходит машину состояний, пересчитывает цены на момент отправки и в одной транзакции пишет историю, событие `request.submitted` и аудит; частоту держит `request.submit`. Повтор заявки копирует позиции в черновик и пропускает недоступные. Страница товара показывает счётчик вместо «Добавить в заявку», если в черновике уже есть строка того же варианта с теми же опциями; «−» на одной штуке удаляет строку.

**Цена строки.** Персональная цена варианта (§5.5) плюс надбавки опций, умноженные на количество. Скидка строки равна большему из договорной `counterparties.discount_percent` и подходящих действующих `discount_rules`. Правила с `counterparty_id = null` общие, с `category_id = null` охватывают все категории, правило категории действует на её потомков. Суммы строк с одинаковым процентом складываются до округления скидки. `DraftDto.discountPercent` показывает округлённый эффективный процент, `discountMinor` остаётся точным.

**Цена агентства.** Одна цена контрагента на модель (`counterparty_product_prices`), размер и опции её не меняют. Она только для показа клиенту: в `total_minor`, скидку, отчисление в фонд и прайс-лист XLSX не входит. `cp_admin` задаёт её на экране «Мои цены» и видит рядом закупочную серым, `cp_employee` видит только её. Пустое поле значит «цена не задана», сотрудник видит прочерк. Аудит `agency_price.set`.

**Люди контрагента.** Лимит `staff_limit` считает активные учётные записи. Администратор не может отключить или понизить себя. Временный пароль уходит письмом через `MailDriver` напрямую и один раз показывается на странице: в очереди пароль не лежит. Создание ограничено `staff.create`. Статус выводится из учётной записи: отключён при `is_active = false`, приглашён при временном пароле без входа, иначе активен.

**Мои заявки.** Фильтры: статусы чипами со счётчиками, окно дат по `submittedAt`, поиск по номеру и по своему номеру контрагента, сортировка `REQUEST_SORTS`; сортировка по сумме для роли без цен игнорируется. Карточка показывает старые комментарии портала (`is_internal = false`) только на чтение, рядом обращения по заявке и кнопку «Написать по заявке». Вложения: `POST /api/files` кладёт файл в `media` с `owner_scope = 'request'`, имя файла берётся из последнего сегмента `media.path`; `/api/files/[id]` отдаёт вложение только тому, кому видна заявка. Частоту держит `file.upload`.

**Профиль.** Карточка контрагента в портале без реквизитов и без скидки по договору (`CounterpartyCardDto` не несёт `legalName`, `inn`, `kpp`, `address`, `phone`, `email`, `settlementScheme`, `discountPercent`). Плитки «Задолженность» и «Закупка за год» только `cp_admin`. Скидка видна в корзине и в карточке заявки.

**Суммы на экране.** Интерфейс и XLSX показывают целые рубли: `formatMinor` округляет по `roundHalfUp`, поэтому итог может разойтись со слагаемыми на рубль. `MoneyInput` принимает только целые рубли, в данных остаются копейки.

### 20.2 Благотворительность, лендинг, документы

**Отчисление.** Считается при первом переходе в `delivered` как `roundHalfUp(totalMinor * rate_bp / 10000)` и дальше не меняется. Цена агентства в базу не входит, заявка на склад отчисления не получает. В счётчик попадают заявки с зафиксированным отчислением, кроме заявок на склад, отменённых и отклонённых; год берётся по `deliveredAt` в `org.timezone`, `requestCount` считается за всё время. Хендлер `charity.recount` пересобирает строку `charity_totals` целиком. Личный вклад контрагента и отчисление с заявки получает только роль с ценами: по ним вычисляется объём закупок. Выгрузки по фонду в портале нет.

**Перечисления в фонд.** Пишет `owner` по `charity.manage` на вкладке отчёта. Ошибочное перечисление гасится строкой с минусом (`reversal_of_id`), перечислить больше остатка «начислено, но не перечислено» нельзя. Аудит `charity.transfer`, `charity.transfer.reverse`.

**Подтверждение перевода.** Блок «Благотворительный фонд» настроек принимает один PDF (form action `charityDocument`, `settings.manage`, лимит `file.upload`, не больше 10 МБ, сигнатуру проверяет `checkCharityDocument` из `lib/domain/charity/document.ts`). Новый файл заменяет прежний: прежняя строка `media` и файл удаляются, прежний адрес отвечает 404. «Удалить» с подтверждением снимает файл (`charityDocumentRemove`). Файл лежит в `charity/<случайное>.pdf` с `owner_scope = 'charity'` без `owner_id`, текущий называет `settings.charity.transfer_media_id`. `/api/files/[id]` отдаёт только текущий файл: любой роли портала и роли CRM с `settings.manage`. Ссылка «Подтверждение перевода в фонд, PDF» стоит на главной портала у всех ролей (`CharityBannerDto.transferDocumentUrl`). Аудит `charity.document_replace`, `charity.document_remove` по сущности `media`.

**Лендинг.** Гостю отвечает `GET /api/public/works/[id]`: обложка опубликованной модели без актора, 404 на скрытую, удалённую, чужую по владельцу и неизвестную. `LandingService` работает без `ActorContext` и выбирает только название и id обложки, до `LANDING_WORKS_LIMIT` = 9 пар. Блок фонда показывает название, ссылку и ставку процентом, собранных сумм гостю нет; без фонда и ставки блока нет (`CharitySettings.findRateBp`). Секции лежат отдельными компонентами, порядок собирает `+page.svelte`. Лендинг несёт title, description, canonical, Open Graph и разметку Organization.

**Публичные документы.** `/legal` и `/legal/terms`, `/legal/personal-data`, `/legal/privacy`, `/legal/cookies` читают реквизиты оператора из настроек на каждом запросе. Ссылки на них стоят в подвале лендинга, на входе и в подвале портала. Плашка cookie на лендинге и входе закрывается кнопкой «Понятно», выбор хранит `localStorage`. `robots.txt` закрывает `/portal`, `/crm`, `/api`, `/password`.

### 20.3 Заявки в CRM

**Доска** `/crm/board` рисует шесть колонок `BOARD_STATUSES`, в колонке не больше `BOARD_COLUMN_LIMIT` карточек и общий счётчик; колонка `paid` берёт заявки, оплаченные за последние `BOARD_PAID_DAYS` дней. Порядок карточек: срочные, затем ближний `deliveryAt`, заявки без срока в конце. Перенос карточки идёт через `RequestTransitionService`: машина состояний решает, отказ по guard-у называет его словами. В «Готов к выдаче» карточку не переносят: туда заявку ставит система (§6.2, инвариант 5). Карточка «В работе» несёт метки станций, где лежат её открытые задания.

**Фильтры** доски и реестра (`CrmRequestFilters`): статус (только реестр), контрагент или «на склад», приоритет, флаг внимания, окно дат по `submittedAt`; поиск по номеру, своему номеру контрагента, названию контрагента и ФИО умершего. Сортировки `CRM_REQUEST_SORTS`, по сумме только роли с ценами.

**Флаг внимания** один, `payment_overdue` (`attentionFlags` в `lib/domain/request/attention.ts`): заявка в `awaiting_payment`, у которой с `deliveredAt` прошло больше дней, чем даёт схема расчётов контрагента (`PAYMENT_WAIT_DAYS`: по факту 3, раз в неделю 7, раз в месяц 30). Заявка на склад долга не ждёт.

**Выгрузка** XLSX синхронная: те же фильтры и сортировка, не больше `CRM_REQUEST_EXPORT_LIMIT` строк, суммы в целых рублях только роли с ценами, ФИО умершего в файл не пишется.

**Заведение** `/crm/requests/new`: заявку контрагента или заявку на склад администратор заводит одной формой сразу в `new`. Номер из `numbering_sequences`, строки с цветом по матрице варианта, цены по правилам корзины; у заявки на склад базовая цена без скидки. Переход `draft -> new` проверяет guard `deliveryFilled`, пишутся история, `request.submitted` и аудит `request.create`. Срок доставки вводится датой и временем в `org.timezone`.

**Ведение** по `request.assign`. Приём `new -> in_work` цены не пересчитывает: их заморозила отправка или последняя правка состава в `new`. Состав правится в `new` свободно, с пересчётом всей заявки по текущим ценам, и в `in_work` под контролем: комментарий обязателен, прежние строки держат свою цену штуки, новая строка берёт персональную цену на момент правки, скидка сохраняет долю (`keepDiscountShare` в `lib/domain/request/amendment.ts`). В других статусах состав закрыт, последнюю строку не удалить. Приоритет меняется в `new`, `in_work`, `ready`. Правка после `new` пишет строку истории с `from_status = to_status` и комментарием (§5.6).

Аудит: `request.create`, `request.items_update`, `request.priority`, переходы `request.transition`.

### 20.4 Цех

Изделие проходит станции по порядку `WORK_ROLES`: столяр, шлифовщик, маляр, обивщик, затем склад. Исключений по моделям нет. Станцию ведёт вся роль: визит видят все её люди, отметки делает любой из них. `owner` и `manager` делают на любой станции всё то же. Схема в §5.12, типы в §8.

- **Раздача склада** считается на лету: `allocateStock` отдаёт остаток позиции «вариант, цвет» строкам по `fillOrder`: заявки контрагентов в `ready`, затем заявки контрагентов в `in_work` (срочные, ближний `deliveryAt`, без срока в конце, затем порядок заведения). Отрицательный остаток ничего не наполняет, строка хочет `qty − loadedQty`. Заявка на склад в раздаче не участвует (`fillTier` даёт ей `null`): она ничего не берёт с полки, сделанное для неё ложится на полку свободным остатком.
- **Досылка** (`planDispatch` в `lib/domain/shop/dispatch.ts`, применяет `ShopDispatch`) сравнивает раздачу с цехом. Для строки заявки контрагента в `in_work` `нужно = shelfWant − наполнено − в цеху`, для строки заявки на склад в `in_work` `нужно = qty − сделано − в цеху`, где «в цеху» это сумма `qty` открытых заданий строки, а «сделано» сумма `qty` заданий с `finished_at`. При `нужно > 0` столько штук приходит столяру. При `нужно < 0` лишнее снимается только с задания столяра и только из несделанных штук; задание, ставшее нулём, удаляется. Задания дальше по станциям доделываются. Строки заявок вне `in_work` досылка не трогает.
- **Когда идёт досылка.** В транзакции каждого действия, которое меняет раздачу или цех: приём заявки (до автоматических шагов), смена приоритета, правка состава, «Выполнено» обивщика, ручное движение и его сторно, проведение инвентаризации, погрузка и её снятие. Кроме приёма, за досылкой в той же транзакции идут автоматические шаги `in_work -> ready` по всем заявкам в работе (`ShopFlow.afterChange`). Повторный прогон на тех же данных ничего не меняет.
- **Визит.** Штуки, пришедшие на станцию, ложатся в открытый визит заявки на этой станции; если его нет, визит создаётся и публикует `shop.task_arrived`. «Взять в работу» ставит `taken_at` и `taken_by_id` один раз, повтор ничего не пишет. Счётчик задания принимает новое значение `done_qty` от 0 до `qty`, а не прибавку. «Выполнено» открыто, когда у визита есть задания и каждое сделано целиком; оно закрывает визит, и каждое задание переходит в визит следующей станции с `done_qty = 0`. На обивщике задание завершается: пишется движение `production` на `+qty` по позиции строки, `finished_at` и `production_move_id`. Повторное «Выполнено» по закрытому визиту отвечает 409 и ничего не пишет.
- **Порядок визитов** на станции: срочные, ближний `deliveryAt`, без срока, затем `accepted_at` заявки, затем id визита. Списки «Новые» (визит не взят) и «В работе» (взят), поиск по номеру заявки, не больше `SHOP_TASK_LIMIT` визитов в списке.
- **Готовность** ставит система (§6.2, инвариант 5). Открытые задания заявки, ставшей `ready`, остаются: досылка снимает несделанное у столяра, остальное доделывается и ложится на полку.
- **Что видит исполнитель:** номер заявки, «Срочно», срок доставки, комментарий заявки, по заданию модель, артикул, размер, материал, цвет, гравировку, комментарий строки, «Нужно N шт» и счётчик «Сделано N из M» (строка из одной штуки рисуется чекбоксом). Цен, контрагента, адреса и ФИО умершего нет.
- **Экран** `/crm/shop` по праву `shop.work`: станции актора, у `owner` и `manager` все четыре с переключением. Визит `/crm/shop/[id]` с кнопками «Взять в работу», «Выполнено» и счётчиками заданий. Экран рассчитан на телефон, тач-цели не меньше 44 px. Роли цеха получают «Цех» первым пунктом меню.
- **Карточка заявки CRM** показывает по строке `CrmLineShopDto`: «Со склада N», станции с «Сделано N из M», сделанное и номера заявок, которые держат позицию выше по очереди.
- Удалённая правкой строка теряет задания вместе с собой. Приход изделия помимо станций пишут приходом или корректировкой склада.

Аудит: `shop.task.take`, `shop.job.progress` (до и после `done_qty`), `shop.task.complete` (id заданий, следующая станция, id движений `production`) по `shop_tasks`.

### 20.5 Доставка

Экран `/crm/delivery` по праву `delivery.work`. Водителя на заявку не назначают: любой водитель видит все заявки контрагентов в `ready`.

- **Списки.** Заявки контрагентов в `ready` с адресом, контактом, ссылкой на Яндекс Карты и погрузкой по строкам; заявки контрагентов в `in_work` для планирования, только на чтение. Заявок на склад на экране нет. Блок «Доставлены» читает `requests.delivered_at`: заявки, доставленные за последние `DELIVERED_DAYS` (7) дней, свежие сверху, не больше `DELIVERY_LIST_LIMIT`; строка `DeliveredStopDto` без денег.
- **Погрузка.** «Погрузил N» пишет движение `shipment` на `−N` по позиции строки с `request_id` и `request_item_id`, это и есть списание со склада. Погружено по строке равно минус сумме движений с её `request_item_id`. Грузить можно не больше остатка строки и не больше, чем `allocateStock` держит для неё, иначе отказ. «Снять» на строке, пока заявка в `ready`, гасит каждое непогашенное движение погрузки строки движением `reversal`.
- **«Доставлено»** закрыто guard-ом `fullyLoaded`. Флажок «Принял оплату наличными» в транзакции доставки до цепочки автоматических шагов пишет `payment_marks` со способом `cash` на остаток `totalMinor − Σ отметок`; при нулевом остатке отметки нет, заявке на склад флажок недоступен.
- **Деньги водителя.** На этом экране водитель получает `totalMinor` заявки в `ready`, потому что принимает наличные. Это единственное исключение из его слепоты к ценам, `canSeePrices` у него ложен.

Аудит: `request.load`, `request.unload`, доставка пишет `request.transition` с `cashCollected` в `after`.

### 20.6 Оплаты и долг

- **Предоплаты нет**: отметка появляется не раньше доставки. Отметку в карточке `/crm/requests/[id]` ставят по `request.payment.mark` и только у заявки контрагента в `awaiting_payment`: дата не позже сегодня в `org.timezone`, сумма, способ из `PAYMENT_METHODS`, комментарий до 500 символов.
- **Переплаты нет**: отметка больше остатка отклоняется 422. Сумма, которая отличается от остатка меньше чем на рубль, записывается как остаток целиком (`settledAmountMinor` в `lib/domain/payment/mark.ts`).
- **Отметка не правится и не удаляется.** Ошибку гасит сторно (`reversal_of_id`): та же дата и способ, сумма с обратным знаком, обязательный комментарий. Сторно доступно, пока заявка в `awaiting_payment`, один раз на отметку, само не сторнируется. Закрытая заявка отметок не меняет.
- **`requests.paid_minor`** равен сумме отметок и переписывается в транзакции каждой отметки и сторно. Долг считается из самих отметок: долг заявки `max(0, total_minor − Σ payment_marks.amount_minor)` для `delivered` и `awaiting_payment`, долг контрагента сумма долгов, `openCount` число заявок с положительным долгом. Один запрос `DebtRepository` считает долг для портала и для CRM.
- **Общий долг.** Guard `fullyPaid` держит покрытую заявку в `awaiting_payment`, пока у контрагента есть долг по другим заявкам (`otherDebtMinor`). Блок «Оплата долга» на вкладке «Заявки и оплаты» карточки контрагента (form action `pay`, схема `paymentMarkSchema`, `request.payment.mark`, только роли с ценами): `CounterpartyPaymentService.pay` разносит сумму по заявкам в `awaiting_payment` от старой доставки к новой (`allocatePayment` в `lib/domain/payment/allocate.ts`), каждая заявка берёт свой остаток целиком, прежде чем следующая получит деньги. Разнесение пишется обычными отметками с той же датой, способом и комментарием. Сумма больше долга отклоняется, сумма в пределах рубля от долга считается долгом. Затем `settleCounterparty` проводит автоматический шаг для каждой ждущей заявки. Карточка заявки при нулевом остатке вместо формы пишет «Заявка оплачена. Она перейдёт в «Оплачено», когда контрагент погасит весь долг».
- **События.** Частичная отметка публикует `request.payment_marked`, ключ fanout пропускает одно такое событие на заявку. Отметка, закрывшая заявку, публикует только `request.paid`. Оплата долга публикует `request.payment_marked` по каждой заявке, которая получила деньги и осталась ждать. Сторно событий не публикует.

Аудит: `payment.mark`, `payment.reverse` по `payment_marks`, `payment.counterparty` по `counterparties` с разнесением и закрытыми заявками.

### 20.7 Контрагенты

- **Реестр** `/crm/counterparties`: поиск по названию и ИНН, фильтры менеджера, схемы расчётов и наличия долга.
- **Заведение** одной транзакцией вместе с первым `cp_admin`, как `pnpm admin counterparty:create`. Лимит сотрудников берётся из `counterparty.staff_limit_default`. Письмо с временным паролем уходит через `MailDriver` напрямую и расходует лимит `staff.create`, пароль один раз показывается на странице. При заведении с регионом цены региона копируются в личный лист.
- **Выдача администратора**: новая учётная запись `cp_admin` в пределах `staff_limit`, перевод активного сотрудника в `cp_admin`, повторная выдача доступа новым временным паролем с закрытием всех сессий. Отключение и понижение людей контрагента остаётся за `cp_admin` в портале.
- **Условия**: ответственный менеджер из активных учётных записей CRM с ролью `manager` или `owner`, региональный прайс только из листов с `is_base = false` и `is_personal = false`, схема расчётов, скидка, лимит.
- **Договоры** добавляются, правятся и удаляются, `valid_until` не раньше `signed_at`; портал показывает последний по `signed_at`. Скан договора не загружается.
- **Адреса** удаляются мягко, потому что на них ссылаются заявки. Адрес по умолчанию один, выбор нового снимает флаг с прежнего. Архивации контрагента нет, `is_active` не меняется.
- **Карточка** отдаёт историю заявок без черновиков и реестр отметок оплаты новыми сверху.
- **Вкладка «Цены»** по `counterparty.manage` и только роли с ценами: администратор вводит цену каждого варианта по правилам §5.5, повторная отправка того же ничего не пишет. Колонка «Базовая» показывает цепочку цены без личного листа. «Заполнить из прайса» с подтверждением заменяет личные цены ценами региона (form action `refill`).

Аудит: `counterparty.create`, `counterparty.update`, `counterparty.terms_update`, `counterparty.notes_update`, `counterparty.contract_create`, `counterparty.contract_update`, `counterparty.contract_delete`, `counterparty.address_create`, `counterparty.address_update`, `counterparty.address_delete`, `counterparty.address_default`, `counterparty.admin_issue`, `counterparty.admin_promote`, `counterparty.access_resend`, `counterparty.prices_update` (старый и новый `priceListId`), `counterparty.prices_refill`. Контакты людей и пароли в журнал не пишутся.

### 20.8 Каталог и прайсы

- **Каталог** ведут `owner` и `manager` по `catalog.manage`: категории, модели, варианты, цвета, матрица совместимости, фото с обложкой и порядком. Модели и варианты удаляются мягко, цвета выключаются, категория с потомками или моделями не удаляется. Скрытие модели или варианта сразу закрывает их и фото модели для портала. Формы создания открываются в `Modal` по кнопке.
- **Складская позиция** варианта выбирается из существующих `stock_items.kind = 'product'`. Себестоимость варианта читается из его позиции (§20.9), вариант без позиции стоит 0. Видят её роли с `canSeeCost`, для прочих колонка не выбирается.
- **Прайс-листы** действуют в полуоткрытом окне `[valid_from, valid_to)`, базовых листов в один момент действует не больше одного. Правила скидок описаны в §20.1.
- **Региональный прайс** загружается на странице листа `/crm/prices/[id]` файлом XLSX (form action `import`, `catalog.manage`, лимит `file.upload`): первая строка «Артикул» и «Цена» (или `sku` и `price`), не больше 2 МБ и 5000 строк, сигнатура ZIP проверяется `matchesSignature`, каждая строка проходит Zod, повтор или неизвестный артикул отклоняют весь файл. Файл заменяет все позиции листа одной транзакцией и в хранилище не попадает. Чтение листа общее с CLI `price:import` (`lib/server/crm-pricing/price-sheet.ts`).

Аудит: `catalog.category.*`, `catalog.product.*`, `catalog.variant.*`, `catalog.option.*`, `catalog.compatibility.update`, `catalog.media.add`, `catalog.media.order`, `catalog.media.remove`, `price_list.create`, `price_list.update`, `price_list.delete`, `price_list.item.upsert`, `price_list.item.delete`, `price_list.import`, `discount_rule.create`, `discount_rule.update`, `discount_rule.delete`.

### 20.9 Склад

- **Позиция.** Изделие хранится парой «вариант, цвет»: остаток равен сумме движений по `(stock_item_id, option_id)`, складскую позицию изделию даёт `product_variants.stock_item_id`. Реестр `/crm/stock` показывает остаток позиции суммой по всем цветам, карточка `/crm/stock/[id]` раскладывает его по цветам и журналу движений. Свёртку делает `lib/domain/stock/balance.ts`.
- **Учётную позицию** создают и правят в реестре: код, название, вид, единица, порог, активность, себестоимость. Вид после создания не меняется, позиция не удаляется.
- **Себестоимость** одной единицы (`stock_items.cost_price_minor`) вводят руками полем «Себестоимость, ₽» в целых рублях от 0 до `STOCK_COST_MAX_MINOR`; пустое поле оставляет прежнее значение. Видят и пишут её только роли с `canSeeCost`, запись от прочих получает 403. Её читают каталог, отчёт маржи и форма позиции.
- **Ручное движение.** `purchase` (приход) только с плюсом, причина необязательна. `adjustment` (корректировка) со знаком и с обязательной причиной из `stock_move_reason`. Ноль отклоняется, у изделия цвет обязан входить в матрицу варианта, у комплектующего цвета нет, `occurred_at` ставит сервер, в одном движении не больше `STOCK_MOVE_MAX` единиц.
- **Сторно** (§6.3) есть только у `purchase` и `adjustment`, один раз на движение, сторно само не сторнируется. Выпуск исправляет корректировка, погрузку снимает экран доставки, инвентаризацию исправляет новая инвентаризация.
- **Инвентаризация** идёт через черновик своего вида (изделия или комплектующие), открытый черновик на вид один. Черновик получает строку на каждую активную позицию вида, у изделия на каждую пару «позиция, цвет» с хотя бы одним движением; его можно сохранять и удалить. «Провести» в одной транзакции пересчитывает `expected_qty` по остатку на момент проведения и пишет движение `inventory` на `actual − expected` по каждой строке с расхождением. Проведённая инвентаризация не правится и не удаляется.
- **Порог** считается по позиции целиком, у изделия по сумме цветов; порог 0 выключает проверку. Движение, после которого остаток ниже порога, ставит `stock.threshold.check` в своей транзакции: ручное движение, сторно, проведение инвентаризации, погрузка и её снятие. Те же действия запускают досылку цеха §20.4. Хендлер читает остаток заново и публикует `stock.below_threshold`, если он всё ещё ниже. Уведомление приходит одно на позицию за всё время, дальше низкий и отрицательный остаток видны подсветкой реестра и фильтром «ниже порога».
- **Выгрузки** реестра и журнала позиции в XLSX синхронные.

Аудит: `stock.item.create`, `stock.item.update` (себестоимость до и после), `stock.move.create`, `stock.move.reverse`, `stock.inventory.create`, `stock.inventory.save`, `stock.inventory.apply`, `stock.inventory.delete`.

### 20.10 Выплаты

Оплата труда бригадная. Раздел читают по `payroll.read`, меняют по `payroll.manage`. Чистая логика в `lib/domain/payroll/calc.ts`.

- **Справочники.** Сотрудники (`staff`) и виды работ с ценой за единицу и ролью цеха из `WORK_ROLES` (`null` это общая работа). Список работ и выбор работы в дне идут в порядке цеха, общие в конце, в дне работа подписана «Роль: название».
- **Рабочий день** один на дату. Состав дня (`work_day_staff`) это отметка присутствия. У каждой записи работы свои исполнители (`work_entry_staff`), их выбирают только из отмеченных в этот день; один вид работ в дне можно внести несколькими записями с разными исполнителями. Цена замораживается в записи; вид работ, уже внесённый в день, держит замороженную цену во всех своих записях. Сумма записи `qty × rate_minor`.
- **Доля работника за день** равна `floor(Σ amount_minor / число исполнителей)` по записям, где он исполнитель, с округлением до рубля вниз один раз от суммы дня; остаток остаётся у мастерской. Пришёл, но ни в одной работе не участвовал: 0 ₽, день в счётчик дней идёт. Доли считаются на лету.
- **Форма дня** шлёт строки `entry.<n>.work`, `entry.<n>.qty`, `entry.<n>.staff.<id>`: строку без количества сервер пропускает, строку без исполнителей или с исполнителем вне состава отклоняет. Будущую дату отметить нельзя. День без людей и без работ не хранится. «Скопировать прошлый день» переносит в пустой день состав последнего отмеченного дня, работы не переносит.
- **Неделя.** `payroll.week_closing_day` это ISO-день недели закрытия; период длится 7 дней и начинается в этот день в `org.timezone`. Строку `payroll_periods` создаёт первая запись дня или корректировки. Свод открытой недели считается на лету: дни, начислено (сумма долей), корректировка, к выплате `accrued + adjustment`. Корректировка со знаком и с обязательным комментарием, выплата в минус не уходит.
- **Закрытие** `open -> calculated` замораживает `payroll_lines` в своей транзакции и публикует `payroll.week_closed`; неделя без дней и корректировок не закрывается. В `calculated` и `paid` дни, работы и корректировки не меняются (`ConflictError`). Переоткрытие требует комментарий; период с отметкой выплаты не переоткрывается, сначала отметку снимают. Повторное закрытие той же недели второй раз не уведомляет.
- **Выплата** отмечается по строке с суммой больше нуля в `calculated`. Когда отмечены все такие строки, период становится `paid`, снятие отметки возвращает `calculated`.
- **Выгрузки и отчёт.** Ведомость недели в XLSX синхронно. Отчёт за произвольные даты: по сотрудникам (дни, начислено) и по видам работ (количество, сумма), корректировки в него не входят.

Аудит: `staff.create`, `staff.update`, `staff.enable`, `staff.disable`, `work_type.create`, `work_type.update` (роль до и после), `work_type.enable`, `work_type.disable`, `payroll.day.save`, `payroll.adjust`, `payroll.close`, `payroll.reopen`, `payroll.pay`, `payroll.unpay`.

### 20.11 Отчёты

Раздел `/crm/reports` читает только `owner`. Период общий для вкладок, не длиннее 366 дней. Выгрузки синхронные, у каждой вкладки свой `export.xlsx`.

- **Продажа** это доставленная заявка контрагента (`delivered`, `awaiting_payment`, `paid`) по `delivered_at` в окне периода.
- **Вкладки**: дашборд, продажи по контрагентам, моделям и периодам, «По контрагентам» с маржой, склад (движения и оборачиваемость в штуках и днях запаса), воронка, отменённые и отклонённые заявки, благотворительность (реестр перечислений и остаток «начислено, но не перечислено»).
- **Маржа по контрагентам.** На строку: заявки, штуки, сумма после скидки (`total_minor`), себестоимость, маржа, доля маржи, оплачено и число штук без себестоимости. Себестоимость строки заявки это `qty × stock_items.cost_price_minor` её варианта на момент отчёта, не замороженная: правка себестоимости меняет маржу прошлых периодов. Вариант без позиции или позиция с нулём дают 0 и попадают в `uncostedQty`. `margin = total − cost`, доля в базисных пунктах от суммы, `null` при нулевой сумме, итоговые доли считаются от сумм (`lib/domain/report/margin.ts`). Параметр `counterpartyId` раскрывает заявки контрагента, свежие доставки сверху; выгрузка тогда получает второй лист «Заявки».

### 20.12 Финансы

Страница `/crm/finance` только у `owner` по `finance.manage`: форма ручной операции, аналитика за период и лента. Схема и источники ленты в §5.11.

- Доход от заявок это поступившие деньги: каждая отметка оплаты идёт доходом на свою дату, сторно туда же с минусом. Выплата бригаде идёт расходом в день отметки «Выплачено», снятая отметка убирает строку. Перечисление в фонд идёт расходом, его сторно уменьшает расход. Взаимозачёт считается доходом.
- Автоматические операции не копируются: лента читает их из источников одним `UNION ALL`, правят их только в источнике.
- Ручная операция: тип, сумма больше нуля и не больше 100 000 000 ₽, день не позже сегодняшнего, обязательный комментарий до 500 символов. Категорий, счетов, валют и повторяющихся платежей нет. Исправить и удалить её можно, удаление мягкое.
- Период не длиннее 366 дней. Сводку и корзины графика (день до 31 дня, неделя до 92, иначе месяц) считает `lib/domain/finance/summary.ts`. Лента выгружается в XLSX синхронно. Событий и топиков раздел не заводит.

Аудит: `finance.entry.create`, `finance.entry.update`, `finance.entry.delete` по `finance_entries`.

### 20.13 Обращения

Схема и инварианты в §5.10, адресаты событий в §7.3.

- `support.own` у ролей портала с фильтром P6: сотрудник видит свои обращения, администратор весь контрагент. `support.any` у `manager` и `owner`.
- Обращение открывает только контрагент, закрывает любая сторона. В закрытое писать нельзя, повторного открытия нет, повторное закрытие ничего не пишет. Заявку к обращению сервер проверяет тем же фильтром P6, чужая даёт 404.
- Экраны: «Чат» в профиле портала (`/portal/support`, `/new`, `/[id]`) и «Обращения» CRM (`/crm/support`, `/[id]`) с фильтром «ждёт ответа».
- Частоту сообщений держит `support.post`: 30 за 10 минут.

Аудит: `support.open`, `support.post`, `support.close` по `support_threads`. Текст сообщения в журнал не пишется.

### 20.14 Уведомления и пуш

Правила разворота в §7.3. Почта о событиях не сообщает, она шлёт только письма доступа.

- **Колокольчик** в шапке обоих контуров (`ContourShell`, сниппет `bell`). Счётчик пересчитывает `+layout.server.ts` на переходе между страницами, персонального SSE-топика нет. Отметку прочтения принимают `POST /portal/notifications/read` и `POST /crm/notifications/read` со списком показанных id, в `audit_log` она не пишется. Строка ленты ведёт на заявку портала, на `/crm/requests/{id}` при `request.read.any`, иначе на `/crm/delivery`; событие склада на `/crm/stock/{id}`, выплат на `/crm/payroll`, обращения на свою ветку.
- **Личные экраны** `/portal/profile/notifications` и `/crm/notifications`: лента событий и переключатели пар «событие, канал», которые предлагает матрица ролей; журнал отправок без текста ошибки. Фид выключить нельзя.
- **Экраны руководителя** под `/crm/settings/notifications`: матрица `notification_rules` на чтение (её меняет сид), шаблоны с предпросмотром и тестовой отправкой себе мимо таблицы `notifications`, журнал отправок всех людей. Правка шаблона пишет `notifications.template.update`, личные настройки пишут `notifications.prefs.update`.
- **Подписка устройства** принадлежит последнему, кто подписался в этом браузере. Выход из приложения и отключение пуша отписывают устройство, даже если сервер недоступен. У человека не больше десяти устройств, новая подписка вытесняет самую старую. При `PUSH_DRIVER=webpush` сервер принимает endpoint только на хостах сервисов доставки Chrome, Safari, Firefox и Edge; без ключей VAPID и `VAPID_SUBJECT` запуск падает. Роуты `POST` и `DELETE /api/push/subscription` для любого вошедшего.
- **Dispatch** шлёт строку на все живые подписки человека параллельно, таймаут 10 секунд. Приняла хотя бы одна, строка `sent`. Все мертвы или живых нет, `failed` с кодом `expired` без ретрая. Шаблон выключен или сущность исчезла, `failed` с кодом `driver` без ретрая. Ошибка сервиса или таймаут, `failed` с кодом `driver` и ретрай. `notifications.error` начинается с кода, DTO отдаёт только код.
- **Сообщение**: `PushMessage.url` это путь без `ORIGIN`, `tag` равен `{eventKey}:{entityId}`, срок жизни 4 часа, `urgency: high`, заголовок до 80 символов, текст до 200.
- `settings.notifications.enabled = false` выключает разворот событий целиком.

### 20.15 Настройки, пользователи, справочники, журнал

Всё под `/crm/settings` открывает только `owner`: настройки по `settings.manage`, журнал по `audit.read`.

- **Пользователи мастерской.** Письмо с временным паролем уходит через `MailDriver` напрямую и расходует `staff.create`. Руководитель не может отключить себя, сбросить себе пароль и снять с себя `owner`, поэтому в мастерской всегда остаётся активный руководитель. Аудит `crm_user.create`, `crm_user.roles_change`, `crm_user.enable`, `crm_user.disable`, `crm_user.password_reset`.
- **Справочники.** Запись выключается, а не удаляется, код после создания не меняется. Аудит `dict.create`, `dict.update`, `dict.enable`, `dict.disable`.
- **Настройки.** Формы ключей в §5.9. Сохранение пишет одну строку `settings.update` со старым и новым значением под ключом настройки.
- **Нумерация** правится только для ключа `request`: префикс до 10 символов и период. Сохранение продолжает счёт от наибольшего выданного номера той же формы (`resumeSequence` в `lib/domain/numbering/numbering.ts`), возврат к старому префиксу занятый номер не выдаёт. Аудит `numbering.update`.
- **Журнал** отдаёт записи новыми сверху. Фильтры: часть имени автора, действие, объект, окно дат в `org.timezone`; списки действий и объектов берутся из самого журнала.

Прочие действия аудита: `auth.login`, `auth.password_changed`, `auth.password_reset`, `profile.update`, `staff.create`, `staff.update`, `staff.role_change`, `staff.enable`, `staff.disable` (люди контрагента в портале), `request.submit`, `request.repeat`, `request.attach`, `request.draft_item_add`, `request.draft_details`, `request.draft_clear`.

### 20.16 Оболочка и интерфейс

- **CRM.** Боковое меню на shadcn `sidebar` (§19.4), состояние хранит кука `sidebar_state`. Подменю раздела рисует один `SectionTabs`, списки вкладок лежат в `lib/crm/sections.ts`. На телефоне нижняя панель: «Главная», три первых раздела роли и «Ещё», которая открывает шторку меню; кнопка меню в шапке скрыта. Оболочка держит один landmark `main`.
- **Таблицы.** `DataTable` там, где строки сравнивают по колонкам: заявки, склад, движения, ведомость, отчёты, журнал, оплаты. Короткий справочник с кнопками в строке рисует `EntityList` из `lib/crm`: пользователи, сотрудники, работы, справочники, инвентаризации, модели каталога, состав заявки.
- **Портал.** Шапка только навигирует, «Выйти» стоит последним пунктом бокового меню профиля; на телефоне меню профиля это строка вкладок. Страница ошибки отвечает на 403, 404 и сбой и показывает `requestId`. Вместо отсутствующего фото рисуется знак мастерской.
- **Поля ввода.** Пустых полей нет: `Input`, `Textarea`, `NumberInput`, `MoneyInput`, `Select`, `Combobox` и `FilterField` требуют `placeholder`. Текст короткий, «Введите номер», «Выберите роль», без примеров и пояснений. Тексты полей почты, телефона и имени лежат в `lib/utils/placeholders.ts`, e2e `ui-placeholders` проверяет видимые поля.
- **Отказы.** Форма получает текст отказа через `userMessage`: коды `forbidden`, `not_found`, `rate_limited` не выводят внутренние имена действий. Отказ доменного сервиса в `load` отдаётся своим статусом через `orHttpStatus`, иначе SvelteKit превращает его в 500.

---

## 21. Чего в системе нет

Эти решения приняты владельцем и закрыты. Не заводи под них таблицы, поля, статусы, события, топики, экраны и библиотеки. Вернуть любое можно только через CONTRACT GAP и решение владельца.

- Брак, переделка, приостановка заявки, рекламация контрагента и отказ при доставке. Обратных переходов в потоке нет.
- Самовывоз: адрес доставки обязателен у любой заявки контрагента.
- Предоплата и переплата.
- Документы и печатные формы: накладные, бланки в цех, счета, справки, генерация PDF, `pdfmake`, таблицы документов и шаблонов. Отчёты и выгрузки отдаются в XLSX. Загруженный PDF подтверждения перевода в фонд документом системы не считается.
- QR-коды, камера и сканирование. Заявку открывают из списка или поиском по номеру.
- Офлайн-режим: кеш service worker, `fetch`-обработчик, `offline.html`, фоновая синхронизация.
- Нормы расхода комплектующих, версии норм, автосписание при выпуске, расчёт дефицита. Номер слайса C9 не переиспользуется.
- Исполнители заявки и назначение водителя на заявку.
- Почта о событиях и канал `email` в уведомлениях.
- IP-фильтр входа в CRM.
- Импорт и версии расценок работ: цену вида работ вводят руками.
- Наличие на складе в витрине портала.
- Опции изделия кроме цвета.
- Поле «Ваш номер заявки» в корзине (колонка `external_number` остаётся для поиска и демо).
- Скан договора и архивация контрагента.
- CD и workflow деплоя. Номера K6 (стал C15) и C11 не переиспользуются.
