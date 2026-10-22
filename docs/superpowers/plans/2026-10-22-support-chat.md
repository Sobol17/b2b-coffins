# C17. Обращения контрагентов: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** контрагент заводит обращение из личного кабинета, мастерская отвечает из CRM, обе стороны получают пуш и строку колокольчика, закрытое обращение не принимает сообщений.

**Architecture:** две новые таблицы `support_threads` и `support_messages`, один сервис чтения и один сервис записи на оба контура, ветвление по `ActorContext.scope`. Уведомления идут существующим путём: `bus.emit` → `notification.fanout` → `notification.dispatch`, адресатов обращения выбирает чистая функция `supportRecipients`. Экраны собраны из примитивов `lib/ui`, общие компоненты переписки лежат в `lib/support/`.

**Tech Stack:** SvelteKit 2, Svelte 5 (руны), Drizzle ORM на SQLite, Zod, Vitest, fast-check, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-support-chat-design.md`

## Global Constraints

- Ветка `feat/support-chat` от `main`, один PR на весь слайс, коммиты маленькими шагами, каждый проходит `pnpm check`.
- Коммиты: `type(scope): summary`, английский, императив, до 50 символов. Scope: `portal`, `crm`, `queue` или `ui`. Без трейлеров соавторов, без `Generated with`, без эмодзи.
- Версия ядра в `tech.md` v1.57. Если к мёрджу v1.57 занята, слайс берёт следующий номер.
- TypeScript strict, `any` запрещён. Файл до 250 строк, функция до 40.
- Сервисы наследуют `BaseService`, репозитории `BaseRepository`. Роут тонкий: право проверяется до разбора формы (`requireScope` + `requireAction`), затем Zod, затем сервис.
- Миграция только `pnpm db:generate`, файлы в `drizzle/` руками не правятся.
- Тексты интерфейса по `stop-slop`: без em-dash, без эмодзи. Плейсхолдеры короткие: «Введите тему», «Введите сообщение», «Выберите заявку».
- Комментарии в коде на английском и объясняют «почему».
- Лимиты из дизайна: тема 3..120 символов после `trim`, сообщение 1..4000, `excerpt` до 100, частота `support.post` 30 за 600 секунд с блокировкой 900 секунд.
- Цены в DTO обращений не уходят никому: заявка в обращении это номер и статус.
- Брак, рекламации и вложения не заводим.

## Review Focus

1. **Сотрудник подделывает `requestId` заявки коллеги или чужого контрагента.** Сервер отвечает 404, ветка не создаётся. Тест в Task 5.
2. **Двойная отправка формы ответа или закрытия.** Второе закрытие успешно и ничего не пишет; два одинаковых сообщения подряд оба сохраняются (это не идемпотентный эндпоинт), но каждое даёт ровно один разворот. Тест в Task 5 и Task 6.
3. **Сообщение из одних пробелов или переводов строк.** Zod отклоняет его как пустое, ветка не трогается. Тест в Task 3.
4. **Автор обращения отключён после открытия.** Администратор контрагента читает, отвечает и закрывает его ветку; fanout не адресует отключённого. Тест в Task 5 и Task 6.
5. **Пуш по событию обращения уходит человеку, который потерял доступ к ветке** (сотрудник другого контрагента, водитель). Адресаты не выходят за фильтр, водитель не получает ни ленты, ни пуша. Тест в Task 6.

---

### Task 1: Контракт в `tech.md` v1.57

**Files:**

- Modify: `tech.md` (шапка, Changelog, §5.10 новый, §7.3, §8, §12, §14, §18.5)

**Interfaces:**

- Produces: текст контракта, на который ссылаются все задачи ниже.

- [ ] **Step 1: Перенести контракт из дизайна в `tech.md`**

Шапка: `**Версия ядра:** v1.57`, статус упоминает C17. Строка Changelog v1.57 одним абзацем по образцу v1.56: таблицы, права `support.own` и `support.any`, три события, правило адресатов с исключением автора действия, переменные шаблонов, `notifications:sync`, замена переписки P6, новые DTO. Разделы заполняются дословно из раздела дизайна «Изменения контракта (v1.57)» и «Что меняется в `tech.md`». §14: слайс C17 перед C16 с DoD из дизайна.

- [ ] **Step 2: Проверить форматирование**

Run: `pnpm exec prettier --check tech.md`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 3: Commit**

```bash
git add tech.md
git commit -m "docs(portal): record support chat contract in v1.57"
```

---

### Task 2: Типы и чистая логика обращений

**Files:**

- Create: `src/lib/types/support.ts`
- Create: `src/lib/domain/support/recipients.ts`, `src/lib/domain/support/awaiting.ts`, `src/lib/domain/support/excerpt.ts`
- Test: `tests/domain/support-recipients.spec.ts`, `tests/domain/support-awaiting.spec.ts`, `tests/domain/support-excerpt.spec.ts`

**Interfaces:**

- Produces (`lib/types/support.ts`): `SUPPORT_THREAD_STATUSES`, `SUPPORT_SIDES`, `SupportThreadStatus`, `SupportSide`, `SUPPORT_SUBJECT_MIN = 3`, `SUPPORT_SUBJECT_MAX = 120`, `SUPPORT_BODY_MAX = 4000`, `SUPPORT_EXCERPT_MAX = 100`, DTO `SupportThreadListItemDto`, `SupportMessageDto`, `SupportThreadDto`, `SupportThreadFilters`, `SupportRequestOptionDto` дословно из дизайна.
- Produces (domain):
  - `interface SupportCandidate { readonly userId: number; readonly side: SupportSide; readonly roles: readonly RoleCode[] }`
  - `interface SupportAct { readonly actorId: number; readonly actorSide: SupportSide; readonly threadAuthorId: number }`
  - `supportRecipients<C extends SupportCandidate>(act: SupportAct, candidates: readonly C[]): C[]`
  - `awaitingSide(status: SupportThreadStatus, lastMessageSide: SupportSide): SupportSide | null`
  - `excerpt(text: string, max?: number): string`

- [ ] **Step 1: Написать падающие тесты**

`support-recipients.spec.ts`, property-based на fast-check с генератором кандидатов обеих сторон и ролями из `ROLE_CODES`:

```ts
it('never addresses the actor', () => fc.assert(fc.property(actArb, candidatesArb, (act, cs) =>
  supportRecipients(act, cs).every((c) => c.userId !== act.actorId))));
