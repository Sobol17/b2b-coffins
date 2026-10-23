# C18 Финансы мастерской: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** страница `/crm/finance` для руководителя: форма ручной операции, аналитика за период и лента, где оплаты заявок, выплаты бригаде и перечисления в фонд появляются сами.

**Architecture:** ручные операции живут в новой таблице `finance_entries`. Автоматические операции не копируются: репозиторий ленты читает `payment_marks`, `payroll_lines`, `charity_transfers` и `finance_entries` одним `UNION ALL`. Сводку и корзины графика считает чистая логика `lib/domain/finance/summary.ts` по строкам периода. Роут тонкий, права проверяет `PolicyService` по новому действию `finance.manage`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle на SQLite, Zod 4, Vitest и fast-check, Playwright, exceljs, shadcn-svelte через `lib/ui`.

**Spec:** `docs/superpowers/specs/2026-10-23-crm-finance-design.md`

## Global Constraints

- Ядро: `tech.md` v1.57 на входе, v1.58 на выходе; в шапке C17 влит, C18 в работе.
- Право `finance.manage` только у `owner`; остальные роли CRM и портала получают 403 на странице, на каждом action и на выгрузке.
- Деньги в целых копейках, поля `_minor`; сумма ручной операции от 1 до `FINANCE_ENTRY_MAX_MINOR = 10_000_000_000`.
- Комментарий ручной операции после `trim` от 1 до `FINANCE_COMMENT_MAX = 500` символов.
- Дата ручной операции: день `YYYY-MM-DD` в `org.timezone`, не позже сегодняшнего; хранится как `startOfDayInZone`.
- Период: `reportRangeSchema` C13, не больше 366 дней, по умолчанию текущий месяц (`presetRange('month', today)`).
- Источники в порядке `FINANCE_SOURCES = ['order_payment', 'manual_income', 'payroll', 'charity', 'manual_expense']`.
- Корзина: `day` до 31 дня включительно, `week` до 92, иначе `month`.
- Миграция только `pnpm db:generate`. Файл до 250 строк, функция до 40. `any` запрещён.
- UI только из `lib/ui`, `lib/crm/reports` и `lib/crm/ReportTable.svelte`; цвета только токенами (`text-success`, `text-danger`, `bg-success`, `bg-danger`); библиотеку графиков не подключаем.
- Плейсхолдеры короткие: «Введите сумму», «Выберите дату», «Введите комментарий», «Выберите тип», «Выберите источник».
- Тексты без em-dash. Комментарии в коде на английском и объясняют почему.
- Коммиты `type(scope): summary` на английском, scope из списка CLAUDE.md (`crm`, `ui`, `ci`), без трейлеров и следов нейросети.
- Перед `pnpm test:e2e` и `pnpm build`: `SESSION_SECRET` в окружении, убить процесс на порту 4173, не запускать сборку параллельно с e2e.

## Review Focus

1. Отметка оплаты и её сторно в одном периоде: доход не меняется, расход не растёт (Task 2, Task 4).
2. Операция в 23:30 по Москве последнего дня периода попадает в период, операция в 00:10 следующего дня нет (Task 4).
3. Снятая отметка выплаты и выплата с `payout_minor = 0` в ленту не попадают (Task 4).
4. Правка или удаление уже удалённой ручной операции даёт 404, а не тихий успех (Task 3).
5. Тело ответа страницы, action и выгрузки для `manager` не содержит сумм (Task 6).

---

### Task 1: Контракт, схема и право

**Files:**

- Modify: `tech.md` (шапка, changelog v1.58, §4.4, новый §5.11, §8, §12, §14)
- Create: `src/lib/types/finance.ts`, `src/lib/validation/finance.ts`, `src/lib/server/db/schema/finance.ts`
- Modify: `src/lib/types/index.ts` (реэкспорт, если файл реэкспортирует остальные типы), `src/lib/server/db/schema/index.ts`, `src/lib/server/auth/policy.ts`
- Create: `drizzle/<generated>.sql` через `pnpm db:generate`
- Test: `tests/unit/finance-validation.spec.ts`, `tests/unit/policy.spec.ts`

