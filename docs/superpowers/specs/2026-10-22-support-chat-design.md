# C17. Обращения контрагентов

**Дата:** 22.10.2026
**Автор:** Sobol17
**Ядро:** `tech.md` v1.56 на входе, v1.57 на выходе
**Статус:** дизайн на согласовании

## Что решаем

Контрагент пишет в мастерскую из личного кабинета: по конкретной заявке или по любому вопросу. Сегодня такой вопрос уходит в телефон и мессенджеры, а в системе от него не остаётся следа. Мастерская отвечает из CRM. Обе стороны узнают о новом сообщении пушем и колокольчиком.

Задача пришла от бизнеса 22.10.2026. Это новая функция, а не правка пилота, поэтому она идёт отдельным слайсом C17 и отдельным PR.

Слайс заодно чинит разрыв P6: комментарии из карточки заявки портала до мастерской не доходят, CRM их не показывает. Обращения заменяют эту переписку.

## Принятые решения

Решения владельца от 22.10.2026:

1. **Обращение это отдельная ветка переписки.** У ветки есть тема, по желанию привязка к заявке своего контрагента и статус: открыто или закрыто. Одного общего чата на контрагента нет.
2. **Сотрудник контрагента (`cp_employee`) видит и ведёт только свои обращения.** Администратор контрагента (`cp_admin`) видит все обращения своего контрагента и пишет в любое из них. Это та же граница, что у реестра заявок (P6).
3. **В мастерской обращения читают и отвечают `manager` и `owner`.** Остальным ролям мастерской раздел закрыт.
4. **Закрыть обращение может любая сторона.** В закрытое обращение писать нельзя, по новому вопросу заводят новое. Повторного открытия нет.
5. **Транспорт это обычные запросы к серверу.** WebSocket, SSE и опроса нет. Новое сообщение видно при открытии или обновлении страницы.
6. **О новом обращении, каждом сообщении и закрытии другой стороне приходит пуш и строка в колокольчике.** В мастерской их получают все `manager` и `owner`, назначенного ответственного нет.
7. **Обращения заменяют «Переписку с менеджером» в карточке заявки портала.** Контрагент больше не пишет комментарии в карточке. Старые комментарии остаются на чтение, рядом кнопка «Написать по заявке». Вопрос по заявке идёт одним каналом, и у этого канала есть пуш.
8. **C17 идёт параллельно с C14, отдельной веткой `feat/support-chat` от `main`.** Пилотные правки (`feat/pilot-edits`, v1.56) вливаются первыми. Номер версии ядра выставляется при мёрдже: если до него ядро займёт v1.57, слайс получит следующий номер.

## Решения разработчика

Владелец эти пункты не обсуждал. Каждый можно пересмотреть до начала слайса.

- **Обращение открывает только контрагент.** Мастерская отвечает в существующих ветках, но новую ветку контрагенту не заводит.
- **Только текст.** Вложений, фото и файлов нет. Сообщение не правится и не удаляется.
- **Отметок прочтения по веткам нет.** Непрочитанное показывает колокольчик. В списке обращений видно, чья очередь отвечать: признак считается по стороне последнего сообщения.
- **Пуш несёт начало текста сообщения** (переменная `{{excerpt}}`, до 100 символов). Агент видит суть вопроса на экране блокировки, не открывая приложение.
- **Вкладка портала называется «Чат»**, как просил бизнес. Раздел CRM называется «Обращения» и стоит последним в группе «Работа».
- **Заявку к обращению выбирают из своих отправленных заявок.** Черновик выбрать нельзя. Сотрудник видит в выборе только свои заявки, администратор все заявки контрагента.
- **C17 стоит в дорожной карте раньше C16.**
- **Старые комментарии не переносятся в обращения.** Их немного, и карточка продолжает их показывать.

## Чего не делаем

- Мгновенной доставки, индикатора «печатает», отметки «прочитано» у собеседника.
- Вложений, правки и удаления сообщений.
- Назначения обращения на конкретного администратора, SLA, категорий проблем.
- Обращений, которые открывает мастерская.
- Повторного открытия закрытого обращения.
- Писем о сообщениях. Почта по-прежнему шлёт только письма доступа.
- Учёта брака и рекламаций. Обращение это переписка, а не рекламация: флагов, статусов и полей под брак у обращения нет.
- Списка обращений на карточке заявки в CRM. Поиск реестра обращений по номеру заявки закрывает эту потребность.

