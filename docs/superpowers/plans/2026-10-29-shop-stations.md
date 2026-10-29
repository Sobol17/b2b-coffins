# C19 Станции цеха: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** столяр, шлифовщик, маляр и обивщик видят заявки своей станции, берут их в работу, отмечают сделанное и передают дальше; после обивщика гробы приходят на склад, и заявка сама становится «Готов к выдаче».

**Architecture:** раздача склада остаётся живой (`allocateStock`), хранимое состояние станций живёт в двух новых таблицах `shop_tasks` (визит заявки на станцию) и `shop_jobs` (штуки строки, которые делают станции). Чистая функция `planDispatch` сравнивает раздачу с цехом, сервис `ShopDispatch` применяет её план в транзакции каждого действия, которое меняет раздачу. `in_work -> ready` становится автоматическим шагом системы, его после досылки проводит `RequestTransitionService.settleWork`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle на SQLite, Zod 4, Vitest и fast-check, Playwright, shadcn-svelte через `lib/ui`.

**Spec:** `docs/superpowers/specs/2026-10-29-shop-stations-design.md`, контракт `tech.md` v2.1: §5.12, §6.2 (инварианты 5 и 10), §7.3 «Событие цеха», §8 `crm-shop.ts`, §19, §20.4.

## Global Constraints

- Ядро `tech.md` v2.1 уже закоммичено в ветке `feat/shop-stations`; слайс его не меняет, расхождение поднимается CONTRACT GAP.
- Порядок станций `WORK_ROLES = ['carpenter','grinder','painter','upholsterer']`, исключений по моделям нет.
- `shop.work` у `carpenter`, `grinder`, `painter`, `upholsterer`, `manager`, `owner`. Роль цеха работает только со своей станцией, визит чужой станции даёт 403.
- Ответ экранов цеха не несёт ключей с `Minor`, контрагента, адреса и `deceasedName` ни для одной роли.
- `SHOP_TASK_LIMIT = 50`, `SHOP_JOB_MAX = 999`, счётчик принимает `done_qty` от 0 до `qty`, а не прибавку.
- Тексты: «Взять в работу», «Выполнено», «Нужно N шт», «Сделано N из M», «Новые», «В работе», «Со склада N», «Склад отдан заявке …»; отказ guard-а `stockLinked`: «У варианта нет складской позиции, свяжите её в каталоге»; повторное «Выполнено»: 409 «Визит уже закрыт, обновите страницу».
- Шаблон пуша: subject «Новая заявка {{number}}», body «{{station}}: {{priority}} заявка в работу»; `{{priority}}` даёт «срочная» или «обычная».
- Аудит: `shop.task.take`, `shop.job.progress`, `shop.task.complete` по сущности `shop_tasks`.
- Миграция только `pnpm db:generate`. Файл до 250 строк, функция до 40. `any` запрещён. UI только из `lib/ui`, тач-цели от 44 px (`TouchButton`).
- Комментарии в коде на английском и объясняют почему. Коммиты `type(scope): summary`, scope `crm`, `stock`, `request`, `ui`, без трейлеров и следов нейросети.
- Перед `pnpm test:e2e` и `pnpm build`: `SESSION_SECRET` в окружении, убить процесс на порту 4173, сборку не гонять параллельно с e2e. Спеки e2e начинают с `emptyCart`, склад выравнивают `stockUp`.

## Review Focus

1. Две роли цеха у одного человека: он видит обе станции, а визит третьей станции ему отвечает 403 (Task 6, Task 7).
2. Строка `qty = 3` при остатке 1: на станцию уходят ровно 2, а после прихода ещё одного гроба на полку досылка снимает одну несделанную штуку у столяра, не трогая взятые на маляре (Task 2, Task 5).
3. Срочная заявка забирает гроб у обычной в `in_work`, но не у заявки в `ready` (Task 5).
4. Двойное «Выполнено» с двух телефонов: второй получает 409, движение `production` одно (Task 7).
5. Заявка на склад при полной полке всё равно уходит на станции и становится `ready` только после обивщика (Task 5).

---

### Task 1: Раздача без заявок на склад и «кто держит позицию»

**Files:**

- Modify: `src/lib/domain/stock/allocation.ts`
- Test: `tests/domain/stock-allocation.spec.ts`

**Interfaces:**