**Interfaces:**

- Produces: типы `FinanceKind`, `FinanceSource`, `FinanceFilters`, `FinanceOperationDto`, `FinanceSourceTotalDto`, `FinanceBucketDto`, `FinanceSummaryDto`, `FinancePageDto` и константы `FINANCE_KINDS`, `FINANCE_SOURCES`, `FINANCE_ENTRY_MAX_MINOR`, `FINANCE_COMMENT_MAX` ровно как в разделе «Типы» спеки; таблица `financeEntries`; действие `'finance.manage'`.
- Produces (validation): `financeEntrySchema` (поля `kind`, `amountMinor`, `occurredOn`, `comment`), `financeEntryUpdateSchema` (то же плюс `id`), `financeDeleteSchema` (`id`), `financeFiltersSchema` (`from`, `to`, `kind`, `source`; пустое значение или неизвестный код даёт `null`), типы `FinanceEntryInput`, `FinanceEntryUpdateInput`, `FinanceDeleteInput`, `FinanceFiltersInput`.

- [ ] **Step 1: Обновить `tech.md`** по разделу спеки «Что меняется в `tech.md`»: таблица §5.11 и её три инварианта дословно из спеки, блок типов §8 из спеки, строка права в §12 рядом с `reports.read`, слайс C18 в §14 после C17 с DoD из спеки, changelog v1.58 одним абзацем с решениями владельца и разработчика.

- [ ] **Step 2: Написать падающие тесты**

`tests/unit/finance-validation.spec.ts`:

- `financeEntrySchema.parse({ kind: 'expense', amountMinor: '150000', occurredOn: '2026-10-20', comment: '  Аренда  ' })` даёт `{ kind: 'expense', amountMinor: 150000, occurredOn: '2026-10-20', comment: 'Аренда' }`;
- `amountMinor: '0'`, `'10000000001'`, `'1.5'` отклоняются с сообщением «Введите сумму» или «Сумма слишком большая»;
- `comment: '   '` отклоняется с «Введите комментарий», 501 символ отклоняется;
- `kind: 'transfer'` отклоняется, `occurredOn: '20.10.2026'` отклоняется с «Выберите дату»;
- `financeFiltersSchema.parse({ from: '2026-10-01', to: '2026-10-31', kind: '', source: 'bogus' })` даёт `kind: null`, `source: null`; диапазон длиннее 366 дней отклоняется «Период не длиннее года».

`tests/unit/policy.spec.ts`, рядом со строкой `charity.manage`:

```ts
expect(PolicyService.can({ roles: [role] }, 'finance.manage')).toBe(role === 'owner');
```

- [ ] **Step 3: Запустить и убедиться, что падают**

Run: `pnpm vitest run tests/unit/finance-validation.spec.ts tests/unit/policy.spec.ts`
Expected: FAIL, модуль `finance` не найден и `finance.manage` не входит в `Action`.

- [ ] **Step 4: Реализовать типы, схемы, таблицу и право**

Схемы собираются из тех же кусков, что `lib/validation/crm-reports.ts`: `reportRangeSchema` расширяется полями фильтра через `.extend` до `superRefine`, либо `rangeShape` и `checkRange` экспортируются из `crm-reports.ts` и переиспользуются (третьего копирования не будет). Фильтр `kind` и `source`: `z.preprocess` к `null` для пустого или неизвестного значения, затем `z.enum(...).nullable()`. Таблица по спеке, индекс `finance_entries_occurred_idx`. Действие добавляется в `ACTIONS` с комментарием про v1.58; `owner` получает его фильтром `GRANTS.owner` сам.

- [ ] **Step 5: Сгенерировать миграцию**

Run: `pnpm db:generate`
Expected: новый файл в `drizzle/` с `CREATE TABLE finance_entries` и индексом, без других изменений.

- [ ] **Step 6: Прогнать тесты и тайпчек**

Run: `pnpm vitest run tests/unit/finance-validation.spec.ts tests/unit/policy.spec.ts && pnpm check`
Expected: PASS, 0 ошибок.

- [ ] **Step 7: Commit**

