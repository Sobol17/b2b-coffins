# C13. Отчёты и аналитика

**Дата:** 07.10.2026
**Автор:** Sobol17
**Ядро:** `tech.md` v1.50 на входе, v1.51 на выходе
**Статус:** дизайн принят 07.10.2026, реализуется слайсом C13

## Что решаем

Руководитель получает цифры мастерской за период прямо в CRM: продажи, склад, воронку заявок, потерянные заявки и расчёты с фондом. Сегодня эти цифры собираются руками из выгрузок реестров.

Объём задан `tech.md` §14 (C13). DoD слайса: руководитель получает цифры за период без ручной выгрузки в Excel, сумма на баннере пожертвований сходится с отчётом по фонду.

Слайс идёт одним PR. Единственная часть с записью: реестр перечислений в фонд.

## Принятые решения

Решения приняты владельцем 07.10.2026, альтернативы записаны, чтобы к ним не возвращаться.

1. **Раздел отчётов видит только руководитель.** `reports.read` снимается с `manager`. Чтение обеими ролями отклонено.
2. **Продажа это доставленная заявка контрагента, дата продажи равна `requests.delivered_at`.** Та же выборка замораживает отчисление в фонд, поэтому продажи и фонд сходятся по периодам. Учёт по дате приёма и по дате оплаты отклонён.
3. **Оборачиваемость считается в штуках, в днях запаса.** Денежной оценки остатка нет: себестоимость заполняют руками и истории у неё нет.
4. **Выгрузка синхронная, топик `report.export` удаляется.** Каждый отчёт получает роут `export.xlsx`, как реестры заявок и склада. Обработчика у топика не было.
5. **Перечисление в фонд не правится и не удаляется, ошибку гасит сторно.** Перечислить больше остатка «начислено, но не перечислено» нельзя, сервер отвечает 409.
6. **Дашборд живёт на `/crm/reports` и состоит из плиток и таблиц.** Графиков нет: `layerchart` в стоп-листе §3, свой SVG-примитив в объём не входит. `/crm` не меняется.

Без вопроса к владельцу, по `tech.md` и здравому смыслу:

- отчёты считаются живыми запросами к БД, read-моделей и джобов под них нет;
- воронка считается когортой заявок, отправленных в периоде, а не срезом по датам переходов;
- себестоимость и маржа в отчёты не входят;
- отчёт «складские движения» это оборотная ведомость по позициям, журнал отдельных операций остаётся в карточке позиции из C8;
- сравнения с прошлым периодом на дашборде нет;
- отчёт по выплатам остаётся на `/crm/payroll/reports` (C10) по праву `payroll.read`, раздел отчётов на него ссылается;
- сторно перечисления хранится компенсирующей строкой с `reversal_of_id`, как у `payment_marks` и `stock_moves`. В обсуждении звучали три колонки `reversed_*`; одна колонка повторяет принятый в схеме приём, а автор, дата и комментарий сторно ложатся в существующие поля строки.

## Изменения контракта (v1.51)

### Права (§12, `policy.ts`)

- `ACTIONS` получает `charity.manage`: запись и сторно перечисления в фонд.
- `manager` теряет `reports.read`. `owner` получает оба действия по общему правилу «всё, кроме портальных».

### Схема (§5.9)

```ts
export const charityTransfers = sqliteTable('charity_transfers', {
	id: pk(),
	amountMinor: money('amount_minor'), // negative on a reversal row
	transferredAt: ts('transferred_at').notNull(),
	documentRef: text('document_ref'),
	comment: text('comment'),
	// Set on a row that cancels an earlier transfer; the original is never edited.
	reversalOfId: integer('reversal_of_id'),
	createdById: integer('created_by_id')
		.notNull()
		.references(() => users.id),
	createdAt: createdAt()
});
```

Перечислено всего равно сумме `amount_minor` по всем строкам. Строка сторно несёт сумму оригинала с минусом и его `transferred_at`, поэтому оригинал и сторно гасят друг друга в любом периоде. Миграция генерируется командой `pnpm db:generate`.

### Очередь (§7.2, §8)

`report.export` уходит из таблицы топиков и из `JOB_TOPICS`.

### Типы (`lib/types/crm-reports.ts`)

```ts
export const REPORT_MAX_DAYS = 366;
export const REPORT_PRESETS = ['week', 'month', 'quarter', 'year'] as const;
export const SALES_GROUPS = ['counterparty', 'model', 'period'] as const;
export const SALES_BUCKETS = ['day', 'week', 'month'] as const;
export const LOST_STATUSES = ['cancelled', 'rejected'] as const;
export const FUNNEL_STAGES = ['new', 'in_work', 'ready', 'delivered', 'paid'] as const;
export const CHARITY_TRANSFER_MAX_MINOR = 10_000_000_000; // 100 000 000 roubles
export type SalesGroup = (typeof SALES_GROUPS)[number];
export type SalesBucket = (typeof SALES_BUCKETS)[number];
export type LostStatus = (typeof LOST_STATUSES)[number];
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface ReportRangeDto {
	from: string;
	to: string;
} // 'YYYY-MM-DD' in org.timezone, both inclusive

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
```