- Produces: `FILL_TIERS = ['held','work']`; `fillTier(status, isStockRequest): FillTier | null` даёт `null` любой заявке на склад; `heldAhead(line: DemandLine, lines: readonly DemandLine[], filled: ReadonlyMap<number, number>): number[]` (id заявок выше по `fillOrder` на той же позиции с `filled > 0`, без заявки самой строки, без повторов, в порядке очереди).
- Removes: `productionNeeds`, `ProductionNeed` (их единственный потребитель уходит в Task 7).

- [ ] **Step 1: Тесты.** `fillTier('in_work', true)` и `fillTier('ready', true)` равны `null`; `fillTier('in_work', false) === 'work'`. `heldAhead`: позиция с остатком 1, срочная заявка 7 и обычная 9 на ней; для строки заявки 9 результат `[7]`, для строки 7 пустой. Property: `heldAhead` никогда не содержит `line.requestId` и каждая заявка в нём стоит раньше в `fillOrder`. Удалить тесты `productionNeeds`.
- [ ] **Step 2:** `pnpm vitest run tests/domain/stock-allocation.spec.ts` падает.
- [ ] **Step 3:** правка `allocation.ts`; поправить вызовы `fillTier` и импорты `productionNeeds` так, чтобы `pnpm check` проходил (временно `ShopService.overview` отдаёт пустую очередь, Task 7 его переписывает).
- [ ] **Step 4:** тест и `pnpm check` зелёные.
- [ ] **Step 5:** `git commit -m "feat(stock): keep stock requests out of the fill"`

### Task 2: Домен станций и досылки

**Files:**

- Create: `src/lib/domain/shop/stations.ts`, `src/lib/domain/shop/dispatch.ts`
- Test: `tests/domain/shop-stations.spec.ts`, `tests/domain/shop-dispatch.spec.ts`

**Interfaces:**

- Produces (`stations.ts`): `nextStation(station: WorkRole): WorkRole | null`; `interface StationOrderFacts { readonly id: number; readonly isUrgent: boolean; readonly deliveryAt: Date | null; readonly acceptedAt: Date | null }`; `stationOrder(a: StationOrderFacts, b: StationOrderFacts): number` (срочные, ближний срок, без срока, `acceptedAt`, `id`).
- Produces (`dispatch.ts`):

```ts
export interface DispatchLine {
	readonly itemId: number;
	readonly requestId: number;
	/** shelfWant for a counterparty line, qty minus pieces past the upholsterer for a stock line. */
	readonly wantQty: number;
	/** Pieces allocateStock gives the line now; always 0 for a stock line. */
	readonly filledQty: number;
}
export interface OpenJob {
	readonly id: number;
	readonly itemId: number;
	readonly station: WorkRole;
	readonly qty: number;
	readonly doneQty: number;
}
export type DispatchStep =
	| {
			readonly kind: 'add';
			readonly itemId: number;
			readonly requestId: number;
			readonly qty: number;
	  }
	| { readonly kind: 'shrink'; readonly jobId: number; readonly qty: number }; // the new qty, 0 removes
export function planDispatch(
	lines: readonly DispatchLine[],
	jobs: readonly OpenJob[]
): DispatchStep[];
export function isMadeByShop(
	lines: readonly { readonly qty: number; readonly madeQty: number }[]
): boolean;
```

- [ ] **Step 1: Тесты `stations`.** `nextStation('carpenter') === 'grinder'`, `nextStation('upholsterer') === null`; срочная раньше обычной с ближним сроком; без срока после любого срока.
- [ ] **Step 2: Тесты `dispatch`.** Строка `wantQty 3, filled 1`, заданий нет: один шаг `add` на 2. Та же строка с заданием столяра `qty 2`: план пуст. `filled 3` при задании столяра `qty 2, done 1`: `shrink` до 1. `filled 3` при задании маляра `qty 2`: план пуст (дальше столяра не снимаем). `isMadeByShop([])` ложно, `[{qty 2, madeQty 2}]` истинно. Property (fast-check): после применения плана к `jobs` повторный `planDispatch` пуст; ни один `shrink` не опускает `qty` ниже `doneQty`; сумма `qty` открытых заданий строки после плана не меньше `max(0, wantQty − filledQty)` минус штуки за столяром.
- [ ] **Step 3:** тесты падают.
- [ ] **Step 4:** реализация; чистый домен без импортов сервера.
- [ ] **Step 5:** тесты зелёные, покрытие `lib/domain/shop/**` не ниже 90% (`pnpm test:unit --coverage`).
- [ ] **Step 6:** `git commit -m "feat(crm): plan the shop dispatch in the domain"`