```bash
git add tech.md src/lib/types src/lib/validation src/lib/server/db/schema src/lib/server/auth/policy.ts drizzle tests/unit/finance-validation.spec.ts tests/unit/policy.spec.ts
git commit -m "feat(crm): add finance contract and entries table"
```

---

### Task 2: Чистая логика сводки

**Files:**

- Create: `src/lib/domain/finance/summary.ts`
- Test: `tests/domain/finance-summary.spec.ts`

**Interfaces:**

- Consumes: `FinanceSource`, `FinanceKind`, `FinanceSummaryDto`, `FinanceBucketDto` (Task 1); `bucketsOf`, `rangeDays`, `ReportRange` из `lib/domain/report/period.ts`; `SalesBucket` из `lib/types/crm-reports.ts`.
- Produces:
  - `interface FinanceLine { readonly source: FinanceSource; readonly occurredOn: string; readonly signedMinor: number }`
  - `kindOf(source: FinanceSource): FinanceKind`
  - `pickBucket(range: ReportRange): SalesBucket`
  - `summarize(lines: readonly FinanceLine[], range: ReportRange): FinanceSummaryDto`

Правило знака: `signedMinor` положителен у денег в мастерскую и отрицателен у денег из неё. Доход это сумма `signedMinor` строк с `kindOf = 'income'`, расход это минус сумма `signedMinor` строк с `kindOf = 'expense'`. Строки вне `range` функция не получает, но и не считает: такие строки отбрасываются.

- [ ] **Step 1: Написать падающие тесты**

Пример и свойства в `tests/domain/finance-summary.spec.ts`:

- пример: оплата `+10000`, её сторно `-10000`, ручной расход `-3000`, выплата `-2000`, перечисление `-500` и его сторно `+500` за октябрь дают `incomeMinor 0`, `expenseMinor 5000`, `netMinor -5000`, `bySource` в порядке `FINANCE_SOURCES` с `count` 2, 0, 1, 2, 1;
- `pickBucket` даёт `day` для 31 дня, `week` для 32 и 92 дней, `month` для 93;
- свойство: `netMinor === incomeMinor - expenseMinor` для любых строк;
- свойство: сумма `incomeMinor` корзин равна `incomeMinor`, сумма `expenseMinor` корзин равна `expenseMinor`;
- свойство: корзины идут подряд, первая начинается с `range.from`, последняя кончается `range.to`, `to + 1 день` каждой равен `from` следующей;
- свойство: добавление пары `{ s, d, +x }` и `{ s, d, -x }` не меняет результата;
- свойство: `kindOf` не зависит от знака: строка `payroll` с положительной суммой уменьшает расход, а не увеличивает доход.

Генератор: `fc.record({ source: fc.constantFrom(...FINANCE_SOURCES), occurredOn: дата внутри диапазона, signedMinor: fc.integer({ min: -1e9, max: 1e9 }) })`, диапазон из `fc.date` с длиной 1..366 дней.

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `pnpm vitest run tests/domain/finance-summary.spec.ts`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализовать `summary.ts`**

Корзины строит `bucketsOf(range, pickBucket(range))`, строка попадает в корзину по `from <= occurredOn <= to`. `bySource` заполняет все пять источников, нули включены.

- [ ] **Step 4: Прогнать тесты с покрытием**