## Изменения контракта (v1.57)

### Схема (новый раздел §5.10)

```ts
export const SUPPORT_THREAD_STATUSES = ['open', 'closed'] as const;
export const SUPPORT_SIDES = ['portal', 'crm'] as const;

export const supportThreads = sqliteTable(
	'support_threads',
	{
		id: pk(),
		counterpartyId: integer('counterparty_id')
			.notNull()
			.references(() => counterparties.id),
		createdById: integer('created_by_id')
			.notNull()
			.references(() => users.id),
		requestId: integer('request_id').references(() => requests.id),
		subject: text('subject').notNull(),
		status: text('status', { enum: SUPPORT_THREAD_STATUSES }).notNull().default('open'),
		// Denormalized from the newest message: the lists sort and mark «whose turn» without a join.
		lastMessageAt: ts('last_message_at').notNull(),
		lastMessageSide: text('last_message_side', { enum: SUPPORT_SIDES }).notNull(),
		closedAt: ts('closed_at'),
		closedById: integer('closed_by_id').references(() => users.id),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => ({
		cpIdx: index('support_threads_cp_idx').on(t.counterpartyId, t.lastMessageAt),
		authorIdx: index('support_threads_author_idx').on(t.createdById, t.lastMessageAt),
		statusIdx: index('support_threads_status_idx').on(t.status, t.lastMessageAt)
	})
);

export const supportMessages = sqliteTable(
	'support_messages',
	{
		id: pk(),
		threadId: integer('thread_id')
			.notNull()
			.references(() => supportThreads.id),
		authorId: integer('author_id')
			.notNull()
			.references(() => users.id),
		// The author's contour at the time of writing: a scope change later must not flip old messages.
		side: text('side', { enum: SUPPORT_SIDES }).notNull(),
		body: text('body').notNull(),
		createdAt: createdAt()
	},
	(t) => ({ threadIdx: index('support_messages_thread_idx').on(t.threadId, t.createdAt) })
);
```

Строки не удаляются. Номер обращения для людей это `id`, отдельной нумерации нет.

Инварианты:

- `support_threads.request_id`, если задан, указывает на заявку того же `counterparty_id` не в статусе `draft`;
- у обращения есть хотя бы одно сообщение: ветка и первое сообщение пишутся одной транзакцией;
- `last_message_at` и `last_message_side` равны полям самого нового сообщения ветки;
- `closed_at` и `closed_by_id` заданы тогда и только тогда, когда `status = 'closed'`.

### Права (§12, `policy.ts`)

- `ACTIONS` получает `support.own` и `support.any`.
- `support.own`: `cp_admin`, `cp_employee`. Чтение и запись ограничены фильтром: `counterpartyId` из `ActorContext` всегда, плюс `createdById = userId` для того, у кого нет `cp_admin`.
- `support.any`: `manager` и `owner`.
- Правило `owner` («всё, кроме портальных») исключает `support.own` так же, как `portal.access` и `prices.manage`.

### События (§7.3)

`EVENT_KEYS` получает три ключа, `SUPPORT_EVENT_KEYS` выделяет их так же, как `REQUEST_EVENT_KEYS`:

| Событие                  | `entityId`   | Когда                                  |
| ------------------------ | ------------ | -------------------------------------- |
| `support.opened`         | id обращения | контрагент завёл обращение             |
| `support.message_posted` | id сообщения | любое сообщение, кроме первого в ветке |
| `support.closed`         | id обращения | любая сторона закрыла обращение        |

Ключ fanout `fanout:{eventKey}:{entityId}` не меняется. У сообщения свой id, поэтому каждое сообщение даёт ровно один разворот.

Адресаты считает чистая функция `supportRecipients` в `lib/domain/support/recipients.ts`. Вход: сторона и id автора действия, id автора обращения, список кандидатов с ролями. Правило:

- действие стороны портала адресовано мастерской: активным учётным записям CRM с ролью `manager` или `owner`;
- действие мастерской адресовано порталу: каждому `cp_admin` контрагента и автору обращения;
- если `cp_admin` пишет в обращение сотрудника или закрывает его, автор обращения тоже получает событие;
- автор действия событие не получает никогда.