### Task 3: Схема, guard-ы и автоматический переход в `ready`

**Files:**

- Create: `src/lib/server/db/schema/shop.ts`; миграция `drizzle/00xx_*.sql` через `pnpm db:generate`
- Modify: `src/lib/server/db/schema/index.ts`, `src/lib/types/request.ts` (`GUARD_CODES` + `stockLinked`), `src/lib/domain/request/state-machine.ts`, `src/lib/domain/request/guards.ts`, `src/lib/server/request/request-transition.repository.ts` (`guardFacts`, `inWorkIds`), `src/lib/server/request/request-transition.service.ts`
- Test: `tests/domain/state-machine.spec.ts`, `tests/domain/guards.spec.ts`, `tests/domain/transition-flow.spec.ts`, `tests/unit/request-transition.spec.ts`

**Interfaces:**

- Produces: таблицы `shopTasks`, `shopJobs` ровно по §5.12; `GuardFacts.stockLinked: boolean`; `stockCovered` у заявки на склад считается `isMadeByShop` по заданиям с `finished_at`; `RequestTransitionService.settleWork(tx: Tx): number[]` (id заявок, ушедших в `ready`, без проверки видимости актора, как `settleCounterparty`).
- Consumes: `isMadeByShop` (Task 2).

- [ ] **Step 1: Тесты.** В таблице переходов `in_work -> ready` только у `system` и `auto: true`; `new -> in_work` требует `stockLinked`; ручной `move(manager, id, 'ready')` даёт 403 `role_not_allowed`; `autoFollowUp('in_work') === 'ready'`. Приём заявки, полностью покрытой складом, возвращает `status: 'ready'` одним `move`. Приём строки варианта без `stock_item_id` даёт 409 с текстом «У варианта нет складской позиции, свяжите её в каталоге».
- [ ] **Step 2:** тесты падают.
- [ ] **Step 3:** схема, `pnpm db:generate` (новые таблицы, без пересборки, TTY не нужен), прогон `pnpm db:migrate` на чистой БД.
- [ ] **Step 4:** guard-ы, таблица переходов, `GUARD_REFUSAL.stockLinked`, `settleWork`.
- [ ] **Step 5:** перевести юнит-хелперы на автоматическую готовность: `tests/unit/helpers/crm-delivery.ts` (`assembled` приходует штуки через `StockMoveService.create(..., { type: 'purchase', ... })` до приёма), `tests/unit/helpers/charity.ts` (`drive` делает `stockUp` до `in_work`); убрать ручные `move(..., 'ready')` в `crm-request-card`, `crm-request-steer`, `request-card`, `request-transition`, `crm-shop` спеках. Отказ `stockCovered` на ручном переходе больше не проверяется: проверяется, что непокрытая заявка остаётся `in_work`.
- [ ] **Step 6:** `pnpm check` и `pnpm test:unit` зелёные.
- [ ] **Step 7:** `git commit -m "feat(request): ready requests automatically once covered"`

### Task 4: Событие `shop.task_arrived`

**Files:**

- Create: `src/lib/server/notifications/shop-facts.repository.ts`
- Modify: `src/lib/types/events.ts`, `src/lib/domain/notification/template.ts`, `src/lib/domain/notification/link.ts`, `src/lib/notifications/labels.ts`, `src/lib/crm/notifications/feed-href.ts`, `src/lib/server/queue/handlers/notification-fanout.ts`, `src/lib/server/notifications/push-message.service.ts`, `src/lib/server/notifications/notification-feed.repository.ts`, `src/lib/server/notifications/dto.ts`, `scripts/fixtures/notification-rules.json`, `scripts/fixtures/notification-templates.json`
- Test: `tests/unit/push-fanout.spec.ts`, `tests/unit/push-message.spec.ts`, `tests/unit/notification-feed.spec.ts`, `tests/domain/notification-link.spec.ts`, `tests/domain/notification-template.spec.ts`, `tests/unit/notifications-sync.spec.ts`

