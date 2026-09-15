# tech.md — ядро проекта

**Проект:** B2B-портал + CRM для столярной мастерской (производство гробов)
**Версия ядра:** v1.13
**Дата:** 15.09.2026
**Владелец файла:** Sobol17 (тимлид и единственный разработчик)
**Источник требований:** `TZ_B2B_CRM_stolyarka_v06.md`

## Changelog

| Версия | Изменение |
|---|---|
| v1.0 | Первая заморозка ядра: стек, структура, схема БД, контракты очереди и событий, общие типы, UI-примитивы, правила кода, дорожная карта слайсов |
| v1.13 | CI переведён на ручной запуск (`workflow_dispatch`), пока разработчик один: автоматический прогон на каждый PR и пуш в `main` съедал время каждого мёрджа. Гейт §11.1 прогоняется локально перед мёрджем тем же набором команд, workflow запускается из Actions по кнопке. Мёрдж в `main` по-прежнему только через PR. Команда `webServer` в Playwright накатывает миграции до старта сервера: воркер очереди читает `job_queue` при запуске, а `globalSetup` выполняется позже |
| v1.12 | Слайс P4, корзина по макету «Корзина». Черновик один на пользователя в своём контрагенте и получает номер из `numbering_sequences` при создании: формат `{prefix}{period}-{00001}`, период считается в `org.timezone`, новый период начинает счёт с единицы. Позиция проверяется на сервере: опции только из матрицы варианта, без повторов и не больше одной каждого вида; одинаковые позиции складываются, в строке не больше 999 штук. Цена строки: персональная цена варианта плюс надбавки опций, умноженные на количество; скидка по договору берётся один раз с суммы заявки (`domain/request/pricing.ts`). Суммы черновика считаются и хранятся для любой роли, DTO отдаёт их только роли с ценами. Отправка `draft -> new` проверяется машиной состояний, пишет историю, событие `request.submitted` и аудит в одной транзакции и пересчитывает цены на момент отправки; ограничение `request.submit` в `rate_limits`. Повтор заявки копирует позиции в черновик и пропускает недоступные. Минимальная партия и шаблоны комплектов из §14 P4 не имеют полей в схеме и переносятся на этап 2 вместе с позициями §18.6. В §8 добавлены DTO черновика |
| v1.11 | Слайс P3, витрина по макетам «Каталог», «Листинг товаров», «Карточка товара». `CatalogFilters` расширен материалами, отделкой, диапазоном длины и признаком наличия; все фильтры проверяются одним вариантом модели. В проекции каталога добавлены `CategoryDto.minPriceMinor`, `ProductListItemDto.materialTitles/lengthsMm/stockQty`, `VariantDto.stockQty`, `CatalogFacetsDto`, `CategoryGroupDto`. Остаток считается суммой `stock_moves` и на витрине не бывает меньше нуля; сид кладёт начальные остатки движениями `inventory` из `stock-balances.json`. Сортировка по цене идёт по минимальной персональной цене модели и для роли без цен игнорируется, чтобы порядок не выдавал цены. Категории образуют дерево по `parent_id`, раздел включает подкатегории. Прайс-лист XLSX отдаётся синхронно на `/portal/catalog/price-list.xlsx` только роли с ценами. `/api/files/[id]` отдаёт пока только медиа товаров по праву `catalog.read`, фото скрытого товара отвечает 404, остальные владельцы получают правила в своих слайсах. У `Checkbox` появился проп `value` для отправки в форме |
| v1.10 | Слайс P2. Персональная цена варианта: позиция прайс-листа контрагента, затем позиция базового прайс-листа, затем `base_price_minor`; прайс-лист действует внутри `valid_from`/`valid_to`, логика в `domain/request/pricing.ts`. Скидка по договору `counterparties.discount_percent` применяется к сумме заявки (`requests.discount_minor`), а не к цене позиции. Сочетание со скидками `discount_rules` по категориям не определено и переносится на этап 2. Письмо с доступом сотруднику уходит через `MailDriver` напрямую, как восстановление пароля: временный пароль не может лежать в очереди, поэтому администратор видит его один раз на странице. Статус сотрудника выводится из учётной записи: отключён при `is_active = false`, приглашён при временном пароле без входа, иначе активен. Лимит `staff_limit` считает активные учётные записи, администратор не может отключить или понизить себя, создание сотрудника ограничено `staff.create` в `rate_limits`. В §8 добавлены проекции контрагента и сотрудников. Сид назначает контрагенту менеджера |
| v1.9 | Слайс P1: в §8 добавлены проекции каталога `CategoryDto`, `ProductListItemDto`, `ProductDto`, `VariantDto`, `OptionDto` и `CatalogFilters`, список видов опций вынесен в `OPTION_KINDS`. Цена варианта в P1 берётся из `basePriceMinor`, P2 меняет источник на персональную цену без смены поля `priceMinor`. Черновые и удалённые позиции видит только роль с `catalog.manage`, скрытая позиция для портала отвечает 404 |
| v1.8 | PWA перенесена на конец этапа 2: слайс K6 выведен из каркаса и стал слайсом C15 после C14. Вместе с ним переехал канал Web Push, потому что без service worker браузерный push не доставляется: P9 подключает только email, C6 и C12 работают без push, отзыв протухших подписок перешёл в C15. До C15 в приложении нет манифеста, service worker и VAPID-подписок |
| v1.7 | Ближайший эпик: завершить этап 1. Всё, что вызывает спор или расходится с контрактом, переносится на этап 2: разрывы §18.6 в этапе 1 не поднимаются и не реализуются, по шрифту §18.7 этап 1 делает вариант А. По итогам K5 зафиксировано: `PushMessage` содержит ровно `title`, `body`, `url` (путь внутри приложения) и необязательный `tag` по §17.2, фейки почты и push умеют `failOnce` и `hangOnce`, `/api/health` отдаёт `queue: { workerRunning, pending, running, dead }` по §16 |
| v1.6 | Добавлен §18 «Макеты портала»: папка `ui/` с десятью макетами стала источником внешнего вида портала, зафиксированы токены палитры «Ангел», типографика, соответствие элементов макета примитивам `lib/ui`, таблица «экран, роут, роли, слайс» и список разрывов контракта, которые макеты открывают, но которые без решения не реализуются. В каркас добавлен слайс K7 «Визуальная система и оболочка портала» с публичным лендингом на `/`. §4.4 и §17.1 приведены к фактическим адресам контуров `/portal/*` и `/crm/*`, цвета манифеста взяты из палитры |
| v1.5 | Вес клиентского бандла зафиксирован в §9: бочка `lib/ui/index.ts` держится tree-shakeable маркером `sideEffects` в `src/lib/ui/package.json`, панель календаря и палитра команд грузятся динамическим импортом на первое открытие. Проброс необязательного пропа под `exactOptionalPropertyTypes` сведён к `definedProps` из `lib/utils/props.ts`, добавление компонента реестра идёт командой `pnpm ui:add`, которая сразу гоняет форматтер и тайпчек. В §16 добавлено требование к весу страницы |
| v1.4 | Среда компонентов shadcn-svelte зафиксирована в §3: разрешены `bits-ui`, `@internationalized/date`, `tailwind-variants`, `clsx`, `tailwind-merge`, `@lucide/svelte`, `tw-animate-css`; запрещены `vaul-svelte`, `svelte-sonner`, `mode-watcher`, `@tanstack/table-core`, `formsnap`, `sveltekit-superforms`, `layerchart`, поэтому `Drawer` собирается на `sheet`, `Toast` на своём рунном сторе, `DataTable` на серверной пагинации §4.3. Пункт «приложение ставится на домашний экран» перенесён из DoD K4 в DoD K6: манифест и service worker появляются только в K6 |
| v1.3 | Офлайн-режим и QR исключены. PWA сведена к манифесту, установке на домашний экран и приёму Web Push: service worker стал push-only, убраны precache оболочки, стратегии кеша, `offline.html` и индикатор потери сети. Убраны библиотека `qrcode`, примитив `QrCode`, `utils/qr.ts`, QR на бланке в цех и открытие заявки сканированием |
| v1.2 | Рекламация контрагента исключена: убраны таблица `claims` и событие `request.claim_created`, из портальной карточки заявки ушла форма рекламации. Добавлен §17 «PWA»: манифест, service worker, стратегии кеша, офлайн-режим, установка на домашний экран, интеграция с Web Push; PWA вынесена в отдельный слайс K6 каркаса и включена в DoD слайсов с мобильным UI |
| v1.1 | Брак и приостановка заявки исключены из системы: убраны таблица `defects`, флаги `hasDefect` и `isOnHold`, переходы `ready -> in_work` и `in_work -> in_work`, событие `request.defect`, тип движения `defect_writeoff`, справочник `defect_reason`, отчёт по браку, действие «Брак» в цеховом экране. Docker, деплой на VPS и CD исключены из объёма: остаётся гейт CI на PR, приложение запускается локально командой `pnpm build && node build`. Явно зафиксировано: shadcn-svelte покрывает и CRM целиком, и базовые компоненты портала |

> Правило версионирования: файл меняется только append-only. Любая правка контракта (таблица, поле, payload джоба, общий тип, пропсы примитива) бампает версию и добавляет строку в changelog. Сессия, которая работает на старой версии, обязана перечитать файл перед стартом слайса.

---

## 1. Что строим

Мастерская из 7–8 человек принимает заявки от ритуальных агентств по телефону и в мессенджерах. Система переносит этот поток в одно приложение: контрагент оформляет заявку сам из каталога со своими ценами, заявка проходит шесть статусов до оплаты, склад и еженедельные выплаты бригаде считаются по тем же данным.

Ядро домена — одна сквозная сущность **Заявка** (`request`). Отдельных «заказов», «производственных заданий» и «отгрузок» нет. Прогресс работы — это статус заявки.

Два логических контура в одном приложении:

- `/portal` — контрагенты: каталог, оформление заявки, статусы, документы, баннер пожертвований;
- `/crm` — сотрудники мастерской: доска заявок, склад, персонал, отчёты, цеховой и водительский экраны.

## 2. Стадии и этапы