it('keeps a workshop act inside the portal', ...) // actorSide 'crm' -> every recipient.side === 'portal'
it('sends a portal act to the workshop, plus the thread author when somebody else acted', ...)
  // every recipient on the portal side has userId === act.threadAuthorId
it('reaches every cp_admin and the thread author on a workshop act', ...)
  // portal candidate with 'cp_admin' or userId === threadAuthorId (and not actor) is in the result
it('leaves a cp_employee who is not the author out', ...)
```

`support-awaiting.spec.ts`: `awaitingSide('closed', s)` равно `null` для обеих сторон; `awaitingSide('open', 'portal')` равно `'crm'`, `awaitingSide('open', 'crm')` равно `'portal'`.

`support-excerpt.spec.ts`, property-based на `fc.string()`:

```ts
const normalized = (s: string) => s.replace(/\s+/g, ' ').trim();
it('fits the limit', ...)            // excerpt(s).length <= SUPPORT_EXCERPT_MAX
it('is the start of the text', ...)  // normalized(s).startsWith(excerpt(s).replace(/…$/, ''))
it('keeps a short text whole', ...)  // normalized(s).length <= 100 -> excerpt(s) === normalized(s)
it('cuts at a word', () => expect(excerpt('слово '.repeat(40))).toMatch(/слово…$/));
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm test:unit tests/domain/support-`
Expected: FAIL, модули не найдены.

- [ ] **Step 3: Реализовать типы и три функции**

Правило `supportRecipients` из дизайна: автор действия исключается всегда; кандидат своей стороны проходит, только если он автор обращения; кандидат мастерской на действие портала проходит весь (роли отсекает матрица правил); кандидат портала на действие мастерской проходит, если у него `cp_admin` или он автор обращения. `excerpt`: пробелы схлопываются, длиннее `max` режется до `max - 1` по последнему пробелу во второй половине и получает `…`.

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm test:unit tests/domain/support-`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/support.ts src/lib/domain/support tests/domain/support-*.spec.ts
git commit -m "feat(portal): add support thread types and rules"
```

---

### Task 3: Схема, миграция, валидация, права

**Files:**

- Create: `src/lib/server/db/schema/support.ts`
- Modify: `src/lib/server/db/schema/index.ts` (экспорт)
- Create: `drizzle/0018_*.sql` и снимок `drizzle/meta` через генератор
- Create: `src/lib/validation/support.ts`
- Modify: `src/lib/server/auth/policy.ts`, `src/lib/server/auth/rate-limit.ts`, `src/lib/crm/labels.ts`
- Test: `tests/unit/policy.spec.ts`, `tests/unit/support-validation.spec.ts`

**Interfaces:**

- Consumes: константы Task 2.
- Produces: таблицы `supportThreads`, `supportMessages` дословно из дизайна; `supportOpenSchema` (`subject`, `body`, `requestId?: number`), `supportPostSchema` (`body`), `supportThreadIdSchema`, `supportFiltersSchema`; типы `SupportOpenInput`, `SupportPostInput`; действия `support.own`, `support.any`; ограничение `support.post`.

- [ ] **Step 1: Написать падающие тесты**

`policy.spec.ts` получает кейсы: `can(cp_admin|cp_employee, 'support.own')` истинно, `support.any` ложно; `can(manager|owner, 'support.any')` истинно, `can(owner, 'support.own')` ложно; `driver`, `carpenter`, `painter` не держат ни одного из двух.

`support-validation.spec.ts`:

```ts
expect(supportPostSchema.safeParse({ body: '  \n\t ' }).success).toBe(false);
expect(supportPostSchema.safeParse({ body: 'x'.repeat(4001) }).success).toBe(false);
expect(supportOpenSchema.parse({ subject: '  Сроки  ', body: 'Когда?', requestId: '' })).toEqual({
	subject: 'Сроки',
	body: 'Когда?'
});
expect(
	supportOpenSchema.parse({ subject: 'Сроки', body: 'Когда?', requestId: '17' }).requestId
).toBe(17);
expect(supportOpenSchema.safeParse({ subject: 'ab', body: 'x' }).success).toBe(false);
expect(supportFiltersSchema.parse({ status: 'nope' })).toEqual({});
```

Сообщения ошибок: «Тема от 3 до 120 символов», «Напишите сообщение», «Сообщение длиннее 4000 символов». Неизвестный фильтр отбрасывается, а не роняет страницу (`.catch(undefined)` на поле).

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm test:unit tests/unit/policy.spec.ts tests/unit/support-validation.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

Схема в `support.ts` дословно из дизайна. `policy.ts`: два действия в `ACTIONS`, `support.own` у `cp_admin` и `cp_employee`, `support.any` у `manager`; фильтр `owner` исключает `support.own` рядом с `portal.access` и `prices.manage`. `RATE_LIMITS['support.post'] = { limit: 30, windowSec: 600, blockSec: 900 }`. `lib/crm/labels.ts`: подписи журнала `support.open` «Обращение открыто», `support.post` «Сообщение в обращении», `support.close` «Обращение закрыто», сущность `support_threads` «Обращения».

- [ ] **Step 4: Сгенерировать миграцию и прогнать на чистой БД**

Run: `pnpm db:generate`
Expected: новый файл `drizzle/0018_*.sql` с двумя `CREATE TABLE` и шестью индексами, без `DROP`.

Run: `pnpm test:unit tests/unit/policy.spec.ts tests/unit/support-validation.spec.ts tests/unit/temp-database.spec.ts && pnpm check`
Expected: PASS, 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/schema drizzle src/lib/validation/support.ts src/lib/server/auth src/lib/crm/labels.ts tests/unit/policy.spec.ts tests/unit/support-validation.spec.ts
git commit -m "feat(portal): add support tables, rights and limits"
```