**Interfaces:**

- Produces: `EVENT_KEYS` + `'shop.task_arrived'`, `SHOP_EVENT_KEYS`; `ShopFactsRepository.occurrence(taskId: number, tx?: Tx): { taskId: number; station: WorkRole; requestNumber: string; priority: RequestPriority } | undefined`; переменные `['number','station','priority','url']`; `eventPath('shop.task_arrived', taskId, …) === '/crm/shop/' + taskId`; `EVENT_LABEL['shop.task_arrived'] = { title: 'Новая заявка на станции', hint: 'Заявка пришла в работу на вашу станцию' }`.
- Rules: адресаты fanout это люди `crmPeople` с ролью станции визита, роли к событию `[station]`; правила `push` в фикстуре для четырёх ролей цеха; шаблон из Global Constraints.

- [ ] **Step 1: Тесты.** Визит столяра: строку колокольчика получают столяр и не получают шлифовщик, администратор и водитель. Повтор fanout оставляет одну строку на человека. Пуш столяру: title «Новая заявка З-…», body «Столяр: срочная заявка в работу» для срочной, url `/crm/shop/{taskId}`. Строка ленты отдаёт `requestNumber` заявки визита, `entityId` визита, `requestId: null`, и `crmFeedHref` ведёт на `/crm/shop/{id}`. `notifications:sync` добавляет четыре правила и шаблон.
- [ ] **Step 2:** тесты падают.
- [ ] **Step 3:** реализация по Interfaces.
- [ ] **Step 4:** тесты, `pnpm check`, `pnpm seed` на чистой БД зелёные.
- [ ] **Step 5:** `git commit -m "feat(crm): tell a station about a new visit"`

### Task 5: Досылка в сервисах

**Files:**

- Create: `src/lib/server/crm-shop/shop-job.repository.ts`, `src/lib/server/crm-shop/shop-arrivals.ts`, `src/lib/server/crm-shop/shop-dispatch.ts`, `src/lib/server/crm-shop/shop-flow.ts`
- Modify: `request-transition.service.ts` (досылка на приёме), `crm-request-priority.service.ts` (`setPriority`), `crm-request-items.service.ts` (`addLine`, `setQty`, `removeLine`), `crm-stock/stock-move.service.ts` (`create`, `reverse`), `crm-stock/inventory.service.ts` (`apply`), `crm-delivery/delivery.service.ts` (`load`, `unload`)
- Test: `tests/unit/shop-dispatch.spec.ts`

**Interfaces:**

- Produces: `class ShopArrivals { arrive(input: { requestId: number; itemId: number; station: WorkRole; qty: number }, tx: Tx): { taskId: number; opened: boolean } }`: кладёт штуки в открытый визит или создаёт его и публикует `EventBus.emit('shop.task_arrived', taskId, tx)`; задание строки в визите одно, штуки прибавляются.
- Produces: `class ShopDispatch { run(tx: Tx): { added: number; shrunk: number; openedTaskIds: number[] } }`: читает `StockFill.read(tx)`, линии заявок на склад в `in_work` и открытые задания из `ShopJobRepository`, применяет `planDispatch`, закрывает опустевшие визиты (`completed_at = now`, `completed_by_id = null`).
- Produces: `ShopFlow.afterChange(ctx: ActorContext, tx: Tx): void` = `new ShopDispatch().run(tx)` и `new RequestTransitionService(ctx).settleWork(tx)`.
- Consumes: `planDispatch` (Task 2), `settleWork` (Task 3), ключ `shop.task_arrived` (Task 4).