| Стадия | Состав | Что на выходе |
|---|---|---|
| **Стадия 0. Каркас** | Слайсы K1–K5, K7 (K6 перенесён в C15) | Приложение запускается локально одной командой, работают миграции, сид, аутентификация, UI-кит, очередь, эталонная вертикаль |
| **Стадия 1. Фичи слайсами** | Этап 1 (P1–P9), Этап 2 (C1–C15) | Рабочая система |

Внутри стадии 1 два этапа:

- **Этап 1 — клиентская часть (B2B-портал).** Слайсы P1–P9. Данные каталога, контрагентов и прайсов на этом этапе заводятся сид-скриптом и CLI, не интерфейсом CRM.
- **Этап 2 — административная часть (CRM).** Слайсы C1–C14. Сначала управление теми данными, которые этап 1 получал из сида, затем производство, склад, выплаты, отчёты.

**Ключевое допущение этапа 1.** Портал зависит от каталога, прайс-листов и учётных записей контрагентов, но CRM-интерфейс для их ведения появляется только на этапе 2. Разрыв закрывается так:

1. сид-скрипт `scripts/seed.ts` наполняет каталог, контрагентов, прайсы и пользователей из фикстур `fixtures/*.json`;
2. CLI `scripts/admin.ts` (команды `user:create`, `counterparty:create`, `price:import`, `request:transition`) выполняет то же самое на боевом стенде без UI;
3. переходы статусов, которые на этапе 2 делает менеджер, на этапе 1 выполняет тот же CLI и e2e-хелпер, поэтому портал демонстрируется на полном цикле заявки.