Последнее правило это исключение из v1.49 («инициатор из адресатов не исключается»): уведомлять человека о его же сообщении бессмысленно. Чтобы fanout знал автора, payload не меняется: обработчик читает автора из сообщения (`author_id`) или из обращения (`created_by_id` для `support.opened`, `closed_by_id` для `support.closed`).

Матрица `notification_rules` получает правила `push` на все три события для `manager`, `owner`, `cp_admin` и `cp_employee`. `support.opened` для ролей портала правила не получает: обращение открывает только контрагент. Личные переключатели работают как у событий заявки.

Переменные шаблона (`EVENT_TEMPLATE_VARIABLES`) у всех трёх событий: `{{thread}}` (номер обращения), `{{subject}}`, `{{counterparty}}`, `{{author}}` (ФИО автора действия), `{{url}}`. У `support.opened` и `support.message_posted` ещё `{{excerpt}}`: начало текста до 100 символов, обрезанное по слову. Фикстура `notification-templates.json` получает три шаблона push:

| Событие                  | Заголовок                            | Текст                           |
| ------------------------ | ------------------------------------ | ------------------------------- |
| `support.opened`         | `Новое обращение №{{thread}}`        | `{{counterparty}}: {{excerpt}}` |
| `support.message_posted` | `Обращение №{{thread}}: {{subject}}` | `{{author}}: {{excerpt}}`       |
| `support.closed`         | `Обращение №{{thread}} закрыто`      | `{{subject}}`                   |

**Доставка правил и шаблонов на стенд.** `docs/deploy.md` запрещает сид на стенде с реальными данными, а без строк `notification_rules` fanout молча никого не находит. Поэтому слайс добавляет команду `pnpm admin notifications:sync`: она вставляет из фикстур только отсутствующие правила и шаблоны и не трогает существующие, то есть правку руководителя и выключенные правила. Повторный запуск ничего не меняет. `docs/deploy.md` получает шаг «после обновления выполнить `notifications:sync`». Это решение разработчика.

Ссылка события (`eventPath`, `lib/domain/notification/link.ts`): `/portal/support/{threadId}` человеку портала, `/crm/support/{threadId}` человеку мастерской. Для `support.message_posted` id обращения берётся из сообщения.

Колокольчик: `NotificationFeedItemDto` у событий обращений отдаёт `entityId` равным id обращения (не сообщения) и `entityLabel` равным теме. `requestId` и `requestNumber` равны `null`. `EVENT_LABEL` получает подписи «Новое обращение», «Новое сообщение», «Обращение закрыто».

### Аудит

Новые действия по сущности `support_threads`: `support.open`, `support.post`, `support.close`. В `after` пишутся `threadId`, `messageId` и `requestId`. Текст сообщения в журнал не пишется: он уже лежит в `support_messages`.

### Типы (§8, `lib/types/support.ts`)

```ts
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];
export type SupportSide = (typeof SUPPORT_SIDES)[number];

export interface SupportThreadListItemDto {
	id: number;
	subject: string;
	status: SupportThreadStatus;
	awaiting: SupportSide | null; // whose turn to answer; null when closed
	counterpartyName: string; // the portal list drops this column
	authorName: string;
	requestId: number | null;
	requestNumber: string | null;
	lastMessageAt: string;
	createdAt: string;
}

export interface SupportMessageDto {
	id: number;
	side: SupportSide;
	authorName: string;
	authorRole: string; // role title: «Администратор мастерской», «Сотрудник»
	isMine: boolean;
	body: string;
	createdAt: string;
}

export interface SupportThreadDto extends SupportThreadListItemDto {
	counterpartyId: number;
	closedAt: string | null;
	closedByName: string | null;
	canPost: boolean; // open and the actor passes the fence
	canClose: boolean;
	messages: SupportMessageDto[];
}

export interface SupportThreadFilters {
	status?: SupportThreadStatus;
	awaiting?: SupportSide;
	counterpartyId?: number; // CRM only
	q?: string; // subject, request number, counterparty name
}

export interface SupportRequestOptionDto {
	id: number;
	number: string;
	status: RequestStatus;
}
```