---

### Task 4: События обращений в контракте уведомлений

**Files:**

- Modify: `src/lib/types/events.ts`, `src/lib/notifications/labels.ts`, `src/lib/domain/notification/template.ts`, `src/lib/domain/notification/link.ts`
- Modify: `scripts/fixtures/notification-rules.json`, `scripts/fixtures/notification-templates.json`
- Test: `tests/domain/notification-template.spec.ts`, `tests/domain/notification-link.spec.ts`, `tests/unit/seed-templates.spec.ts`

**Interfaces:**

- Produces: `EVENT_KEYS` += `'support.opened' | 'support.message_posted' | 'support.closed'` (в конце списка), `SUPPORT_EVENT_KEYS`; `eventPath(key, threadId, audience)` для событий обращений; `EVENT_TEMPLATE_VARIABLES` и `TEMPLATE_SAMPLES` для трёх событий.

- [ ] **Step 1: Написать падающие тесты**

```ts
// notification-link.spec.ts
expect(eventPath('support.message_posted', 17, 'portal')).toBe('/portal/support/17');
expect(eventPath('support.opened', 17, 'crm_registry')).toBe('/crm/support/17');
// notification-template.spec.ts
expect(EVENT_TEMPLATE_VARIABLES['support.opened']).toEqual([
	'thread',
	'subject',
	'counterparty',
	'author',
	'excerpt',
	'url'
]);
expect(EVENT_TEMPLATE_VARIABLES['support.closed']).not.toContain('excerpt');
expect(unknownVariables('support.closed', '{{excerpt}}')).toEqual(['excerpt']);
expect(EVENT_TEMPLATE_VARIABLES['payroll.week_closed']).toEqual(['period', 'url']); // the refactor keeps old sets
// seed-templates.spec.ts: fixture holds a push template for every EVENT_KEYS entry
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm test:unit tests/domain/notification-template.spec.ts tests/domain/notification-link.spec.ts tests/unit/seed-templates.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

`perEvent` в `template.ts` сейчас отдаёт любое неизвестное событие набору выплат. Заменить на явный выбор группы по ключу, чтобы новое событие без группы падало на тайпчеке. Наборы: `SUPPORT_VARIABLES = ['thread','subject','counterparty','author','excerpt','url']`, у `support.closed` без `excerpt`. Пример для предпросмотра: `thread: '17'`, `subject: 'Сроки по заявке 2026-0042'`, `counterparty: 'Ритуал-Сервис'`, `author: 'Илья Коротков'`, `excerpt: 'Подскажите, успеете ли к пятнице?'`, `url: 'https://example.ru/crm/support/17'`. `EVENT_LABEL`: «Новое обращение» / «Контрагент задал вопрос», «Новое сообщение» / «Ответ в обращении», «Обращение закрыто» / «Переписка завершена». Правила `push` с `enabled: true`: три события для `manager` и `owner`, `support.message_posted` и `support.closed` для `cp_admin` и `cp_employee`. Шаблоны дословно из таблицы дизайна.

- [ ] **Step 4: Прогнать тесты и тайпчек**

Run: `pnpm test:unit tests/domain/notification-*.spec.ts tests/unit/seed-templates.spec.ts tests/unit/seed.spec.ts && pnpm check`
Expected: PASS, 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/events.ts src/lib/notifications/labels.ts src/lib/domain/notification scripts/fixtures tests
git commit -m "feat(queue): add support events and push templates"
```

