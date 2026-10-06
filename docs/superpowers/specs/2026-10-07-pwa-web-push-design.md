# C15. PWA и Web Push

**Дата:** 07.10.2026
**Автор:** Sobol17
**Ядро:** `tech.md` v1.49 на входе, v1.50 на выходе
**Статус:** дизайн принят 07.10.2026, реализуется слайсом C15

## Что решаем

Приложение ставится на домашний экран и присылает системные уведомления о событиях из §7.3. Главный сценарий: водитель получает пуш в момент перехода заявки в `ready` и открывает её из уведомления.

Объём слайса задан `tech.md` §14 (C15) и §17. Офлайн-режима нет: `fetch`-обработчик, Cache Storage, `offline.html` и фоновая синхронизация не делаются.

## Принятые решения

Решения приняты владельцем 07.10.2026, альтернативы записаны, чтобы к ним не возвращаться.

1. **Мёртвая подписка помечается, удаляет её `session.cleanup`.** Новое поле `push_subscriptions.expired_at`. Удаление строки прямо в `notification.dispatch` отклонено: §7.2 поручает отзыв джобу уборки.
2. **Человеку без подписанного устройства строка `notifications` не создаётся.** Журнал отправок хранит только то, что реально ушло на устройство. Строка `failed` с причиной «нет устройства» отклонена.
3. **Тестовая отправка шаблона идёт мимо журнала.** Драйвер шлёт напрямую на устройства руководителя, таблица `notifications` хранит только события.
4. **Иконки собираются из `src/lib/assets/favicon.svg`** на фоне `#1c2b48` разовым скриптом на Playwright. Новой зависимости под растеризацию нет.
5. **Включение пуша предлагают экран настроек и плашка.** Кнопка на личных экранах уведомлений обоих контуров и плашка рядом с кнопкой установки.
6. **Руководитель видит причину отказа из списка.** Два значения: `expired` и `driver`. Сырой текст ошибки драйвера с сервера не уходит.
7. **Раздел `/crm/settings/notifications` делится на три подстраницы:** матрица, шаблоны, журнал.

Без вопроса к владельцу, по `tech.md` и здравому смыслу:

- у человека одна строка `notifications` на событие и канал, dispatch шлёт её на все живые подписки;
- срок жизни пуша 4 часа, `urgency: high`;
- `tag` уведомления равен `{eventKey}:{entityId}`: повтор заменяет уведомление на устройстве;
- матрицу `notification_rules` по-прежнему меняет сид, руководитель её читает;
- тексты шаблонов по умолчанию лежат в фикстуре, руководитель правит их в CRM.

## Изменения контракта (v1.50)

### Схема

```ts
export const pushSubscriptions = sqliteTable(
	'push_subscriptions',
	{
		id: pk(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		createdAt: createdAt(),
		lastUsedAt: ts('last_used_at'),
		// Set by dispatch on 404 or 410 from the push service; session.cleanup deletes the row.
		expiredAt: ts('expired_at')
	},
	(t) => ({ endpointUq: uniqueIndex('push_endpoint_uq').on(t.endpoint) })
);
```

Миграция генерируется из схемы командой `pnpm db:generate`.

### Типы и схемы (§8)

```ts
// validation/push.ts
export const pushSubscriptionSchema = z.strictObject({
	endpoint: z.url({ protocol: /^https$/ }),
	p256dh: z.string().min(1),
	auth: z.string().min(1)
});
export const pushUnsubscribeSchema = z.strictObject({ endpoint: z.url({ protocol: /^https$/ }) });
export const pushTemplateSchema = z.strictObject({
	eventKey: z.enum(EVENT_KEYS),
	title: z.string().trim().min(1).max(80),
	body: z.string().trim().min(1).max(200),
	isActive: z.boolean()
});

// types/push.ts
export const DELIVERY_FAILURES = ['expired', 'driver'] as const;
export interface PushStateDto {
	publicKey: string;
	deviceCount: number;
}
export interface NotificationTemplateDto {
	eventKey: EventKey;
	channel: NotificationChannel;
	title: string;
	body: string;
	isActive: boolean;
	variables: readonly string[]; // EVENT_TEMPLATE_VARIABLES of the event
}
export interface NotificationTemplatePreviewDto {
	title: string;
	body: string;
}
export interface NotificationDeliveryDto extends NotificationLogItemDto {
	userId: number;
	userName: string;
	failure: DeliveryFailure | null; // null unless status is 'failed'
}

// types/notifications.ts
export const LIVE_CHANNELS = ['push'] as const; // max joins in C16
```

`notification_templates.subject` хранит заголовок пуша, `body` его текст. Шаблон один на пару «событие, канал» для обоих контуров.