Цен в DTO обращений нет ни для одной роли: заявка представлена номером и статусом.

### Валидация (`lib/validation/support.ts`)

- `subject`: после `trim` от 3 до 120 символов.
- `body`: после `trim` от 1 до 4000 символов.
- `requestId`: необязательное целое. Сервер применяет к нему фильтр реестра заявок P6: заявка того же контрагента, не черновик, а для того, у кого нет `cp_admin`, ещё и своя (`created_by_id = userId`). Чужая заявка даёт 404. То же правило проверяет `?request=` на `/portal/support/new`: чужой id молча не подставляется. Выпадающий список строит тот же запрос, поэтому список и проверка не расходятся.
- Ограничение частоты `support.post` в `RATE_LIMITS`: 30 сообщений за 10 минут на пользователя, считаются и первые сообщения обращений.

## Экраны

### Портал

- Профиль получает пункт «Чат» (`ProfileSection` += `support`) между «Мои заявки» и «Уведомления». Обе роли портала видят его.
- `/portal/support`: список обращений `DataTable`, колонки «№», «Тема», «Заявка», «Статус», «Последнее сообщение». Сотрудник видит свои, администратор все обращения контрагента с колонкой «Автор». Открытые выше закрытых, внутри по `lastMessageAt` новыми сверху. Статус словами: «Ждёт ответа мастерской», «Есть ответ», «Закрыто». Кнопка «Новое обращение».
- `/portal/support/new`: тема, заявка (`Select` из `SupportRequestOptionDto`, необязательно), текст. Параметр `?request={id}` подставляет заявку. После отправки переход на страницу обращения.
- `/portal/support/[id]`: переписка снизу вверх по времени, свои сообщения справа. Под перепиской форма ответа и кнопка «Закрыть обращение» с `ConfirmDialog`. В закрытом обращении формы нет, вместо неё строка «Обращение закрыто {дата}, {кто}» и кнопка «Новое обращение».
- Карточка заявки портала получает кнопку «Написать по заявке», она ведёт на `/portal/support/new?request={id}`.
- Карточка заявки портала теряет форму комментария. Блок «Переписка с менеджером» показывает старые комментарии `is_internal = false` на чтение и рисуется, только если они есть. Под ним список обращений по этой заявке (номер, тема, статус) в пределах фильтра читателя.

### Что уходит из P6

Сегодня карточка заявки CRM комментарии не показывает (`CrmRequestCardDto` исключает `comments`), поэтому написанное в портале до мастерской не доходило. Слайс убирает запись:

- form action `comment` роута `/portal/requests/[id]` и метод записи в `RequestCommentService`;
- ограничение частоты `request.comment` из `RATE_LIMITS` и §12;
- поле ввода комментария из компонента карточки.

Таблица `comments` и колонка `requests.comment` (комментарий к заявке из корзины) не меняются, миграции под это нет. `RequestCardDto.comments` остаётся и отдаёт старые публичные комментарии. `RequestCardDto` получает `supportThreads: SupportThreadListItemDto[]`: обращения по заявке, видимые читателю.

### CRM

- Раздел «Обращения» (`/crm/support`) в группе «Работа», `CrmNavRights.support`, плитка главной с подсказкой «Вопросы контрагентов и ответы мастерской».
- `/crm/support`: реестр `DataTable` с `FilterBar` (статус, «ждёт ответа», контрагент, поиск по теме, номеру заявки и названию контрагента). По умолчанию открытые, первыми те, что ждут ответа мастерской.
- `/crm/support/[id]`: та же переписка, ссылки на карточку контрагента (при `counterparty.manage`) и на карточку заявки (при `request.read.any`), форма ответа и «Закрыть обращение».

Компоненты переписки (`SupportThread`, `SupportMessageList`, `SupportReplyForm`) лежат в `lib/support/` и общие для двух контуров, как компоненты уведомлений в `lib/notifications/`. Новых UI-примитивов слайс не заводит: собирается из `Card`, `Textarea`, `Button`, `Select`, `DataTable`, `FilterBar`, `ConfirmDialog`, `EmptyState`.

### Раскладка кода

Вертикаль повторяет эталон K5:

```
src/routes/(portal)/portal/support/{+page.server.ts,+page.svelte,new/,[id]/}
src/routes/(crm)/crm/support/{+page.server.ts,+page.svelte,[id]/}
src/lib/validation/support.ts
src/lib/types/support.ts
src/lib/domain/support/{recipients.ts,awaiting.ts,excerpt.ts}
src/lib/server/support/{support-thread.service.ts,support-thread.repository.ts,support-message.repository.ts,dto.ts}
src/lib/support/  shared Svelte components
```

Сервис один на оба контура, ветвление по `ActorContext.scope`. Роуты тонкие: право проверяется до разбора формы (§12, v1.53), затем Zod, затем сервис.

## Поведение сервера

- **Открытие.** `support.own`. Одна транзакция: ветка, первое сообщение (`side = 'portal'`), аудит `support.open`, `bus.emit('support.opened', threadId, tx)`.
- **Сообщение.** `support.own` или `support.any`. Ветка вне фильтра отвечает 404. Закрытая ветка отвечает 409 «Обращение закрыто». Одна транзакция: сообщение, `last_message_*`, аудит `support.post`, `bus.emit('support.message_posted', messageId, tx)`.
- **Закрытие.** Те же права. Повторное закрытие уже закрытой ветки ничего не пишет и не шлёт событие, ответ успешный. Одна транзакция: статус, `closed_*`, аудит `support.close`, `bus.emit('support.closed', threadId, tx)`.
- **Отключённый автор.** Обращения отключённого сотрудника остаются у администратора контрагента, их можно вести и закрывать.

## Тесты

Выведены из критериев приёмки:

- **Контракт.** Payload `notification.fanout` для трёх событий проходит Zod-схему топика. Ответ `/portal/support/[id]` и `/crm/support/[id]` для `cp_employee` не содержит ценовых ключей.
- **Идемпотентность.** Fanout каждого события дважды с тем же payload даёт одну строку ленты и одну строку `notifications` на адресата. Повторное закрытие не создаёт второго события.
- **Путь ошибки.** Отказ драйвера пуша на сообщении обращения ведёт строку в `failed` и ретрай, как у событий заявки.
- **Property-based.** `supportRecipients`: автор действия никогда не адресат; действие портала не уходит в портал, кроме автора обращения при действии `cp_admin`; действие мастерской не уходит в мастерскую. `awaiting`: закрытая ветка даёт `null`, открытая даёт сторону, противоположную последнему сообщению. `excerpt`: результат не длиннее 100 символов и является началом исходного текста.
- **Сервис.** Чужая заявка в `requestId` даёт 404. Сообщение в закрытую ветку даёт 409. Сотрудник не видит обращение коллеги (404), администратор видит.
- **P6 после правки.** Карточка заявки портала не принимает POST `?/comment` (404 action), старые публичные комментарии видны, обращение по заявке видно в карточке тому, кому видно само обращение.
- **E2E.** Сотрудник контрагента заводит обращение по заявке, администратор мастерской видит его в реестре первым и отвечает, сотрудник видит ответ и закрывает ветку, форма ответа пропадает. Чужая роль: водитель получает 403 на `/crm/support`, человек другого контрагента 404 на чужое обращение, гость уходит на вход.

## Что меняется в `tech.md`

- Changelog v1.57, шапка версии.
- §5.10 «Обращения» со схемой и инвариантами.
- §7.3: три события, правило адресатов обращений, переменные шаблонов, ссылки.
- §8: `lib/types/support.ts`, подписи событий, поправка к `NotificationFeedItemDto.entityId`, `RequestCardDto.supportThreads`.
- §12: права `support.own`, `support.any`, исключение для `owner`; `support.post` вместо `request.comment` в ограничениях частоты.
- §18.5: строка «Заявка (детальная)» без записи комментариев, с обращениями по заявке.
- `docs/deploy.md`: шаг `pnpm admin notifications:sync` после обновления.
- §14: слайс C17 с DoD «контрагент задаёт вопрос из кабинета, администратор мастерской отвечает из CRM, обе стороны получают пуш и строку колокольчика, закрытое обращение не принимает сообщений».
- §18.5: экран «Чат» портала (макета нет, собран в раскладке профиля).
- `docs/portal-guide.md` и `docs/guides/` администратора и руководителя: раздел про обращения.