---

### Task 5: Сервисы и репозитории обращений

**Files:**

- Create: `src/lib/server/support/support-thread.repository.ts`, `support-message.repository.ts`, `support-request.repository.ts`, `dto.ts`, `support-thread.service.ts`, `support-posting.service.ts`
- Test: `tests/unit/support-thread.spec.ts`, `tests/unit/helpers/support.ts`

**Interfaces:**

- Consumes: Task 2 (`awaitingSide`), Task 3 (таблицы, схемы, права, `support.post`), Task 4 (ключи событий).
- Produces:
  - `SupportThreadService(ctx)`: `list(query: ListQuery<SupportThreadFilters>): Page<SupportThreadListItemDto>`, `thread(id: number): SupportThreadDto`, `forRequest(requestId: number): SupportThreadListItemDto[]`, `requestOptions(): SupportRequestOptionDto[]`, `counterpartyChoices(): { id: number; name: string }[]` (только мастерская: контрагенты, у которых есть обращения, для фильтра реестра)
  - `SupportPostingService(ctx)`: `open(input: SupportOpenInput): SupportThreadDto`, `post(threadId: number, input: SupportPostInput): SupportMessageDto`, `close(threadId: number): SupportThreadDto`
  - helper `tests/unit/helpers/support.ts`: `openThread(ctx, overrides?)`, `supportWorld(db)` поверх `seedOrderingWorld` плюс `managerId`, `ownerId`, `driverId`

- [ ] **Step 1: Написать падающие тесты**

Кейсы `support-thread.spec.ts`, каждый выведен из критерия дизайна:

```ts
it('opens a thread with its first message, audit and one support.opened fanout');
// thread.messages.length === 1, side 'portal'; audit action 'support.open'; fanouts('support.opened').length === 1
it('lets the employee link only an own sent request');
// colleague's request -> refused(...).status === 404; draft -> 404; other counterparty -> 404
it('shows an employee only own threads and the cp_admin all of the counterparty');
// employee thread(colleagueThread) -> 404; admin list total === 2
it('answers 404 to another counterparty and to a workshop role without support.any');
it('posts a reply, moves last_message_* and emits support.message_posted with the message id');
// awaiting before 'crm', after manager reply 'portal'
it('refuses a message into a closed thread with 409');
it('closes once: a second close writes no audit row and no fanout');
it('lets the cp_admin lead the thread of a deactivated employee');
it('keeps prices out of every support dto for cp_employee');
// JSON.stringify(dto) has no key from purchaseMoneyKeys-style list: totalMinor, unitPriceMinor, discountMinor
it('lists threads waiting for the workshop first in the CRM');
it('counts opens and replies against support.post');
// 31st post within the window -> RateLimitError
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm test:unit tests/unit/support-thread.spec.ts`
Expected: FAIL, модули не найдены.