Run: `pnpm vitest run tests/domain/finance-summary.spec.ts --coverage --coverage.include=src/lib/domain/finance/**`
Expected: PASS, строки `summary.ts` покрыты не меньше чем на 90%.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/finance tests/domain/finance-summary.spec.ts
git commit -m "feat(crm): add finance summary domain logic"
```

---

### Task 3: Ручные операции

**Files:**

- Create: `src/lib/server/finance/finance-entry.repository.ts`, `src/lib/server/finance/finance-entry.service.ts`
- Test: `tests/unit/finance-entry.spec.ts`

**Interfaces:**

- Consumes: `financeEntries`, `FinanceEntryInput`, `FinanceEntryUpdateInput`, `FinanceDeleteInput`, `'finance.manage'` (Task 1).
- Produces:
  - `class FinanceEntryRepository extends BaseRepository<typeof financeEntries>`: `findLive(id: number, tx?: Tx): FinanceEntryRow | undefined` (только без `deleted_at`), `insert(row: NewFinanceEntry, tx: Tx): number`, `update(id: number, patch: FinanceEntryPatch, tx: Tx): void`, `softDelete(id: number, at: Date, tx: Tx): void`.
  - `class FinanceEntryService extends BaseService`, конструктор `(ctx: ActorContext, entries = new FinanceEntryRepository(), timeZone = OrgService.timezone(), now: () => Date = () => new Date())`, проверка `ctx.scope === 'crm' && PolicyService.can(ctx, 'finance.manage')` в конструкторе. Методы `create(input: FinanceEntryInput): number`, `update(input: FinanceEntryUpdateInput): void`, `remove(input: FinanceDeleteInput): void`.

Аудит через `this.audited`: действия `finance.entry.create`, `finance.entry.update`, `finance.entry.delete`, сущность `finance_entries`, `before` и `after` с `kind`, `amountMinor`, `occurredOn`, `comment`. Дата превращается в момент так же, как `CharityTransferService.transferredAt`: `ValidationError('Выберите дату', { field: 'occurredOn' })` для несуществующего дня, `ValidationError('Дата не может быть позже сегодняшней', { field: 'occurredOn' })` для будущего. Отсутствующая или удалённая строка даёт `NotFoundError('finance_entry')`.

- [ ] **Step 1: Написать падающие тесты**

Мир теста: `migratedDatabase()`, `insertUser` для `owner` и `manager`, `crmActor` из `helpers/portal-requests`, часы теста `() => new Date('2026-10-23T09:00:00Z')`, зона `Europe/Moscow`; `beforeEach` чистит `finance_entries` и `audit_log`.

- `create` пишет строку с `occurred_at = startOfDayInZone('2026-10-20', TZ)`, `created_by_id` руководителя и одну строку аудита `finance.entry.create` с `after.amountMinor`;
- дата `2026-10-24` при часах 23.10 отклоняется `ValidationError`, дата `2026-10-23` проходит;
- `update` меняет сумму и комментарий, аудит `finance.entry.update` несёт старое значение в `before` и новое в `after`;
- `remove` ставит `deleted_at`, строка остаётся в таблице, аудит `finance.entry.delete`;
- `update` и `remove` удалённой строки и строки `id = 999999` бросают `NotFoundError`;
- `new FinanceEntryService(manager)` бросает `ForbiddenError`.

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `pnpm vitest run tests/unit/finance-entry.spec.ts`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализовать репозиторий и сервис**

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm vitest run tests/unit/finance-entry.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/finance tests/unit/finance-entry.spec.ts
git commit -m "feat(crm): record, edit and delete manual finance entries"
```

---

### Task 4: Лента и сводка страницы

**Files:**

- Create: `src/lib/server/finance/finance-feed.repository.ts`, `src/lib/server/finance/finance.service.ts`, `src/lib/server/finance/dto.ts`
- Test: `tests/unit/finance-feed.spec.ts`

**Interfaces:**

- Consumes: `summarize`, `FinanceLine` (Task 2); `FinanceEntryRepository` не нужен; `reportWindow`, `presetRange`, `ReportRange`, `ReportWindow`; `ListQuery`, `offsetFor`; `isoDay`.
- Produces:
  - `interface FeedRow { source: FinanceSource; id: number; occurredAt: Date; signedMinor: number; requestId: number | null; requestNumber: string | null; method: PaymentMethod | null; isReversal: boolean; staffName: string | null; weekStartsAt: Date | null; weekEndsAt: Date | null; documentRef: string | null; comment: string | null }`
  - `class FinanceFeedRepository extends BaseRepository<typeof financeEntries>`: `page(window: ReportWindow, filters: { kind: FinanceKind | null; source: FinanceSource | null }, query: ListQuery<unknown>): { rows: FeedRow[]; total: number }` и `lines(window: ReportWindow): FeedRow[]` (все строки периода без пагинации и без фильтров типа).
  - `class FinanceService extends BaseService`, конструктор `(ctx, feed = new FinanceFeedRepository(), timeZone = OrgService.timezone(), now = () => new Date())`, проверка `finance.manage` в конструкторе. Методы `today(): string`, `defaultRange(): ReportRange`, `page(input: FinanceFiltersInput, query: ListQuery<unknown>): FinancePageDto`, `feedAll(input: FinanceFiltersInput): FinanceOperationDto[]` (для выгрузки, до 10 000 строк).
  - `toOperationDto(row: FeedRow, timeZone: string): FinanceOperationDto` в `dto.ts`.