Домен, схема БД и машина состояний пишутся сразу целиком на обоих этапах. Этапы делят **интерфейсы**, а не доменный слой.

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
| Импорт таблиц | `exceljs` (XLSX), `papaparse` (CSV) | Расчётные таблицы и расценки |
| PDF | `pdfmake` | Спецификация, накладная, бланк в цех, ведомость |
| Пароли | `@node-rs/argon2` (argon2id) | Политика сложности в `lib/server/auth/policy.ts` |
| Почта | `nodemailer` за интерфейсом `MailDriver` | Фейк с первого дня |
| Web Push | `web-push`, VAPID | Драйвер `PushDriver` за тем же интерфейсом. Реальная отправка подключается в C15 |
| Логи | `pino` в stdout | Структурные, с `requestId`, без ПДн |
| Тесты | Vitest, Playwright, fast-check | Юнит, e2e по ролям, property-based на домене |
| Линт | ESLint + Prettier + `svelte-check` | Гейт перед мёрджем (§11.1) |
| PWA | `manifest.webmanifest` + push-only service worker (`src/service-worker.ts`) | Установка на домашний экран и приём Web Push. Кеширования и офлайн-режима нет, отдельный PWA-плагин не тянем. Делается в C15 в конце этапа 2 |
| Запуск | `adapter-node`, `node build` | Локально и на будущем сервере. Docker, CD и деплой на VPS в объём не входят |

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
      payroll/calc.ts             дневной и недельный расчёт
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
      documents/                  generator.ts, templates/*.ts, numbering.ts
      files/                      storage.ts, validate.ts, image.ts
      audit/                      audit.service.ts
      config.ts                   единый разбор env через Zod
    types/                        общие TypeScript-типы (см. §8)
    ui/                           примитивы (см. §9)
    validation/                   Zod-схемы
    utils/                        format.ts, money.ts, dates.ts, props.ts
  routes/
    +page.server.ts               гость видит лендинг (§18.5), вошедший уходит в свой контур
    (portal)/                     контур контрагента, адреса /portal/*
      +layout.server.ts           guard: только роли портала
      portal/
        catalog/ , cart/ , requests/ , profile/ , staff/ , charity/
    (crm)/                        контур мастерской, адреса /crm/*
      +layout.server.ts           guard: только роли CRM
      crm/
        board/ , requests/ , catalog/ , counterparties/ , stock/ , payroll/ , reports/ , settings/
        shop/                     цеховой мобильный экран
        delivery/                 водительский мобильный экран
    api/
      stream/[topic]/+server.ts   SSE
      files/[id]/+server.ts       раздача файлов с проверкой прав
      health/+server.ts
    login/ , logout/ , password/
static/
  manifest.webmanifest            имя, иконки, display, shortcuts
  icons/                          192, 512, maskable
drizzle/                          сгенерированные миграции, руками не правим
scripts/                          seed.ts, admin.ts, fixtures/
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
  priceListId: integer('price_list_id').references(() => priceLists.id),
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
  costPriceMinor: money('cost_price_minor'),          // visible to owner role only
  stockItemId: integer('stock_item_id').references(() => stockItems.id),
  isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: ts('deleted_at')
}, (t) => ({ skuUq: uniqueIndex('variants_sku_uq').on(t.sku), prodIdx: index('variants_product_idx').on(t.productId) }));

// Options: finish, lacquer colour, upholstery, hardware, kit.
export const options = sqliteTable('options', {
  id: pk(),
  kind: text('kind', { enum: ['finish', 'lacquer', 'upholstery', 'hardware', 'kit'] }).notNull(),
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
  ownerScope: text('owner_scope', { enum: ['product', 'request', 'contract', 'document', 'import'] }).notNull(),
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
  validFrom: ts('valid_from'), validTo: ts('valid_to'),
  createdAt: createdAt(), updatedAt: updatedAt()
});

export const priceListItems = sqliteTable('price_list_items', {
  id: pk(),
  priceListId: integer('price_list_id').notNull().references(() => priceLists.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  priceMinor: money('price_minor')
}, (t) => ({ uq: uniqueIndex('pli_uq').on(t.priceListId, t.variantId) }));

export const discountRules = sqliteTable('discount_rules', {
  id: pk(),
  counterpartyId: integer('counterparty_id').references(() => counterparties.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').references(() => categories.id),
  percent: integer('percent').notNull(),
  validFrom: ts('valid_from'), validTo: ts('valid_to')
});
```

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
  isPickup: integer('is_pickup', { mode: 'boolean' }).notNull().default(false),
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

export const requestAssignees = sqliteTable('request_assignees', {
  requestId: integer('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['carpenter', 'painter', 'driver'] }).notNull(),
  takenAt: ts('taken_at'), doneAt: ts('done_at')
}, (t) => ({ pkUq: primaryKey({ columns: [t.requestId, t.userId, t.role] }) }));

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

### 5.7 Склад

```ts
export const stockItems = sqliteTable('stock_items', {
  id: pk(),
  kind: text('kind', { enum: ['product', 'component'] }).notNull(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  unitId: integer('unit_id').notNull().references(() => dictItems.id),   // dict = 'unit'
  minThreshold: integer('min_threshold').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt()
}, (t) => ({ codeUq: uniqueIndex('stock_items_code_uq').on(t.code) }));

// Balance is never stored. It is the sum of moves. Append-only table.
export const stockMoves = sqliteTable('stock_moves', {
  id: pk(),
  stockItemId: integer('stock_item_id').notNull().references(() => stockItems.id),
  qty: integer('qty').notNull(),                    // signed: + income, - outcome
  type: text('type', { enum: STOCK_MOVE_TYPES }).notNull(),
  requestId: integer('request_id').references(() => requests.id),
  reversalOfId: integer('reversal_of_id'),          // set when compensating a previous move
  reasonId: integer('reason_id').references(() => dictItems.id),
  comment: text('comment'),
  actorId: integer('actor_id').references(() => users.id),
  occurredAt: ts('occurred_at').notNull(),
  createdAt: createdAt()
}, (t) => ({
  itemIdx: index('stock_moves_item_idx').on(t.stockItemId, t.occurredAt),
  reqIdx: index('stock_moves_request_idx').on(t.requestId)
}));

export const bomVersions = sqliteTable('bom_versions', {
  id: pk(),
  version: integer('version').notNull(),
  importedById: integer('imported_by_id').references(() => users.id),
  sourceFileId: integer('source_file_id').references(() => media.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt()
});

export const bomNorms = sqliteTable('bom_norms', {
  id: pk(),
  bomVersionId: integer('bom_version_id').notNull().references(() => bomVersions.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id),
  componentId: integer('component_id').notNull().references(() => stockItems.id),
  qtyPerUnitMilli: integer('qty_per_unit_milli').notNull()   // qty * 1000, integer math only
}, (t) => ({ uq: uniqueIndex('bom_norms_uq').on(t.bomVersionId, t.variantId, t.componentId) }));

export const inventories = sqliteTable('inventories', {
  id: pk(),
  status: text('status', { enum: ['draft', 'applied'] }).notNull().default('draft'),
  comment: text('comment'),
  createdById: integer('created_by_id').notNull().references(() => users.id),
  appliedAt: ts('applied_at'), createdAt: createdAt()
});

export const inventoryLines = sqliteTable('inventory_lines', {
  id: pk(),
  inventoryId: integer('inventory_id').notNull().references(() => inventories.id, { onDelete: 'cascade' }),
  stockItemId: integer('stock_item_id').notNull().references(() => stockItems.id),
  expectedQty: integer('expected_qty').notNull(),
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

export const workRateVersions = sqliteTable('work_rate_versions', {
  id: pk(), version: integer('version').notNull(),
  validFrom: ts('valid_from').notNull(),
  importedById: integer('imported_by_id').references(() => users.id),
  createdAt: createdAt()
});

export const workRates = sqliteTable('work_rates', {
  id: pk(),
  versionId: integer('version_id').notNull().references(() => workRateVersions.id, { onDelete: 'cascade' }),
  workTypeId: integer('work_type_id').notNull().references(() => dictItems.id),  // dict = 'work_type'
  unitId: integer('unit_id').notNull().references(() => dictItems.id),
  rateMinor: money('rate_minor')
}, (t) => ({ uq: uniqueIndex('work_rates_uq').on(t.versionId, t.workTypeId) }));

export const workDays = sqliteTable('work_days', {
  id: pk(),
  staffId: integer('staff_id').notNull().references(() => staff.id),
  workDate: ts('work_date').notNull(),
  present: integer('present', { mode: 'boolean' }).notNull().default(true),
  totalMinor: money('total_minor'),                    // recalculated on every entry change
  createdById: integer('created_by_id').notNull().references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt()
}, (t) => ({ uq: uniqueIndex('work_days_uq').on(t.staffId, t.workDate) }));

export const workEntries = sqliteTable('work_entries', {
  id: pk(),
  workDayId: integer('work_day_id').notNull().references(() => workDays.id, { onDelete: 'cascade' }),
  workTypeId: integer('work_type_id').notNull().references(() => dictItems.id),
  qty: integer('qty').notNull(),
  rateMinor: money('rate_minor'),                      // frozen rate at entry time
  amountMinor: money('amount_minor'),
  requestId: integer('request_id').references(() => requests.id)
});

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

### 5.9 Благотворительность, документы, сквозное

```ts
export const charityTransfers = sqliteTable('charity_transfers', {
  id: pk(),
  amountMinor: money('amount_minor'),
  transferredAt: ts('transferred_at').notNull(),
  documentRef: text('document_ref'),
  comment: text('comment'),
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
  key: text('key').primaryKey(),             // 'request' | 'invoice' | 'spec'
  prefix: text('prefix').notNull().default(''),
  period: text('period', { enum: ['none', 'year', 'month'] }).notNull().default('year'),
  periodKey: text('period_key').notNull().default(''),
  lastValue: integer('last_value').notNull().default(0)
});

export const documentTemplates = sqliteTable('document_templates', {
  id: pk(),
  kind: text('kind', { enum: DOCUMENT_KINDS }).notNull(),
  version: integer('version').notNull().default(1),
  title: text('title').notNull(),
  body: text('body', { mode: 'json' }).$type<Record<string, unknown>>(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
});

export const documents = sqliteTable('documents', {
  id: pk(),
  kind: text('kind', { enum: DOCUMENT_KINDS }).notNull(),
  number: text('number'),
  requestId: integer('request_id').references(() => requests.id, { onDelete: 'cascade' }),
  periodId: integer('period_id').references(() => payrollPeriods.id),
  variant: text('variant', { enum: ['full', 'no_prices'] }).notNull().default('full'),
  status: text('status', { enum: ['queued', 'ready', 'failed'] }).notNull().default('queued'),
  fileId: integer('file_id').references(() => media.id),
  error: text('error'),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: createdAt()
}, (t) => ({ reqIdx: index('documents_request_idx').on(t.requestId) }));

export const notificationTemplates = sqliteTable('notification_templates', {
  id: pk(),
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  channel: text('channel', { enum: ['email', 'push'] }).notNull(),
  subject: text('subject'), body: text('body').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
}, (t) => ({ uq: uniqueIndex('nt_uq').on(t.eventKey, t.channel) }));

export const notificationRules = sqliteTable('notification_rules', {
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  roleCode: text('role_code', { enum: ROLE_CODES }).notNull(),
  channel: text('channel', { enum: ['email', 'push'] }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true)
}, (t) => ({ pkUq: primaryKey({ columns: [t.eventKey, t.roleCode, t.channel] }) }));

export const userNotificationPrefs = sqliteTable('user_notification_prefs', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  channel: text('channel', { enum: ['email', 'push'] }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull()
}, (t) => ({ pkUq: primaryKey({ columns: [t.userId, t.eventKey, t.channel] }) }));

export const notifications = sqliteTable('notifications', {
  id: pk(),
  eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channel: text('channel', { enum: ['email', 'push'] }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ['queued', 'sent', 'failed'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  sentAt: ts('sent_at'), createdAt: createdAt()
}, (t) => ({ userIdx: index('notifications_user_idx').on(t.userId, t.createdAt) }));

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: pk(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(), auth: text('auth').notNull(),
  createdAt: createdAt(), lastUsedAt: ts('last_used_at')
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

Ключи `settings`: `org.requisites`, `org.timezone`, `charity.rate_bp`, `charity.fund`, `counterparty.staff_limit_default`, `payroll.week_closing_day`, `notifications.enabled`, `crm.ip_allowlist`.

---

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

Брак, переделка и приостановка заявки в системе не учитываются. Цех решает эти вопросы вне приложения, поэтому в схеме нет ни таблицы брака, ни флагов, ни переходов под них. Единственный обратный переход в потоке — отказ при доставке.

### 6.2 Таблица переходов

```ts
export const TRANSITIONS: readonly Transition[] = [
  { from: 'draft',  to: 'new',       roles: ['cp_admin','cp_employee','manager','owner'], ownOnly: true },
  { from: 'new',    to: 'in_work',   roles: ['manager','owner'], guards: ['hasAssignee','pricesFixed'], effects: ['audit'] },
  { from: 'new',    to: 'cancelled', roles: ['cp_admin','cp_employee','manager','owner'], ownOnly: true },
  { from: 'new',    to: 'rejected',  roles: ['manager','owner'], requiresReason: true },
  { from: 'in_work', to: 'ready',    roles: ['carpenter','painter','manager','owner'], assignedOnly: true,
    guards: ['hasAssignee'], effects: ['consumeComponents','produceStockItems','emit:request.ready'] },
  { from: 'ready',  to: 'delivered', roles: ['driver','manager','owner'], assignedOnly: true,
    effects: ['shipStockItems','freezeCharity','emit:request.delivered'] },
  { from: 'delivered', to: 'ready',  roles: ['driver','manager','owner'], requiresReason: true,
    effects: ['reverseShipment','emit:request.delivery_failed'] },
  { from: 'delivered', to: 'awaiting_payment', roles: ['system'], auto: true },
  { from: 'awaiting_payment', to: 'paid', roles: ['manager','owner'], guards: ['fullyPaid'], effects: ['emit:request.paid'] }
] as const;
```

Инварианты, покрытые property-based тестами:

1. Движение только вперёд по основному потоку. Единственный обратный переход — `delivered -> ready` (отказ при доставке), с обязательной причиной из справочника.
2. Каждый переход пишет строку в `request_status_history` в той же транзакции.
3. `charityAmountMinor` заполняется ровно один раз, в момент первого перехода в `delivered`, и дальше не меняется ни при смене ставки, ни при правке цен.
4. Складское движение и смена статуса выполняются в одной транзакции. Провал движения откатывает статус.
5. Переход в `in_work` и `ready` невозможен без назначенного исполнителя.
6. Заявка на склад (`isStockRequest = true`) не порождает благотворительное отчисление и не имеет контрагента.

### 6.3 Компенсация вместо удаления

Отказ при доставке не удаляет складские движения. Сервис пишет обратные движения с `reversalOfId` и типом `reversal`. Остаток остаётся суммой всех строк, история операций читаема.

---

## 7. Контракты очереди и событий

### 7.1 Транзакционный outbox

Сервис не отправляет письмо и не генерирует PDF по месту. Он вставляет строку в `job_queue` внутри своей транзакции. Воркер `lib/server/queue/worker.ts` опрашивает таблицу раз в секунду, берёт задачу через `UPDATE ... WHERE status='pending' AND visible_at <= now` и выполняет хендлер.

```ts
export interface JobHandler<T> {
  readonly topic: JobTopic;
  readonly schema: ZodType<T>;          // payload is validated before the handler runs
  handle(payload: T, ctx: JobContext): Promise<void>;
}
```

Правила:

- **Идемпотентность обязательна.** `idempotencyKey` уникален по `(topic, key)`. Повторная постановка той же задачи не создаёт вторую строку. Хендлер, запущенный дважды, даёт ровно один эффект. На каждый хендлер пишется тест «выполнить дважды, проверить один эффект».
- Ретраи: экспоненциальный бэкофф `2^attempts` секунд, `maxAttempts = 5`, после исчерпания статус `dead` и запись в лог с уровнем error.
- Payload содержит только идентификаторы и минимум данных. Тело письма собирается в хендлере из БД на момент отправки.
- Задача не запускает другую задачу напрямую, только через постановку в очередь.

### 7.2 Топики

| Топик | Payload | Ключ идемпотентности | Эффект |
|---|---|---|---|
| `notification.dispatch` | `{ notificationId: number }` | `notification:{id}` | Отправка одного уведомления в один канал, отметка `sent`/`failed` |
| `notification.fanout` | `{ eventKey: EventKey, entityId: number }` | `fanout:{eventKey}:{entityId}` | Разворачивает событие в строки `notifications` по матрице ролей и личным настройкам |
| `document.generate` | `{ documentId: number }` | `document:{id}` | Рендер PDF/XLSX, запись `media`, статус `ready` |
| `charity.recount` | `{ scope: string }` | `charity:{scope}:{yyyymmddhh}` | Пересборка `charity_totals`, публикация в SSE-топик `charity` |
| `stock.threshold.check` | `{ stockItemId: number }` | `threshold:{id}:{yyyymmdd}` | Сравнение остатка с порогом, событие `stock.below_threshold` |
| `import.bom` | `{ mediaId: number, actorId: number }` | `import-bom:{mediaId}` | Разбор XLSX/CSV, создание `bom_versions` + `bom_norms` |
| `import.rates` | `{ mediaId: number, actorId: number }` | `import-rates:{mediaId}` | Создание `work_rate_versions` + `work_rates` |
| `payroll.calculate` | `{ periodId: number }` | `payroll:{periodId}:{revision}` | Пересчёт `payroll_lines` за период |
| `report.export` | `{ reportKey: string, filters: object, userId: number }` | `report:{sha256(reportKey+filters+userId)}` | XLSX в `media`, уведомление автору |
| `session.cleanup` | `{}` | `cleanup:{yyyymmdd}` | Удаление протухших сессий, токенов, мёртвых push-подписок |

### 7.3 Доменные события

```ts
export const EVENT_KEYS = [
  'request.submitted', 'request.accepted', 'request.ready', 'request.delivered',
  'request.delivery_failed', 'request.cancelled', 'request.rejected',
  'request.payment_marked', 'request.paid',
  'stock.below_threshold', 'payroll.week_closed'
] as const;
```

Публикация: `bus.emit(eventKey, entityId, tx)` вставляет `notification.fanout` в очередь. Прямой вызов почты из сервиса запрещён.

Матрица «событие × роль × канал» лежит в `notification_rules` и наполняется сидом. Персональные настройки пользователя перекрывают правило роли.

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
export const ROLE_CODES = ['owner','manager','carpenter','painter','driver','cp_admin','cp_employee'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
export const CRM_ROLES = ['owner','manager','carpenter','painter','driver'] as const;
export const PORTAL_ROLES = ['cp_admin','cp_employee'] as const;

// actor.ts — passed into every service, built once in hooks.server.ts
export interface ActorContext {
  readonly userId: number;
  readonly roles: readonly RoleCode[];
  readonly scope: 'portal' | 'crm';
  readonly counterpartyId: number | null;   // row-level filter for portal users
  readonly canSeePrices: boolean;           // false for cp_employee, carpenter, painter, driver
  readonly canSeeCost: boolean;             // owner only
  readonly requestId: string;               // correlation id for logs and audit
}

// request.ts
export const REQUEST_STATUSES = ['draft','new','in_work','ready','delivered','awaiting_payment','paid','cancelled','rejected'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface Transition {
  readonly from: RequestStatus; readonly to: RequestStatus;
  readonly roles: readonly (RoleCode | 'system')[];
  readonly ownOnly?: boolean; readonly assignedOnly?: boolean;
  readonly requiresReason?: boolean; readonly auto?: boolean;
  readonly guards?: readonly GuardCode[]; readonly effects?: readonly EffectCode[];
}

// Role-projected DTO. Price fields are optional by type, so a missing check fails at compile time.
export interface RequestListItemDto {
  id: number; number: string; status: RequestStatus; priority: 'normal' | 'urgent';
  counterpartyName: string | null; itemCount: number;
  createdAt: string; readyAt: string | null; deliveredAt: string | null;
  totalMinor?: number; paidMinor?: number; charityAmountMinor?: number;
}

// Portal draft (P4). Money keys only for a role with prices; the stored sums are computed for every role.
export interface DraftItemDto {
  id: number; productId: number; productTitle: string; sku: string; sizeCode: string; materialTitle: string;
  coverMediaId: number | null; qty: number; options: { id: number; kind: string; title: string }[];
  unitPriceMinor?: number;               // variant price plus option surcharges, one piece
  lineTotalMinor?: number;
}
export interface DraftDto {
  id: number; number: string; items: DraftItemDto[]; unitCount: number;
  isPickup: boolean; deliveryAddressId: number | null; comment: string | null; externalNumber: string | null;
  addresses: DeliveryAddressDto[]; updatedAt: string;
  itemsTotalMinor?: number; discountPercent?: number; discountMinor?: number; totalMinor?: number;
}
export interface SubmittedRequestDto { id: number; number: string; status: RequestStatus; }
export interface LastRequestDto { id: number; number: string; submittedAt: string | null; itemCount: number; unitCount: number; totalMinor?: number; }

// list.ts — one shape for every registry in the app
export interface ListQuery<F = Record<string, unknown>> {
  page: number; perPage: number; sort?: string; dir?: 'asc' | 'desc';
  search?: string; filters?: F;
}
export interface Page<T> { rows: T[]; total: number; page: number; perPage: number; }

// catalog.ts — role projections of the catalog (P1). Price keys are optional and never selected for a price-blind role.
export const OPTION_KINDS = ['finish','lacquer','upholstery','hardware','kit'] as const;
export const CATALOG_SORTS = ['sortOrder','title','price'] as const;   // price: personal price, ignored for a price-blind role
export interface CatalogFilters {                                        // one variant has to satisfy all filters at once (P3)
  categoryId?: number; materialIds?: number[]; finishOptionIds?: number[];
  lengthFromMm?: number; lengthToMm?: number; inStock?: boolean;
}
export interface CategoryDto { id: number; title: string; parentId: number | null; productCount: number; minPriceMinor?: number; }
export interface CategoryGroupDto { category: CategoryDto; children: CategoryDto[]; showcase: ProductListItemDto[]; }
export interface CatalogFacetsDto {
  materials: { id: number; title: string; productCount: number }[]; finishes: { id: number; title: string }[];
  lengthMm: { min: number | null; max: number | null };
}
export interface ProductListItemDto {
  id: number; sku: string; title: string; categoryId: number | null; coverMediaId: number | null; variantCount: number;
  materialTitles: string[]; lengthsMm: number[]; stockQty: number;   // stock: sum of moves, never below zero
  minPriceMinor?: number;
}
export interface OptionDto { id: number; kind: OptionKind; title: string; isDefault: boolean; priceDeltaMinor?: number; }
export interface VariantDto {
  id: number; sku: string; sizeCode: string; materialTitle: string;
  lengthMm: number | null; widthMm: number | null; heightMm: number | null; weightG: number | null;
  options: OptionDto[];                  // compatibility matrix of the variant
  stockQty: number;                      // sum of stock moves, never below zero
  priceMinor?: number;                   // base price in P1, personal price from P2
  costPriceMinor?: number;               // owner only
}
export interface ProductDto {
  id: number; sku: string; title: string; description: string | null;
  categoryId: number | null; categoryTitle: string | null; mediaIds: number[]; variants: VariantDto[];
}

// counterparty.ts — counterparty card and portal staff (P2). Money and the discount only for a role with prices.
export const STAFF_STATUSES = ['active','invited','disabled'] as const;   // derived, never stored
export interface ContactDto { fullName: string; phone: string | null; email: string; }
export interface CounterpartySummaryDto { name: string; manager: ContactDto | null; }
export interface CounterpartyCardDto {
  id: number; name: string; legalName: string | null; inn: string | null; kpp: string | null;
  address: string | null; phone: string | null; email: string | null; settlementScheme: SettlementScheme;
  contract: { number: string; signedAt: string | null; validUntil: string | null } | null;
  manager: ContactDto | null; staffPreview: (ContactDto & { role: PortalRole })[]; staffCount: number; staffLimit: number;
  discountPercent?: number; debtMinor?: number; yearPurchasesMinor?: number; yearDeliveries?: number;
}
export interface StaffMemberDto {
  id: number; fullName: string; email: string; phone: string | null; role: PortalRole;
  status: StaffStatus; lastLoginAt: string | null; isSelf: boolean;
}
export interface StaffPageDto extends Page<StaffMemberDto> { activeCount: number; staffLimit: number; }
export interface CreatedStaffDto { member: StaffMemberDto; temporaryPassword: string; mailSent: boolean; }

// money.ts — branded type, blocks accidental mixing with plain numbers
export type Minor = number & { readonly __brand: 'minor' };

// dicts.ts
export const DICT_CODES = ['material','finish','fabric','hardware','unit','work_type','refusal_reason','stock_move_reason','transport'] as const;
export const STOCK_MOVE_TYPES = ['production','shipment','adjustment','inventory','reversal','purchase'] as const;
export const DOCUMENT_KINDS = ['specification','waybill','shop_order','label','payroll_sheet','stock_report','charity_report'] as const;
export const JOB_TOPICS = ['notification.dispatch','notification.fanout','document.generate','charity.recount','stock.threshold.check','import.bom','import.rates','payroll.calculate','report.export','session.cleanup'] as const;
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

Правило: `select` для роли без цен не тянет ценовые колонки из БД. Проверка в e2e: ответ сервера для `cp_employee` не содержит подстроки `Minor` ни в одном ключе.

---

## 9. UI-примитивы

База — shadcn-svelte поверх Tailwind, одна на оба контура: CRM собирается на ней целиком, портал берёт из неё базовые компоненты и добавляет свои витринные (карточка модели, конфигуратор позиции, баннер пожертвований). Вторую UI-библиотеку не тянем.

Примитивы собираются в каркасе (слайс K4) командой `pnpm ui:add <component>` и дальше живут в репозитории как обычный код: правим стили под токены проекта, не форкаем и не переписываем с нуля. Рендерятся в `routes/(dev)/kitchen-sink`. Слайс не пишет свой `<table>` и свою модалку.

| Компонент | Ключевые пропсы |
|---|---|
| `Button` | `variant: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size: 'sm'\|'md'\|'lg'\|'touch'`, `loading`, `disabled` |
| `TouchButton` | обёртка `Button` с `size='touch'`, минимум 44×44 px, для цеха и водителя |
| `Input` / `Textarea` / `NumberInput` | `label`, `error`, `hint`, `required`, `bind:value` |
| `MoneyInput` | `bind:valueMinor`, ввод в рублях, хранение в копейках |
| `Select` / `Combobox` | `options: {value,label}[]`, `bind:value`, `searchable` |
| `Checkbox` / `Switch` / `RadioGroup` | `label`, `bind:checked`; у `Checkbox` ещё `name` и `value` для отправки в форме |
| `DatePicker` / `DateRangePicker` | `bind:value: string`, ISO-строки |
| `FileUpload` | `accept`, `maxSizeMb`, `multiple`, `onUploaded(mediaId)` |
| `DataTable` | `columns`, `rows`, `total`, `query: ListQuery`, `onQueryChange`, `exportUrl`, серверная пагинация |
| `FilterBar` | `fields`, `bind:filters`, сохранение в URL |
| `Modal` / `Drawer` / `ConfirmDialog` | `open`, `title`, `onClose`, `{#snippet body()}` |
| `Toast` (`toast.success/error`) | глобальный стор на рунах |
| `StatusBadge` | `status: RequestStatus`, палитра и подпись из одного словаря |
| `Card` / `Tabs` / `Breadcrumbs` / `Pagination` | базовые |
| `EmptyState` / `Skeleton` / `Spinner` / `ErrorState` | `title`, `description`, `action` |
| `KanbanBoard` / `KanbanColumn` / `KanbanCard` | `columns: RequestStatus[]`, `onDrop(id, status)` |
| `AnimatedCounter` | `valueMinor`, анимация досчёта, для баннера пожертвований |
| `PhotoGallery` / `PhotoUploader` | `mediaIds`, `editable` |
| `PriceCell` | `valueMinor?`, рисует прочерк, когда значение не пришло |
| `Stepper` | история статусов заявки |

Токены: цвета, радиусы, тени и шкала отступов в `src/app.css` как CSS-переменные. Хардкод цвета в компоненте слайса — повод для отката.

Вес. Кит импортируется одной бочкой `lib/ui/index.ts`, поэтому бочка обязана оставаться tree-shakeable: `src/lib/ui/package.json` объявляет `"sideEffects": false`, и ни один модуль папки не заводит побочный эффект на верхнем уровне. Блок `<style>` в примитиве запрещён отдельно от правила про токены: его CSS выкинет сборщик. Тяжёлая половина контрола, которая живёт за триггером, грузится динамическим импортом на первое открытие через `LazyComponent` из `lib/ui/lazy.svelte.ts`: так устроены календарь `DatePicker`, календарь диапазона `DateRangePicker` и палитра команд `Combobox`. Новый примитив, который тянет свою библиотеку и открывается по клику, собирается так же.

Добавление компонента реестра идёт командой `pnpm ui:add <component>`. Она зовёт генератор, затем `pnpm format` и `pnpm check` и печатает список правок, без которых сгенерированный код не проходит тайпчек проекта: необязательный проп пробрасывается через `definedProps` из `lib/utils/props.ts`, биндинг календарного корня приводится к `never` с комментарием причины, слишком широкая поверхность пропсов заменяется явным списком. Ослаблять `tsconfig.json` под генератор запрещено.

---

## 10. Стратегия тестов

Тесты привязаны к слайсу и PR. Отдельной сущности «тесты на стадию» нет. Слайс мёрджится только с тестами.

**Главное правило: тест выводится из критериев приёмки задачи, а не из реализации.** Сначала читаем критерии, пишем тест на контракт, потом код. Тест, который повторяет структуру кода, подтверждает баги вместе с поведением.

Обязательные типы на слайс:

1. **Контрактные на стыках.** Payload джоба и события валидируется Zod-схемой из этого файла. Фейковые драйверы почты и push проверяют вход и падают на мусоре. Ответ сервера для роли без цен проверяется на отсутствие ценовых полей.
2. **Идемпотентность джобов.** Каждый хендлер прогоняется дважды с тем же payload. Эффект ровно один: одно письмо, один документ, одно складское движение.
3. **Путь ошибки.** Фейк умеет возвращать ошибку и таймаут. Проверяем ретрай, бэкофф, переход в `dead`, отсутствие частичного эффекта.
4. **Property-based (fast-check) на чистой логике.** `domain/request/state-machine`, `domain/request/pricing`, `domain/stock/balance`, `domain/payroll/calc`, `domain/charity/rate`. Генерируем входы, проверяем инварианты из §6.2.
5. **E2E по ролям (Playwright).** На каждый слайс с UI: сценарий целевой роли плюс негативный сценарий чужой роли (прямая ссылка на чужой объект даёт 403).

Фикстуры общие: `tests/fixtures/` использует тот же сид, что и `scripts/seed.ts`. Разные данные в тестах и в деве не заводим.

Порог покрытия: доменный слой `src/lib/domain/**` не ниже 90% строк, гейт §11.1 падает ниже порога. Остальное покрытием не меряем.

---

## 11. Инфраструктура и владение

| Область | Правило |
|---|---|
| Миграции | Генерируются `pnpm db:generate` из `schema/`. Руками файлы в `drizzle/` не правим. Применяются командой `pnpm db:migrate` перед запуском |
| Сид | `scripts/seed.ts`, идемпотентный, безопасен для повторного запуска. Один набор фикстур для дева, тестов и фейков |
| Конфиг | Единый модуль `src/lib/server/config.ts`, разбор `process.env` через Zod, падение на старте при нехватке переменной. Прямое обращение к `process.env` вне этого модуля запрещено |
| Секреты | Только в `.env`, в репозиторий не коммитятся. `.env.example` содержит все ключи с пустыми значениями |
| Файлы | Каталог `FILES_DIR` рядом с БД, вне репозитория. Имя файла на диске генерирует сервер, оригинальное имя хранится в БД. Раздача только через `/api/files/[id]` с проверкой прав |
| Логи | `pino` в stdout, поля `requestId`, `userId`, `route`, `durationMs`. Пароли, токены, email в логи не пишем |
| Health | `GET /api/health` проверяет БД и воркер. Используется смоук-тестом CI и мной после запуска сборки |
| Примитивы UI | Компонент реестра добавляется командой `pnpm ui:add <component>`: генератор, затем `pnpm format` и `pnpm check`. Правки под тайпчек делаются в самом компоненте, `tsconfig.json` не ослабляется |
| Поставка | Docker, CD и деплой на VPS в объём не входят. Приложение собирается `pnpm build` и запускается `node build` на моей машине. Вопрос возвращается отдельной задачей после этапа 1 |

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

Пока разработчик один, гейт прогоняется локально, а workflow `.github/workflows/ci.yml` запускается вручную (`workflow_dispatch`) на тех же шагах (v1.13). Автоматический запуск на PR возвращается, когда в работу входит второй человек.

CD нет. Мёрдж в `main` ничего не разворачивает. Docker, VPS и автодеплой заводятся отдельной задачей после этапа 1, поэтому в коде не должно быть допущений о конкретном хостинге: пути к БД и файлам берутся из конфига, а не из констант.

Мёрдж в `main` только через PR после зелёного гейта. Работаю один, поэтому self-review по чек-листу §13.3 обязателен, апрув формальный.

---

## 12. Безопасность

Требования обязательны к каждому слайсу, не выносятся в отдельную задачу «сделать безопасность в конце».

- **Аутентификация.** Пароли argon2id (`memoryCost >= 19456`, `timeCost >= 2`). Сессия на сервере, в куку кладём случайный идентификатор, в БД его хеш. Кука `httpOnly`, `secure`, `sameSite=lax`, срок 30 дней с продлением. Смена пароля и блокировка убивают все сессии пользователя.
- **Права.** Проверка на сервере на каждое действие и каждый переход статуса, а не только на отрисовку экрана. Единая точка: `PolicyService.can(actor, action, subject)`. Скрытие кнопки в UI защитой не считается.
- **Row-level.** Каждый репозиторий портального домена принимает `counterpartyId` из `ActorContext` и подмешивает его в `where`. Метод без этого фильтра не проходит ревью. Исполнитель видит только назначенные ему заявки.
- **Цены.** Роль `cp_employee` не получает ценовые поля из БД. Проверяется e2e-тестом на теле ответа, а не глазами.
- **Валидация.** Весь вход через Zod на сервере, включая `FormData`, query-параметры и содержимое импортируемых XLSX. Клиентская валидация только для UX.
- **CSRF.** Form actions SvelteKit проверяют origin. Мутации через `+server.ts` требуют заголовка `x-requested-with` и совпадения origin.
- **Rate limiting.** Логин, восстановление пароля, создание сотрудника контрагента, отправка заявки, загрузка файла. Счётчики в `rate_limits`, окно и лимит в конфиге.
- **Загрузка файлов.** Белый список MIME, проверка сигнатуры файла, лимит размера, генерация имени сервером, запрет исполняемых расширений, хранение вне webroot.
- **SQL.** Только Drizzle-построитель. Конкатенация строк в SQL запрещена, сырой SQL только через параметризованный `sql` с плейсхолдерами.
- **Заголовки.** `hooks.server.ts` ставит CSP без `unsafe-eval`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, HSTS.
- **Аудит.** Все изменяющие действия пишутся в `audit_log` через декоратор сервиса. ПДн в логи не попадают.
- **Ошибки.** Наружу отдаём код и нейтральный текст. Стек и детали только в лог.

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
fix(stock): reverse shipment moves on delivery refusal
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

Дальше: правлю `tech.md` append-only, бампаю версию, добавляю строку в changelog, генерирую миграцию. Работа продолжается на локальной заглушке до апдейта ядра. Заглушка в мёрдж не попадает.

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
9. сценарий DoD слайса из §14 продемонстрирован на локальной сборке (`pnpm build && node build`), а не только в дев-режиме.

---

## 14. Дорожная карта слайсов

Слайс — сквозной кусок «данные → сервер → права → UI → тест», пригодный к демонстрации. Порядок жёсткий: сначала каркас целиком, затем этап 1 (портал), затем этап 2 (CRM).

### Стадия 0. Каркас

Фичи не начинаются, пока чек-лист «каркас готов» не зелёный целиком:

- CI зелёный на тривиальном PR;
- миграции и сид проходят на чистой БД в CI;
- layout обоих контуров, навигация данными, guard авторизации в `main`;
- примитивы `lib/ui` импортируются и отрендерены в `kitchen-sink`;
- очередь гоняет демо-джоб и переживает рестарт;
- SSE эхает тестовое событие;
- фейки почты и push отдают сид-данные;
- эталонная вертикаль в `routes/(portal)/portal/profile` работает и покрыта тестами;
- кит и оболочка портала переведены на визуальную систему §18, лендинг отдаётся гостю.

**K1. Репозиторий и сборка.** SvelteKit + TS strict, `adapter-node`, Tailwind, ESLint/Prettier, `svelte-check`, структура папок §4.4, `config.ts` с разбором env, `pino`, `/api/health`, CI-гейт на PR. Docker, деплой и CD не делаем.
**DoD:** `pnpm build && node build` поднимает приложение локально, `/api/health` отвечает, CI зелёный на тривиальном PR.

**K2. БД, миграции, сид.** Полная схема §5 в Drizzle, PRAGMA (WAL, `busy_timeout`, `foreign_keys`), первая миграция, `scripts/seed.ts` с фикстурами (роли, справочники, каталог на 10 позиций, два контрагента, прайс, сотрудники), `scripts/admin.ts` с командами `user:create`, `counterparty:create`, `price:import`, `request:transition`.
**DoD:** миграции и сид проходят на чистой БД, CLI заводит контрагента с администратором.

**K3. Аутентификация и RBAC.** `users`, `roles`, сессии, вход и выход, принудительная смена временного пароля, восстановление по email, блокировка после N попыток, rate limiting, `ActorContext` в `hooks.server.ts`, `PolicyService`, guard-ы layout обоих контуров, row-level хелперы репозиториев.
**DoD:** пользователь каждой роли входит и видит только свой контур, прямая ссылка на чужой объект даёт 403, e2e по всем семи ролям зелёные.

**K4. UI-кит и дизайн-токены.** Примитивы §9 на shadcn-svelte, токены в `app.css`, тосты, состояния загрузки и ошибок, адаптив, тач-режим для цеха, `kitchen-sink`.
**DoD:** каждый примитив отрендерен в `kitchen-sink`, тач-цели не меньше 44 px, кит работает в мобильном вьюпорте и с клавиатуры. Установка на домашний экран демонстрируется в C15 вместе с манифестом и service worker.

**K5. Очередь, события, интеграции за фейками, эталонная вертикаль.** `job_queue` и воркер с ретраями и идемпотентностью, `bus`, SSE-транспорт, интерфейсы `MailDriver` и `PushDriver` с фейками, эталонный слайс «Профиль пользователя портала» (load → form action → Zod → сервис → репозиторий → аудит → тест).
**DoD:** демо-джоб выполняется ровно один раз при двойной постановке, SSE доставляет событие в браузер, эталонная вертикаль покрыта юнит- и e2e-тестами и служит шаблоном для всех дальнейших слайсов.

**K6.** Перенесён на конец этапа 2 и выполняется как C15 (v1.8). Каркас считается готовым без него.

**K7. Визуальная система «Ангел» и оболочка портала.** Токены §18.2 в `app.css`, шрифты по §18.3, перенастройка примитивов `lib/ui` под пилюли, радиусы и плоские панели, оболочка портала по макетам: шапка с навигацией, чипами корзины и контрагента, хлебные крошки, подвал, раскладка профиля с боковым меню, мобильная раскладка шапки. Публичный лендинг на `/` для гостя по §18.5. Данных слайс не добавляет: счётчик корзины появляется в P4, контакты менеджера в P2, до этого элементы не рисуются.
**DoD:** `kitchen-sink`, вход и главная портала отрисованы в новой палитре, в компонентах нет hex-цветов, e2e `ui-shell` проверяет шапку портала в десктопном и мобильном вьюпорте, гость на `/` видит лендинг, вошедший пользователь уходит в свой контур, `ui-bundle` зелёный.

### Этап 1. Клиентская часть (B2B-портал)

Экраны этапа собираются по макетам из `ui/`. Какой макет относится к какому слайсу, что из макета берётся и что нет, записано в §18.5 и §18.6.

**P1. Каталог: доменное ядро и данные.** Модели, варианты, опции, матрица совместимости, категории, медиа, публикация. Наполнение через сид и CLI, интерфейса CRM ещё нет. Сервис каталога, репозиторий, проекция DTO с ценами и без.
**DoD:** сид создаёт каталог с вариантами и опциями, сервис отдаёт позицию с ценой для `cp_admin` и без цены для `cp_employee`.

**P2. Контрагенты, прайсы, пользователи портала.** Карточка контрагента, адреса доставки, договор, прайс-лист и скидка, вычисление персональной цены, учётные записи портала, CRUD сотрудников на стороне портала, лимит сотрудников, генерация временного пароля и отправка доступа письмом.
**DoD:** администратор контрагента заводит сотрудника сам, сотрудник входит по временному паролю и меняет его, цены не приходят в ответах сервера для роли сотрудника.

**P3. Портал: витрина каталога.** Дерево категорий, карточка модели, галерея, характеристики, опции, персональные цены для `cp_admin`, признак наличия на складе, поиск, фильтры, сортировка, выгрузка прайса в XLSX для администратора.
**DoD:** контрагент видит каталог со своими ценами и не видит чужие, сотрудник видит тот же каталог с прочерками вместо цен.

**P4. Портал: черновик и оформление заявки.** Конфигуратор позиции с проверкой матрицы совместимости, черновик со счётом суммы онлайн, адрес доставки или самовывоз, комментарий, вложения, свой номер заказа, валидация минимальной партии, отправка (`draft -> new`), повтор предыдущей заявки, шаблоны комплектов.
**DoD:** контрагент собирает заявку из каталога и отправляет, недоступная комбинация опций отклоняется сервером, заявка получает номер из `numbering_sequences`.

**P5. Заявка: машина состояний и история.** Полная реализация §6 в домене и сервисе, guard-ы, эффекты, история переходов, отмена контрагентом до `in_work`, отказ при доставке, транзакционность со складом (движения подключаются в C8, интерфейс эффектов готов сразу).
**DoD:** заявка проходит путь `new -> in_work -> ready -> delivered -> awaiting_payment -> paid` через CLI и e2e-хелпер, каждый переход записан в историю, недопустимый переход даёт 409, property-based тесты на инварианты §6.2 зелёные.

**P6. Портал: мои заявки.** Список с фильтрами по статусу и периоду, поиск по номеру, видимость «вся организация» для администратора и «свои» для сотрудника, карточка со составом, суммами по роли, историей статусов, комментарии с менеджером и вложения.
**DoD:** контрагент отслеживает статус без звонка, сотрудник видит ту же карточку без сумм, чужая заявка по прямой ссылке даёт 403.

**P7. Документы портала.** Нумерация, шаблоны, генерация спецификации и накладной в PDF через очередь, вариант без цен для роли сотрудника, скачивание через `/api/files/[id]` с проверкой прав.
**DoD:** спецификация и накладная скачиваются с корректными реквизитами и номером, сотруднику контрагента отдаётся версия без стоимостей.

**P8. Баннер пожертвований.** Расчёт и заморозка отчисления в момент `delivered`, `charity_totals` и джоб пересчёта, SSE-обновление счётчика, баннер с фондом и анимированным счётчиком, счётчик за год и число заявок, личный вклад контрагента, строка «в фонд с этой заявки» в карточке, справка за период в PDF.
**DoD:** счётчик растёт при доставке без перезагрузки страницы, смена ставки не двигает уже зафиксированные суммы, отменённые заявки и заявки на склад в счётчик не попадают.

**P9. Уведомления портала и стабилизация этапа.** Драйвер email на реальных ключах, шаблоны, матрица «событие × роль × канал», личные настройки пользователя, лог доставки и ретраи. Канал push появляется в C15. Далее: сквозные e2e по портальным ролям, адаптив, a11y, аудит утечки цен и прямых ссылок, инструкция контрагенту.
**DoD:** контрагент получает письмо по своим событиям, отправки видны в логе, этап 1 демонстрируется целиком на локальной сборке.

### Этап 2. Административная часть (CRM)

**C1. Каркас CRM, пользователи, справочники, настройки, аудит.** Layout и навигация CRM, управление сотрудниками мастерской и ролями, справочники `dict_items`, настройки организации и нумерации, ставка отчисления и данные фонда, лимит сотрудников, журнал аудита с фильтрами, опциональный IP-фильтр входа в CRM.
**DoD:** руководитель заводит пользователя, справочник и настройку без разработчика, каждое изменение видно в журнале аудита.

**C2. CRM: каталог и цены.** CRUD моделей, вариантов, опций, матрицы совместимости, медиа с обложкой и порядком, прайс-листы и скидки с периодом действия, себестоимость только для руководителя, привязка варианта к учётной позиции склада и к норме, публикация и скрытие в портале.
**DoD:** каталог наполняется через CRM без сида, себестоимость не приходит в ответах никому кроме руководителя.

**C3. CRM: контрагенты.** Карточка с реквизитами, договором, адресами, прайсом и схемой расчётов, список пользователей контрагента, выдача администратора, история заявок и оплат, индикатор задолженности, заметки, ответственный менеджер.
**DoD:** менеджер заводит контрагента с администратором и отправляет доступ, индикатор долга сходится с реестром отметок оплаты.

**C4. CRM: доска и реестр заявок.** Канбан по шести статусам с фильтрами, реестр с сортировкой, поиском и экспортом XLSX, ручное создание заявки, заявка на склад, приём в работу с фиксацией цен и скидки, назначение исполнителей, приоритет, отклонение, контролируемое изменение состава после запуска, флаги внимания (заявка без исполнителя, долгое ожидание оплаты).
**DoD:** менеджер ведёт заявку от приёма до готовности только из CRM, все изменения после запуска в работу пишутся в историю с комментарием.

**C5. Цеховое рабочее место.** Мобильный список «Мои заявки» с учётом приоритета, поиск по номеру заявки с бланка, действия «Взял» и «Готово», загрузка фото результата, требования к изделию, перечень комплектующих по норме, цены и контрагент скрыты, крупные тач-цели.
**DoD:** столяр ведёт заявку с телефона, не заходя в общий интерфейс CRM, переход в `ready` доступен только назначенному исполнителю.

**C6. Водительское рабочее место и доставка.** Список заявок в работе для планирования, список готовых с адресом, контактом и кнопкой навигации, «Доставлено» с переводом в `delivered` и автопереходом в `awaiting_payment`, отказ при доставке с компенсирующими движениями, просмотр накладной. Push при переходе в `ready` подключается в C15.
**DoD:** водитель видит заявку в списке готовых сразу после перехода в `ready` и доводит её до `delivered`, отказ откатывает складские движения обратными строками.

**C7. Оплата и закрытие.** Отметки оплаты с датой, суммой, способом и комментарием, частичная оплата с остатком, автоматический переход в `paid` при полном покрытии, индикатор задолженности контрагента, флаг долгого ожидания оплаты, аудит правок.
**DoD:** сумма отметок сходится с `totalMinor` до копейки, заявка закрывается автоматически при полном покрытии.

**C8. Склад: остатки и движения.** Учётные позиции, журнал движений, автоматические движения от статусов (приход по заявке на склад, расход при выдаче), ручные корректировки с причиной, инвентаризация одной операцией, минимальные пороги и сигнал, реестр и карточка позиции с раскрытием остатка до операций, экспорт XLSX, подсветка отрицательного остатка.
**DoD:** остаток равен сумме движений, любая цифра раскрывается до перечня операций, инвентаризация проводится одной операцией.

**C9. Склад: расчётные таблицы комплектующих.** Импорт XLSX/CSV с предпросмотром и отчётом об ошибках, версионирование, ручное редактирование норм, автоматическое списание комплектующих при переходе в `ready`, расчёт потребности по заявкам в работе и дефицита.
**DoD:** файл бизнеса создаёт версию норм, изготовление списывает комплектующие автоматически, дефицит виден списком, старые списания не пересчитываются.

**C10. Персонал и еженедельные выплаты.** Справочник сотрудников, импорт и версионирование расценок, ежедневный чеклист присутствия с копированием вчерашнего дня, работы и количества, дневной заработок, недельный свод, корректировки с комментарием, закрытие и переоткрытие периода, отметка выплаты, ведомость в XLSX и PDF, отчёты по сотрудникам и видам работ.
**DoD:** день отмечается за минуту, недельная ведомость совпадает с контрольным примером бизнеса до копейки, закрытый период не редактируется без переоткрытия с записью в аудит.

**C11. Документы и печатные формы целиком.** Бланк в цех с крупным номером заявки и перечнем комплектующих, этикетки, ведомость выплат, реестр остатков, массовая печать, асинхронная генерация через очередь, версии шаблонов.
**DoD:** все формы печатаются с корректными реквизитами и номерами, массовая печать десяти бланков не блокирует интерфейс.

**C12. Уведомления CRM.** Полная матрица событий CRM, шаблоны с переменными, предпросмотр и тестовая отправка, персональные настройки, лог доставки. Канал push и отзыв протухших подписок подключаются в C15.
**DoD:** по каждому событию из §7.3 адресаты получают уведомление в выбранных каналах, лог показывает статус доставки.

**C13. Отчёты и аналитика.** Дашборд руководителя, продажи по контрагентам, моделям и периодам, складские движения и оборачиваемость, выплаты, воронка заявок, отказы при доставке, отчёт по благотворительности с реестром перечислений и остатком «начислено, но не перечислено», фильтры и экспорт.
**DoD:** руководитель получает цифры за период без выгрузки в Excel вручную, сумма на баннере сходится с отчётом.

**C14. Стабилизация и приёмка.** Сквозное e2e по всем семи ролям, нагрузочная проверка реестров на 10 тыс. заявок и 50 тыс. движений, аудит безопасности (права на переходы, прямые ссылки, сокрытие цен, загрузка файлов), правки UX по итогам пилота, инструкции по ролям, первичное наполнение справочников, каталога, норм и расценок. Docker и деплой на VPS выносятся отдельной задачей после этого слайса.
**DoD:** сквозной сценарий отработан всеми ролями на реальных данных, контрольные примеры по комплектующим и выплатам сходятся до копейки, акт приёмки подписан.

**C15. PWA и Web Push** (бывший K6, перенесён в v1.8). `manifest.webmanifest` с иконками и shortcuts, регистрация push-only service worker по §17, обработчики `push` и `notificationclick`, кнопка установки и инструкция для iOS. Реальный драйвер Web Push на VAPID-ключах, подписки в `push_subscriptions`, канал push в матрице уведомлений портала и CRM, push водителю при переходе в `ready`, отзыв протухших подписок джобом `session.cleanup`. Кеширование, офлайн-фолбэк и фоновая синхронизация не делаются.
**DoD:** приложение ставится на домашний экран Android и iOS и открывается в standalone-режиме, водитель получает push в момент готовности и открывает карточку заявки из уведомления, Cache Storage пуст.

### Соответствие релизам исходного ТЗ

| Релиз | Слайсы |
|---|---|
| R1. Приём заявок | K1–K5, K7, P1–P7 |
| R2. Портал целиком | P8, P9 |
| R3. Производство и доставка | C1–C7 |
| R4. Склад, выплаты, отчётность, PWA | C8–C15 |

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
| Производительность | Отклик реестра не выше 1 с при 10 тыс. заявок и 50 тыс. движений, генерация документа не выше 5 с | Нагрузочный прогон в C14 на сгенерированных данных |
| Нагрузка | 20 одновременных пользователей, 200 контрагентов, 5 тыс. заявок в год | Один процесс, SQLite WAL |
| Доступность | 99% в рабочее время, обновления вне смен | Проверяется после выноса деплоя в отдельную задачу |
| Целостность | Остаток равен сумме движений, движение и статус в одной транзакции | Property-based и e2e |
| Совместимость | Актуальные Chrome, Edge, Safari, Firefox, мобильные через браузер и установленную PWA | Playwright на трёх движках плюс ручная установка на Android и iOS |
| Адаптивность | Портал, цеховой и водительский экраны, standalone-режим PWA | E2E в мобильном вьюпорте |
| Вес страницы | Страница грузит только те примитивы, которые рендерит. Кит целиком не приходит ни на один экран | E2E `ui-bundle`: на `/login` в ответах нет календаря и палитры команд, на `kitchen-sink` они приходят только после открытия контрола |
| Доступность (a11y) | Контраст, тач-цели не меньше 44 px, работа с клавиатуры в CRM | Проверка в K4 и C14 |
| Наблюдаемость | Структурные логи, health-check, метрики очереди | `/api/health` отдаёт длину очереди и число `dead` |
| Данные | Резервное копирование и хостинг вне объёма этапа 1. Файл БД и каталог файлов лежат вне репозитория и задаются конфигом | Вне объёма разработки |

---

## 17. PWA

Раздел реализуется слайсом C15 в конце этапа 2 (v1.8). До него в приложении нет манифеста, service worker и push-подписок, а тесты §17.5 не заводятся.

Приложение поставляется как PWA. Отдельного мобильного клиента нет: цех, водитель и контрагент ставят приложение на домашний экран и работают из standalone-окна. Вторая причина — Web Push, без которого водитель не узнает о готовности заявки.

Объём PWA в текущей реализации ровно два пункта: **установка на домашний экран и приём push**. Офлайн-режима нет. Service worker ничего не кеширует, `offline.html` нет, фоновой синхронизации и очереди отложенных действий нет. Без сети приложение ведёт себя как обычный сайт: запрос падает, экран показывает стандартное состояние ошибки из `ErrorState`. Кеширование и офлайн заводятся отдельной задачей после этапа 1, если бизнес это попросит.

Отдельный PWA-плагин не подключаем: SvelteKit собирает `src/service-worker.ts` сам.

### 17.1 Манифест

`static/manifest.webmanifest`, подключается в `src/app.html`:

```json
{
  "name": "Столярная мастерская: заявки",
  "short_name": "Заявки",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#eef1f5",
  "theme_color": "#2b6fae",
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

`skipWaiting` здесь безопасен: воркер не управляет отдачей документов, поэтому мгновенная замена версии не перезагружает страницу под руками у столяра.

**Cache Storage не используется вообще.** Ни оболочка, ни данные, ни картинки. Проверяется e2e: после логина, работы с каталогом и выхода `caches.keys()` возвращает пустой список. Появление кеша в этой проверке означает, что кто-то добавил `fetch`-обработчик в обход §17.

### 17.3 Push

Подписка создаётся в слайсе C15 на реальных VAPID-ключах, хранится в `push_subscriptions`, протухшие подписки отзываются джобом `session.cleanup`.

Payload push-уведомления не содержит цен, персональных данных и состава заявки: только номер, короткий текст и ссылку. Уведомление видно на заблокированном экране, а телефон в цехе лежит на верстаке.

### 17.4 Установка

Кнопка «Установить приложение» появляется по событию `beforeinstallprompt` в портале и на цеховом с водительским экранами. Safari на iOS событие не даёт, поэтому там показываем короткую инструкцию «Поделиться, На экран Домой». Факт установки определяем через `display-mode: standalone` и по нему прячем кнопку.

### 17.5 Тесты

- Playwright: манифест отдаётся, валиден и содержит обязательные поля;
- Playwright: service worker регистрируется, после сессии с логином и выходом `caches.keys()` пуст;
- юнит: сборка payload push-уведомления не содержит ценовых полей и ПДн;
- ручная проверка установки и получения push на Android Chrome и iOS Safari в DoD слайса C15.

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

Палитра небесно-голубая: светлое холодное поле, белые панели без рамки и тени, глубокий голубой акцент. Одна палитра на оба контура: CRM берёт те же токены, у неё своих макетов нет. Значения переносятся в `@theme` файла `src/app.css` в слайсе K7, семантические имена из K4 сохраняются, чтобы примитивы не переписывались.

| Роль | Значение в макете | Токен `app.css` |
|---|---|---|
| Поле страницы | `#eef1f5` | `--color-surface` |
| Панель, карточка | `#ffffff` | `--color-surface-raised` |
| Врезка, поле ввода, степпер | `#f5f7fa` | `--color-surface-muted` |
| Серый чип, кнопка в карточке | `#eef1f5`, hover `#e2e7ee` | `--color-chip`, `--color-chip-hover` (новые) |
| Основной текст | `#1b2430` | `--color-fg` |
| Второстепенный текст | `#5f6b7a` | `--color-fg-muted` |
| Подпись, плейсхолдер, артикул | `#8592a3` | `--color-fg-faint` (новый) |
| Разделитель | `#1b2430` на 7–10 % | `--color-border` |
| Акцент | `#2b6fae`, hover `#3d84bd`, active `#1f5183` | `--color-brand`, `--color-brand-hover`, `--color-brand-active` (новый) |
| Мягкий акцент (тег, выбранная карточка) | фон `#edf4fb`, текст `#1f5183` | `--color-tone-info-soft`, `--color-tone-info` |
| Успех (тег «активен») | фон `#e9f0e6`, текст `#3f5c3a` | `--color-tone-success-soft`, `--color-tone-success` |
| Опасное действие (отмена, отключение) | текст `#8a3b2f` | `--color-danger` |

Шкалы для редких мест, где семантического токена не хватает: акцент `--color-brand-100…900` (`#edf4fb`, `#d6e7f6`, `#b3d3ec`, `#8bbce1`, `#5e9fd2`, `#3d84bd`, `#2b6fae`, `#1f5183`, `#143658`), холодный нейтральный `--color-neutral-100…900` (`#f5f7fa`, `#eef1f5`, `#e2e7ee`, `#cbd3de`, `#a7b2c1`, `#8592a3`, `#5f6b7a`, `#414b58`, `#1b2430`), серебристо-облачный второй акцент `--color-mist-100…900` (`#f1f4f8`, `#e0e7f0`, `#c7d4e3`, `#a8bcd2`, `#8aa3bd`, `#6d88a5`, `#56708b`, `#3d5266`, `#273543`). Тона статусов `--color-tone-*` перенастраиваются на эти шкалы, словарь тонов в `status.ts` не меняется.

| Шкала | Значения макета | Токен |
|---|---|---|
| Радиусы | 8 px мелкие элементы, 14 px врезка и фото, 18 px панель и карточка, 999 px кнопка, чип, поле, тег | `--radius-sm`, `--radius-inset`, `--radius-card`, `--radius-pill` |
| Отступы | 4, 8, 12, 16, 24, 40 px | шкала Tailwind с шагом 4 px: `1`, `2`, `3`, `4`, `6`, `10` |
| Тени | панели плоские, тени только у оверлеев | `--shadow-card: none`, `--shadow-overlay` по `--shadow-lg` макета |
| Высоты | основная кнопка 52 px, чип и поле 44 px, кнопка в карточке 42 px, компактный чип 38 px | `size` у `Button`: `lg` 52, `md` 44, `sm` 38; `--spacing-touch` 44 px не меняется |
| Ширина | контейнер 1440 px, поля 24 px | `max-w-[--container-shell]`, `px-6` |

### 18.3 Типографика

Текст набран Barlow 400/500, заголовки, цифры и цены Barlow Condensed 600 (класс `.num` макета). Кегли: заголовок страницы 36–44 px, лендинг 64 px, секция 26–34 px, блок 22 px, текст 15 px, мелкий 13–13.5 px, подпись-капитель 11.5–12 px с разрядкой 0.08–0.12 em.

Гарнитуры Barlow и Barlow Condensed не содержат кириллицы: в файлах макета подключены только наборы latin, latin-ext и vietnamese, поэтому русский текст в макетах фактически рисуется системным шрифтом. Внешний сервис шрифтов запрещён §3 и CSP (`font-src 'self'`), поэтому файлы woff2 лежат в `static/fonts/` и подключаются `@font-face` в `app.css`. Выбор кириллической гарнитуры открыт, см. §18.7.

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

### 18.5 Экраны, роуты и слайсы

| Макет | Роут | Роли | Слайс | Что берём из макета |
|---|---|---|---|---|
| Лендинг | `/` | гость | K7 | Шапка с чипом телефона и кнопкой «Вход для контрагентов» на `/login`, первый экран, постоянные факты (срок изготовления, регион доставки), товарные группы текстом, «Производство», «Как мы работаем», подвал. Кнопки «Стать контрагентом» и «Запросить условия» открывают `mailto:` и `tel:` из `org.requisites`. Счётчики каталога и остатка гостю не показываются: публичного доступа к данным каталога нет |
| Главная портала | `/portal` | `cp_admin`, `cp_employee` | P6, блоки дополняют P2, P4, P8 | Заголовок с именем контрагента и договором (P2). Три показателя: заявки в работе с суммой для `cp_admin`, ближайшая готовность по `readyAt`, скидка `discountPercent` (P2). Панели «Собрать заявку» и «Повторить заявку» (P4). Таблица активных заявок `new…awaiting_payment` и закрытых за три месяца (P6). Баннер пожертвований в макете отсутствует, P8 ставит его под показателями |
| Каталог | `/portal/catalog` | обе | P3 | Группы верхнего уровня `categories` с подкатегориями, число артикулов, «от N ₽» только для `cp_admin`, кнопка «Скачать прайс-лист XLSX» только для `cp_admin` |
| Листинг товаров | `/portal/catalog/[categoryId]` | обе | P3 | Фильтры: материал (`dict_items` `material`), отделка (`options` `finish`), длина (`lengthMm`), наличие по остатку. Сортировка, число на странице, выбранные фильтры чипами, сетка карточек с артикулом, названием, ценой и остатком |
| Карточка товара | `/portal/catalog/product/[productId]` | обе | P3 просмотр, P4 добавление | Галерея `media`, характеристики из полей варианта и справочника материалов, описание, выбор размера (`sizeCode` варианта), обивка и тиснение из `options` по матрице `product_options`, цена за штуку, остаток, количество, «Добавить в заявку» (P4), похожие позиции той же категории |
| Корзина | `/portal/cart` | обе | P4 | Черновик заявки: строки с вариантом и опциями, цена и сумма строки для `cp_admin`, количество, удаление, очистка. Отгрузка: адрес из `delivery_addresses` или самовывоз (`isPickup`), комментарий, поле «Ваш номер заявки» (`externalNumber`, в макете нет, добавляется). Итог: позиции, изделия, сумма, скидка по договору, к оплате (только `cp_admin`). «Оформить заявку» выполняет `draft -> new` |
| Мои заявки | `/portal/requests` | обе | P6 | Раскладка профиля с боковым меню, строки-карточки: номер, дата, статус, первая позиция, число позиций и изделий, сумма для `cp_admin`, автор (`createdById`) для администратора. Чипы статусов с числами, поиск по номеру, сортировка. Фильтр периода из DoD P6 добавляется, в макете его нет. «Новая заявка» ведёт в каталог |
| Заявка (детальная) | `/portal/requests/[id]` | обе | P6, P7, P8 | Показатели: позиции, сумма (`cp_admin`), статус. Состав заявки `DataTable`, комментарий, параметры отгрузки и скидка, «Повторить заявку» (P4), «Отменить заявку» для `new -> cancelled` (P5), карточка менеджера. Из DoD P6 добавляются `Stepper` истории статусов, переписка с менеджером (`comments` без `isInternal`) и вложения, из P7 документы, из P8 строка «в фонд с этой заявки» |
| Профиль контрагента | `/portal/profile` | обе | K5 аккаунт, P2 карточка | K5: раскладка профиля и блок «Мой аккаунт» с формой ФИО и телефона, эталонная вертикаль. P2: название, реквизиты (`legalName`, `inn`, `kpp`, `address`, `phone`, `email`), договор (`contracts`), показатели скидки, задолженности и закупки за год для `cp_admin`, превью трёх сотрудников, менеджер. Кнопка «Изменить данные» реквизитов не рисуется: реквизиты правит менеджер в C3 |
| Мои сотрудники | `/portal/staff` | `cp_admin`, у `cp_employee` 403 | P2 | `DataTable` с выбором строк: ФИО и email, роль (`cp_admin` «Администратор», `cp_employee` «Сотрудник»), телефон, последний вход (`lastLoginAt`), статус (активен; приглашён при `mustChangePassword` и пустом `lastLoginAt`; отключён при `isActive = false`). Поиск, фильтры роли и статуса, «Добавить сотрудника» с временным паролем письмом, «Сменить роль», «Отключить», счётчик «N из `staffLimit`» |

Навигация шапки портала: «Главная», «Каталог», «Заявки». Пункт «Доставка» из макета не рисуется, экрана под него нет. Боковое меню профиля: «Профиль», «Мои сотрудники» только для `cp_admin`, «Мои заявки». Подвал: контакты менеджера и «Выйти», ссылки «Условия поставки» и «Помощь» не рисуются до появления страниц.

### 18.6 Разрывы контракта, которые открывают макеты

Решение для этапа 1: элемент не рисуется и блок CONTRACT GAP по нему не поднимается. Все пункты таблицы переносятся на этап 2 и разбираются там отдельными задачами. Колонка «Где всплывает» показывает слайс этапа 1, в котором элемент есть на макете, но не делается.

| № | Элемент макета | Чего нет в контракте | Где всплывает |
|---|---|---|---|
| 1 | «Мои заявки» как запросы на нестандартное изделие, образцы и изменение условий, статусы «Согласовано» и «Отклонено», срок ответа менеджера | Отдельной сущности запроса нет, §1 оставляет одну сущность «Заявка» | P6 |
| 2 | Ступени цены «от 50 шт», «от 100 шт» | Таблицы ступеней цены от объёма | P3, P4 |
| 3 | «Под заказ, срок 4 дня», «Срок производства 3 дня», «Готовность заявки 20 июня» | Срока изготовления варианта и плановой даты готовности заявки | P3, P4, P6 |
| 4 | Цветные свотчи фильтра и цвет обивки | Значения цвета у `options` | P3 |
| 5 | Паспорт изделия, габаритный чертёж, сертификат PDF в карточке товара | Вида документа изделия, `media.ownerScope = 'product'` задуман под фото | P3 |
| 6 | Позиции вне каталога и услуги в составе заявки («по чертежу», «упаковка усиленная») | `request_items.variantId` обязателен | P4 |
| 7 | «Добавить по артикулам», «В спецификацию», «Запросить образец», «Отправить запрос» | Сценариев нет в объёме P3 и P4 | P3, P4 |
| 8 | Стоимость доставки и порог бесплатной доставки | Полей стоимости доставки | P4 |
| 9 | «Запросить счёт на оплату» | Вида `invoice` в `DOCUMENT_KINDS` (ключ нумерации `invoice` уже есть) | P7 |
| 10 | ОГРН, банк, расчётный счёт контрагента | Полей в `counterparties` | P2 |
| 11 | Должность сотрудника и роль «Наблюдатель» с правом только смотреть | Поля должности у `users` и роли в `ROLE_CODES` | P2 |
| 12 | Прогрессивная скидка «до 5 % от 1 500 000 ₽ в квартал» | Скидка только фиксированным `discountPercent` и `discount_rules` | P2 |
| 13 | Меню действий строки «⋯» | Примитива меню действий в §9 | P2 |
| 14 | Архив заявок старше шести месяцев | Архива нет, закрывается фильтром периода | P6 |
| 15 | Форма «Стать контрагентом» с сохранением заявки гостя | Таблицы обращений гостей | K7 |

### 18.7 Открытые вопросы

1. **Кириллическая гарнитура.** Вариант А: Barlow и Barlow Condensed для цифр и латиницы, кириллица на системном шрифте, как фактически выглядит макет. Вариант Б: пара с кириллицей и близким характером под свободной лицензией, например Fira Sans и Fira Sans Condensed. Этап 1 делает вариант А. Выбор другой гарнитуры переносится на этап 2.