- [ ] **Step 3: Реализовать репозитории**

Фильтр в одном приватном методе репозитория веток через `scopedWhere`: портал видит `counterpartyId = ctx.counterpartyId`, и без `cp_admin` (`PolicyService.seesWholeCounterparty`) ещё `createdById = ctx.userId`; мастерская без фильтра. `support-request.repository.ts` берёт фильтр реестра заявок P6 (контрагент, `status <> 'draft'`, автор для сотрудника) для `options(ctx)` и `reachable(ctx, id, tx)`, один запрос на оба метода. Сортировка CRM: `awaiting = 'crm'` первыми, затем `lastMessageAt desc`; портал: открытые первыми, затем `lastMessageAt desc`. Поиск `q` по теме, номеру заявки и названию контрагента через `lib/server/core/search.ts`.

- [ ] **Step 4: Реализовать сервисы**

Права: чтение и запись требуют `support.own` или `support.any`, `open` только `support.own`. Ветка вне фильтра даёт `NotFoundError`. Каждая запись идёт через `this.audited` с сущностью `support_threads`, `after` несёт `threadId`, `messageId`, `requestId` без текста. `consumeRateLimit('support.post', String(userId))` до транзакции в `open` и `post`. `close` читает статус до `audited`: закрытая ветка возвращается как есть. События: `bus.emit('support.opened', threadId, tx)`, `bus.emit('support.message_posted', messageId, tx)`, `bus.emit('support.closed', threadId, tx)`. `side` сообщения берётся из `ctx.scope`. DTO-маппер в `dto.ts` считает `awaiting`, `isMine`, `canPost` (открыта и читатель внутри фильтра), `canClose` (то же), `authorRole` по `ROLE_TITLE`.

- [ ] **Step 5: Прогнать тесты**

Run: `pnpm test:unit tests/unit/support-thread.spec.ts && pnpm check`
Expected: PASS, 0 ошибок.

- [ ] **Step 6: Commit** (двумя коммитами: репозитории, затем сервисы)

```bash
git commit -m "feat(portal): store and fence support threads"
git commit -m "feat(portal): open, answer and close support threads"
```

---

### Task 6: Разворот, пуш и колокольчик для обращений

**Files:**

- Create: `src/lib/server/notifications/support-facts.repository.ts`
- Modify: `src/lib/server/queue/handlers/notification-fanout.ts`, `src/lib/server/notifications/push-message.service.ts`, `src/lib/server/notifications/notification-feed.repository.ts`, `src/lib/server/notifications/dto.ts`, `src/lib/portal/feed-href.ts`, `src/lib/crm/notifications/feed-href.ts`
- Test: `tests/unit/support-notifications.spec.ts`

**Interfaces:**

- Consumes: Task 2 `supportRecipients`, `excerpt`; Task 4 события; Task 5 сервисы для подготовки данных.
- Produces: `SupportFactsRepository.occurrence(eventKey: EventKey, entityId: number, tx?: Tx): SupportOccurrence | undefined`, где `SupportOccurrence = { threadId, counterpartyId, counterpartyName, subject, threadAuthorId, actorId, actorSide, actorName, body: string | null }`; `FeedRow` получает `supportThreadId: number | null` и `supportSubject: string | null`.

- [ ] **Step 1: Написать падающие тесты**