Запрос ленты: `UNION ALL` четырёх подзапросов с одинаковыми колонками, внешний `select ... where occurred_at >= from and occurred_at < to [and source = ?] [and kind = ?] order by occurred_at desc, source_rank, id desc limit ? offset ?`. Колонка `kind` вычисляется в подзапросе по источнику. Знаки: `payment_marks.amount_minor` как есть; `payroll_lines.payout_minor` с минусом, только `paid_at is not null and payout_minor > 0`; `charity_transfers.amount_minor` с минусом (сторно с отрицательной суммой даёт плюс); `finance_entries` со знаком по `kind`, только `deleted_at is null`. Даты в SQLite лежат секундами (`mode: 'timestamp'`), окно передаётся секундами. Сборка через `sql` из drizzle с параметрами, без конкатенации строк.

Тексты `dto.ts`: `order_payment` даёт `title` «Заявка №{number}», `detail` подпись способа из существующего словаря способов оплаты C7 (найти по `PAYMENT_METHODS`), у сторно `detail` начинается с «Сторно оплаты»; `payroll` даёт «Выплата: {ФИО}», `detail` «неделя {dd.mm}–{dd.mm}» через `formatDate`; `charity` даёт «Перечисление в фонд», `detail` номер документа, у сторно «Сторно перечисления»; ручная строка даёт `title = comment`, `detail = null`, `href = null`, `manualId = id`. Ссылки через `resolve`-совместимые пути: `/crm/requests/{id}`, `/crm/payroll?week={isoDay(weekStartsAt)}`, `/crm/reports/charity`.

- [ ] **Step 1: Написать падающие тесты**

Мир: `migratedDatabase()`, руководитель и `manager`, контрагент, заявка через `insertRequest({ status: 'awaiting_payment', counterpartyId, createdById })`, сотрудник через `insertStaff`, неделя `payroll_periods` и строки `payroll_lines` прямой вставкой, `charity_transfers` и `payment_marks` прямой вставкой, ручные строки через `FinanceEntryService`. Зона `Europe/Moscow`, период `2026-10-01..2026-10-31`.

- оплата 1000 ₽ и её сторно: в ленте две строки `order_payment` со `signedMinor` `100000` и `-100000`, сводка `incomeMinor 0`;
- выплата с `paid_at` даёт строку `-payout`; та же строка после `paid_at = null` пропадает; строка с `payout_minor = 0` и `paid_at` не попадает;
- перечисление 500 ₽ и его сторно: `expenseMinor` 0;
- удалённая ручная операция не попадает ни в ленту, ни в сводку;
- граница зоны: оплата с `paid_at = 2026-10-31T20:30:00Z` (23:30 МСК) в октябре есть, `2026-10-31T21:10:00Z` (00:10 МСК 1 ноября) нет;
- фильтр `kind: 'expense'` оставляет только `payroll`, `charity`, `manual_expense`; `source: 'manual_income'` только ручные доходы; `total` считает после фильтра;
- порядок: дата по убыванию, на одной дате по `id` по убыванию внутри источника;
- сводка `page().summary` совпадает с `summarize` по `lines()` и не зависит от фильтра `kind` и `source`;
- `toOperationDto` для оплаты даёт `href '/crm/requests/{id}'`, `manualId null`; для ручной строки `href null`, `manualId id`;
- `new FinanceService(manager)` бросает `ForbiddenError`.

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `pnpm vitest run tests/unit/finance-feed.spec.ts`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализовать репозиторий, DTO и сервис**