`notifications.error` хранит код причины первым словом: `expired` или `driver`, дальше через двоеточие текст для серверного лога. DTO отдаёт только код.

### Роуты, права, аудит

| Роут                                    | Право             | Что делает                                                                                                                   |
| --------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/push/subscription`           | любой вошедший    | Сохраняет подписку текущего устройства. Идемпотентен по `endpoint`: повтор обновляет ключи и владельца, снимает `expired_at` |
| `DELETE /api/push/subscription`         | любой вошедший    | Удаляет свою подписку по `endpoint`. Чужой `endpoint` даёт 404                                                               |
| `/crm/settings/notifications`           | `settings.manage` | Матрица на чтение, как в C12                                                                                                 |
| `/crm/settings/notifications/templates` | `settings.manage` | Правка шаблонов, предпросмотр, отправка себе                                                                                 |
| `/crm/settings/notifications/log`       | `settings.manage` | Журнал отправок всех людей                                                                                                   |

Новое действие аудита одно: `notifications.template.update`. Подписка и отписка в аудит не пишутся: это настройка устройства, а не действие над данными.

### Правила §7.3

- fanout создаёт строку `notifications` канала `push` только человеку, у которого есть подписка без `expired_at`, и только если у события есть активный шаблон. Лента `notification_feed` пишется всем адресатам, как раньше;
- dispatch собирает текст из шаблона и БД на момент отправки и шлёт его на все живые подписки человека.

## Устройство

### PWA

- `static/manifest.webmanifest` дословно по §17.1, ссылка `<link rel="manifest">` и `theme-color` в `src/app.html`.
- `src/service-worker.ts` дословно по §17.2. SvelteKit собирает и регистрирует его сам.
- `scripts/icons.ts` рендерит `favicon.svg` в `icon-192.png`, `icon-512.png` и `maskable-512.png`. У maskable-иконки знак занимает центральные 60% холста. PNG коммитятся в `static/icons`, скрипт в сборке не участвует.
- `lib/ui/InstallPrompt.svelte`: кнопка «Установить приложение» по `beforeinstallprompt`, на iOS Safari инструкция «Поделиться, На экран Домой», в `display-mode: standalone` компонент пуст. Стоит в оболочке портала, на `/crm/shop` и `/crm/delivery`.

### Подписка на клиенте

Класс `PushState` в `lib/notifications/push-state.svelte.ts` держит три факта: поддержку API, разрешение браузера и наличие подписки. Методы:

- `enable()` запрашивает разрешение по нажатию, подписывает `pushManager` публичным ключом и отправляет подписку на сервер;
- `disable()` отписывает `pushManager` и удаляет строку на сервере;
- `sync()` вызывается при открытии приложения: если разрешение выдано, сверяет подписку браузера с сервером и молча отправляет её заново. Так лечится подписка, которую iOS отозвал после простоя.

Публичный ключ и число устройств приходят в `PushStateDto` из загрузчика личного экрана уведомлений и из layout обоих контуров.

`lib/notifications/PushToggle.svelte` рисует кнопку на `/portal/profile/notifications` и `/crm/notifications`. `lib/notifications/PushBanner.svelte` рисует плашку «Включите уведомления» рядом с `InstallPrompt`. Плашка видна, пока устройство не подписано и разрешение не отклонено; закрытие запоминается в `localStorage` этого устройства.

На iOS вне standalone пуш недоступен: вместо кнопки стоит текст «Сначала установите приложение на экран Домой».

### Сервер

| Файл                                             | Ответственность                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `notifications/drivers/push/webpush.ts`          | `WebPushDriver`: отправка через `web-push`, TTL и urgency, 404 и 410 бросают `PushGoneError`                                 |
| `notifications/drivers/push/select.ts`           | Выбор драйвера по `PUSH_DRIVER`, как у почты. `webpush` без ключей VAPID роняет запуск                                       |
| `notifications/push-subscription.repository.ts`  | Сохранение по `endpoint`, живые подписки человека, отметка `expired_at`, удаление помеченных                                 |
| `notifications/push-subscription.service.ts`     | Подписка и отписка актора, `PushStateDto`                                                                                    |
| `notifications/push-template.repository.ts`      | Чтение и запись `notification_templates` канала `push`                                                                       |
| `notifications/push-template.service.ts`         | Список, правка с аудитом, предпросмотр, отправка себе                                                                        |
| `notifications/push-message.service.ts`          | Сборка `PushMessage` для строки `notifications`: значения переменных из БД, ссылка по адресату, обрезка до 80 и 200 символов |
| `notifications/notification-delivery.service.ts` | Журнал руководителя: страница `NotificationDeliveryDto` с фильтрами                                                          |

`FakePushDriver` получает метод `goneOnce()`, чтобы тесты проходили путь 410.

### Dispatch

1. Строки нет: `InvalidPayloadError`. Статус `sent`: выход без отправки.
2. Живых подписок нет: `failed` с кодом `expired`, джоб завершается без ретрая.
3. Сообщение собирается из шаблона. Шаблона нет или он выключен: `failed` с кодом `driver`, без ретрая.
4. Отправка на каждую подписку. `PushGoneError` ставит подписке `expired_at`. Успех обновляет `last_used_at`.
5. Приняла хотя бы одна: `sent`. Все мертвы: `failed` с кодом `expired`, без ретрая. Остальные ошибки и таймаут: `failed` с кодом `driver`, джоб бросает ошибку и уходит в ретрай по бэкоффу, после пятой попытки `dead`.

Таймаут отправки на одну подписку 10 секунд: зависший сервис доставки не держит воркер.

### Шаблоны

`lib/domain/notification/template.ts` получает `EVENT_TEMPLATE_VARIABLES`: набор переменных на событие из §7.3. `unknownVariables` и `renderTemplate` принимают ключ события. Подстановка в один проход остаётся.

Ссылка в `PushMessage.url` относительная: путь из §7.3 без `ORIGIN`, потому что воркер открывает окно на своём хосте. Переменная `{{url}}` в тексте по-прежнему абсолютная.

Фикстура `scripts/fixtures/notification-templates.json` держит десять шаблонов. Сид вставляет шаблон, которого нет, и не перетирает правку руководителя. Переменная вне набора события роняет сид.

Предпросмотр подставляет образцовые значения из константы в `lib/domain/notification/template.ts` и ничего не читает из БД. «Отправить себе» шлёт тот же предпросмотр на живые подписки актора. Без подписок сервер отвечает ошибкой формы «Включите уведомления на этом устройстве».

### Уборка

`session.cleanup` удаляет подписки с `expired_at` в той же транзакции, что и сессии.

## Тесты

Критерии приёмки из DoD слайса и §17.5.

| Критерий                          | Тест                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Манифест отдаётся и валиден       | e2e: `GET /manifest.webmanifest`, обязательные поля, иконки отвечают 200                                                               |
| Воркер регистрируется, кеша нет   | e2e: регистрация активна, после логина, каталога и выхода `caches.keys()` пуст                                                         |
| Водитель получает пуш при `ready` | e2e с `FakePushDriver`: подписка водителя, переход в `ready`, в `sent` драйвера сообщение со ссылкой `/crm/delivery`                   |
| Пуш без цен и ПДн                 | контрактный юнит: сообщение каждого из десяти событий проходит строгую схему `title, body, url, tag`, в тексте нет суммы и ФИО         |
| Payload джоба по контракту        | контрактный: `notification.dispatch` против Zod-схемы топика                                                                           |
| Один эффект на повтор             | dispatch дважды: одна отправка; fanout дважды: одна строка; `session.cleanup` дважды                                                   |
| Путь ошибки                       | фейк драйвера: ошибка, таймаут, ретрай, `dead`; 410 ставит `expired_at`; все подписки мертвы: `failed expired` без ретрая              |
| Без устройства строки нет         | fanout человеку без подписки пишет ленту и не пишет `notifications`                                                                    |
| Личный переключатель работает     | выключенная пара в `user_notification_prefs`: строки `notifications` нет                                                               |
| Шаблон проверяется                | property-based: `renderTemplate` по событию, один проход, чужая переменная отклоняется; сервис отклоняет сохранение с чужой переменной |
| Правка шаблона в аудите           | сервисный: строка `notifications.template.update` с прежним и новым текстом                                                            |
| Чужая подписка недоступна         | `DELETE` чужого `endpoint` отвечает 404                                                                                                |
| Чужая роль не входит              | e2e: `driver` получает 403 на `/templates` и `/log`; запрос без сессии на `/api/push/subscription` сервер отклоняет                    |

Вручную на стенде `arhangel.pro` с боевыми ключами VAPID: установка на Android Chrome и iOS Safari, пуш водителю при `ready`, открытие карточки из уведомления.

## Что не входит

- офлайн, кеширование, фоновая синхронизация;
- правка матрицы из CRM;
- кнопки действий и картинки в уведомлении;
- список устройств человека с отзывом по одному;
- канал `max`, он остаётся за C16.

## Что нужно от владельца

- пара ключей VAPID для стенда, сгенерированная на VPS: `pnpm dlx web-push generate-vapid-keys`;
- адрес для `VAPID_SUBJECT`;
- телефоны на Android и iOS 16.4 или новее для ручной приёмки.