```ts
it(
	'tells the workshop managers and owner about an employee thread, not the driver or the cp_admin'
);
it('tells the cp_admin and the author about a manager reply, never the manager who wrote it');
it('tells the employee when the cp_admin writes in the employee thread');
it('runs the fanout of one message twice with one feed row and one push row per person');
it('skips a deactivated author');
it(
	'builds the push of a reply: title «Обращение №{id}: {subject}», body «{author}: {excerpt}», url /portal/support/{id}'
);
it('points a feed line of a message at the thread, labelled by the subject');
// NotificationFeedItemDto.entityId === threadId, entityLabel === subject, requestId === null
it('keeps a support feed line of another counterparty out of a portal reader');
it('puts a failed push of a support event on retry like a request event');
// fake driver throws -> notifications.status 'failed', error starts with 'driver', job back to pending
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm test:unit tests/unit/support-notifications.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

`occurrence` читает актора: у `support.opened` автор ветки и первое сообщение, у `support.message_posted` автор и текст сообщения, у `support.closed` `closed_by_id` и его `users.scope`, текст `null`. Fanout получает зависимость `support: Pick<SupportFactsRepository, 'occurrence'>` и ветку `addresseesOf` для `SUPPORT_EVENT_KEYS`: кандидаты это `portalPeople(counterpartyId)` со стороной `portal` и `crmPeople()` со стороной `crm`, отбор `supportRecipients`, роли человека передаются целиком, остальное режет матрица. Если файл обработчика уходит за 250 строк, сбор адресатов переезжает в `src/lib/server/notifications/addressees.ts`. `PushMessageService` получает `supportScene`: путь `eventPath(key, threadId, audienceOf(to))`, значения из `occurrence`, `excerpt` через доменную функцию. Лента: левые соединения `support_messages` по `entityId` для `support.message_posted` и `support_threads` по id ветки (из сообщения или из `entityId` для `support.opened` и `support.closed`), портальный читатель дополнительно ограничен `support_threads.counterparty_id = users.counterparty_id`. Маппер: `entityId = stockItemId ?? weekId ?? supportThreadId`, `entityLabel = stockItemTitle ?? week ?? supportSubject`. Ссылки ленты: событие обращения ведёт на `/portal/support/{entityId}` и `/crm/support/{entityId}`.

- [ ] **Step 4: Прогнать тесты и смежные наборы**

Run: `pnpm test:unit tests/unit/support-notifications.spec.ts tests/unit/push-*.spec.ts tests/unit/notification-*.spec.ts && pnpm check`
Expected: PASS, 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(queue): notify the other side of a support thread"
```

---

### Task 7: Команда `notifications:sync`

**Files:**

- Create: `scripts/admin/notifications.ts`
- Modify: `scripts/admin.ts` (команда и строка USAGE), `docs/deploy.md`
- Test: `tests/unit/notifications-sync.spec.ts`

**Interfaces:**

- Produces: `notificationsSync(db: Db): void`, печатает `{"rules":N,"templates":M}` с числом вставленных строк; чистая часть `syncNotificationFixtures(db: Db): { rules: number; templates: number }` в `scripts/seed/reference.ts` рядом с `seedNotificationRules`.

- [ ] **Step 1: Написать падающий тест**