- [ ] **Step 1: Тесты** (на временной БД из `tests/unit/helpers/db.ts`). Приём заявки на 2 штуки при пустой полке создаёт визит столяра с заданием `qty 2` и одну строку `shop.task_arrived` в очереди. Повторный `ShopDispatch.run` ничего не пишет. Полка с 1 штукой: задание на 1. Срочная заявка, принятая позже, забирает штуку у обычной: у обычной задание столяра выросло на 1. Обычная заявка в `ready` штуку не отдаёт. Заявка на склад при полной полке получает задания на все штуки и остаётся `in_work`. Приход на полку (`StockMoveService.create` `purchase`) покрывает обычную заявку: она в `ready`, несделанное задание столяра снято, визит закрыт без `completed_by_id`. Удаление строки правкой состава снимает её задания каскадом.
- [ ] **Step 2:** тесты падают.
- [ ] **Step 3:** репозиторий, `ShopArrivals`, `ShopDispatch`, `ShopFlow`; вызовы в сервисах ставятся после записи движения или правки, внутри той же транзакции, один раз на действие. На приёме `RequestTransitionService.run` зовёт только `ShopDispatch.run` перед `chainAutoSteps` (без цикла импортов: `ShopDispatch` не импортирует `RequestTransitionService`).
- [ ] **Step 4:** тесты и весь `pnpm test:unit` зелёные.
- [ ] **Step 5:** `git commit -m "feat(crm): dispatch missing pieces to the shop"`

### Task 6: Право `shop.work` и навигация

**Files:**

- Modify: `src/lib/server/auth/policy.ts`, `src/routes/(crm)/+layout.server.ts`, `src/lib/crm/nav.ts`, `tests/e2e/crm-surface.ts`
- Test: `tests/unit/policy.spec.ts`, `tests/unit/crm-nav.spec.ts`

**Interfaces:**

- Produces: действие `'shop.work'` в `ACTIONS` и в `SHOP_GRANTS`, у `manager`; `PolicyService.stationsOf(actor: Pick<ActorContext, 'roles'>): WorkRole[]` (роли цеха актора в порядке `WORK_ROLES`, у `owner` и `manager` все четыре); флаг `can.shop = PolicyService.can(actor, 'shop.work')`; подсказка плитки «Цех»: «Заявки на станциях и отметка сделанного».
- `crm-surface.ts`: `/crm/shop` читают `[...ADMINS, ...SHOP]`; `/crm/shop/[id]` берёт id последнего открытого визита столяра, читают `[...ADMINS, 'carpenter']`; правило задаётся отдельной строкой раньше `/crm/shop`.

- [ ] **Step 1: Тесты.** `can(carpenter, 'shop.work')`, `can(driver, 'shop.work') === false`; `stationsOf({ roles: ['grinder','painter'] })` равно `['grinder','painter']`, `stationsOf(manager)` четыре станции; у столяра первым пунктом `crmNav` идёт «Цех».
- [ ] **Step 2:** падают. **Step 3:** реализация. **Step 4:** зелёные.
- [ ] **Step 5:** `git commit -m "feat(auth): open the shop to the station roles"`

### Task 7: Сервис станций

**Files:**

- Rewrite: `src/lib/types/crm-shop.ts` (ровно §8 v2.1), `src/lib/validation/crm-shop.ts`, `src/lib/server/crm-shop/shop.service.ts`, `src/lib/server/crm-shop/shop.repository.ts`, `src/lib/server/crm-shop/dto.ts`
- Create: `src/lib/server/crm-shop/shop-task.service.ts` (действия визита, чтобы оба файла уложились в 250 строк)
- Test: `tests/unit/crm-shop.spec.ts` (переписать)

**Interfaces:**

- Produces: `ShopService.overview(query: { search?: string; station?: WorkRole }): ShopDto`, `ShopService.task(id: number): ShopTaskDto`; `ShopTaskService.take(taskId: number): void`, `.progress(input: ShopProgressInput): void`, `.complete(taskId: number): void`. Оба конструктора проверяют контур `crm` и `shop.work`, визит вне `stationsOf` даёт `ForbiddenError`, неизвестный `NotFoundError`.
- Validation: `shopTaskSchema = z.object({ taskId: id })`, `shopProgressSchema = z.object({ jobId: id, doneQty: z.coerce.number().int().min(0).max(SHOP_JOB_MAX) })`, `shopStationSchema = z.enum(WORK_ROLES).optional().catch(undefined)`, `shopSearchSchema` прежний.
- `complete`: визит открыт и у каждого задания `doneQty === qty`, иначе 409; закрывает визит; для каждого задания `nextStation` даёт станцию и `ShopArrivals.arrive` переносит штуки (задание переезжает, `done_qty = 0`); на обивщике пишет движение `production` (`stockItemId`, `optionId` строки, `+qty`, без `request_id` и `request_item_id`), ставит `finished_at`, `production_move_id`, затем `ShopFlow.afterChange`. Аудит по Global Constraints.
- Consumes: `ShopArrivals` (Task 5), `ShopFlow` (Task 5), `stationOrder`, `nextStation` (Task 2), `stationsOf` (Task 6).