Если `finance.service.ts` подходит к 250 строкам, вынести окно и значения по умолчанию в общий с `ReportBaseService` помощник не нужно: сервис наследует `BaseService` и повторяет только `today` и `window`, как `ReportBaseService`. Третьего повтора нет.

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm vitest run tests/unit/finance-feed.spec.ts tests/unit/finance-entry.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/finance tests/unit/finance-feed.spec.ts
git commit -m "feat(crm): read the finance feed from payments, payroll and fund"
```

---

### Task 5: Выгрузка XLSX

**Files:**

- Create: `src/lib/server/finance/finance-export.service.ts`, `src/routes/(crm)/crm/finance/export.xlsx/+server.ts`, `src/lib/server/finance/route.ts`
- Test: `tests/unit/finance-export.spec.ts`

**Interfaces:**

- Consumes: `FinanceService.feedAll`, `FinanceOperationDto`, `xlsxResponse` из `server/crm-stock/route.ts`, `rethrowAsHttp`, `parseOr422` из `server/crm-reports/route.ts`.
- Produces:
  - `financeActor(event: { locals: App.Locals; url: URL }): ActorContext` в `server/finance/route.ts`: `requireAction(requireScope(event.locals.actor, 'crm', event.url.pathname), 'finance.manage')`.
  - `class FinanceExportService`: `constructor(timeZone: string)`, `async sheet(rows: readonly FinanceOperationDto[]): Promise<Buffer>`.

Лист «Финансы», колонки «Дата» (12), «Тип» (10), «Источник» (22), «Описание» (48), «Сумма, ₽» (16, формат `#,##0.00`, со знаком через `fromMinor`). Подписи источников и типов берутся из `lib/crm/finance/labels.ts` (создаётся здесь, Task 6 его переиспользует): `FINANCE_SOURCE_TITLE` («Оплата заявки», «Прочий доход», «Выплата бригаде», «Перечисление в фонд», «Прочий расход») и `FINANCE_KIND_TITLE` («Доход», «Расход»). Файл ответа `finance.xlsx`, заголовок «Финансы».

- [ ] **Step 1: Написать падающий тест**