```ts
it('adds missing rules and templates and keeps what the owner changed', () => {
	// seed rules + templates, delete the support rows, switch one request rule off, edit one template body
	// 3 events x (manager, owner) + 2 events x (cp_admin, cp_employee) = 10 rules
	expect(syncNotificationFixtures(db)).toEqual({ rules: 10, templates: 3 });
	// the switched-off rule stays off, the edited body stays edited
	expect(syncNotificationFixtures(db)).toEqual({ rules: 0, templates: 0 });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm test:unit tests/unit/notifications-sync.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

Обе вставки через `onConflictDoNothing`, счётчик из `changes`. Фикстуры читает тот же `loadFixture` со схемами, что и сид, поэтому неизвестная переменная шаблона роняет команду так же, как сид. `docs/deploy.md`: в разделе обновления стенда шаг `docker compose run --rm app pnpm admin notifications:sync` после `docker compose up`, с одной фразой, зачем.

- [ ] **Step 4: Прогнать тест**

Run: `pnpm test:unit tests/unit/notifications-sync.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(queue): sync missing push rules on the stand"
```

---

### Task 8: Экраны портала

**Files:**

- Create: `src/lib/support/SupportThreadList.svelte`, `SupportMessageList.svelte`, `SupportReplyForm.svelte`, `SupportThreadHeader.svelte`, `labels.ts`
- Create: `src/routes/(portal)/portal/support/+page.server.ts`, `+page.svelte`, `new/+page.server.ts`, `new/+page.svelte`, `[id]/+page.server.ts`, `[id]/+page.svelte`
- Modify: `src/lib/portal/profile-nav.ts`, `src/lib/portal/search/portal-sections.ts`
- Test: `tests/unit/portal-sections.spec.ts`

**Interfaces:**

- Consumes: Task 5 сервисы, Task 3 схемы.
- Produces: `ProfileSection` += `'support'`; пункт «Чат» между «Мои заявки» и «Уведомления»; компоненты `lib/support` с пропсами `thread: SupportThreadDto`, `timeZone: string`, `formError?: string`, `contour: 'portal' | 'crm'`; `SUPPORT_STATE_LABEL` в `lib/support/labels.ts`: портал «Ждёт ответа мастерской», «Есть ответ», «Закрыто»; CRM «Ждёт ответа», «Ответили», «Закрыто».

- [ ] **Step 1: Написать падающий тест**

`portal-sections.spec.ts`: `matchSections(portalSections(rights), 'обращ')` находит «Чат»; алиасы `['обращения', 'вопрос', 'поддержка', 'переписка']`.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm test:unit tests/unit/portal-sections.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать роуты**

Каждый роут и каждое действие начинаются с `requireAction(requireScope(locals.actor, 'portal', url.pathname), 'support.own')`. `new`: `load` отдаёт `requestOptions()` и `requestId` из `?request=`, только если он есть среди вариантов; действие `open` через `formAction` и `redirect(303, /portal/support/{id})`. `[id]`: `load` через `orHttpStatus(() => service.thread(id))`, действия `post` и `close`. Список: `DataTable` с колонками из дизайна, колонка «Автор» только у `cp_admin`, кнопка «Новое обращение».

- [ ] **Step 4: Реализовать компоненты**

Переписка: свои сообщения справа (`isMine`), подпись «Вы» или ФИО и роль, время в `timeZone` через `formatDateTime`. Форма ответа: `Textarea` с `label` «Сообщение», плейсхолдер «Введите сообщение», кнопка «Отправить» с `data-testid="support-send"`. Закрытие через `ConfirmDialog` с текстом «Закрыть обращение? Писать в него больше будет нельзя.», кнопка `data-testid="support-close"`. В закрытой ветке вместо формы строка «Обращение закрыто {дата}, {кто}» и ссылка «Новое обращение». Пустой список это `EmptyState` «Обращений пока нет». Цвета только из токенов.

- [ ] **Step 5: Проверить**

Run: `pnpm test:unit tests/unit/portal-sections.spec.ts && pnpm check && pnpm lint`
Expected: PASS, 0 ошибок.

- [ ] **Step 6: Commit** (компоненты и роуты отдельно)

```bash
git commit -m "feat(ui): add shared support thread components"
git commit -m "feat(portal): add support chat screens to the profile"
```

---

### Task 9: Карточка заявки портала без записи комментариев

**Files:**

- Modify: `src/routes/(portal)/portal/requests/[id]/+page.server.ts`, `+page.svelte`
- Modify: `src/lib/portal/requests/RequestThread.svelte`
- Modify: `src/lib/server/request/request-card.service.ts`, `card.dto.ts`, `request-card.repository.ts`
- Delete: `src/lib/server/request/request-comment.service.ts`
- Modify: `src/lib/validation/request.ts` (убрать `requestCommentSchema`), `src/lib/server/auth/rate-limit.ts` (убрать `request.comment`), `src/lib/types/request.ts` (`RequestCardDto.supportThreads`)
- Test: `tests/unit/request-thread.spec.ts`, `tests/unit/config.spec.ts`, `tests/e2e/portal-requests.e2e.ts`

**Interfaces:**

- Consumes: `SupportThreadService.forRequest` из Task 5.
- Produces: `RequestCardDto.supportThreads: SupportThreadListItemDto[]`.

- [ ] **Step 1: Переписать тесты под новое поведение**

`request-thread.spec.ts`: кейсы записи комментария удаляются; новые кейсы: старый публичный комментарий (вставлен напрямую в `comments`) виден в `card(id).comments`, внутренний не виден; обращение по заявке видно `cp_admin` и автору в `card(id).supportThreads`, сотруднику-коллеге не видно. `config.spec.ts`: ссылки на `request.comment` убираются. `portal-requests.e2e.ts`: шаг с комментарием заменяется проверкой, что поля «Сообщение мастерской» нет, а кнопка «Написать по заявке» ведёт на `/portal/support/new?request={id}`.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm test:unit tests/unit/request-thread.spec.ts`
Expected: FAIL на `supportThreads`.

- [ ] **Step 3: Реализовать**

Действие `comment` и `RequestCommentService` удаляются, метод `insertComment` репозитория тоже. `RequestThread.svelte` теряет форму, блок комментариев рисуется только при непустом `comments`, вложения не меняются. Под ним список обращений по заявке и кнопка «Написать по заявке». Подпись журнала `request.comment` в `lib/crm/labels.ts` остаётся: старые строки журнала должны читаться.

- [ ] **Step 4: Проверить**