- [ ] **Step 1: Тесты.** Столяр видит визит в `fresh`, после `take` в `taken`; повторный `take` ничего не пишет. `progress` с `doneQty 4` при `qty 3` даёт 422. `complete` при неполном счётчике 409; после полного визит закрыт, у шлифовщика открыт визит с тем же заданием и `doneQty 0`. Прогон до обивщика: движение `production` на `qty`, заявка в `ready`. Двойной `complete` даёт 409 и одно движение. Шлифовщик на визит столяра получает 403. Тело `overview` и `task` для столяра не содержит `Minor`, `counterparty`, `deceasedName`, `address` (`JSON.stringify` и поиск подстрок). Порядок `fresh`: срочная раньше обычной.
- [ ] **Step 2:** падают. **Step 3:** реализация. **Step 4:** зелёные, файлы до 250 строк.
- [ ] **Step 5:** `git commit -m "feat(crm): work a request through the stations"`

### Task 8: Экраны цеха

**Files:**

- Rewrite: `src/routes/(crm)/crm/shop/+page.server.ts`, `src/routes/(crm)/crm/shop/+page.svelte`
- Create: `src/routes/(crm)/crm/shop/[id]/+page.server.ts`, `src/routes/(crm)/crm/shop/[id]/+page.svelte`, `src/lib/crm/shop/StationTasks.svelte`, `src/lib/crm/shop/JobRow.svelte`
- Delete: `src/lib/crm/shop/ProductionQueue.svelte`, `src/lib/crm/shop/RequestFill.svelte`
- Modify: `src/lib/crm/shop/labels.ts` (+ `stationTitle(station: WorkRole): string` из `ROLE_TITLE`)

**Interfaces:**

- `/crm/shop` load: `{ search, station, shop: ShopDto }`; у `owner` и `manager` переключатель станции (`?station=`), у роли цеха её станции подряд. Каждая станция: «Новые», «В работе», ссылки на `/crm/shop/[id]`, поиск по номеру.
- `/crm/shop/[id]`: load `task`; actions `take`, `progress`, `complete`; каждое сначала `requireScope(..., 'crm')` и `requireAction(actor, 'shop.work')`, затем разбор формы (§12). Строка с `qty 1` рисуется `Checkbox` (форма шлёт `doneQty` 0 или 1), иначе «Нужно N шт» и `NumberInput` с «Сделано N из M». Кнопки `TouchButton`; «Выполнено» неактивна без `canComplete`. Исход action через `withToast`.

- [ ] **Step 1:** роуты и компоненты, `InstallPrompt` и `PushBanner` остаются на `/crm/shop`.
- [ ] **Step 2:** `pnpm check`, `pnpm lint` зелёные; dev-сервер (`dev` из `.claude/launch.json`): столяр видит визит, отмечает и закрывает его, на ширине 375 px нет горизонтальной прокрутки.
- [ ] **Step 3:** `git commit -m "feat(crm): add the station screens"`

### Task 9: Доска и карточка заявки

**Files:**

- Create: `src/lib/server/crm-shop/shop-lines.ts` (`ShopLineReader`)
- Modify: `src/lib/types/crm-request.ts` (`stations`, `shop` по §8), `src/lib/server/crm-request/crm-request-list.service.ts` или `dto.ts`, `src/lib/server/crm-request/crm-request-card.service.ts`, `src/routes/(crm)/crm/board/+page.svelte` (метки станций в `tags`), `src/lib/crm/requests/ItemsPanel.svelte`
- Test: `tests/unit/crm-request-card.spec.ts`, `tests/unit/crm-request-list.spec.ts`

**Interfaces:**

- Produces: `ShopLineReader.forRequest(requestId: number, tx?: Tx): CrmLineShopDto[]` (пусто вне `in_work`; `heldBy` номера заявок из `heldAhead`); `ShopJobRepository.stationsByRequest(requestIds: readonly number[], tx?: Tx): Map<number, WorkRole[]>`.
- UI: у строки карточки «Со склада N», станции «Маляр: сделано 2 из 3», «Сделано цехом N», «Склад отдан заявке З-…».