### Схемы входа (`lib/validation/crm-reports.ts`)

- `reportRangeSchema`: `from` и `to` датами `YYYY-MM-DD`, `from <= to`, длина не больше `REPORT_MAX_DAYS`.
- `salesReportSchema`: период, `group`, `bucket` (по умолчанию `month`), необязательный `counterpartyId`.
- `stockTurnoverSchema`: период и необязательный `kind`.
- `lostReportSchema`: период и необязательный `status`; пагинацию реестра разбирает `parseListQuery`.
- Отчёт по фонду берёт `reportRangeSchema`, пагинацию реестра перечислений разбирает `parseListQuery`. Отдельной схемы у него нет.
- `charityTransferSchema`: `amountMinor` целое от 1 до `CHARITY_TRANSFER_MAX_MINOR`, `transferredOn` датой не позже сегодняшнего дня в `org.timezone`, `documentRef` до 100 символов, `comment` до 500.
- `charityTransferReverseSchema`: `transferId` и обязательный `comment` от 1 до 500 символов.

Период по умолчанию: текущий календарный месяц в `org.timezone`.

### Роуты (§4.4)

| Роут                                                 | Право            | Назначение                                 |
| ---------------------------------------------------- | ---------------- | ------------------------------------------ |
| `/crm/reports`                                       | `reports.read`   | Дашборд                                    |
| `/crm/reports/sales`, `/sales/export.xlsx`           | `reports.read`   | Продажи по контрагентам, моделям, периодам |
| `/crm/reports/stock`, `/stock/export.xlsx`           | `reports.read`   | Оборотная ведомость и дни запаса           |
| `/crm/reports/funnel`, `/funnel/export.xlsx`         | `reports.read`   | Воронка заявок                             |
| `/crm/reports/lost`, `/lost/export.xlsx`             | `reports.read`   | Отменённые и отклонённые                   |
| `/crm/reports/charity`, `/charity/export.xlsx`       | `reports.read`   | Фонд: начисления, перечисления, остаток    |
| `/crm/reports/charity` actions `transfer`, `reverse` | `charity.manage` | Запись и сторно перечисления               |

Пункт «Отчёты» в навигации CRM появляется по `reports.read`. Плитка выплат на дашборде и пункт в меню раздела ведут на `/crm/payroll/reports`.

### Аудит

Действия `charity.transfer` и `charity.transfer.reverse`, сущность `charity_transfers`.

## Правила расчёта

**Период.** Границы `from` и `to` переводятся в моменты начала дня `from` и начала дня после `to` в `org.timezone`. Все отборы идут по полуоткрытому окну.

**Продажи.** В отчёт попадают заявки с `is_stock_request = false`, `delivered_at` в окне, в статусах `delivered`, `awaiting_payment`, `paid`. По контрагентам и периодам складываются `items_total_minor`, `discount_minor`, `total_minor`, `paid_minor` заявок и штуки их строк. По моделям складываются `qty` и `line_total_minor` строк; скидка действует на заявку целиком, поэтому колонка подписана «Сумма до скидки». Бакет недели начинается в понедельник, крайние бакеты обрезаются границами периода. Фильтр по контрагенту действует на все три вкладки.

**Склад.** Строка отчёта это позиция «учётная позиция, цвет». Начало равно сумме движений до окна, конец равен началу плюс движения окна. Приход это сумма положительных движений окна, расход это сумма отрицательных по модулю. Отгружено равно модулю движений `shipment` окна минус сторно этих движений, попавшие в окно. Дни запаса: `(начало + конец) / 2 * дней периода / отгружено`, округление до целого; отгружено ноль или средний остаток не положителен, значение `null` и в ячейке прочерк. В отчёт идут позиции с ненулевым началом или с движениями в окне.

**Воронка.** Когорта: заявки с `is_stock_request = false` и `submitted_at` в окне. Заявка дошла до стадии, если заполнена её метка: `submitted_at`, `accepted_at`, `ready_at`, `delivered_at`, `paid_at`. Доли считаются в базисных пунктах от предыдущей стадии и от первой. Отдельно показано, сколько заявок когорты сейчас в `cancelled` и `rejected`.