Run: `pnpm test:unit && pnpm check`
Expected: PASS, 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(portal): move request questions to support chat"
```

---

### Task 10: Экраны CRM

**Files:**

- Create: `src/routes/(crm)/crm/support/+page.server.ts`, `+page.svelte`, `[id]/+page.server.ts`, `[id]/+page.svelte`
- Modify: `src/routes/(crm)/+layout.server.ts` (`can.support`), `src/lib/crm/nav.ts` (`CrmNavRights.support`, пункт), `tests/e2e/crm-surface.ts`
- Test: `tests/unit/shell-groups.spec.ts`

**Interfaces:**

- Consumes: Task 5 сервисы, Task 8 компоненты `lib/support`.
- Produces: раздел «Обращения» с иконкой `message-square`, `href: '/crm/support'`, группа «Работа», последним в группе; подсказка плитки «Вопросы контрагентов и ответы мастерской».

- [ ] **Step 1: Написать падающий тест**

`shell-groups.spec.ts`: при `support: true` группа «Работа» заканчивается пунктом «Обращения»; при `support: false` пункта нет. `crm-surface.ts`: секция `{ prefix: '/crm/support', readers: ADMINS }` и параметр `'/crm/support/[id]'` из последней строки `support_threads`.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm test:unit tests/unit/shell-groups.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

Роуты проверяют `requireAction(requireScope(..., 'crm', ...), 'support.any')`. Реестр: `DataTable` + `FilterBar` (статус, ожидание, контрагент из `choices`, поиск), фильтр по умолчанию `status=open`. Карточка: заголовок с контрагентом и заявкой, ссылки на `/crm/counterparties/{id}` при `counterparty.manage` и `/crm/requests/{id}` при `request.read.any`, переписка и форма из `lib/support`.

- [ ] **Step 4: Проверить**

Run: `pnpm test:unit tests/unit/shell-groups.spec.ts && pnpm check && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(crm): add support threads section"
```

---

### Task 11: Сквозной e2e

**Files:**

- Create: `tests/e2e/support.e2e.ts`
- Test: `tests/e2e/crm-audit.e2e.ts`, `tests/e2e/portal-audit.e2e.ts` (без правки, прогон)

**Interfaces:**

- Consumes: всё выше, фикстуры `login`, `queueIdle`, `openBell`, `OTHER_COUNTERPARTY_ADMIN` из `tests/e2e/fixtures.ts`.

- [ ] **Step 1: Написать сценарии**

```ts
test('an employee asks about a request and the workshop answers', ...)
  // cp_employee: card -> «Написать по заявке» -> subject + body -> thread page
  // manager: /crm/support first row is the thread with «Ждёт ответа» -> reply
  // queueIdle -> cp_employee: openBell shows «Новое сообщение», thread shows the reply, «Закрыть обращение»
  // the reply form is gone, «Обращение закрыто» is visible
test('the cp_admin sees the employee thread, a colleague counterparty does not', ...)
  // OTHER_COUNTERPARTY_ADMIN opens /portal/support/{id} -> 404
test('workshop roles without support.any get 403 and a guest goes to login', ...)
  // driver /crm/support -> 403; guest /portal/support -> /login
```

Перед заявкой вызывается `emptyCart` (память проекта: черновики в e2e-базе ломают соседние спеки).

- [ ] **Step 2: Прогнать**

Run: `pnpm build && pnpm test:e2e tests/e2e/support.e2e.ts tests/e2e/crm-audit.e2e.ts tests/e2e/portal-audit.e2e.ts tests/e2e/portal-requests.e2e.ts` с `SESSION_SECRET`, заданным прямо в команде: ни сборка, ни Playwright не читают `.env`.
Expected: PASS. Перед прогоном убедиться, что на порту 4173 нет старого preview: Playwright переиспользует его и гоняет старую сборку.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(portal): cover support chat end to end"
```

---

### Task 12: Инструкции и гейт

**Files:**

- Modify: `docs/portal-guide.md`, `docs/guides/` (руководитель, администратор), `src/routes/(dev)/kitchen-sink` не трогается
- Modify: `tech.md` §14 C17, если по ходу слайса контракт уточнялся

- [ ] **Step 1: Дописать инструкции**

Портал: как завести обращение, где его найти, что закрытое не принимает сообщений, что переписка в карточке заявки стала обращениями. Мастерская: раздел «Обращения», фильтр «ждёт ответа», закрытие. Прогнать текст через правила `stop-slop`.

- [ ] **Step 2: Гейт целиком**

Run: `pnpm lint && pnpm check && pnpm test:unit && pnpm test:e2e && pnpm build`
Expected: все пять команд зелёные; покрытие `lib/domain/**` не ниже 90% строк.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(portal): explain support chat to both contours"
```