- [ ] **Step 1: Тесты.** Карточка заявки с строкой 3 шт при остатке 1: `fromStockQty 1`, `stations [{ station: 'carpenter', qty: 2, doneQty: 0 }]`. Строка, у которой срочная забрала гроб, несёт номер срочной в `heldBy`. Реестр отдаёт `stations: ['carpenter']`.
- [ ] **Step 2:** падают. **Step 3:** реализация. **Step 4:** зелёные.
- [ ] **Step 5:** `git commit -m "feat(crm): show the stations on the board and the card"`

### Task 10: `shop:sync` и демо-данные

**Files:**

- Create: `scripts/admin/shop.ts`
- Modify: `scripts/admin.ts` (команда и `USAGE`), `scripts/seed/demo.ts`
- Test: `tests/unit/shop-sync.spec.ts`, `tests/unit/seed-demo.spec.ts`

**Interfaces:**

- `shopSync(db: Db): void`: актор это первый активный `owner` через `actorContext` из `scripts/admin/request.ts`; одна транзакция `ShopFlow.afterChange`; печатает «Отправлено в цех: N штук, заявок готово: M». Повторный запуск печатает нули.
- Демо: сценарии `ready` и дальше приходуют штуки покупкой (`StockMoveService.create`, `purchase`) до приёма; сценарии `in_work` остаются на станциях, один из них проходит столяра от имени учётки столяра сида и ждёт шлифовщика. `ShopService.produce` из демо уходит.

- [ ] **Step 1: Тесты.** Заявка в `in_work` без заданий получает их одним `shopSync`, второй прогон ничего не пишет. `seed:demo` на чистой БД даёт хотя бы один открытый визит шлифовщика и заявки во всех прежних статусах.
- [ ] **Step 2:** падают. **Step 3:** реализация. **Step 4:** зелёные.
- [ ] **Step 5:** `git commit -m "feat(crm): sync the shop from the cli and the demo"`

### Task 11: E2E

**Files:**

- Modify: `tests/e2e/transitions.ts` (`stockUp` считает спрос и самой заявки, даже если она ещё в `new`; новый хелпер `acceptReady(db, number): void` = `stockUp` + `transition(number, 'in_work', 'manager')` с проверкой статуса `ready`), все спеки с `transition(number, 'ready', 'manager')`: `charity`, `crm-push`, `crm-delivery`, `crm-notifications`, `crm-payments`, `crm-reports`, `notifications`, `notification-feed`, `request-transitions`; `crm-requests.e2e.ts` и `acceptance.e2e.ts` (шаг цеха идёт через станции); `tests/e2e/global-setup.ts` (комментарий о раздаче)
- Rewrite: `tests/e2e/crm-shop.e2e.ts`

- [ ] **Step 1: `crm-shop.e2e.ts` по DoD C19.** Администратор принимает заявку без склада; столяр в мобильном вьюпорте видит её в «Новых», берёт, отмечает, жмёт «Выполнено»; то же шлифовщик, маляр, обивщик; заявка в `ready` и видна водителю на `/crm/delivery`. Срочная заявка забирает гроб у обычной: у обычной появляется визит столяра. Шлифовщик на `/crm/shop/{визит столяра}` получает 403, водитель на `/crm/shop` 403. Тело ответа визита для столяра без `Minor`.
- [ ] **Step 2:** перевести остальные спеки на `acceptReady`, `acceptance.e2e.ts` ведёт заявку через четыре станции учётками цеха.
- [ ] **Step 3:** `pnpm test:e2e` зелёный целиком (порт 4173 свободен, `SESSION_SECRET` задан).
- [ ] **Step 4:** `git commit -m "test(crm): walk a request through the stations end to end"`

### Task 12: Инструкции и гейт

**Files:**

- Modify: `docs/guides/shop-crew.md` (работа станции с телефона), `docs/guides/manager.md` (обзор станций, автоматическая готовность, приход помимо станций), `docs/guides/README.md` при необходимости

- [ ] **Step 1:** тексты по `stop-slop`, без em-dash.
- [ ] **Step 2:** гейт: `pnpm lint`, `pnpm check`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm build`, миграции на чистой БД (`pnpm db:migrate` на новом файле, затем `pnpm seed`).
- [ ] **Step 3:** `git commit -m "docs(crm): guide the crew through the stations"`