`tests/unit/finance-export.spec.ts`: две строки (ручной расход `-150000` и оплата `+100000`) дают книгу, где лист «Финансы» имеет заголовки колонок выше, вторую строку `['20.10.2026', 'Расход', 'Прочий расход', 'Аренда', -1500]`, третью с суммой `1000`. Книга читается обратно через `ExcelJS.Workbook().xlsx.load`.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `pnpm vitest run tests/unit/finance-export.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать сервис, `route.ts`, `labels.ts` и эндпоинт**

Эндпоинт по образцу `reports/charity/export.xlsx/+server.ts`: актор через `financeActor`, фильтры через `parseOr422(financeFiltersSchema, event.url)`.

- [ ] **Step 4: Прогнать тест**

Run: `pnpm vitest run tests/unit/finance-export.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/finance src/lib/crm/finance/labels.ts "src/routes/(crm)/crm/finance/export.xlsx" tests/unit/finance-export.spec.ts
git commit -m "feat(crm): export the finance feed to xlsx"
```

---

### Task 6: Страница, навигация и e2e

**Files:**

- Create: `src/routes/(crm)/crm/finance/+page.server.ts`, `src/routes/(crm)/crm/finance/+page.svelte`
- Create: `src/lib/crm/finance/EntryForm.svelte`, `EntryModal.svelte`, `FinanceChart.svelte`, `SourceTable.svelte`, `FeedTable.svelte`
- Modify: `src/lib/crm/nav.ts`, `src/routes/(crm)/+layout.server.ts`, `tests/unit/crm-nav.spec.ts`, `tests/e2e/crm-surface.ts`
- Create: `tests/e2e/crm-finance.e2e.ts`

**Interfaces:**

- Consumes: `financeActor` (Task 5), `FinanceService`, `FinanceEntryService` (Task 3, 4), `formAction`, `loadReport` из `server/crm-reports/route.ts`, `parseListQuery`, `ReportFilters`, `StatTile`, `ReportTable`, `labels.ts` (Task 5).
- Produces: actions `create`, `update`, `remove`; флаг `CrmNavRights.finance`.

`+page.server.ts`: `load` строит `FinanceService(financeActor(event))` и отдаёт `today` и результат `loadReport(event.url, financeFiltersSchema, service.defaultRange(), (input) => service.page(input, parseListQuery(event.url)))`. Каждый action сначала зовёт `financeActor(event)`, затем `formAction(event.request, '<name>', <schema>, (input) => new FinanceEntryService(actor).<method>(input))`.

Разметка по разделу «Экран» спеки. Детали, которые спека не фиксирует:

- `EntryForm` (props `today: string`, `action: '?/create' | '?/update'`, `entry?: FinanceOperationDto`): `RadioGroup` с `name="kind"`, `MoneyInput name="amountMinor"`, `DatePicker name="occurredOn"`, `Textarea name="comment" maxlength={500}`; отправка через `use:enhance={withToast({ success, reset, pending, onSuccess })}`; ошибка сервера показывается текстом `formError` у формы, как в остальных формах CRM.
- `EntryModal` оборачивает `EntryForm` в `Modal` «Изменить операцию» со скрытым `id`.
- Удаление: `ConfirmDialog` «Удалить операцию?» с описанием «Итоги периода пересчитаются», подтверждение отправляет форму `?/remove` со скрытым `id`.
- Фильтры типа и источника передаются в `ReportFilters` через `extra` (поля `select` с ключами `kind` и `source`), выгрузка через `exportHref={resolve('/crm/finance/export.xlsx')}`. Сводка от них не зависит.
- `FinanceChart` (props `buckets: FinanceBucketDto[]`, `bucket: SalesBucket`): столбики `div` с `style:height` в процентах от наибольшего значения, `bg-success` и `bg-danger`, легенда текстом «Доходы», «Расходы»; у каждой пары `title` и `aria-label` вида «Октябрь: доходы 12 000 ₽, расходы 8 000 ₽»; таблица тех же чисел в `sr-only`; контейнер `overflow-x-auto`.
- Сумма в ленте и в «Итог»: знак «+» или «−» в тексте и класс `text-success` или `text-danger`.
- `data-testid`: `finance-income`, `finance-expense`, `finance-net` на плитках, `finance-feed` на ленте.
- Навигация: пункт «Финансы» в группе «Учёт» после «Отчёты», иконка `@lucide/svelte/icons/banknote-arrow-up`, подсказка «Доходы, расходы и итог за период»; флаг в layout `finance: PolicyService.can(actor, 'finance.manage')`.
- `crm-surface.ts`: `{ prefix: '/crm/finance', readers: OWNER }` и `QUERIES['/crm/finance/export.xlsx'] = RANGE`.

- [ ] **Step 1: Написать падающие тесты**

`tests/unit/crm-nav.spec.ts`: `NONE` получает `finance: false`; новый тест: группа «Учёт» при `{ stock, payroll, reports, finance: true }` даёт `['Склад', 'Выплаты', 'Отчёты', 'Финансы']`, без `finance` пункта нет.

`tests/e2e/crm-finance.e2e.ts`:

- `owner records, edits and deletes an expense`: вход руководителем, `/crm/finance`, запомнить текст `finance-expense`, внести расход 1 234 ₽ с уникальным комментарием, тост «Операция добавлена», строка с комментарием в `finance-feed`, плитка выросла на 1 234 ₽ (сравнение с запомненным); «Изменить» на 2 000 ₽, строка показывает «−2 000»; «Удалить», подтвердить, строки нет, плитка вернулась к исходной.
- `a payment mark shows up as income`: вставить `payment_marks` на последнюю не черновую заявку e2e-базы суммой 777 ₽ и датой сейчас через `e2eDb()`, открыть страницу, лента содержит «Заявка №{number}» с «+777», плитка «Доходы» выросла на 777 ₽; в `finally` удалить вставленную строку.
- `the administrator gets 403`: вход `manager`, `page.goto('/crm/finance')` отвечает 403; `request.get('/crm/finance/export.xlsx?from=...&to=...')` отвечает 403; POST на `?/create` отвечает 403; тело ответа не содержит `1234` и `signedMinor`.

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `pnpm vitest run tests/unit/crm-nav.spec.ts`
Expected: FAIL, нет флага `finance`.

- [ ] **Step 3: Реализовать роут, компоненты и навигацию**

- [ ] **Step 4: Проверить юнит, тайпчек и линт**

Run: `pnpm vitest run tests/unit/crm-nav.spec.ts && pnpm check && pnpm lint`
Expected: PASS, 0 ошибок.

- [ ] **Step 5: Проверить страницу в браузере**

Запустить dev-превью (`dev` из `.claude/launch.json`, переменные в строке запуска), войти руководителем, внести, изменить и удалить операцию, проверить ширину 375 px: нет горизонтальной прокрутки страницы, график прокручивается внутри карточки.

- [ ] **Step 6: Прогнать e2e слайса и аудит маршрутов**

Run: `lsof -ti:4173 | xargs kill; SESSION_SECRET=e2e-secret-0123456789abcdef0123456789 pnpm test:e2e tests/e2e/crm-finance.e2e.ts tests/e2e/crm-audit.e2e.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(crm)/crm/finance" "src/routes/(crm)/+layout.server.ts" src/lib/crm/finance src/lib/crm/nav.ts tests/unit/crm-nav.spec.ts tests/e2e/crm-surface.ts tests/e2e/crm-finance.e2e.ts
git commit -m "feat(crm): add the finance page for the owner"
```

---

### Task 7: Демо-данные и инструкция руководителя

**Files:**

- Modify: `scripts/seed/demo-scenarios.ts` (`DEMO_PEOPLE.owner = 'owner@workshop.example'`), `scripts/seed/demo.ts`
- Create: `scripts/seed/demo-finance.ts`
- Modify: `docs/guides/owner.md`

**Interfaces:**

- Consumes: `FinanceEntryService` (Task 3).
- Produces: `seedDemoFinance(owner: ActorContext, today: string): number` (число записанных операций).

Демо-набор: расходы «Аренда цеха» 45 000 ₽ первого числа месяца, «Доски, сосна» 18 500 ₽ пять дней назад, «Бензин на доставку» 3 200 ₽ вчера; доход «Продажа обрезков» 2 000 ₽ два дня назад. Даты не раньше начала месяца и не позже сегодняшнего. `seedDemo` зовёт его после сценариев, повторный прогон ничего не пишет, потому что `alreadySeeded` уже отсекает весь демо-сид.

- [ ] **Step 1: Реализовать `demo-finance.ts` и вызов**
- [ ] **Step 2: Проверить на чистой базе**

Run: `rm -f /tmp/finance-demo.db && DATABASE_PATH=/tmp/finance-demo.db pnpm db:migrate && DATABASE_PATH=/tmp/finance-demo.db pnpm seed && DATABASE_PATH=/tmp/finance-demo.db pnpm seed:demo && DATABASE_PATH=/tmp/finance-demo.db pnpm seed:demo`
Expected: оба прогона без ошибок, в `finance_entries` четыре строки. Имя переменной пути к базе взять из `src/lib/server/config.ts`.

- [ ] **Step 3: Раздел «Финансы» в `docs/guides/owner.md`**: что попадает в ленту само, как внести, исправить и удалить операцию, где исправлять автоматическую операцию. Правила stop-slop, без em-dash.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed docs/guides/owner.md
git commit -m "chore(crm): seed demo finance entries and document the page"
```

---

### Task 8: Полный гейт

- [ ] **Step 1: Гейт**

Run по очереди: `pnpm lint`, `pnpm check`, `pnpm test:unit`, затем `lsof -ti:4173 | xargs kill; SESSION_SECRET=... pnpm test:e2e`, затем `SESSION_SECRET=... pnpm build`.
Expected: все пять зелёные. Падение чинится в задаче, которой принадлежит код, отдельным коммитом `fix(crm): ...`.

- [ ] **Step 2: Миграция на чистой базе** уже проверена в Task 7, Step 2. `pnpm db:migrate` для `data/app.db` dev-стенда прогнать отдельно.