**Потерянные.** Строка `request_status_history` с `to_status` из `cancelled`, `rejected` и `created_at` в окне. Причина берётся из `reason_id`, комментарий из той же строки, сумма из `requests.total_minor`. Свод группирует по причине, заявки без причины идут строкой «Без причины». Оба перехода идут только из `new` (§6.2), поэтому колонки «из статуса» в отчёте нет.

**Фонд.** «Начислено всего» считается тем же кодом, что `charity.recount` для области `all`: `CharityRepository.frozenRows` плюс правило отбора из `lib/domain/charity/rate.ts`. «Начислено за период» это та же выборка с `delivered_at` в окне, разложенная по контрагентам. «Перечислено» это сумма `amount_minor`. Остаток равен начислено всего минус перечислено всего. Баннер перечисления не трогают.

**Перечисление.** Сервис открывает транзакцию, считает остаток и отклоняет сумму больше остатка `ConflictError`. Сторно пишет строку с минусом, `reversal_of_id` и комментарием. Сторно строки, которая сама является сторно или уже сторнирована, даёт `ConflictError`.

**Дашборд.** `sales`, `topCounterparties`, `topModels` берутся из сервиса продаж. Долг считает запрос долга из C3 без фильтра по контрагенту. Счётчики статусов считаются на текущий момент и от периода не зависят. Выплаты это `accruedTotalMinor` отчёта C10 за тот же период. Позиции ниже порога считаются правилом `stock.threshold.check`.

## Раскладка кода

```
src/lib/domain/
  report/period.ts            окно периода, бакеты, пресеты
  report/funnel.ts            доли стадий
  stock/turnover.ts           дни запаса, свёртка движений в строку ведомости
  charity/balance.ts          остаток и проверка суммы перечисления
src/lib/server/crm-reports/
  route.ts                    actor и проверка reports.read для роутов раздела
  report-base.service.ts      общий предок: право, окно периода из org.timezone
  sales-report.{repository,service}.ts
  stock-turnover.{repository,service}.ts
  funnel-report.{repository,service}.ts
  lost-report.{repository,service}.ts
  charity-report.service.ts
  charity-transfer.{repository,service}.ts
  dashboard.service.ts
  report-export.service.ts    листы XLSX всех отчётов на общем построителе выгрузок
  dto.ts
src/lib/types/crm-reports.ts
src/lib/validation/crm-reports.ts
src/routes/(crm)/crm/reports/  +layout.svelte с меню раздела и страницы из таблицы роутов
```

Роут повторяет эталон `portal/profile`: `+page.server.ts`, Zod-схема, сервис, репозиторий, аудит для записи, DTO, компонент из `lib/ui`. UI собирается из `Card`, `Tabs`, `DataTable`, `FilterBar`, `DateRangePicker`, `Select`, `PriceCell`, `Modal`, `ConfirmDialog`, `EmptyState`. Новых примитивов нет.

Некорректный период не роняет страницу: фильтр остаётся, вместо таблицы показана подсказка, как в отчёте C10.

## Тесты

Критерии приёмки и тест на каждый:

1. Руководитель видит цифры за период. Интеграционные тесты каждого сервиса на засеянной БД с ручным контрольным примером.
2. Сумма на баннере сходится с отчётом. Контрактный тест: после `charity.recount` значение `charity_totals` области `all` равно `accruedAllMinor`.
3. Отчёты закрыты от всех, кроме руководителя. Контрактный тест по списку роутов: страница, выгрузка и оба action отвечают `manager` 403. e2e: руководитель проходит дашборд, отчёт продаж, выгрузку и запись перечисления, `manager` получает 403.
4. Три вкладки продаж согласованы. Тест: `totals` одинаков на всех вкладках, сумма строк по контрагентам и по периодам равна `totals`, сумма `linesTotalMinor` по моделям равна `itemsTotalMinor`.
5. Перечисление не превышает остаток и не теряется. Интеграционные: запись, отказ сверх остатка, сторно, повторное сторно 409, сторно сторно 409, две строки аудита.
6. Заявки на склад, отменённые и отклонённые в продажи и фонд не попадают. Интеграционный тест на выборку.

Property-based (fast-check):

- `period`: бакеты покрывают период без дыр и наложений, длина окна равна числу дней;
- `turnover`: `closing = opening + income - outcome`, дни запаса не отрицательны, `null` ровно при нулевой отгрузке или неположительном среднем остатке;
- `funnel`: доли в пределах 0..10000 при невозрастающих счётчиках, `null` после пустой стадии;
- `balance`: остаток равен начислено минус сумма строк, сторно возвращает остаток к прежнему значению.

Новых джобов нет, тест идемпотентности не нужен. Путь ошибки драйвера слайс не затрагивает.

## Что не входит

Графики, сравнение периодов, себестоимость и маржа, планировщик рассылки отчётов, выгрузка через очередь, право администратора на раздел.
