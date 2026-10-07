# C15 PWA and Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app installs to a home screen and delivers the events of tech.md 7.3 as system notifications; a driver gets a push the moment a request turns `ready` and opens it from the notification.

**Architecture:** `notification.fanout` writes a `notifications` row of channel `push` for a person with a live subscription, `notification.dispatch` renders the template and sends it to every live subscription through `PushDriver`. A push-only service worker shows the notification and opens the link. The owner edits templates and reads the delivery log in `/crm/settings/notifications`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Zod 4, Drizzle SQLite, `web-push` on VAPID, Vitest, fast-check, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-pwa-web-push-design.md`. Contract: `tech.md` v1.49 in, v1.50 out, sections 5.9, 7.2, 7.3, 8, 14 (C15), 17.

## Global Constraints

- No offline mode: no `fetch` handler in the service worker, no Cache Storage, no `offline.html`, no background sync.
- Push payload carries a number, a short text and a link only: no prices, no personal data. Title at most 80 characters, body at most 200.
- `PushMessage.url` is a path on the app host (`/crm/delivery`), never an absolute URL.
- Push TTL is 4 hours (`14400` seconds), `urgency: 'high'`, send timeout 10 seconds per subscription, `tag` is `{eventKey}:{entityId}`.
- A person without a live subscription gets no `notifications` row. The feed row is written to every addressee as before.
- `notifications.error` starts with the failure code, `expired` or `driver`, then `: ` and the text for the server log. A DTO carries the code only.
- Rights are checked on the server in every entry point: `settings.manage` for templates and the log, the contour access right for a subscription. A portal read keeps the `counterpartyId` fence.
- The matrix `notification_rules` stays seed-owned; no CRM write to it.
- TypeScript strict, no `any`. Services extend `BaseService`, repositories `BaseRepository`. Files at most 250 lines, functions at most 40.
- Migrations only through `pnpm db:generate`. UI only from `lib/ui` primitives and tokens of `src/app.css`.
- Comments in English and about why. Placeholders in the short form «Введите …».
- Commits: Conventional Commits in English, scope from the list in `CLAUDE.md`, no co-author trailers, no generator lines, no emoji.
- Local e2e and build need `SESSION_SECRET` in the shell; stop a stale preview on port 4173 before `pnpm test:e2e`.

## Review Focus

- A second person signs in on the same browser and enables push: the endpoint moves to the new person and the previous one stops receiving on that device. Pinned in Task 4.
- A person is deactivated or deleted after a row is queued: dispatch sends nothing to their devices. Pinned in Task 4 (`liveOf`) and Task 6.
- A template renders longer than 80 or 200 characters after substitution (a long counterparty name): the text is clipped with an ellipsis, the driver does not reject it. Pinned in Task 5.
- The request, stock item or payroll week of a queued row is gone, or its template was switched off: the row turns `failed` once and the job does not retry or die in a loop. Pinned in Task 6.
- `VAPID_PUBLIC_KEY` is empty (dev, e2e): the toggle says push is unavailable and never calls `pushManager.subscribe`. A person who signs out stops receiving on that device. Pinned in Task 10.

## File Structure

| File                                                                                             | Responsibility                                                  |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `src/lib/types/push.ts`                                                                          | `PushStateDto`, template and delivery DTOs, `DELIVERY_FAILURES` |
| `src/lib/validation/push.ts`                                                                     | Zod schemas of subscription, template form, log filters         |
| `src/lib/domain/notification/template.ts`                                                        | Variables per event, one-pass render, sample values             |
| `src/lib/domain/notification/link.ts`                                                            | Path of an event for an audience                                |
| `src/lib/domain/notification/delivery.ts`                                                        | Failure code in and out of `notifications.error`, text clipping |
| `src/lib/server/notifications/drivers/push/webpush.ts`                                           | Real driver                                                     |
| `src/lib/server/notifications/drivers/push/select.ts`                                            | Driver by `PUSH_DRIVER`                                         |
| `src/lib/server/notifications/push-subscription.repository.ts`                                   | Rows of `push_subscriptions`                                    |
| `src/lib/server/notifications/push-subscription.service.ts`                                      | Subscribe, unsubscribe, state of the actor                      |
| `src/lib/server/notifications/push-facts.repository.ts`                                          | Recipient, stock item and payroll week facts for a message      |
| `src/lib/server/notifications/push-message.service.ts`                                           | `PushMessage` of one notification row                           |
| `src/lib/server/notifications/push-template.repository.ts`                                       | Rows of `notification_templates`, channel `push`                |
| `src/lib/server/notifications/push-template.service.ts`                                          | List, save with audit, preview, test send                       |
| `src/lib/server/notifications/notification-delivery.repository.ts`                               | Delivery log of all people                                      |
| `src/lib/server/notifications/notification-delivery.service.ts`                                  | Owner's log page                                                |
| `src/routes/api/push/subscription/+server.ts`                                                    | `POST`, `DELETE`                                                |
| `src/routes/(crm)/crm/settings/notifications/+layout.svelte`                                     | Three tabs                                                      |
| `src/routes/(crm)/crm/settings/notifications/templates/`                                         | Templates page                                                  |
| `src/routes/(crm)/crm/settings/notifications/log/`                                               | Log page                                                        |
| `src/lib/crm/notifications/TemplateForm.svelte`, `DeliveryTable.svelte`, `SettingsTabs.svelte`   | CRM components                                                  |
| `src/lib/notifications/push-state.svelte.ts`, `PushToggle.svelte`, `PushBanner.svelte`           | Client subscription                                             |
| `src/lib/ui/InstallPrompt.svelte`                                                                | Install button and iOS hint                                     |
| `static/manifest.webmanifest`, `static/icons/*.png`, `src/service-worker.ts`, `scripts/icons.ts` | PWA shell                                                       |

---

### Task 1: Contract v1.50, schema, types, validation

**Files:**

- Modify: `tech.md` (header, changelog, 5.9, 7.3, 8, 14 C15, 17.3)
- Modify: `src/lib/server/db/schema/system.ts` (`pushSubscriptions`)
- Create: `src/lib/types/push.ts`, `src/lib/validation/push.ts`
- Modify: `src/lib/types/index.ts` (re-export, if the barrel lists files)
- Create: `drizzle/*` through `pnpm db:generate`
- Test: `tests/unit/push-validation.spec.ts`

**Interfaces:**

- Produces: `pushSubscriptions.expiredAt`; `pushSubscriptionSchema`, `pushUnsubscribeSchema`, `pushTemplateSchema`, `deliveryFiltersSchema` and their `z.infer` types `PushSubscriptionInput`, `PushTemplateInput`, `DeliveryFilters`; `PushStateDto`, `NotificationTemplateDto`, `NotificationTemplatePreviewDto`, `NotificationDeliveryDto`, `DELIVERY_FAILURES`, `DeliveryFailure`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/push-validation.spec.ts
import { describe, expect, it } from 'vitest';
import {
	deliveryFiltersSchema,
	pushSubscriptionSchema,
	pushTemplateSchema
} from '../../src/lib/validation/push';

const subscription = { endpoint: 'https://push.example/sub/1', p256dh: 'key', auth: 'secret' };

describe('push validation (C15)', () => {
	it('accepts a subscription of the browser', () => {
		expect(pushSubscriptionSchema.safeParse(subscription).success).toBe(true);
	});

	it('refuses a plain http endpoint and a stray field', () => {
		const http = { ...subscription, endpoint: 'http://push.example/sub/1' };
		expect(pushSubscriptionSchema.safeParse(http).success).toBe(false);
		expect(pushSubscriptionSchema.safeParse({ ...subscription, userId: 7 }).success).toBe(false);
	});

	it('keeps a template inside the limits of a notification', () => {
		const form = { eventKey: 'request.ready', title: 'Заявка {{number}}', body: 'Готова' };
		expect(pushTemplateSchema.parse({ ...form, isActive: 'on' }).isActive).toBe(true);
		expect(pushTemplateSchema.parse(form).isActive).toBe(false);
		expect(pushTemplateSchema.safeParse({ ...form, title: 'а'.repeat(81) }).success).toBe(false);
		expect(pushTemplateSchema.safeParse({ ...form, body: '  ' }).success).toBe(false);
		expect(pushTemplateSchema.safeParse({ ...form, eventKey: 'request.lost' }).success).toBe(false);
	});

	it('reads empty log filters as no filter', () => {
		expect(deliveryFiltersSchema.parse({ eventKey: '', status: '' })).toEqual({});
		expect(deliveryFiltersSchema.parse({ status: 'failed' })).toEqual({ status: 'failed' });
	});
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm vitest run tests/unit/push-validation.spec.ts`
Expected: FAIL, module `validation/push` not found.

- [ ] **Step 3: Write types and schemas**

```ts
// src/lib/types/push.ts
import type { EventKey } from './events';
import type { NotificationChannel, NotificationLogItemDto } from './notifications';

export const DELIVERY_FAILURES = ['expired', 'driver'] as const;
export type DeliveryFailure = (typeof DELIVERY_FAILURES)[number];

/** What a page needs to offer push on this device. An empty key means push is not configured. */
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
	variables: readonly string[];
}

export interface NotificationTemplatePreviewDto {
	title: string;
	body: string;
}

/** A line of the owner's log. The driver answer stays on the server, the code is all that leaves. */
export interface NotificationDeliveryDto extends NotificationLogItemDto {
	userId: number;
	userName: string;
	failure: DeliveryFailure | null;
}
```

```ts
// src/lib/validation/push.ts
import { z } from 'zod';
import { EVENT_KEYS } from '$lib/types/events';
import { NOTIFICATION_STATUSES } from '$lib/types/notifications';

const endpoint = z.url({ protocol: /^https$/ }).max(2000);

export const pushSubscriptionSchema = z.strictObject({
	endpoint,
	p256dh: z.string().min(1).max(200),
	auth: z.string().min(1).max(100)
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.strictObject({ endpoint });

// A checkbox sends `on` or nothing, so an absent field means the template is switched off.
export const pushTemplateSchema = z.strictObject({
	eventKey: z.enum(EVENT_KEYS, { error: 'Неизвестное событие' }),
	title: z.string().trim().min(1, 'Введите заголовок').max(80, 'Заголовок длиннее 80 символов'),
	body: z.string().trim().min(1, 'Введите текст').max(200, 'Текст длиннее 200 символов'),
	isActive: z.preprocess((value) => value === 'on' || value === true, z.boolean())
});
export type PushTemplateInput = z.infer<typeof pushTemplateSchema>;

const optional = <T extends z.ZodType>(schema: T) =>
	z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** Filters of the owner's log. Unknown query keys are dropped, an empty value means no filter. */
export const deliveryFiltersSchema = z.object({
	eventKey: optional(z.enum(EVENT_KEYS)),
	status: optional(z.enum(NOTIFICATION_STATUSES))
});
export type DeliveryFilters = z.infer<typeof deliveryFiltersSchema>;
```

`deliveryFiltersSchema.parse({ eventKey: '', status: '' })` must equal `{}`: if Zod keeps the keys as `undefined`, add `.transform((value) => definedProps(value))` with `definedProps` from `$lib/utils/props`.

- [ ] **Step 4: Add the column**

In `src/lib/server/db/schema/system.ts`, inside `pushSubscriptions`, after `lastUsedAt`:

```ts
// Set by dispatch on 404 or 410 from the push service; session.cleanup deletes the row.
expiredAt: ts('expired_at');
```

Run: `pnpm db:generate`. Expected: one new SQL file with `ALTER TABLE push_subscriptions ADD expired_at integer`. Do not edit it.

- [ ] **Step 5: Update `tech.md` to v1.50**

- Header: version `v1.50`, date `07.10.2026`.
- Changelog row `v1.50` in one paragraph: `push_subscriptions.expired_at`; `types/push.ts` and `validation/push.ts`; routes `POST`/`DELETE /api/push/subscription`, `/crm/settings/notifications/templates`, `/crm/settings/notifications/log`; audit action `notifications.template.update`; `LIVE_CHANNELS = ['push']`; fanout rule about a live subscription and an active template; `PushMessage.url` is a path; failure code in `notifications.error`; test send bypasses `notifications`; a subscription of a device has one owner at a time.
- 5.9: the `pushSubscriptions` block gets `expiredAt`.
- 7.3: replace the bullet «живых каналов до C15 нет» with the two rules of the spec section «Правила §7.3»; in the last paragraph replace «делает C15 … до него `notification_templates` пуста» with the present tense.
- 8: `LIVE_CHANNELS = ['push']`, the blocks of `push.ts` types and schemas from Step 3.
- 14, C15: add «(контракт v1.50)».
- 17.3: «мёртвая подписка получает `expired_at` в `notification.dispatch`».

- [ ] **Step 6: Run, check, commit**

Run: `pnpm vitest run tests/unit/push-validation.spec.ts && pnpm check`
Expected: PASS, no type errors.

```bash
git add tech.md src/lib/types src/lib/validation/push.ts src/lib/server/db/schema/system.ts drizzle tests/unit/push-validation.spec.ts
git commit -m "feat(queue): add the push contract of v1.50"
```

---

### Task 2: Templates per event, links, default texts

**Files:**

- Modify: `src/lib/domain/notification/template.ts`
- Create: `src/lib/domain/notification/link.ts`, `src/lib/domain/notification/delivery.ts`
- Modify: `scripts/seed/schema.ts` (`notificationTemplateFixture`), `scripts/fixtures/notification-templates.json`
- Test: `tests/domain/notification-template.spec.ts` (rewrite), `tests/domain/notification-link.spec.ts`, `tests/domain/notification-delivery.spec.ts`, `tests/unit/seed-templates.spec.ts`

**Interfaces:**

- Produces:
  - `EVENT_TEMPLATE_VARIABLES: Record<EventKey, readonly string[]>`
  - `type TemplateValues = Readonly<Record<string, string>>`
  - `unknownVariables(eventKey: EventKey, text: string): string[]`
  - `renderTemplate(eventKey: EventKey, text: string, values: TemplateValues): string`
  - `TEMPLATE_SAMPLES: Record<EventKey, TemplateValues>`
  - `type Audience = 'portal' | 'crm_registry' | 'crm_floor'`
  - `eventPath(eventKey: EventKey, entityId: number, audience: Audience, weekStart?: string): string`
  - `failureText(code: DeliveryFailure, detail: string): string`, `failureOf(error: string | null): DeliveryFailure | null`, `clip(text: string, max: number): string`

- [ ] **Step 1: Rewrite the template test**

```ts
// tests/domain/notification-template.spec.ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	EVENT_TEMPLATE_VARIABLES,
	TEMPLATE_SAMPLES,
	renderTemplate,
	unknownVariables
} from '../../src/lib/domain/notification/template';
import { EVENT_KEYS } from '../../src/lib/types/events';

const eventKey = fc.constantFrom(...EVENT_KEYS);
const plain = fc.string().filter((s) => !s.includes('{{'));

/** An event with a value for each of its variables. */
const scene = eventKey.chain((key) =>
	fc.record({
		key: fc.constant(key),
		values: fc.record(
			Object.fromEntries(EVENT_TEMPLATE_VARIABLES[key].map((name) => [name, fc.string()]))
		),
		names: fc.array(fc.constantFrom(...EVENT_TEMPLATE_VARIABLES[key]), { maxLength: 6 })
	})
);

describe('notification templates per event (C15)', () => {
	it('fills every placeholder of the event with its value', () => {
		fc.assert(
			fc.property(scene, fc.array(plain, { minLength: 7, maxLength: 7 }), (s, leads) => {
				const text = s.names.map((name, i) => `${leads[i]}{{ ${name} }}`).join('') + leads[6];
				const expected =
					s.names.map((name, i) => `${leads[i]}${s.values[name]}`).join('') + leads[6];
				expect(renderTemplate(s.key, text, s.values)).toBe(expected);
			})
		);
	});

	it('never expands a placeholder that arrives inside a value', () => {
		const values = { ...TEMPLATE_SAMPLES['request.ready'], externalNumber: '{{number}}' };
		expect(renderTemplate('request.ready', 'Ваш номер: {{externalNumber}}', values)).toBe(
			'Ваш номер: {{number}}'
		);
	});

	it('leaves text without placeholders untouched', () => {
		fc.assert(
			fc.property(eventKey, plain, (key, text) => {
				expect(renderTemplate(key, text, TEMPLATE_SAMPLES[key])).toBe(text);
			})
		);
	});

	it('refuses a variable of another event and a money variable', () => {
		expect(unknownVariables('payroll.week_closed', 'Заявка {{number}} за {{period}}')).toEqual([
			'number'
		]);
		expect(unknownVariables('request.ready', '{{ totalMinor }}')).toEqual(['totalMinor']);
		expect(() =>
			renderTemplate('request.ready', '{{item}}', TEMPLATE_SAMPLES['request.ready'])
		).toThrow(/item/);
	});

	it('has a sample value for every variable of every event', () => {
		for (const key of EVENT_KEYS) {
			expect(Object.keys(TEMPLATE_SAMPLES[key]).sort()).toEqual(
				[...EVENT_TEMPLATE_VARIABLES[key]].sort()
			);
		}
	});
});
```

- [ ] **Step 2: Write link and delivery tests**

```ts
// tests/domain/notification-link.spec.ts
import { describe, expect, it } from 'vitest';
import { eventPath } from '../../src/lib/domain/notification/link';

describe('where an event leads (tech.md 7.3)', () => {
	it('opens a request in the contour of the reader', () => {
		expect(eventPath('request.ready', 42, 'portal')).toBe('/portal/requests/42');
		expect(eventPath('request.ready', 42, 'crm_registry')).toBe('/crm/requests/42');
		expect(eventPath('request.ready', 42, 'crm_floor')).toBe('/crm/delivery');
	});

	it('opens the stock item and the payroll week', () => {
		expect(eventPath('stock.below_threshold', 5, 'crm_registry')).toBe('/crm/stock/5');
		expect(eventPath('payroll.week_closed', 9, 'crm_registry', '2026-10-05')).toBe(
			'/crm/payroll?week=2026-10-05'
		);
		expect(eventPath('payroll.week_closed', 9, 'crm_registry')).toBe('/crm/payroll');
	});
});
```

```ts
// tests/domain/notification-delivery.spec.ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clip, failureOf, failureText } from '../../src/lib/domain/notification/delivery';

describe('delivery failure codes and clipping (C15)', () => {
	it('reads back the code it wrote', () => {
		expect(failureOf(failureText('expired', 'gone: 410'))).toBe('expired');
		expect(failureOf(failureText('driver', 'timeout'))).toBe('driver');
	});

	it('reads an old or empty error as no code', () => {
		expect(failureOf(null)).toBeNull();
		expect(failureOf('channel push is not live')).toBeNull();
	});

	it('never returns more than the limit and keeps short text as is', () => {
		fc.assert(
			fc.property(fc.string(), fc.integer({ min: 1, max: 300 }), (text, max) => {
				const clipped = clip(text, max);
				expect([...clipped].length).toBeLessThanOrEqual(max);
				if ([...text].length <= max) expect(clipped).toBe(text);
			})
		);
	});

	it('marks a cut with an ellipsis', () => {
		expect(clip('Ритуальная служба', 8)).toBe('Ритуаль…');
	});
});
```

- [ ] **Step 3: Run and see them fail**

Run: `pnpm vitest run tests/domain/notification-template.spec.ts tests/domain/notification-link.spec.ts tests/domain/notification-delivery.spec.ts`
Expected: FAIL, missing exports.

- [ ] **Step 4: Implement the domain**

```ts
// src/lib/domain/notification/template.ts
import { REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';

const REQUEST_VARIABLES = ['number', 'status', 'url', 'counterparty', 'externalNumber'] as const;

/** Variables a template of the event may use (tech.md 7.3). No money on any of the lists. */
export const EVENT_TEMPLATE_VARIABLES: Readonly<Record<EventKey, readonly string[]>> = {
	...(Object.fromEntries(REQUEST_EVENT_KEYS.map((key) => [key, REQUEST_VARIABLES])) as Record<
		EventKey,
		readonly string[]
	>),
	'stock.below_threshold': ['item', 'code', 'balance', 'threshold', 'unit', 'url'],
	'payroll.week_closed': ['period', 'url']
};

export type TemplateValues = Readonly<Record<string, string>>;

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** Placeholders the event does not offer. The seed and the CRM form refuse such a text. */
export function unknownVariables(eventKey: EventKey, text: string): string[] {
	const known = EVENT_TEMPLATE_VARIABLES[eventKey];
	const names = [...text.matchAll(PLACEHOLDER)].map(([, name]) => name ?? '');
	return [...new Set(names.filter((name) => !known.includes(name)))];
}

/**
 * Fills `{{ name }}` placeholders in one pass: a value that itself looks like a placeholder, such
 * as a counterparty's own order number, is printed as is and never expanded.
 * @throws Error on a placeholder outside the variables of the event.
 */
export function renderTemplate(eventKey: EventKey, text: string, values: TemplateValues): string {
	const unknown = unknownVariables(eventKey, text);
	if (unknown.length > 0) throw new Error(`unknown template variables: ${unknown.join(', ')}`);
	return text.replace(PLACEHOLDER, (_, name: string) => values[name] ?? '');
}

const REQUEST_SAMPLE: TemplateValues = {
	number: '2026-0042',
	status: 'Готов к выдаче',
	url: 'https://example.ru/crm/requests/42',
	counterparty: 'Ритуал-Сервис',
	externalNumber: 'РС-118'
};

/** What the preview and the test push show in place of live data. */
export const TEMPLATE_SAMPLES: Readonly<Record<EventKey, TemplateValues>> = {
	...(Object.fromEntries(REQUEST_EVENT_KEYS.map((key) => [key, REQUEST_SAMPLE])) as Record<
		EventKey,
		TemplateValues
	>),
	'stock.below_threshold': {
		item: 'Ткань обивочная',
		code: 'TK-01',
		balance: '4',
		threshold: '10',
		unit: 'м',
		url: 'https://example.ru/crm/stock/5'
	},
	'payroll.week_closed': {
		period: '05.10.2026 по 11.10.2026',
		url: 'https://example.ru/crm/payroll?week=2026-10-05'
	}
};
```

```ts
// src/lib/domain/notification/link.ts
import { REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';

/** Who reads the event: a portal person, a workshop person with the registry, or one without it. */
export type Audience = 'portal' | 'crm_registry' | 'crm_floor';

/** Path of the screen an event opens (tech.md 7.3). The server checks the right there again. */
export function eventPath(
	eventKey: EventKey,
	entityId: number,
	audience: Audience,
	weekStart?: string
): string {
	if (REQUEST_EVENT_KEYS.includes(eventKey)) {
		if (audience === 'portal') return `/portal/requests/${entityId}`;
		return audience === 'crm_registry' ? `/crm/requests/${entityId}` : '/crm/delivery';
	}
	if (eventKey === 'stock.below_threshold') return `/crm/stock/${entityId}`;
	return weekStart === undefined ? '/crm/payroll' : `/crm/payroll?week=${weekStart}`;
}
```

```ts
// src/lib/domain/notification/delivery.ts
import { DELIVERY_FAILURES, type DeliveryFailure } from '$lib/types/push';

/** `notifications.error` leads with the code, so the log can show a reason without the raw answer. */
export function failureText(code: DeliveryFailure, detail: string): string {
	return `${code}: ${detail}`;
}

export function failureOf(error: string | null): DeliveryFailure | null {
	const code = error?.split(':', 1)[0];
	return DELIVERY_FAILURES.find((known) => known === code) ?? null;
}

/** Cuts by code points, so a clipped text never ends on half a character. */
export function clip(text: string, max: number): string {
	const chars = [...text];
	return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}
```

- [ ] **Step 5: Seed fixture**

`scripts/seed/schema.ts`, replace `notificationTemplateFixture` (and drop the `templateText` refine it used):

```ts
export const notificationTemplateFixture = z
	.object({
		eventKey: z.enum(EVENT_KEYS),
		channel: z.enum(NOTIFICATION_CHANNELS),
		subject: z.string().min(1).max(80),
		body: z.string().min(1).max(200)
	})
	.refine(
		(row) => unknownVariables(row.eventKey, `${row.subject} ${row.body}`).length === 0,
		'unknown template variable'
	);
```

`scripts/fixtures/notification-templates.json`:

```json
[
	{
		"eventKey": "request.submitted",
		"channel": "push",
		"subject": "Новая заявка {{number}}",
		"body": "Заказчик: {{counterparty}}"
	},
	{
		"eventKey": "request.accepted",
		"channel": "push",
		"subject": "Заявка {{number}} принята",
		"body": "Мастерская взяла заявку в работу"
	},
	{
		"eventKey": "request.ready",
		"channel": "push",
		"subject": "Заявка {{number}} готова",
		"body": "Изделия готовы к выдаче"
	},
	{
		"eventKey": "request.delivered",
		"channel": "push",
		"subject": "Заявка {{number}} доставлена",
		"body": "Водитель передал изделия"
	},
	{
		"eventKey": "request.cancelled",
		"channel": "push",
		"subject": "Заявка {{number}} отменена",
		"body": "Заказчик: {{counterparty}}"
	},
	{
		"eventKey": "request.rejected",
		"channel": "push",
		"subject": "Заявка {{number}} отклонена",
		"body": "Мастерская не приняла заявку"
	},
	{
		"eventKey": "request.payment_marked",
		"channel": "push",
		"subject": "Оплата по заявке {{number}}",
		"body": "Мастерская отметила платёж"
	},
	{
		"eventKey": "request.paid",
		"channel": "push",
		"subject": "Заявка {{number}} оплачена",
		"body": "Оплата покрыла всю сумму"
	},
	{
		"eventKey": "stock.below_threshold",
		"channel": "push",
		"subject": "Остаток ниже порога",
		"body": "{{item}}: {{balance}} {{unit}}, порог {{threshold}}"
	},
	{
		"eventKey": "payroll.week_closed",
		"channel": "push",
		"subject": "Неделя закрыта",
		"body": "Ведомость за {{period}} готова к выплате"
	}
]
```

Fix the comment in `seedNotificationTemplates` (`scripts/seed/reference.ts`): «C15 edits the texts in the CRM».

```ts
// tests/unit/seed-templates.spec.ts
import { describe, expect, it } from 'vitest';
import { seedNotificationTemplates } from '../../scripts/seed/reference';
import { notificationTemplateFixture } from '../../scripts/seed/schema';
import { notificationTemplates } from '../../src/lib/server/db/schema';
import { EVENT_KEYS } from '../../src/lib/types/events';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();

describe('seed of push templates (C15)', () => {
	it('writes one push template per event and keeps an edited text on a rerun', () => {
		expect(seedNotificationTemplates(db)).toBe(EVENT_KEYS.length);
		db.update(notificationTemplates).set({ body: 'Свой текст' }).run();

		seedNotificationTemplates(db);

		const rows = db.select().from(notificationTemplates).all();
		expect(rows.map((row) => row.eventKey).sort()).toEqual([...EVENT_KEYS].sort());
		expect(rows.every((row) => row.channel === 'push' && row.body === 'Свой текст')).toBe(true);
	});

	it('refuses a fixture row with a variable of another event', () => {
		const row = {
			eventKey: 'payroll.week_closed',
			channel: 'push',
			subject: 'Неделя',
			body: '{{number}}'
		};
		expect(notificationTemplateFixture.safeParse(row).success).toBe(false);
	});
});
```

- [ ] **Step 6: Fix other callers, run, commit**

Run: `grep -rn "TEMPLATE_VARIABLES\|renderTemplate\|unknownVariables" src scripts tests` and move every caller to the per-event signatures.

Run: `pnpm vitest run tests/domain tests/unit/seed-templates.spec.ts && pnpm check`
Expected: PASS.

```bash
git add src/lib/domain/notification scripts tests/domain tests/unit/seed-templates.spec.ts
git commit -m "feat(queue): bind template variables to the event"
```

---

### Task 3: Web Push driver

**Files:**

- Modify: `package.json` (`web-push`, dev `@types/web-push`)
- Modify: `src/lib/server/notifications/drivers/push/index.ts`, `fake.ts`
- Create: `src/lib/server/notifications/drivers/push/webpush.ts`, `select.ts`
- Modify: `src/lib/server/config.ts`
- Test: `tests/unit/push-driver.spec.ts` (extend), `tests/unit/webpush-driver.spec.ts`, config test file that covers `parseConfig` (find with `grep -rln parseConfig tests`)

**Interfaces:**

- Produces: `class PushGoneError extends Error { readonly endpoint: string }`; `FakePushDriver.goneOnce(): void`; `class WebPushDriver implements PushDriver`; `PUSH_TTL_SECONDS`, `PUSH_TIMEOUT_MS`; `pushDriver(): PushDriver`; `createPushDriver(env): PushDriver`.

- [ ] **Step 1: Install**

Run: `pnpm add web-push && pnpm add -D @types/web-push`

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/webpush-driver.spec.ts
import { describe, expect, it } from 'vitest';
import { WebPushError } from 'web-push';
import { PushGoneError } from '../../src/lib/server/notifications/drivers/push';
import {
	PUSH_TIMEOUT_MS,
	PUSH_TTL_SECONDS,
	WebPushDriver,
	type PushTransport
} from '../../src/lib/server/notifications/drivers/push/webpush';

const vapid = { subject: 'mailto:owner@example.ru', publicKey: 'pub', privateKey: 'priv' };
const target = { endpoint: 'https://push.example/sub/1', p256dh: 'key', auth: 'secret' };
const message = { title: 'Заявка 2026-0042', body: 'Готова', url: '/crm/delivery', tag: 'r:42' };

function answering(statusCode: number): PushTransport {
	return () => Promise.reject(new WebPushError('refused', statusCode, {}, '', target.endpoint));
}

describe('web push driver (C15)', () => {
	it('sends the message as JSON with the TTL, the urgency and the timeout of the plan', async () => {
		const calls: Parameters<PushTransport>[] = [];
		const driver = new WebPushDriver(vapid, (...args) => {
			calls.push(args);
			return Promise.resolve();
		});

		await driver.send(target, message);

		const [subscription, payload, options] = calls[0] ?? [];
		expect(subscription).toEqual({
			endpoint: target.endpoint,
			keys: { p256dh: 'key', auth: 'secret' }
		});
		expect(JSON.parse(String(payload))).toEqual(message);
		expect(options).toEqual({
			vapidDetails: vapid,
			TTL: PUSH_TTL_SECONDS,
			urgency: 'high',
			timeout: PUSH_TIMEOUT_MS
		});
		expect(PUSH_TTL_SECONDS).toBe(14_400);
	});

	it('reports a subscription the push service no longer knows', async () => {
		for (const status of [404, 410]) {
			await expect(
				new WebPushDriver(vapid, answering(status)).send(target, message)
			).rejects.toBeInstanceOf(PushGoneError);
		}
	});

	it('passes any other refusal on for a retry', async () => {
		const failure = new WebPushDriver(vapid, answering(503)).send(target, message);
		await expect(failure).rejects.toBeInstanceOf(WebPushError);
	});
});
```

Add to `tests/unit/push-driver.spec.ts`:

```ts
it('reports a gone subscription once on request', async () => {
	driver.goneOnce();

	await expect(driver.send(target, message)).rejects.toBeInstanceOf(PushGoneError);
	await driver.send(target, message);

	expect(driver.sent).toHaveLength(1);
});
```

Add to the config spec:

```ts
it('refuses real push without VAPID keys or a contact', () => {
	const env = { SESSION_SECRET: 's'.repeat(32), PUSH_DRIVER: 'webpush' };
	expect(() => parseConfig(env)).toThrow(/VAPID_PUBLIC_KEY/);
	expect(() => parseConfig({ ...env, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toThrow(
		/VAPID_SUBJECT/
	);
	expect(
		parseConfig({
			...env,
			VAPID_PUBLIC_KEY: 'pub',
			VAPID_PRIVATE_KEY: 'priv',
			VAPID_SUBJECT: 'mailto:a@b.ru'
		}).PUSH_DRIVER
	).toBe('webpush');
});
```

- [ ] **Step 3: Run and see them fail**

Run: `pnpm vitest run tests/unit/push-driver.spec.ts tests/unit/webpush-driver.spec.ts`
Expected: FAIL, `PushGoneError` and `webpush` module missing.

- [ ] **Step 4: Implement**

`index.ts`, add:

```ts
/** The push service answered 404 or 410: the subscription will never accept a message again. */
export class PushGoneError extends Error {
	constructor(readonly endpoint: string) {
		super('push subscription is gone');
		this.name = 'PushGoneError';
	}
}
```

`fake.ts`: add `private goneNext = false;`, `goneOnce(): void { this.goneNext = true; }`, clear it in `reset()`, and in `send` after the validation:

```ts
if (this.goneNext) {
	this.goneNext = false;
	throw new PushGoneError(target.endpoint);
}
```

```ts
// src/lib/server/notifications/drivers/push/webpush.ts
import webpush, { WebPushError } from 'web-push';
import { PushGoneError, type PushDriver, type PushMessage, type PushTarget } from './index';

// A request ready in the evening must not ring at dawn: the push service drops it after four hours.
export const PUSH_TTL_SECONDS = 14_400;
export const PUSH_TIMEOUT_MS = 10_000;

export interface VapidDetails {
	readonly subject: string;
	readonly publicKey: string;
	readonly privateKey: string;
}

export type PushTransport = (
	subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
	payload: string,
	options: { vapidDetails: VapidDetails; TTL: number; urgency: 'high'; timeout: number }
) => Promise<unknown>;

export class WebPushDriver implements PushDriver {
	constructor(
		private readonly vapid: VapidDetails,
		private readonly transport: PushTransport = (subscription, payload, options) =>
			webpush.sendNotification(subscription, payload, options)
	) {}

	async send(target: PushTarget, message: PushMessage): Promise<void> {
		const subscription = {
			endpoint: target.endpoint,
			keys: { p256dh: target.p256dh, auth: target.auth }
		};
		try {
			await this.transport(subscription, JSON.stringify(message), {
				vapidDetails: this.vapid,
				TTL: PUSH_TTL_SECONDS,
				urgency: 'high',
				timeout: PUSH_TIMEOUT_MS
			});
		} catch (err) {
			if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
				throw new PushGoneError(target.endpoint);
			}
			throw err;
		}
	}
}
```

```ts
// src/lib/server/notifications/drivers/push/select.ts
import { config, type AppConfig } from '../../../config';
import { fakePushDriver } from './fake';
import type { PushDriver } from './index';
import { WebPushDriver } from './webpush';

type PushConfig = Pick<
	AppConfig,
	'PUSH_DRIVER' | 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'
>;

export function createPushDriver(env: PushConfig): PushDriver {
	if (env.PUSH_DRIVER === 'fake') return fakePushDriver;
	return new WebPushDriver({
		subject: env.VAPID_SUBJECT,
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY
	});
}

let selected: PushDriver | null = null;

/** The driver `PUSH_DRIVER` names, one per process. */
export function pushDriver(): PushDriver {
	selected ??= createPushDriver(config);
	return selected;
}
```

`config.ts`, in `superRefine`, replace the early `return` of the mail check with an `if` block and add:

```ts
// A subscription is bound to the public key, and Apple refuses a push without a real contact.
if (env.PUSH_DRIVER === 'webpush') {
	for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const) {
		if (env[key] === '') {
			issues.addIssue({
				code: 'custom',
				path: [key],
				message: 'required when PUSH_DRIVER=webpush'
			});
		}
	}
	if (!/^(mailto:.+@.+|https:\/\/.+)/.test(env.VAPID_SUBJECT)) {
		issues.addIssue({
			code: 'custom',
			path: ['VAPID_SUBJECT'],
			message: 'a mailto: address or an https URL is required when PUSH_DRIVER=webpush'
		});
	}
}
```

Add `PUSH_DRIVER=fake` with a comment line to `.env.example` if it is not there.

- [ ] **Step 5: Run and commit**

Run: `pnpm vitest run tests/unit/push-driver.spec.ts tests/unit/webpush-driver.spec.ts && pnpm vitest run -t "VAPID" && pnpm check`
Expected: PASS.

```bash
git add package.json pnpm-lock.yaml src/lib/server/notifications/drivers/push src/lib/server/config.ts .env.example tests/unit
git commit -m "feat(queue): send pushes through web-push on VAPID"
```

---

### Task 4: Subscriptions and their endpoint

**Files:**

- Create: `src/lib/server/notifications/push-subscription.repository.ts`, `push-subscription.service.ts`
- Create: `src/routes/api/push/subscription/+server.ts`
- Test: `tests/unit/push-subscription.spec.ts`

**Interfaces:**

- Consumes: `pushSubscriptionSchema`, `pushUnsubscribeSchema`, `PushSubscriptionInput`, `PushStateDto` (Task 1).
- Produces:
  - `interface LiveSubscription { id: number; endpoint: string; p256dh: string; auth: string }`
  - `PushSubscriptionRepository`: `save(userId: number, input: PushSubscriptionInput, tx?: Tx): void`, `liveOf(userId: number, tx?: Tx): LiveSubscription[]`, `hasLive(userId: number, tx?: Tx): boolean`, `remove(userId: number, endpoint: string, tx?: Tx): boolean`, `markExpired(id: number, at: Date, tx?: Tx): void`, `touch(id: number, at: Date, tx?: Tx): void`, `purgeExpired(tx?: Tx): number`
  - `PushSubscriptionService(ctx, repo?, publicKey?)`: `state(): PushStateDto`, `subscribe(input): PushStateDto`, `unsubscribe(endpoint: string): PushStateDto`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/push-subscription.spec.ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/lib/server/core/errors';
import { pushSubscriptions, users } from '../../src/lib/server/db/schema';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { PushSubscriptionService } from '../../src/lib/server/notifications/push-subscription.service';
import type { ActorContext } from '../../src/lib/types/actor';
import { insertCounterparty, insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const repo = new PushSubscriptionRepository();
const driverId = insertUser({ email: 'drv@push.example', role: 'driver', counterpartyId: null });
const otherId = insertUser({ email: 'mgr@push.example', role: 'manager', counterpartyId: null });
const agencyId = insertCounterparty('Агентство пушей');
const portalId = insertUser({
	email: 'cp@push.example',
	role: 'cp_employee',
	counterpartyId: agencyId
});

const phone = { endpoint: 'https://push.example/sub/phone', p256dh: 'k1', auth: 'a1' };
const tablet = { endpoint: 'https://push.example/sub/tablet', p256dh: 'k2', auth: 'a2' };

function actor(
	userId: number,
	scope: 'crm' | 'portal',
	roles: ActorContext['roles']
): ActorContext {
	return {
		userId,
		scope,
		roles,
		counterpartyId: scope === 'portal' ? agencyId : null,
		canSeePrices: false,
		requestId: 'test'
	};
}
const driver = actor(driverId, 'crm', ['driver']);
const other = actor(otherId, 'crm', ['manager']);
const service = (ctx: ActorContext) => new PushSubscriptionService(ctx, repo, 'public-key');

beforeEach(() => {
	db.delete(pushSubscriptions).run();
	db.update(users).set({ isActive: true, deletedAt: null }).run();
});

describe('push subscriptions (C15)', () => {
	it('stores every device of a person and counts them', () => {
		service(driver).subscribe(phone);

		expect(service(driver).subscribe(tablet)).toEqual({ publicKey: 'public-key', deviceCount: 2 });
		expect(
			repo
				.liveOf(driverId)
				.map((row) => row.endpoint)
				.sort()
		).toEqual([phone.endpoint, tablet.endpoint]);
	});

	it('keeps one row when the same device subscribes twice and takes the new keys', () => {
		service(driver).subscribe(phone);
		service(driver).subscribe({ ...phone, p256dh: 'rotated' });

		expect(repo.liveOf(driverId)).toMatchObject([{ endpoint: phone.endpoint, p256dh: 'rotated' }]);
	});

	it('moves a device to the person who subscribed on it last', () => {
		service(driver).subscribe(phone);

		service(other).subscribe(phone);

		expect(repo.liveOf(driverId)).toEqual([]);
		expect(repo.liveOf(otherId)).toHaveLength(1);
	});

	it('brings an expired device back when it subscribes again', () => {
		service(driver).subscribe(phone);
		const [row] = repo.liveOf(driverId);
		repo.markExpired(row?.id ?? 0, new Date());
		expect(repo.hasLive(driverId)).toBe(false);

		service(driver).subscribe(phone);

		expect(repo.hasLive(driverId)).toBe(true);
	});

	it('sends nothing to a deactivated or deleted account', () => {
		service(driver).subscribe(phone);

		db.update(users).set({ isActive: false }).where(eq(users.id, driverId)).run();
		expect(repo.liveOf(driverId)).toEqual([]);
		db.update(users)
			.set({ isActive: true, deletedAt: new Date() })
			.where(eq(users.id, driverId))
			.run();
		expect(repo.hasLive(driverId)).toBe(false);
	});

	it('removes the own device and answers not found for a device of somebody else', () => {
		service(driver).subscribe(phone);

		expect(() => service(other).unsubscribe(phone.endpoint)).toThrow(NotFoundError);
		expect(service(driver).unsubscribe(phone.endpoint).deviceCount).toBe(0);
	});

	it('serves a portal person the same way', () => {
		const portal = actor(portalId, 'portal', ['cp_employee']);
		expect(service(portal).subscribe(phone).deviceCount).toBe(1);
	});

	it('refuses an actor without a contour right', () => {
		expect(() => service(actor(driverId, 'crm', [])).state()).toThrow(ForbiddenError);
	});

	it('purges expired rows once and leaves live ones', () => {
		service(driver).subscribe(phone);
		service(driver).subscribe(tablet);
		const [first] = repo.liveOf(driverId);
		repo.markExpired(first?.id ?? 0, new Date());

		expect(repo.purgeExpired()).toBe(1);
		expect(repo.purgeExpired()).toBe(0);
		expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
	});
});
```

Adjust the `actor` literal to the real fields of `ActorContext` in `src/lib/types/actor.ts`.

- [ ] **Step 2: Run and see it fail**

Run: `pnpm vitest run tests/unit/push-subscription.spec.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the repository**

```ts
// src/lib/server/notifications/push-subscription.repository.ts
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { pushSubscriptions, users } from '../db/schema';
import type { PushSubscriptionInput } from '$lib/validation/push';

export interface LiveSubscription {
	readonly id: number;
	readonly endpoint: string;
	readonly p256dh: string;
	readonly auth: string;
}

/** Devices that agreed to receive pushes (tech.md 17.3). One row per browser endpoint. */
export class PushSubscriptionRepository extends BaseRepository<typeof pushSubscriptions> {
	constructor() {
		super(pushSubscriptions);
	}

	/**
	 * The endpoint identifies the browser, not the person: whoever subscribes on it last owns it,
	 * so a shared phone never rings for the previous account.
	 */
	save(userId: number, input: PushSubscriptionInput, tx?: Tx): void {
		this.db(tx)
			.insert(pushSubscriptions)
			.values({ userId, ...input })
			.onConflictDoUpdate({
				target: pushSubscriptions.endpoint,
				set: { userId, p256dh: input.p256dh, auth: input.auth, expiredAt: null }
			})
			.run();
	}

	/** Devices of an active account that the push service still accepts. */
	liveOf(userId: number, tx?: Tx): LiveSubscription[] {
		return this.db(tx)
			.select({
				id: pushSubscriptions.id,
				endpoint: pushSubscriptions.endpoint,
				p256dh: pushSubscriptions.p256dh,
				auth: pushSubscriptions.auth
			})
			.from(pushSubscriptions)
			.innerJoin(users, eq(users.id, pushSubscriptions.userId))
			.where(
				and(
					eq(pushSubscriptions.userId, userId),
					isNull(pushSubscriptions.expiredAt),
					eq(users.isActive, true),
					isNull(users.deletedAt)
				)
			)
			.orderBy(pushSubscriptions.id)
			.all();
	}

	hasLive(userId: number, tx?: Tx): boolean {
		return this.liveOf(userId, tx).length > 0;
	}

	remove(userId: number, endpoint: string, tx?: Tx): boolean {
		const removed = this.db(tx)
			.delete(pushSubscriptions)
			.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
			.run();
		return removed.changes > 0;
	}

	markExpired(id: number, at: Date, tx?: Tx): void {
		this.db(tx)
			.update(pushSubscriptions)
			.set({ expiredAt: at })
			.where(eq(pushSubscriptions.id, id))
			.run();
	}

	touch(id: number, at: Date, tx?: Tx): void {
		this.db(tx)
			.update(pushSubscriptions)
			.set({ lastUsedAt: at })
			.where(eq(pushSubscriptions.id, id))
			.run();
	}

	/** Deletes by condition, so a second run of the cleanup finds nothing. */
	purgeExpired(tx?: Tx): number {
		return this.db(tx).delete(pushSubscriptions).where(isNotNull(pushSubscriptions.expiredAt)).run()
			.changes;
	}
}
```

- [ ] **Step 4: Implement the service**

```ts
// src/lib/server/notifications/push-subscription.service.ts
import { contourAccess, PolicyService } from '../auth/policy';
import { config } from '../config';
import { NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import { PushSubscriptionRepository } from './push-subscription.repository';
import type { ActorContext } from '$lib/types/actor';
import type { PushStateDto } from '$lib/types/push';
import type { PushSubscriptionInput } from '$lib/validation/push';

/** Push on the devices of the actor. A device setting, not a business action: no audit row. */
export class PushSubscriptionService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly subscriptions: PushSubscriptionRepository = new PushSubscriptionRepository(),
		private readonly publicKey: string = config.VAPID_PUBLIC_KEY
	) {
		super(ctx);
	}

	/** @throws ForbiddenError for an actor without a contour of its own. */
	state(): PushStateDto {
		this.assertContour();
		return {
			publicKey: this.publicKey,
			deviceCount: this.subscriptions.liveOf(this.ctx.userId).length
		};
	}

	subscribe(input: PushSubscriptionInput): PushStateDto {
		this.assertContour();
		this.subscriptions.save(this.ctx.userId, input);
		return this.state();
	}

	/** @throws NotFoundError for an endpoint the actor does not own. */
	unsubscribe(endpoint: string): PushStateDto {
		this.assertContour();
		if (!this.subscriptions.remove(this.ctx.userId, endpoint)) {
			throw new NotFoundError('push subscription');
		}
		return this.state();
	}

	private assertContour(): void {
		const action = contourAccess(this.ctx);
		this.assert(PolicyService.can(this.ctx, action), action);
	}
}
```

Match the `NotFoundError` constructor to `src/lib/server/core/errors.ts`.

- [ ] **Step 5: Add the endpoint**

```ts
// src/routes/api/push/subscription/+server.ts
import { error, json, redirect } from '@sveltejs/kit';
import { rethrowAsHttp } from '$lib/server/core/http';
import { PushSubscriptionService } from '$lib/server/notifications/push-subscription.service';
import type { PushStateDto } from '$lib/types/push';
import { pushSubscriptionSchema, pushUnsubscribeSchema } from '$lib/validation/push';
import type { RequestHandler } from './$types';

const NO_STORE = { headers: { 'cache-control': 'private, no-store' } };

// Both contours subscribe here, so the service checks the contour right of the actor itself.
function service(locals: App.Locals, request: Request, pathname: string): PushSubscriptionService {
	// A mutation over `+server.ts` carries the header of tech.md 12: a form post cannot forge it.
	if (request.headers.get('x-requested-with') !== 'fetch') {
		error(403, { code: 'forbidden', message: 'Доступ запрещён' });
	}
	if (!locals.actor) redirect(303, `/login?redirectTo=${encodeURIComponent(pathname)}`);
	return new PushSubscriptionService(locals.actor);
}

function answer(run: () => PushStateDto): Response {
	try {
		return json(run(), NO_STORE);
	} catch (err) {
		rethrowAsHttp(err);
	}
}

export const POST: RequestHandler = async ({ locals, request, url }) => {
	const push = service(locals, request, url.pathname);
	const body = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, { code: 'validation_failed', message: 'Неверная подписка' });
	return answer(() => push.subscribe(body.data));
};

export const DELETE: RequestHandler = async ({ locals, request, url }) => {
	const push = service(locals, request, url.pathname);
	const body = pushUnsubscribeSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, { code: 'validation_failed', message: 'Неверная подписка' });
	return answer(() => push.unsubscribe(body.data.endpoint));
};
```

- [ ] **Step 6: Run and commit**

Run: `pnpm vitest run tests/unit/push-subscription.spec.ts && pnpm check`
Expected: PASS.

```bash
git add src/lib/server/notifications/push-subscription.* src/routes/api/push tests/unit/push-subscription.spec.ts
git commit -m "feat(queue): store push subscriptions per device"
```

---

### Task 5: Message of a notification row

**Files:**

- Create: `src/lib/server/notifications/push-facts.repository.ts`, `push-message.service.ts`
- Test: `tests/unit/push-message.spec.ts`

**Interfaces:**

- Consumes: `renderTemplate`, `EVENT_TEMPLATE_VARIABLES`, `eventPath`, `Audience`, `clip` (Task 2); `NotificationRepository.requestFacts`, `NotificationRuleRepository.activeTemplate`; `PushMessage`.
- Produces:
  - `PushFactsRepository`: `recipient(userId, tx?): { scope: Scope; roles: RoleCode[] } | undefined`, `stockItem(id, tx?): { title: string; code: string; balance: number; minThreshold: number; unit: string } | undefined`, `week(id, tx?): { startsOn: Date; endsOn: Date } | undefined`
  - `PushMessageService(deps?)`: `build(row: { eventKey: EventKey; entityId: number; userId: number }, tx?: Tx): PushMessage | null`, `render(eventKey: EventKey, text: { title: string; body: string }, values: TemplateValues): { title: string; body: string }`

- [ ] **Step 1: Write the failing test**

Use the world of `tests/unit/notification-queue.spec.ts` (`seedCharityWorld`, `sent`, `drive`) for request facts and `seedNotificationTemplates(db)` for texts. Insert a stock item and a payroll period with the helpers in `tests/unit/helpers/crm-stock.ts` and `crm-payroll.ts`.

```ts
// tests/unit/push-message.spec.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedNotificationTemplates } from '../../scripts/seed/reference';
import { notificationTemplates, requests } from '../../src/lib/server/db/schema';
import { PushMessageService } from '../../src/lib/server/notifications/push-message.service';
import { REQUEST_EVENT_KEYS } from '../../src/lib/types/events';
import { seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';
import { eq } from 'drizzle-orm';

const db = migratedDatabase();
const { world, ids, actors, sent } = seedCharityWorld(db);
const messages = new PushMessageService();
// The handler of tech.md 17.2 reads these four fields and nothing else.
const wire = z.strictObject({
	title: z.string().min(1).max(80),
	body: z.string().min(1).max(200),
	url: z.string().regex(/^\/(?!\/)/),
	tag: z.string().min(1)
});

let requestId = 0;
let number = '';

beforeAll(() => {
	seedNotificationTemplates(db);
	requestId = sent(actors.admin);
	number = db.select().from(requests).where(eq(requests.id, requestId)).all()[0]?.number ?? '';
});

describe('push message of a notification row (C15)', () => {
	it('carries the number, a short text and a path for every request event', () => {
		for (const eventKey of REQUEST_EVENT_KEYS) {
			const message = messages.build({ eventKey, entityId: requestId, userId: world.adminId });

			expect(wire.safeParse(message).success).toBe(true);
			expect(message?.tag).toBe(`${eventKey}:${requestId}`);
			expect(message?.url).toBe(`/portal/requests/${requestId}`);
			expect(`${message?.title} ${message?.body}`).toContain(number);
		}
	});

	it('leads each reader to a screen they may open', () => {
		const row = { eventKey: 'request.ready' as const, entityId: requestId };

		expect(messages.build({ ...row, userId: ids.manager })?.url).toBe(`/crm/requests/${requestId}`);
		expect(messages.build({ ...row, userId: ids.driver })?.url).toBe('/crm/delivery');
	});

	it('keeps money and the name of the deceased out of the text', () => {
		const request = db.select().from(requests).where(eq(requests.id, requestId)).all()[0];
		db.update(notificationTemplates)
			.set({ body: '{{counterparty}} {{status}} {{externalNumber}} {{url}}' })
			.where(eq(notificationTemplates.eventKey, 'request.ready'))
			.run();

		const message = messages.build({
			eventKey: 'request.ready',
			entityId: requestId,
			userId: world.adminId
		});
		const text = JSON.stringify(message);

		expect(text).not.toMatch(/Minor|₽/);
		expect(request?.deceasedFullName).toBeTruthy();
		expect(text).not.toContain(String(request?.deceasedFullName));
		expect(text).not.toContain(String(request?.totalMinor));
	});

	it('clips a text that grew past the limit of a notification', () => {
		db.update(notificationTemplates)
			.set({
				subject: '{{counterparty}} '.repeat(10).trim(),
				body: '{{counterparty}} '.repeat(30).trim()
			})
			.where(eq(notificationTemplates.eventKey, 'request.paid'))
			.run();

		const message = messages.build({
			eventKey: 'request.paid',
			entityId: requestId,
			userId: world.adminId
		});

		expect(wire.safeParse(message).success).toBe(true);
		expect(message?.title.endsWith('…')).toBe(true);
	});

	it('builds nothing without an active template or without the entity', () => {
		db.update(notificationTemplates)
			.set({ isActive: false })
			.where(eq(notificationTemplates.eventKey, 'request.delivered'))
			.run();

		expect(
			messages.build({ eventKey: 'request.delivered', entityId: requestId, userId: world.adminId })
		).toBeNull();
		expect(
			messages.build({ eventKey: 'request.accepted', entityId: 999_999, userId: world.adminId })
		).toBeNull();
		expect(
			messages.build({ eventKey: 'stock.below_threshold', entityId: 999_999, userId: ids.manager })
		).toBeNull();
		expect(
			messages.build({ eventKey: 'request.accepted', entityId: requestId, userId: 999_999 })
		).toBeNull();
	});
});
```

Add two cases with real rows: `stock.below_threshold` gives `url` `/crm/stock/{id}` and a body with the item title; `payroll.week_closed` gives `/crm/payroll?week={yyyy-mm-dd}` and a body with both dates of the week. Use the field names of `requests` as the schema spells them (`deceasedFullName`, `totalMinor`); if the seeded request has no deceased name, set one in `beforeAll`.

- [ ] **Step 2: Run and see it fail**

Run: `pnpm vitest run tests/unit/push-message.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the facts repository**

```ts
// src/lib/server/notifications/push-facts.repository.ts
import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	dictItems,
	payrollPeriods,
	roles,
	stockItems,
	stockMoves,
	userRoles,
	users
} from '../db/schema';
import type { RoleCode, Scope } from '$lib/types/roles';

export interface RecipientFacts {
	readonly scope: Scope;
	readonly roles: RoleCode[];
}

export interface StockItemFacts {
	readonly title: string;
	readonly code: string;
	readonly balance: number;
	readonly minThreshold: number;
	readonly unit: string;
}

/** What a push text and its link are made of besides the request: read at send time (tech.md 7.1). */
export class PushFactsRepository extends BaseRepository<typeof users> {
	constructor() {
		super(users);
	}

	recipient(userId: number, tx?: Tx): RecipientFacts | undefined {
		const rows = this.db(tx)
			.select({ scope: users.scope, role: roles.code })
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(users.id, userId))
			.all();
		const [first] = rows;
		return first ? { scope: first.scope, roles: rows.map((row) => row.role) } : undefined;
	}

	/** The item as a whole, all colours together, the way the threshold watches it (v1.45). */
	stockItem(id: number, tx?: Tx): StockItemFacts | undefined {
		const [row] = this.db(tx)
			.select({
				title: stockItems.title,
				code: stockItems.code,
				minThreshold: stockItems.minThreshold,
				unit: dictItems.title,
				balance: sql<number>`coalesce(sum(${stockMoves.qty}), 0)`
			})
			.from(stockItems)
			.innerJoin(dictItems, eq(dictItems.id, stockItems.unitId))
			.leftJoin(stockMoves, eq(stockMoves.stockItemId, stockItems.id))
			.where(eq(stockItems.id, id))
			.groupBy(stockItems.id)
			.all();
		return row;
	}

	week(id: number, tx?: Tx): { startsOn: Date; endsOn: Date } | undefined {
		const [row] = this.db(tx)
			.select({ startsOn: payrollPeriods.startsOn, endsOn: payrollPeriods.endsOn })
			.from(payrollPeriods)
			.where(eq(payrollPeriods.id, id))
			.all();
		return row;
	}
}
```

Check the label column of `dictItems` in `src/lib/server/db/schema` and use it for `unit`.

- [ ] **Step 4: Implement the service**

```ts
// src/lib/server/notifications/push-message.service.ts
import { PolicyService } from '../auth/policy';
import { config } from '../config';
import type { Tx } from '../db/client';
import { OrgService } from '../settings/org.service';
import type { PushMessage } from './drivers/push';
import { NotificationRuleRepository } from './notification-rule.repository';
import { NotificationRepository } from './notification.repository';
import { PushFactsRepository, type RecipientFacts } from './push-facts.repository';
import { clip } from '$lib/domain/notification/delivery';
import { eventPath, type Audience } from '$lib/domain/notification/link';
import { renderTemplate, type TemplateValues } from '$lib/domain/notification/template';
import { REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';
import { REQUEST_STATUS_META } from '$lib/ui/status';
import { formatDate, isoDay } from '$lib/utils/format';

export const PUSH_TITLE_MAX = 80;
export const PUSH_BODY_MAX = 200;

export interface PushMessageDeps {
	readonly templates: NotificationRuleRepository;
	readonly requests: NotificationRepository;
	readonly facts: PushFactsRepository;
	readonly timeZone: () => string;
	readonly origin: string;
}

interface Scene {
	readonly values: TemplateValues;
	readonly path: string;
}

/** Builds the push of one `notifications` row from the database at send time (tech.md 7.1, 17.3). */
export class PushMessageService {
	private readonly deps: PushMessageDeps;

	constructor(deps: Partial<PushMessageDeps> = {}) {
		this.deps = {
			templates: deps.templates ?? new NotificationRuleRepository(),
			requests: deps.requests ?? new NotificationRepository(),
			facts: deps.facts ?? new PushFactsRepository(),
			timeZone: deps.timeZone ?? (() => OrgService.timezone()),
			origin: deps.origin ?? config.ORIGIN
		};
	}

	/** Null when the template is off or the person or the entity is gone: nothing to send. */
	build(
		row: { eventKey: EventKey; entityId: number; userId: number },
		tx?: Tx
	): PushMessage | null {
		const template = this.deps.templates.activeTemplate(row.eventKey, 'push', tx);
		const recipient = this.deps.facts.recipient(row.userId, tx);
		if (!template || !recipient) return null;
		const scene = this.scene(row.eventKey, row.entityId, recipient, tx);
		if (!scene) return null;
		const text = { title: template.subject ?? '', body: template.body };
		return {
			...this.render(row.eventKey, text, scene.values),
			url: scene.path,
			tag: `${row.eventKey}:${row.entityId}`
		};
	}

	/** A rendered text is clipped, not refused: a long counterparty name must not lose the push. */
	render(
		eventKey: EventKey,
		text: { title: string; body: string },
		values: TemplateValues
	): { title: string; body: string } {
		return {
			title: clip(renderTemplate(eventKey, text.title, values), PUSH_TITLE_MAX),
			body: clip(renderTemplate(eventKey, text.body, values), PUSH_BODY_MAX)
		};
	}

	private scene(key: EventKey, id: number, to: RecipientFacts, tx?: Tx): Scene | null {
		if (REQUEST_EVENT_KEYS.includes(key)) return this.requestScene(key, id, to, tx);
		return key === 'stock.below_threshold' ? this.stockScene(id, tx) : this.weekScene(id, tx);
	}

	private requestScene(key: EventKey, id: number, to: RecipientFacts, tx?: Tx): Scene | null {
		const request = this.deps.requests.requestFacts(id, tx);
		if (!request) return null;
		const path = eventPath(key, id, audienceOf(to));
		return {
			path,
			values: {
				number: request.number,
				status: REQUEST_STATUS_META[request.status].label,
				url: this.deps.origin + path,
				counterparty: request.counterpartyName ?? 'Склад',
				externalNumber: request.externalNumber ?? ''
			}
		};
	}

	private stockScene(id: number, tx?: Tx): Scene | null {
		const item = this.deps.facts.stockItem(id, tx);
		if (!item) return null;
		const path = eventPath('stock.below_threshold', id, 'crm_registry');
		return {
			path,
			values: {
				item: item.title,
				code: item.code,
				balance: String(item.balance),
				threshold: String(item.minThreshold),
				unit: item.unit,
				url: this.deps.origin + path
			}
		};
	}

	private weekScene(id: number, tx?: Tx): Scene | null {
		const week = this.deps.facts.week(id, tx);
		if (!week) return null;
		const zone = this.deps.timeZone();
		const start = week.startsOn.toISOString();
		const path = eventPath('payroll.week_closed', id, 'crm_registry', isoDay(start, zone));
		return {
			path,
			values: {
				period: `${formatDate(start, zone)} по ${formatDate(week.endsOn.toISOString(), zone)}`,
				url: this.deps.origin + path
			}
		};
	}
}

function audienceOf(recipient: RecipientFacts): Audience {
	if (recipient.scope === 'portal') return 'portal';
	return PolicyService.can(recipient, 'request.read.any') ? 'crm_registry' : 'crm_floor';
}
```

- [ ] **Step 5: Run and commit**

Run: `pnpm vitest run tests/unit/push-message.spec.ts && pnpm check`
Expected: PASS.

```bash
git add src/lib/server/notifications/push-facts.repository.ts src/lib/server/notifications/push-message.service.ts tests/unit/push-message.spec.ts
git commit -m "feat(queue): build a push from the template at send time"
```

---

### Task 6: Fanout, dispatch and cleanup go live

**Files:**

- Modify: `src/lib/types/notifications.ts` (`LIVE_CHANNELS`)
- Modify: `src/lib/server/notifications/notification.repository.ts` (`DispatchRow.userId`)
- Modify: `src/lib/server/queue/handlers/notification-fanout.ts`, `notification-dispatch.ts`, `session-cleanup.ts`, `index.ts`
- Test: `tests/unit/push-dispatch.spec.ts`, `tests/unit/push-fanout.spec.ts`, modify `tests/unit/notification-queue.spec.ts`, `tests/unit/session-cleanup.spec.ts`

**Interfaces:**

- Consumes: `PushSubscriptionRepository` (Task 4), `PushMessageService.build` (Task 5), `pushDriver()`, `PushGoneError`, `PUSH_TIMEOUT_MS` (Task 3), `failureText` (Task 2).
- Produces:
  - `FanoutDeps` gains `subscriptions: Pick<PushSubscriptionRepository, 'hasLive'>`
  - `DispatchDeps = { notifications; subscriptions: PushSubscriptionRepository; messages: Pick<PushMessageService, 'build'>; driver: () => PushDriver; timeoutMs?: number }`
  - `LIVE_CHANNELS = ['push'] as const`

- [ ] **Step 1: Write the failing fanout test**

```ts
// tests/unit/push-fanout.spec.ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationRules, seedNotificationTemplates } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationFeed,
	notificationTemplates,
	notifications,
	pushSubscriptions,
	userNotificationPrefs
} from '../../src/lib/server/db/schema';
import { NotificationRuleRepository } from '../../src/lib/server/notifications/notification-rule.repository';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import { seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { world, ids, actors, sent, drive } = seedCharityWorld(db);
seedNotificationRules(db);
seedNotificationTemplates(db);
const subscriptions = new PushSubscriptionRepository();

function fanout(): Worker {
	return new Worker({
		handlers: [
			createNotificationFanoutHandler({
				rules: new NotificationRuleRepository(),
				notifications: new NotificationRepository(),
				subscriptions,
				isEnabled: () => true
			})
		]
	});
}

const device = (name: string) => ({
	endpoint: `https://push.example/${name}`,
	p256dh: 'k',
	auth: 'a'
});
const pushedTo = () =>
	db
		.select()
		.from(notifications)
		.all()
		.map((row) => row.userId)
		.sort();
const dispatchJobs = () =>
	db.select().from(jobQueue).where(eq(jobQueue.topic, 'notification.dispatch')).all();

beforeEach(() => {
	resetRequests(db);
	for (const table of [notificationFeed, notifications, userNotificationPrefs, pushSubscriptions]) {
		db.delete(table).run();
	}
	db.update(notificationTemplates).set({ isActive: true }).run();
});

describe('notification.fanout over the push channel (C15)', () => {
	it('queues a push for the driver with a device when a request turns ready', async () => {
		subscriptions.save(ids.driver, device('driver'));
		drive(sent(actors.admin), 'ready');

		await fanout().drain();

		expect(pushedTo()).toContain(ids.driver);
		const jobs = dispatchJobs();
		expect(jobs.length).toBeGreaterThan(0);
		for (const job of jobs) {
			expect(JOB_PAYLOAD_SCHEMAS['notification.dispatch'].safeParse(job.payload).success).toBe(
				true
			);
			expect(job.idempotencyKey).toBe(`notification:${String(job.payload['notificationId'])}`);
		}
	});

	it('writes the feed and no push row for a person without a device', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');

		await fanout().drain();

		expect(db.select().from(notificationFeed).all().length).toBeGreaterThan(0);
		expect(db.select().from(notifications).all()).toEqual([]);
		expect(dispatchJobs()).toEqual([]);
	});

	it('respects a personal switch', async () => {
		subscriptions.save(world.adminId, device('admin'));
		db.insert(userNotificationPrefs)
			.values({ userId: world.adminId, eventKey: 'request.ready', channel: 'push', enabled: false })
			.run();
		drive(sent(actors.admin), 'ready');

		await fanout().drain();

		expect(
			db
				.select()
				.from(notifications)
				.all()
				.filter((row) => row.eventKey === 'request.ready')
		).toEqual([]);
	});

	it('queues nothing for an event whose template is switched off', async () => {
		subscriptions.save(ids.driver, device('driver'));
		db.update(notificationTemplates)
			.set({ isActive: false })
			.where(eq(notificationTemplates.eventKey, 'request.ready'))
			.run();
		drive(sent(actors.admin), 'ready');

		await fanout().drain();

		expect(
			db
				.select()
				.from(notifications)
				.all()
				.filter((row) => row.eventKey === 'request.ready')
		).toEqual([]);
	});

	it('leaves one push row per person when the fanout runs twice', async () => {
		subscriptions.save(ids.driver, device('driver'));
		drive(sent(actors.admin), 'ready');
		await fanout().drain();
		const before = pushedTo();
		db.update(jobQueue)
			.set({ status: 'pending', finishedAt: null })
			.where(eq(jobQueue.topic, 'notification.fanout'))
			.run();

		await fanout().drain();

		expect(pushedTo()).toEqual(before);
	});
});
```

- [ ] **Step 2: Write the failing dispatch test**

```ts
// tests/unit/push-dispatch.spec.ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationTemplates } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationTemplates,
	notifications,
	pushSubscriptions,
	users
} from '../../src/lib/server/db/schema';
import { FakePushDriver } from '../../src/lib/server/notifications/drivers/push';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { PushMessageService } from '../../src/lib/server/notifications/push-message.service';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { createNotificationDispatchHandler } from '../../src/lib/server/queue/handlers/notification-dispatch';
import { Queue } from '../../src/lib/server/queue/queue';
import { jobKey } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import { seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const { ids, actors, sent } = seedCharityWorld(db);
seedNotificationTemplates(db);
const requestId = sent(actors.admin);
const driver = new FakePushDriver();
const subscriptions = new PushSubscriptionRepository();

function worker(): Worker {
	return new Worker({
		handlers: [
			createNotificationDispatchHandler({
				notifications: new NotificationRepository(),
				subscriptions,
				messages: new PushMessageService(),
				driver: () => driver,
				timeoutMs: 50
			})
		]
	});
}

function queued(entityId = requestId): number {
	const [row] = db
		.insert(notifications)
		.values({
			eventKey: 'request.ready',
			userId: ids.driver,
			channel: 'push',
			payload: { entityId }
		})
		.returning()
		.all();
	const id = row?.id ?? 0;
	Queue.enqueue('notification.dispatch', { notificationId: id }, jobKey.dispatch(id));
	return id;
}

const rowOf = (id: number) =>
	db.select().from(notifications).where(eq(notifications.id, id)).all()[0];
const job = () => db.select().from(jobQueue).all()[0];
const device = (name: string) => ({
	endpoint: `https://push.example/${name}`,
	p256dh: 'k',
	auth: 'a'
});
/** Makes a retried job visible at once: the backoff is not what these tests are about. */
const rewind = () =>
	db
		.update(jobQueue)
		.set({ visibleAt: new Date(0) })
		.run();

beforeEach(() => {
	driver.reset();
	for (const table of [jobQueue, notifications, pushSubscriptions]) db.delete(table).run();
	db.update(notificationTemplates).set({ isActive: true }).run();
	db.update(users).set({ isActive: true }).run();
});

describe('notification.dispatch over the push channel (C15)', () => {
	it('sends the row to every device of the person and marks it sent', async () => {
		subscriptions.save(ids.driver, device('phone'));
		subscriptions.save(ids.driver, device('tablet'));
		const id = queued();

		await worker().drain();

		expect(driver.sent.map((push) => push.target.endpoint).sort()).toEqual([
			'https://push.example/phone',
			'https://push.example/tablet'
		]);
		expect(driver.sent[0]?.message).toMatchObject({
			url: '/crm/delivery',
			tag: `request.ready:${requestId}`
		});
		expect(rowOf(id)).toMatchObject({ status: 'sent', attempts: 1, error: null });
		expect(subscriptions.liveOf(ids.driver).length).toBe(2);
	});

	it('sends once when the same payload runs twice', async () => {
		subscriptions.save(ids.driver, device('phone'));
		const id = queued();
		await worker().drain();
		db.update(jobQueue).set({ status: 'pending', finishedAt: null }).run();

		await worker().drain();

		expect(driver.sent).toHaveLength(1);
		expect(rowOf(id)).toMatchObject({ status: 'sent', attempts: 1 });
	});

	it('retires a device the push service no longer knows and still delivers to the other', async () => {
		subscriptions.save(ids.driver, device('phone'));
		subscriptions.save(ids.driver, device('tablet'));
		driver.goneOnce();
		const id = queued();

		await worker().drain();

		expect(rowOf(id)?.status).toBe('sent');
		expect(subscriptions.liveOf(ids.driver).map((row) => row.endpoint)).toEqual([
			'https://push.example/tablet'
		]);
	});

	it('marks the row failed as expired, without a retry, when every device is gone', async () => {
		subscriptions.save(ids.driver, device('phone'));
		driver.goneOnce();
		const id = queued();

		await worker().drain();

		expect(rowOf(id)).toMatchObject({ status: 'failed', attempts: 1 });
		expect(rowOf(id)?.error).toMatch(/^expired: /);
		expect(job()).toMatchObject({ status: 'done', attempts: 1 });
	});

	it('fails without a retry when the person has no live device or was deactivated', async () => {
		const noDevice = queued();
		await worker().drain();
		expect(rowOf(noDevice)?.error).toMatch(/^expired: /);

		db.delete(jobQueue).run();
		subscriptions.save(ids.driver, device('phone'));
		db.update(users).set({ isActive: false }).where(eq(users.id, ids.driver)).run();
		const deactivated = queued();
		await worker().drain();

		expect(driver.sent).toHaveLength(0);
		expect(rowOf(deactivated)?.status).toBe('failed');
		expect(job()?.status).toBe('done');
	});

	it('fails once, without a retry, when the template is off or the request is gone', async () => {
		subscriptions.save(ids.driver, device('phone'));
		const gone = queued(999_999);

		await worker().drain();

		expect(rowOf(gone)?.error).toMatch(/^driver: /);
		expect(job()).toMatchObject({ status: 'done', attempts: 1 });
		expect(driver.sent).toHaveLength(0);
	});

	it('retries a driver failure and delivers on the second attempt', async () => {
		subscriptions.save(ids.driver, device('phone'));
		driver.failOnce();
		const id = queued();

		await worker().drain();
		expect(rowOf(id)).toMatchObject({ status: 'failed', attempts: 1 });
		expect(rowOf(id)?.error).toMatch(/^driver: /);
		expect(job()?.status).toBe('pending');

		rewind();
		await worker().drain();
		expect(rowOf(id)).toMatchObject({ status: 'sent', attempts: 2, error: null });
	});

	it('treats a hanging push service as a failure and retries', async () => {
		subscriptions.save(ids.driver, device('phone'));
		driver.hangOnce();
		const id = queued();

		await worker().drain();

		expect(rowOf(id)?.error).toMatch(/^driver: .*timed out/);
		expect(job()?.status).toBe('pending');
	});

	it('gives the job up as dead after the last attempt', async () => {
		subscriptions.save(ids.driver, device('phone'));
		const id = queued();
		for (let attempt = 0; attempt < 5; attempt += 1) {
			driver.failOnce();
			rewind();
			await worker().drain();
		}

		expect(rowOf(id)).toMatchObject({ status: 'failed', attempts: 5 });
		expect(job()).toMatchObject({ status: 'dead', attempts: 5 });
	});

	it('gives up at once on a row that does not exist', async () => {
		Queue.enqueue('notification.dispatch', { notificationId: 999_999 }, jobKey.dispatch(999_999));

		await worker().drain();

		expect(job()?.status).toBe('dead');
	});
});
```

Queue tests need a real clock: do not freeze the worker clock, rewind `visible_at` as `rewind()` does. If `Worker.drain()` already waits out a pending retry, drop the `rewind()` calls that make an assertion on `pending` impossible and assert on `attempts` instead.

- [ ] **Step 3: Run and see them fail**

Run: `pnpm vitest run tests/unit/push-fanout.spec.ts tests/unit/push-dispatch.spec.ts`
Expected: FAIL, unknown deps and no rows.

- [ ] **Step 4: Go live in types and the repository**

`src/lib/types/notifications.ts`:

```ts
export const LIVE_CHANNELS = ['push'] as const; // max joins in C16
```

`notification.repository.ts`: add `readonly userId: number;` to `DispatchRow` and `userId: notifications.userId,` to the select of `forDispatch`.

- [ ] **Step 5: Fanout**

In `notification-fanout.ts` add to `FanoutDeps`:

```ts
	readonly subscriptions: Pick<PushSubscriptionRepository, 'hasLive'>;
```

In `handle`, inside the transaction, read the template once and pass it down:

```ts
const rules = deps.rules.rules(event.eventKey, tx);
const hasPushText = deps.rules.activeTemplate(event.eventKey, 'push', tx) !== undefined;
return addresseesOf(event, tx).map((addressee) =>
	fanOutTo(addressee, event, { rules, hasPushText }, tx)
);
```

Change `fanOutTo` to take `plan: { rules: readonly RoleRule[]; hasPushText: boolean }` and add before the `exists` guard:

```ts
// A push nobody can receive is not a delivery: without a device or a text there is no row.
if (channel === 'push' && !(plan.hasPushText && deps.subscriptions.hasLive(person.userId, tx))) {
	continue;
}
```

Add `subscriptions: new PushSubscriptionRepository()` to the exported handler. Update the doc comment of the handler: push rows go to people with a live device.

- [ ] **Step 6: Dispatch**

```ts
// src/lib/server/queue/handlers/notification-dispatch.ts
import { PushGoneError, type PushDriver, type PushMessage } from '../../notifications/drivers/push';
import { pushDriver } from '../../notifications/drivers/push/select';
import { PUSH_TIMEOUT_MS } from '../../notifications/drivers/push/webpush';
import { NotificationRepository } from '../../notifications/notification.repository';
import { PushMessageService } from '../../notifications/push-message.service';
import {
	PushSubscriptionRepository,
	type LiveSubscription
} from '../../notifications/push-subscription.repository';
import { defineHandler, InvalidPayloadError } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';
import { failureText } from '$lib/domain/notification/delivery';

export interface DispatchDeps {
	readonly notifications: NotificationRepository;
	readonly subscriptions: PushSubscriptionRepository;
	readonly messages: Pick<PushMessageService, 'build'>;
	readonly driver: () => PushDriver;
	readonly timeoutMs?: number;
}

interface Outcome {
	readonly accepted: number;
	readonly errors: string[];
}

/**
 * `notification.dispatch` of tech.md 7.2: sends one row to every live device of its person and
 * marks it. A refusal that time cannot cure, no device or no text, fails the row and ends the
 * job; a driver error or a timeout fails the row and throws, so the queue retries with backoff.
 */
export function createNotificationDispatchHandler(deps: DispatchDeps) {
	const timeoutMs = deps.timeoutMs ?? PUSH_TIMEOUT_MS;

	async function sendToAll(
		targets: readonly LiveSubscription[],
		message: PushMessage,
		now: Date
	): Promise<Outcome> {
		const errors: string[] = [];
		let accepted = 0;
		for (const target of targets) {
			try {
				await withTimeout(deps.driver().send(target, message), timeoutMs);
				deps.subscriptions.touch(target.id, now);
				accepted += 1;
			} catch (err) {
				if (err instanceof PushGoneError) deps.subscriptions.markExpired(target.id, now);
				else errors.push(err instanceof Error ? err.message : String(err));
			}
		}
		return { accepted, errors };
	}

	return defineHandler({
		topic: 'notification.dispatch',
		schema: JOB_PAYLOAD_SCHEMAS['notification.dispatch'],
		async handle({ notificationId }, ctx) {
			const row = deps.notifications.forDispatch(notificationId);
			if (!row) throw new InvalidPayloadError(`notification ${notificationId} not found`);
			if (row.status === 'sent') return;
			const attempts = row.attempts + 1;
			const fail = (text: string) => deps.notifications.markFailed(row.id, attempts, text);
			if (row.channel !== 'push') {
				fail(`channel ${row.channel} is not live`);
				throw new InvalidPayloadError(`channel ${row.channel} is not live`);
			}

			const targets = deps.subscriptions.liveOf(row.userId);
			if (targets.length === 0) return fail(failureText('expired', 'no live subscription'));
			const message = deps.messages.build(row);
			if (!message) return fail(failureText('driver', 'no active template or entity'));

			const outcome = await sendToAll(targets, message, ctx.now);
			if (outcome.accepted > 0) return deps.notifications.markSent(row.id, attempts, ctx.now);
			const [reason] = outcome.errors;
			if (reason === undefined) return fail(failureText('expired', 'every subscription is gone'));
			fail(failureText('driver', reason));
			throw new Error(`push failed: ${reason}`);
		}
	});
}

/** A push service that never answers must not hold the worker: the job retries instead. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`push timed out after ${ms} ms`)), ms);
		work.then(resolve, reject).finally(() => clearTimeout(timer));
	});
}

export const notificationDispatchHandler = createNotificationDispatchHandler({
	notifications: new NotificationRepository(),
	subscriptions: new PushSubscriptionRepository(),
	messages: new PushMessageService(),
	driver: pushDriver
});
```

If `handle` grows past 40 lines after formatting, move the three early exits into a `refusal(row): string | null` helper.

- [ ] **Step 7: Cleanup**

`session-cleanup.ts`: replace the C15 comment and extend the transaction:

```ts
const removed = withTransaction((tx) => ({
	...new SessionCleanupRepository().purgeExpired(ctx.now, tx),
	// Dispatch marks a device the push service refused for good; the row is dropped here.
	pushSubscriptions: new PushSubscriptionRepository().purgeExpired(tx)
}));
ctx.logger.info(removed, 'expired sessions, reset tokens and push subscriptions purged');
```

Add to `tests/unit/session-cleanup.spec.ts` (insert two subscriptions in `seedAuthRows`, one with `expiredAt: now`; add `pushSubscriptions` to `beforeEach` and to `snapshot()` as `devices`): the first test expects `devices: [{ endpoint: 'https://push.example/alive' }]`, the idempotency test stays as is.

- [ ] **Step 8: Update the C12 queue spec**

In `tests/unit/notification-queue.spec.ts`:

- pass `subscriptions: new PushSubscriptionRepository()` to the fanout handler and the full `DispatchDeps` (a `FakePushDriver`, `new PushMessageService()`) to the dispatch handler;
- delete `describe('no channel is live before C15')` except its contract test of fanout payloads, which moves into the idempotency block;
- delete `describe('the error path of the dispatch')` and the `sent row` test: `push-dispatch.spec.ts` owns them now;
- drop the helpers `pushRow` and `rowOf` if nothing uses them.

- [ ] **Step 9: Run and commit**

Run: `pnpm vitest run tests/unit && pnpm check`
Expected: PASS.

```bash
git add src/lib/types/notifications.ts src/lib/server tests/unit
git commit -m "feat(queue): deliver events over the push channel"
```

---

### Task 7: Templates in the CRM

**Files:**

- Create: `src/lib/server/notifications/push-template.repository.ts`, `push-template.service.ts`
- Create: `src/routes/(crm)/crm/settings/notifications/templates/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(crm)/crm/settings/notifications/+layout.svelte`, `src/lib/crm/notifications/SettingsTabs.svelte`, `TemplateForm.svelte`
- Modify: `src/routes/(crm)/crm/settings/notifications/+page.svelte` (heading and copy), `src/routes/(crm)/+layout.svelte` (menu label «Уведомления»), `src/lib/crm/labels.ts` (audit titles)
- Test: `tests/unit/push-template.spec.ts`

**Interfaces:**

- Consumes: `pushTemplateSchema`, `PushTemplateInput`, DTOs (Task 1); `unknownVariables`, `EVENT_TEMPLATE_VARIABLES`, `TEMPLATE_SAMPLES` (Task 2); `PushMessageService.render` (Task 5); `PushSubscriptionRepository.liveOf` (Task 4); `PushDriver`.
- Produces: `PushTemplateService(ctx, deps?)`: `list(): NotificationTemplateDto[]`, `save(input: PushTemplateInput): NotificationTemplateDto`, `preview(input: PushTemplateInput): NotificationTemplatePreviewDto`, `sendTest(input: PushTemplateInput): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/push-template.spec.ts
import { desc } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationTemplates } from '../../scripts/seed/reference';
import { ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import {
	auditLog,
	notifications,
	notificationTemplates,
	pushSubscriptions
} from '../../src/lib/server/db/schema';
import { FakePushDriver } from '../../src/lib/server/notifications/drivers/push';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { PushTemplateService } from '../../src/lib/server/notifications/push-template.service';
import type { ActorContext } from '../../src/lib/types/actor';
import { EVENT_KEYS } from '../../src/lib/types/events';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const ownerId = insertUser({ email: 'own@tpl.example', role: 'owner', counterpartyId: null });
const managerId = insertUser({ email: 'mgr@tpl.example', role: 'manager', counterpartyId: null });
const driver = new FakePushDriver();
const subscriptions = new PushSubscriptionRepository();

const ctx = (userId: number, role: 'owner' | 'manager'): ActorContext => ({
	userId,
	scope: 'crm',
	roles: [role],
	counterpartyId: null,
	canSeePrices: true,
	requestId: 'test'
});
const service = (actor = ctx(ownerId, 'owner')) =>
	new PushTemplateService(actor, { driver: () => driver });
const form = {
	eventKey: 'request.ready' as const,
	title: 'Готова {{number}}',
	body: 'Заберите до вечера',
	isActive: true
};

beforeEach(() => {
	driver.reset();
	for (const table of [notificationTemplates, pushSubscriptions, auditLog, notifications])
		db.delete(table).run();
	seedNotificationTemplates(db);
});

describe('push templates in the CRM (C15)', () => {
	it('lists one template per event with the variables it may use', () => {
		const list = service().list();

		expect(list.map((item) => item.eventKey)).toEqual([...EVENT_KEYS]);
		expect(list.find((item) => item.eventKey === 'payroll.week_closed')?.variables).toEqual([
			'period',
			'url'
		]);
	});

	it('saves a text and writes the old and the new one to the audit', () => {
		const saved = service().save(form);

		expect(saved).toMatchObject({ title: form.title, body: form.body, isActive: true });
		const [entry] = db.select().from(auditLog).orderBy(desc(auditLog.id)).all();
		expect(entry).toMatchObject({
			action: 'notifications.template.update',
			entity: 'notification_templates',
			actorId: ownerId
		});
		expect(entry?.before).toMatchObject({ subject: 'Заявка {{number}} готова' });
		expect(entry?.after).toMatchObject({ subject: form.title, body: form.body, isActive: true });
	});

	it('creates the row of an event that had no template', () => {
		db.delete(notificationTemplates).run();

		expect(service().save(form).title).toBe(form.title);
		expect(db.select().from(notificationTemplates).all()).toHaveLength(1);
	});

	it('refuses a variable of another event and leaves the text alone', () => {
		expect(() => service().save({ ...form, body: 'Остаток {{balance}}' })).toThrow(ValidationError);
		expect(
			service()
				.list()
				.find((item) => item.eventKey === 'request.ready')?.body
		).toBe('Изделия готовы к выдаче');
	});

	it('previews on sample values without reading a request', () => {
		expect(service().preview(form)).toEqual({
			title: 'Готова 2026-0042',
			body: 'Заберите до вечера'
		});
	});

	it('sends the preview to the devices of the owner and writes no log row', async () => {
		subscriptions.save(ownerId, { endpoint: 'https://push.example/owner', p256dh: 'k', auth: 'a' });

		expect(await service().sendTest(form)).toBe(1);

		expect(driver.sent[0]?.message).toMatchObject({
			title: 'Готова 2026-0042',
			url: '/crm/settings/notifications/templates',
			tag: 'test:request.ready'
		});
		expect(db.select().from(notifications).all()).toEqual([]);
	});

	it('asks to enable push first when the owner has no device', async () => {
		await expect(service().sendTest(form)).rejects.toThrow(
			'Включите уведомления на этом устройстве'
		);
	});

	it('is closed to everyone without settings.manage', () => {
		const manager = service(ctx(managerId, 'manager'));
		expect(() => manager.list()).toThrow(ForbiddenError);
		expect(() => manager.save(form)).toThrow(ForbiddenError);
		expect(() => manager.preview(form)).toThrow(ForbiddenError);
	});
});
```

- [ ] **Step 2: Run and see it fail**

Run: `pnpm vitest run tests/unit/push-template.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the repository**

```ts
// src/lib/server/notifications/push-template.repository.ts
import { and, eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { notificationTemplates } from '../db/schema';
import type { EventKey } from '$lib/types/events';

export interface PushTemplateRow {
	readonly id: number;
	readonly eventKey: EventKey;
	readonly subject: string | null;
	readonly body: string;
	readonly isActive: boolean;
}

const COLUMNS = {
	id: notificationTemplates.id,
	eventKey: notificationTemplates.eventKey,
	subject: notificationTemplates.subject,
	body: notificationTemplates.body,
	isActive: notificationTemplates.isActive
};

/** Texts of the push channel: one row per event (tech.md 5.9). */
export class PushTemplateRepository extends BaseRepository<typeof notificationTemplates> {
	constructor() {
		super(notificationTemplates);
	}

	all(tx?: Tx): PushTemplateRow[] {
		return this.db(tx)
			.select(COLUMNS)
			.from(notificationTemplates)
			.where(eq(notificationTemplates.channel, 'push'))
			.all();
	}

	find(eventKey: EventKey, tx?: Tx): PushTemplateRow | undefined {
		const [row] = this.db(tx)
			.select(COLUMNS)
			.from(notificationTemplates)
			.where(
				and(eq(notificationTemplates.eventKey, eventKey), eq(notificationTemplates.channel, 'push'))
			)
			.all();
		return row;
	}

	upsert(
		row: { eventKey: EventKey; subject: string; body: string; isActive: boolean },
		tx: Tx
	): number {
		const [saved] = tx
			.insert(notificationTemplates)
			.values({ ...row, channel: 'push' })
			.onConflictDoUpdate({
				target: [notificationTemplates.eventKey, notificationTemplates.channel],
				set: { subject: row.subject, body: row.body, isActive: row.isActive }
			})
			.returning({ id: notificationTemplates.id })
			.all();
		if (!saved) throw new Error('template upsert returned no row');
		return saved.id;
	}
}
```

- [ ] **Step 4: Implement the service**

```ts
// src/lib/server/notifications/push-template.service.ts
import { PolicyService } from '../auth/policy';
import { ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { PushDriver } from './drivers/push';
import { pushDriver } from './drivers/push/select';
import { PushMessageService } from './push-message.service';
import { PushSubscriptionRepository } from './push-subscription.repository';
import { PushTemplateRepository, type PushTemplateRow } from './push-template.repository';
import {
	EVENT_TEMPLATE_VARIABLES,
	TEMPLATE_SAMPLES,
	unknownVariables
} from '$lib/domain/notification/template';
import type { ActorContext } from '$lib/types/actor';
import { EVENT_KEYS, type EventKey } from '$lib/types/events';
import type { NotificationTemplateDto, NotificationTemplatePreviewDto } from '$lib/types/push';
import type { PushTemplateInput } from '$lib/validation/push';

const TEMPLATES_PATH = '/crm/settings/notifications/templates';

export interface PushTemplateDeps {
	readonly templates: PushTemplateRepository;
	readonly subscriptions: PushSubscriptionRepository;
	readonly messages: Pick<PushMessageService, 'render'>;
	readonly driver: () => PushDriver;
}

/** The push texts the owner edits (C15). The matrix beside them stays seed-owned. */
export class PushTemplateService extends BaseService {
	private readonly deps: PushTemplateDeps;

	constructor(ctx: ActorContext, deps: Partial<PushTemplateDeps> = {}) {
		super(ctx);
		this.deps = {
			templates: deps.templates ?? new PushTemplateRepository(),
			subscriptions: deps.subscriptions ?? new PushSubscriptionRepository(),
			messages: deps.messages ?? new PushMessageService(),
			driver: deps.driver ?? pushDriver
		};
	}

	/** One line per event, in flow order; an event without a row comes empty and switched off. */
	list(): NotificationTemplateDto[] {
		this.assertManage();
		const rows = new Map(this.deps.templates.all().map((row) => [row.eventKey, row]));
		return EVENT_KEYS.map((eventKey) => toDto(eventKey, rows.get(eventKey)));
	}

	/** @throws ValidationError for a variable the event does not offer. */
	save(input: PushTemplateInput): NotificationTemplateDto {
		this.assertManage();
		this.assertVariables(input);
		return this.audited(
			{ action: 'notifications.template.update', entity: 'notification_templates' },
			(tx) => {
				const before = this.deps.templates.find(input.eventKey, tx);
				const after = { subject: input.title, body: input.body, isActive: input.isActive };
				const id = this.deps.templates.upsert({ eventKey: input.eventKey, ...after }, tx);
				return {
					result: toDto(input.eventKey, { id, eventKey: input.eventKey, ...after }),
					entityId: id,
					...(before
						? { before: { subject: before.subject, body: before.body, isActive: before.isActive } }
						: {}),
					after
				};
			}
		);
	}

	/** The text on sample values: nothing is read from a request, so nothing can leak into it. */
	preview(input: PushTemplateInput): NotificationTemplatePreviewDto {
		this.assertManage();
		this.assertVariables(input);
		return this.deps.messages.render(input.eventKey, input, TEMPLATE_SAMPLES[input.eventKey]);
	}

	/**
	 * Sends the preview to the devices of the actor, past the delivery log: `notifications` holds
	 * events only. Returns how many devices took it.
	 * @throws ValidationError when the actor has no live device.
	 */
	async sendTest(input: PushTemplateInput): Promise<number> {
		const text = this.preview(input);
		const targets = this.deps.subscriptions.liveOf(this.ctx.userId);
		if (targets.length === 0) {
			throw new ValidationError('Включите уведомления на этом устройстве', { field: 'eventKey' });
		}
		const message = { ...text, url: TEMPLATES_PATH, tag: `test:${input.eventKey}` };
		const results = await Promise.allSettled(
			targets.map((target) => this.deps.driver().send(target, message))
		);
		const delivered = results.filter((result) => result.status === 'fulfilled').length;
		if (delivered === 0)
			throw new ValidationError('Сервис доставки не принял уведомление', { field: 'eventKey' });
		return delivered;
	}

	private assertManage(): void {
		this.assert(PolicyService.can(this.ctx, 'settings.manage'), 'settings.manage');
	}

	private assertVariables(input: PushTemplateInput): void {
		const unknown = unknownVariables(input.eventKey, `${input.title} ${input.body}`);
		if (unknown.length > 0) {
			throw new ValidationError(`Переменной нет у этого события: ${unknown.join(', ')}`, {
				field: 'body'
			});
		}
	}
}

function toDto(eventKey: EventKey, row: PushTemplateRow | undefined): NotificationTemplateDto {
	return {
		eventKey,
		channel: 'push',
		title: row?.subject ?? '',
		body: row?.body ?? '',
		isActive: row?.isActive ?? false,
		variables: EVENT_TEMPLATE_VARIABLES[eventKey]
	};
}
```

- [ ] **Step 5: Routes and components**

```ts
// src/routes/(crm)/crm/settings/notifications/templates/+page.server.ts
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction } from '$lib/server/core/http';
import { PushTemplateService } from '$lib/server/notifications/push-template.service';
import { pushTemplateSchema } from '$lib/validation/push';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function service(locals: App.Locals, url: URL): PushTemplateService {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	return new PushTemplateService(requireAction(actor, 'settings.manage'));
}

export const load: PageServerLoad = ({ locals, url }) => ({
	templates: service(locals, url).list()
});

export const actions = {
	save: ({ request, locals, url }) =>
		formAction(request, 'save', pushTemplateSchema, (input) => service(locals, url).save(input)),
	test: ({ request, locals, url }) =>
		formAction(request, 'test', pushTemplateSchema, (input) => service(locals, url).sendTest(input))
} satisfies Actions;
```

`SettingsTabs.svelte`: a `<nav aria-label="Разделы уведомлений">` with three links, «Матрица» `/crm/settings/notifications`, «Шаблоны» `/templates`, «Журнал отправок» `/log`, each `class={buttonVariants({ variant: active ? 'secondary' : 'ghost', size: 'sm' })}` and `aria-current="page"` on the active one; the active tab is the longest prefix match of `page.url.pathname`. `+layout.svelte` renders `<SettingsTabs />` above `{@render children()}` inside the same `max-w-6xl` column.

`TemplateForm.svelte` props: `{ template: NotificationTemplateDto; result: ActionData }`. One `<form method="POST" use:enhance={withToast(...)}>` with a hidden `eventKey`; `Input name="title" label="Заголовок" placeholder="Введите заголовок"`, `Textarea name="body" label="Текст" placeholder="Введите текст"`, `Checkbox name="isActive" label="Отправлять пуш об этом событии"`; the list of variables as `{{name}}` in `text-fg-faint`; a preview block `data-testid="template-preview"` with `$derived` title and body from `renderTemplate(template.eventKey, value, TEMPLATE_SAMPLES[template.eventKey])` wrapped in `try`, showing the `unknownVariables` message on a throw; two submit buttons with `formaction="?/save"` («Сохранить», `data-testid="template-save"`) and `formaction="?/test"` (`variant="secondary"`, «Отправить себе», `data-testid="template-test"`). Success toasts: «Шаблон сохранён», «Отправлено на устройств: N». Card title is `EVENT_LABEL[template.eventKey].title`.

`templates/+page.svelte`: `<svelte:head><title>Шаблоны уведомлений</title></svelte:head>`, an `h1`, a paragraph «Текст пуша по каждому событию. В уведомлении нет цен и личных данных: его видно на заблокированном экране.», then `{#each data.templates as template (template.eventKey)}` a `Card.Root data-testid="template-card"` with `TemplateForm`.

Matrix page copy: replace «Пуш и бот в МАКС заработают позже, до тех пор каналы только хранят выбор.» with «Пуш приходит на устройства, где человек включил уведомления. Бот в МАКС заработает позже.».

`src/lib/crm/labels.ts`: add `'notifications.template.update': 'Шаблон уведомления изменён'` to `AUDIT_ACTION_TITLE` and `notification_templates: 'Шаблон уведомления'` to `AUDIT_ENTITY_TITLE`.

- [ ] **Step 6: Run and commit**

Run: `pnpm vitest run tests/unit/push-template.spec.ts && pnpm check && pnpm lint`
Expected: PASS.

```bash
git add src/lib/server/notifications/push-template.* src/lib/crm src/routes/\(crm\) tests/unit/push-template.spec.ts
git commit -m "feat(crm): edit push templates with preview and test send"
```

---

### Task 8: Delivery log of the owner

**Files:**

- Create: `src/lib/server/notifications/notification-delivery.repository.ts`, `notification-delivery.service.ts`
- Create: `src/routes/(crm)/crm/settings/notifications/log/+page.server.ts`, `+page.svelte`, `src/lib/crm/notifications/DeliveryTable.svelte`
- Modify: `src/lib/notifications/labels.ts` (`FAILURE_LABEL`)
- Test: `tests/unit/notification-delivery.spec.ts`

**Interfaces:**

- Consumes: `deliveryFiltersSchema`, `DeliveryFilters`, `NotificationDeliveryDto` (Task 1); `failureOf` (Task 2); `normalizeListQuery`, `offsetFor`, `countExpression`, `Page`, `ListQuery`.
- Produces: `NotificationDeliveryService(ctx, repo?)`: `page(query: ListQuery<DeliveryFilters>): Page<NotificationDeliveryDto>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/notification-delivery.spec.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { notifications } from '../../src/lib/server/db/schema';
import { NotificationDeliveryService } from '../../src/lib/server/notifications/notification-delivery.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { EventKey } from '../../src/lib/types/events';
import { seedCharityWorld } from './helpers/charity';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const { world, ids, actors, sent } = seedCharityWorld(db);
const ownerId = insertUser({
	email: 'own@log.example',
	role: 'owner',
	counterpartyId: null,
	fullName: 'Хозяин'
});
const requestId = sent(actors.admin);

const owner: ActorContext = {
	userId: ownerId,
	scope: 'crm',
	roles: ['owner'],
	counterpartyId: null,
	canSeePrices: true,
	requestId: 't'
};
const log = (filters = {}) =>
	new NotificationDeliveryService(owner).page({ page: 1, perPage: 20, filters });

function row(
	userId: number,
	status: 'sent' | 'failed',
	error: string | null,
	eventKey: EventKey = 'request.ready'
) {
	db.insert(notifications)
		.values({
			eventKey,
			userId,
			channel: 'push',
			payload: { entityId: requestId },
			status,
			attempts: 1,
			error
		})
		.run();
}

beforeEach(() => db.delete(notifications).run());

describe('delivery log of the owner (C15)', () => {
	it('lists the pushes of every person, portal and workshop, newest first', () => {
		row(ids.driver, 'sent', null);
		row(world.adminId, 'failed', 'driver: 503 from fcm.googleapis.com');

		const page = log();

		expect(page.total).toBe(2);
		expect(page.rows.map((item) => item.userId)).toEqual([world.adminId, ids.driver]);
		expect(page.rows[0]).toMatchObject({ status: 'failed', failure: 'driver', requestId });
		expect(page.rows[1]).toMatchObject({ status: 'sent', failure: null });
		expect(page.rows[1]?.userName.length).toBeGreaterThan(0);
		expect(page.rows[1]?.requestNumber).toBeTruthy();
	});

	it('names the reason and never the answer of the push service', () => {
		row(ids.driver, 'failed', 'expired: every subscription is gone');
		row(ids.driver, 'failed', 'driver: 503 from fcm.googleapis.com');

		const body = JSON.stringify(log());

		expect(body).toContain('"failure":"expired"');
		expect(body).not.toContain('fcm.googleapis.com');
		expect(body).not.toMatch(/Minor/);
	});

	it('filters by event and by status', () => {
		row(ids.driver, 'sent', null);
		row(ids.driver, 'failed', 'driver: x', 'request.paid');

		expect(log({ status: 'failed' }).rows).toHaveLength(1);
		expect(log({ eventKey: 'request.ready' }).rows.map((item) => item.status)).toEqual(['sent']);
	});

	it('is closed to everyone without settings.manage', () => {
		const manager = { ...owner, userId: ids.manager, roles: ['manager'] } as ActorContext;
		expect(() => new NotificationDeliveryService(manager).page({ page: 1, perPage: 20 })).toThrow(
			ForbiddenError
		);
	});
});
```

- [ ] **Step 2: Run and see it fail**

Run: `pnpm vitest run tests/unit/notification-delivery.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/server/notifications/notification-delivery.repository.ts
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { notifications, requests, users } from '../db/schema';
import type { LogRow } from './notification.repository';
import { REQUEST_EVENT_KEYS } from '$lib/types/events';
import type { DeliveryFilters } from '$lib/validation/push';

export interface DeliveryRow extends LogRow {
	readonly userId: number;
	readonly userName: string;
	readonly error: string | null;
}

const entityIdOf = sql<number>`json_extract(${notifications.payload}, '$.entityId')`;

/** Every channel row of every person: the owner's view of what the system sent (C15). */
export class NotificationDeliveryRepository extends BaseRepository<typeof notifications> {
	constructor() {
		super(notifications);
	}

	page(
		filters: DeliveryFilters,
		limit: number,
		offset: number,
		tx?: Tx
	): { rows: DeliveryRow[]; total: number } {
		const where = and(
			filters.eventKey === undefined ? undefined : eq(notifications.eventKey, filters.eventKey),
			filters.status === undefined ? undefined : eq(notifications.status, filters.status)
		);
		const rows = this.db(tx)
			.select({
				id: notifications.id,
				eventKey: notifications.eventKey,
				channel: notifications.channel,
				status: notifications.status,
				attempts: notifications.attempts,
				requestId: requests.id,
				requestNumber: requests.number,
				createdAt: notifications.createdAt,
				sentAt: notifications.sentAt,
				userId: users.id,
				userName: users.fullName,
				error: notifications.error
			})
			.from(notifications)
			.innerJoin(users, eq(users.id, notifications.userId))
			// Only a request event points at a request; the owner reads every counterparty.
			.leftJoin(
				requests,
				and(eq(requests.id, entityIdOf), inArray(notifications.eventKey, [...REQUEST_EVENT_KEYS]))
			)
			.where(where)
			.orderBy(desc(notifications.createdAt), desc(notifications.id))
			.limit(limit)
			.offset(offset)
			.all();
		const [count] = this.db(tx)
			.select({ total: countExpression })
			.from(notifications)
			.where(where)
			.all();
		return { rows, total: count?.total ?? 0 };
	}
}
```

```ts
// src/lib/server/notifications/notification-delivery.service.ts
import { PolicyService } from '../auth/policy';
import { normalizeListQuery } from '../core/list';
import { BaseService } from '../core/service';
import { NotificationDtoMapper } from './dto';
import { NotificationDeliveryRepository } from './notification-delivery.repository';
import { failureOf } from '$lib/domain/notification/delivery';
import type { ActorContext } from '$lib/types/actor';
import type { ListQuery, Page } from '$lib/types/list';
import type { NotificationDeliveryDto } from '$lib/types/push';
import type { DeliveryFilters } from '$lib/validation/push';

/** The delivery log of all people, for the owner (C15). */
export class NotificationDeliveryService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly deliveries: NotificationDeliveryRepository = new NotificationDeliveryRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError without `settings.manage`. */
	page(query: Partial<ListQuery<DeliveryFilters>> = {}): Page<NotificationDeliveryDto> {
		this.assert(PolicyService.can(this.ctx, 'settings.manage'), 'settings.manage');
		const { page, perPage, filters } = normalizeListQuery(query);
		const found = this.deliveries.page(filters ?? {}, perPage, (page - 1) * perPage);
		return {
			rows: found.rows.map((row) => ({
				...NotificationDtoMapper.toLogItem(row),
				userId: row.userId,
				userName: row.userName,
				// The code only: a push service answer can name hosts and tokens.
				failure: row.status === 'failed' ? failureOf(row.error) : null
			})),
			total: found.total,
			page,
			perPage
		};
	}
}
```

The two rows inserted in one test share a `createdAt` second; the `desc(notifications.id)` tiebreak gives the order the test expects.

- [ ] **Step 4: Route and table**

```ts
// src/routes/(crm)/crm/settings/notifications/log/+page.server.ts
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { parseListQuery } from '$lib/server/core/list';
import { NotificationDeliveryService } from '$lib/server/notifications/notification-delivery.service';
import { deliveryFiltersSchema } from '$lib/validation/push';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	const service = new NotificationDeliveryService(requireAction(actor, 'settings.manage'));
	const filters = deliveryFiltersSchema.parse(Object.fromEntries(url.searchParams));
	return { log: service.page(parseListQuery(url, filters)) };
};
```

`src/lib/notifications/labels.ts`, add:

```ts
export const FAILURE_LABEL: Readonly<Record<DeliveryFailure, string>> = {
	expired: 'Подписка устарела',
	driver: 'Ошибка сервиса доставки'
};
```

`DeliveryTable.svelte`: `DataTable` with columns «Кому» (`userName`), «Событие» (label and date, as in `DeliveryLog.svelte`), «Заявка» (link to `/crm/requests/{id}` or «—»), «Доставка» (the same pill; under it `sentAt`, or for a failed row `FAILURE_LABEL[row.failure]` with `data-testid="delivery-failure"` and «Попыток: N»). Props mirror `DeliveryLog.svelte` with `rows: readonly NotificationDeliveryDto[]`; `emptyTitle="Пушей пока не было"`.

`log/+page.svelte`: follow `src/routes/(crm)/crm/settings/audit/+page.svelte`: a `FilterBar` with two selects, «Событие» (options from `EVENT_KEYS` and `EVENT_LABEL`, first option «Все события», placeholder «Выберите событие») and «Доставка» (options from `NOTIFICATION_STATUSES` and `DELIVERY_LABEL`, first option «Любая», placeholder «Выберите статус»), then `Card.Root data-testid="delivery-log"` with `DeliveryTable`. Title «Журнал отправок», paragraph «Пуши, которые система отправила людям мастерской и контрагентов. Человек без подписанного устройства в журнал не попадает.».

- [ ] **Step 5: Run and commit**

Run: `pnpm vitest run tests/unit/notification-delivery.spec.ts && pnpm check && pnpm lint`
Expected: PASS.

```bash
git add src/lib/server/notifications/notification-delivery.* src/lib/crm/notifications src/lib/notifications/labels.ts src/routes/\(crm\) tests/unit/notification-delivery.spec.ts
git commit -m "feat(crm): show the owner the delivery log of all people"
```

---

### Task 9: Installable shell

**Files:**

- Create: `static/manifest.webmanifest`, `scripts/icons.ts`, `static/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`
- Create: `src/service-worker.ts`
- Modify: `src/app.html`
- Create: `src/lib/ui/InstallPrompt.svelte`, `src/lib/ui/install.svelte.ts`; modify `src/lib/ui/index.ts`, `src/routes/(dev)/kitchen-sink` page
- Modify: `tech.md` section 9 (row `InstallPrompt`)
- Test: `tests/e2e/pwa.e2e.ts`

**Interfaces:**

- Produces: `InstallPrompt` (no props); `installState` with `canPrompt: boolean`, `isStandalone: boolean`, `isIos: boolean`, `prompt(): Promise<void>`.

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/pwa.e2e.ts
import { expect, test } from '@playwright/test';
import { login, logout } from './fixtures';

test('C15: the manifest is served, valid and points at real icons', async ({ page, request }) => {
	await page.goto('/login');
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
		'href',
		'/manifest.webmanifest'
	);

	const response = await request.get('/manifest.webmanifest');
	expect(response.status()).toBe(200);
	const manifest = await response.json();
	expect(manifest).toMatchObject({
		name: 'Столярная мастерская: заявки',
		short_name: 'Заявки',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		theme_color: '#1c2b48'
	});
	expect(manifest.icons.map((icon: { purpose?: string }) => icon.purpose ?? 'any')).toEqual([
		'any',
		'any',
		'maskable'
	]);
	for (const icon of manifest.icons as { src: string }[]) {
		const image = await request.get(icon.src);
		expect(image.status()).toBe(200);
		expect(image.headers()['content-type']).toBe('image/png');
	}
});

test('C15: the service worker registers and keeps Cache Storage empty', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto('/portal/catalog');
	const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
	expect(scope).toBe('http://localhost:4173/');

	await logout(page);

	expect(await page.evaluate(() => caches.keys())).toEqual([]);
});

test('C15: the worker source has no fetch handler and no cache', async ({ request }) => {
	const source = await (await request.get('/service-worker.js')).text();
	expect(source).toContain('notificationclick');
	expect(source).not.toMatch(/addEventListener\(\s*["'`]fetch/);
	expect(source).not.toMatch(/caches\./);
});
```

- [ ] **Step 2: Run and see it fail**

Run: `lsof -ti :4173 | xargs kill 2>/dev/null; SESSION_SECRET=e2e-session-secret-value-at-least-32-chars pnpm playwright test tests/e2e/pwa.e2e.ts`
Expected: FAIL, 404 on the manifest.

- [ ] **Step 3: Manifest, icons, head**

`static/manifest.webmanifest`: the JSON of tech.md 17.1 verbatim.

```ts
// scripts/icons.ts
// One-off: renders the app icons of tech.md 17.1 from the favicon. Run `pnpm tsx scripts/icons.ts`
// after the mark changes and commit the PNG files; the build never runs it.
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const mark = readFileSync('src/lib/assets/favicon.svg', 'utf8');
// A maskable icon is cropped to a circle by the launcher, so its mark stays inside the safe zone.
const ICONS = [
	{ file: 'icon-192.png', size: 192, mark: 0.72 },
	{ file: 'icon-512.png', size: 512, mark: 0.72 },
	{ file: 'maskable-512.png', size: 512, mark: 0.6 }
] as const;

mkdirSync('static/icons', { recursive: true });
const browser = await chromium.launch();
for (const icon of ICONS) {
	const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
	const side = Math.round(icon.size * icon.mark);
	await page.setContent(
		`<body style="margin:0;display:grid;place-items:center;height:100vh;background:#1c2b48">
			<div style="width:${side}px;height:${side}px;display:grid">${mark}</div>
		</body>`
	);
	await page.locator('svg').evaluate((svg) => {
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', '100%');
	});
	await page.screenshot({ path: `static/icons/${icon.file}` });
	await page.close();
}
await browser.close();
```

Run: `pnpm tsx scripts/icons.ts`, then open the three PNG files and check the mark is centred and readable on the dark background. If the favicon mark is dark, set `color:#d0e2f5` on the wrapper and `fill="currentColor"` handling as the SVG needs.

`src/app.html`, after the viewport meta:

```html
<link rel="manifest" href="%sveltekit.assets%/manifest.webmanifest" />
<meta name="theme-color" content="#1c2b48" />
<link rel="apple-touch-icon" href="%sveltekit.assets%/icons/icon-192.png" />
```

- [ ] **Step 4: Service worker**

```ts
// src/service-worker.ts
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

// Push-only worker: no fetch handler, no caches. Offline mode is out of scope (tech.md 17.2).
const sw = self as unknown as ServiceWorkerGlobalScope;

interface PushPayload {
	readonly title?: string;
	readonly body?: string;
	readonly url?: string;
	readonly tag?: string;
}

sw.addEventListener('install', () => void sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (event) => {
	const data = (event.data?.json() ?? {}) as PushPayload;
	// iOS revokes a subscription whose push shows nothing, so a notification appears whatever came.
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'Заявки', {
			body: data.body ?? '',
			icon: '/icons/icon-192.png',
			...(data.tag ? { tag: data.tag } : {}),
			data: { url: data.url ?? '/' }
		})
	);
});

// Deep-link straight into the request card instead of the app root.
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = String((event.notification.data as { url?: string } | null)?.url ?? '/');
	event.waitUntil(sw.clients.openWindow(url));
});
```

SvelteKit registers `src/service-worker.ts` by itself; do not add a manual `register` call. If `pnpm check` complains about lib references, follow the SvelteKit service worker docs for the `tsconfig` of this file.

- [ ] **Step 5: Install prompt**

```ts
// src/lib/ui/install.svelte.ts
interface InstallEvent extends Event {
	prompt(): Promise<void>;
}

/** Whether the app can be installed here and how (tech.md 17.4). Browser-only state. */
class InstallState {
	canPrompt = $state(false);
	isStandalone = $state(false);
	isIos = $state(false);
	private deferred: InstallEvent | null = null;

	/** Call from an effect: reads the device and listens for the browser's install offer. */
	watch(): () => void {
		this.isStandalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		this.isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
		const offer = (event: Event) => {
			event.preventDefault();
			this.deferred = event as InstallEvent;
			this.canPrompt = true;
		};
		const done = () => {
			this.canPrompt = false;
			this.isStandalone = true;
		};
		addEventListener('beforeinstallprompt', offer);
		addEventListener('appinstalled', done);
		return () => {
			removeEventListener('beforeinstallprompt', offer);
			removeEventListener('appinstalled', done);
		};
	}

	async prompt(): Promise<void> {
		await this.deferred?.prompt();
		this.deferred = null;
		this.canPrompt = false;
	}
}

export const installState = new InstallState();
```

`InstallPrompt.svelte`: `$effect(() => installState.watch())`; nothing when `isStandalone`; a `TouchButton variant="secondary" data-testid="install-app"` «Установить приложение» calling `installState.prompt()` when `canPrompt`; when `isIos && !canPrompt` a paragraph `data-testid="install-ios-hint"` «Чтобы установить приложение, нажмите «Поделиться», затем «На экран Домой».»; nothing otherwise. No `<style>` block: the kit barrel is side-effect free. Export from `src/lib/ui/index.ts`, render once in the kitchen-sink page, add the row `InstallPrompt` | «без пропсов: кнопка по `beforeinstallprompt`, инструкция для iOS, пусто в standalone» to tech.md section 9.

Place `<InstallPrompt />` at the top of `src/routes/(portal)/portal/+page.svelte`, `src/routes/(crm)/crm/shop/+page.svelte` and `src/routes/(crm)/crm/delivery/+page.svelte`.

- [ ] **Step 6: Run and commit**

Run: `lsof -ti :4173 | xargs kill 2>/dev/null; SESSION_SECRET=e2e-session-secret-value-at-least-32-chars pnpm playwright test tests/e2e/pwa.e2e.ts tests/e2e/kitchen-sink.e2e.ts tests/e2e/ui-bundle.e2e.ts && pnpm check && pnpm lint`
Expected: PASS.

```bash
git add static src/service-worker.ts src/app.html scripts/icons.ts src/lib/ui src/routes tech.md tests/e2e/pwa.e2e.ts
git commit -m "feat(ui): make the app installable with a push-only worker"
```

---

### Task 10: Push on the device

**Files:**

- Create: `src/lib/notifications/push-state.svelte.ts`, `PushToggle.svelte`, `PushBanner.svelte`
- Modify: `src/routes/(crm)/+layout.server.ts`, `src/routes/(portal)/+layout.server.ts` (`push`)
- Modify: `src/routes/(crm)/+layout.svelte`, `src/routes/(portal)/+layout.svelte` (sync)
- Modify: `src/routes/(crm)/crm/notifications/+page.svelte`, `src/routes/(portal)/portal/profile/notifications/+page.svelte`, `src/lib/notifications/NotificationPrefsForm.svelte` (copy)
- Modify: pages of Task 9 Step 5 (`PushBanner` beside `InstallPrompt`), `src/lib/ui/ContourShell.svelte` (`onLogout?: () => Promise<void>`), tech.md section 9 (`ContourShell` row)
- Test: `tests/unit/push-state.spec.ts`

**Interfaces:**

- Consumes: `PushStateDto`, `POST`/`DELETE /api/push/subscription` (Tasks 1, 4).
- Produces: `class PushState` with `status: 'unsupported' | 'unconfigured' | 'needs_install' | 'blocked' | 'off' | 'on'`, `busy: boolean`, `enable(): Promise<void>`, `disable(): Promise<void>`, `sync(): Promise<void>`; `pushState: PushState` singleton; `interface PushBrowser` for tests.

- [ ] **Step 1: Write the failing test**

The class takes its browser through one interface, so the test runs in Node without a DOM:

```ts
// tests/unit/push-state.spec.ts
import { describe, expect, it } from 'vitest';
import { PushState, type PushBrowser } from '../../src/lib/notifications/push-state.svelte';

const SUB = { endpoint: 'https://push.example/sub/1', p256dh: 'k', auth: 'a' };

function browser(over: Partial<PushBrowser> = {}) {
	const calls: string[] = [];
	const fake: PushBrowser = {
		supported: true,
		needsInstall: false,
		permission: () => 'default',
		requestPermission: async () => 'granted',
		current: async () => null,
		subscribe: async (key) => {
			calls.push(`subscribe:${key}`);
			return SUB;
		},
		unsubscribe: async () => void calls.push('unsubscribe'),
		send: async (method, body) => void calls.push(`${method}:${JSON.stringify(body)}`),
		...over
	};
	return { fake, calls };
}

describe('push state of a device (C15)', () => {
	it('never subscribes when the server has no public key', async () => {
		const { fake, calls } = browser();
		const state = new PushState(fake, '');

		await state.enable();

		expect(state.status).toBe('unconfigured');
		expect(calls).toEqual([]);
	});

	it('subscribes with the public key and tells the server', async () => {
		const { fake, calls } = browser();
		const state = new PushState(fake, 'public-key');

		await state.enable();

		expect(calls).toEqual(['subscribe:public-key', `POST:${JSON.stringify(SUB)}`]);
		expect(state.status).toBe('on');
	});

	it('stays off and asks no more when the person refused', async () => {
		const { fake, calls } = browser({
			requestPermission: async () => 'denied',
			permission: () => 'denied'
		});
		const state = new PushState(fake, 'public-key');

		await state.enable();

		expect(state.status).toBe('blocked');
		expect(calls).toEqual([]);
	});

	it('asks to install first on iOS outside the home screen', () => {
		const state = new PushState(browser({ needsInstall: true }).fake, 'public-key');
		expect(state.status).toBe('needs_install');
	});

	it('reports a browser without push as unsupported', () => {
		expect(new PushState(browser({ supported: false }).fake, 'public-key').status).toBe(
			'unsupported'
		);
	});

	it('sends the live subscription again on sync, and nothing without a permission', async () => {
		const granted = browser({ permission: () => 'granted', current: async () => SUB });
		const state = new PushState(granted.fake, 'public-key');
		await state.sync();
		expect(granted.calls).toEqual([`POST:${JSON.stringify(SUB)}`]);
		expect(state.status).toBe('on');

		const fresh = browser();
		await new PushState(fresh.fake, 'public-key').sync();
		expect(fresh.calls).toEqual([]);
	});

	it('removes the device on the server before it unsubscribes the browser', async () => {
		const { fake, calls } = browser({ permission: () => 'granted', current: async () => SUB });
		const state = new PushState(fake, 'public-key');
		await state.sync();
		calls.length = 0;

		await state.disable();

		expect(calls).toEqual([`DELETE:${JSON.stringify({ endpoint: SUB.endpoint })}`, 'unsubscribe']);
		expect(state.status).toBe('off');
	});

	it('stays off when the server refuses the subscription', async () => {
		const { fake } = browser({ send: async () => Promise.reject(new Error('500')) });
		const state = new PushState(fake, 'public-key');

		await expect(state.enable()).rejects.toThrow('500');
		expect(state.status).toBe('off');
		expect(state.busy).toBe(false);
	});
});
```

Vitest must compile `.svelte.ts` runes; the repo already tests rune classes (`grep -rln "svelte'" tests/unit` shows how they import them). Follow that import form.

- [ ] **Step 2: Run and see it fail**

Run: `pnpm vitest run tests/unit/push-state.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the state**

```ts
// src/lib/notifications/push-state.svelte.ts
import type { PushSubscriptionInput } from '$lib/validation/push';

export type PushStatus =
	'unsupported' | 'unconfigured' | 'needs_install' | 'blocked' | 'off' | 'on';

/** Everything the state needs from the browser, so a test can stand in for it. */
export interface PushBrowser {
	readonly supported: boolean;
	/** iOS delivers a push to an installed app only (tech.md 17). */
	readonly needsInstall: boolean;
	permission(): NotificationPermission;
	requestPermission(): Promise<NotificationPermission>;
	current(): Promise<PushSubscriptionInput | null>;
	subscribe(publicKey: string): Promise<PushSubscriptionInput>;
	unsubscribe(): Promise<void>;
	send(method: 'POST' | 'DELETE', body: unknown): Promise<void>;
}

/** Push on this very device: the permission of the browser and the subscription behind it. */
export class PushState {
	busy = $state(false);
	private subscribed = $state(false);
	private permission = $state<NotificationPermission>('default');
	private endpoint: string | null = null;

	constructor(
		private readonly browser: PushBrowser,
		private readonly publicKey: string
	) {
		if (browser.supported) this.permission = browser.permission();
	}

	get status(): PushStatus {
		if (!this.browser.supported) return 'unsupported';
		if (this.publicKey === '') return 'unconfigured';
		if (this.browser.needsInstall) return 'needs_install';
		if (this.permission === 'denied') return 'blocked';
		return this.subscribed ? 'on' : 'off';
	}

	/** Must run from a click: browsers refuse a permission prompt that no gesture asked for. */
	async enable(): Promise<void> {
		if (this.status !== 'off') return;
		await this.run(async () => {
			this.permission = await this.browser.requestPermission();
			if (this.permission !== 'granted') return;
			await this.store(await this.browser.subscribe(this.publicKey));
		});
	}

	async disable(): Promise<void> {
		if (this.endpoint === null) return;
		const endpoint = this.endpoint;
		await this.run(async () => {
			// Server first: a row left behind would keep ringing a device that no longer listens.
			await this.browser.send('DELETE', { endpoint });
			await this.browser.unsubscribe();
			this.endpoint = null;
			this.subscribed = false;
		});
	}

	/**
	 * On every app open: sends the live subscription again, so a device the push service
	 * re-issued, or the server retired, starts ringing without a tap.
	 */
	async sync(): Promise<void> {
		if (this.status !== 'off' || this.permission !== 'granted') return;
		const current = await this.browser.current();
		if (current) await this.store(current);
	}

	private async store(subscription: PushSubscriptionInput): Promise<void> {
		await this.browser.send('POST', subscription);
		this.endpoint = subscription.endpoint;
		this.subscribed = true;
	}

	private async run(work: () => Promise<void>): Promise<void> {
		this.busy = true;
		try {
			await work();
		} finally {
			this.busy = false;
		}
	}
}
```

Below the class, in the same file: `function realBrowser(): PushBrowser` and `export function pushStateFor(publicKey: string): PushState` that keeps one instance per page session. `realBrowser`:

- `supported`: `'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`;
- `needsInstall`: iOS user agent and not standalone (the two checks of `install.svelte.ts`);
- `permission`: `Notification.permission`; `requestPermission`: `Notification.requestPermission()`;
- `current`: `(await navigator.serviceWorker.ready).pushManager.getSubscription()` mapped through `toInput`;
- `subscribe`: `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })` mapped through `toInput`;
- `unsubscribe`: `getSubscription()` then `.unsubscribe()`;
- `send`: `fetch('/api/push/subscription', { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: JSON.stringify(body) })`, throwing on `!response.ok`;
- `toInput(subscription)`: `const json = subscription.toJSON(); return { endpoint: subscription.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' }`.

If the file passes 250 lines, move `realBrowser` to `push-browser.ts`.

- [ ] **Step 4: Server data**

Both layout loads return `push: new PushSubscriptionService(actor).state()`.

- [ ] **Step 5: Components and wiring**

`PushToggle.svelte` props `{ publicKey: string }`; one block `data-testid="push-toggle"` by `status`:

- `on`: «Уведомления на этом устройстве включены» and `Button variant="secondary" data-testid="push-disable"` «Отключить»;
- `off`: `Button data-testid="push-enable" loading={state.busy}` «Включить уведомления на этом устройстве»;
- `blocked`: «Уведомления запрещены в настройках браузера. Разрешите их для этого сайта и обновите страницу.»;
- `needs_install`: «Сначала установите приложение на экран Домой.»;
- `unsupported`: «Этот браузер не показывает уведомления.»;
- `unconfigured`: «Уведомления на устройства пока не настроены.».
  A rejected `enable` shows `toast.error('Не удалось включить уведомления')`.

`PushBanner.svelte` props `{ publicKey: string }`: renders only when `status === 'off'` and `localStorage['push-banner-closed'] !== '1'`; a `Card.Root data-testid="push-banner"` with «Включите уведомления, чтобы узнавать о заявках сразу», `TouchButton` «Включить» and a ghost `Button` «Не сейчас» that stores the flag. Read `localStorage` inside `$effect`, in a `try`.

Layouts: `$effect(() => { void pushStateFor(data.push.publicKey).sync(); })` in both contour layouts. Pass `onLogout={() => pushStateFor(data.push.publicKey).disable()}` to `ContourShell`; in `ContourShell.svelte` the logout form gets `onsubmit` that, when `onLogout` is set, prevents the default, awaits `onLogout()` inside `try`/`finally`, then submits the form, so a failed unsubscribe never blocks the sign-out. The portal logs out from `/portal/profile`: give that form the same handler.

Pages: `PushToggle` in a `Card` above `NotificationPrefsForm` on both personal pages, `PushBanner` under `InstallPrompt` on the three pages of Task 9.

Copy:

- `NotificationPrefsForm.svelte`: «Пуш приходит на устройства, где вы включили уведомления. Бот в МАКС заработает позже: выбор сохранится и включится вместе с ним.»
- portal page, log section: «Пуш-уведомления, которые портал отправил вам. Если отправка не удалась, портал повторит её сам.» stays.

- [ ] **Step 6: Run and commit**

Run: `pnpm vitest run tests/unit/push-state.spec.ts && pnpm check && pnpm lint`
Expected: PASS.

```bash
git add src/lib/notifications src/lib/ui src/routes tech.md tests/unit/push-state.spec.ts
git commit -m "feat(portal): enable push on the device from both contours"
```

---

### Task 11: End to end, deploy notes, gate

**Files:**

- Create: `tests/e2e/crm-push.e2e.ts`
- Modify: `tests/e2e/crm-notifications.e2e.ts`, `tests/e2e/notifications.e2e.ts` (copy and counts that changed)
- Modify: `docs/deploy.md`, `compose.yml` (VAPID env pass-through, `PUSH_DRIVER`)

- [ ] **Step 1: Write the e2e**

```ts
// tests/e2e/crm-push.e2e.ts
import { expect, test, type Page } from '@playwright/test';
import { desc, eq } from 'drizzle-orm';
import {
	auditLog,
	notifications,
	notificationTemplates,
	pushSubscriptions,
	users
} from '../../src/lib/server/db/schema';
import { ACCOUNTS, login, logout, purchaseMoneyKeys } from './fixtures';
import { sendRequest } from './portal-flow';
import { e2eDb, stockUp, transition } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';
const QUEUE_TIMEOUT = 15_000;
const API = '/api/push/subscription';
const JSON_HEADERS = {
	origin: ORIGIN,
	'content-type': 'application/json',
	'x-requested-with': 'fetch'
};
const device = (name: string) => ({
	endpoint: `https://push.example/e2e/${name}`,
	p256dh: 'k',
	auth: 'a'
});

const userId = (role: keyof typeof ACCOUNTS) =>
	db.select().from(users).where(eq(users.email, ACCOUNTS[role].email)).all()[0]?.id ?? 0;

function clean(): void {
	db.delete(pushSubscriptions).run();
	db.delete(notifications).run();
}

async function readyRequest(page: Page): Promise<string> {
	const number = await sendRequest(page, 'cp_admin');
	await logout(page);
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
	return number;
}

test.beforeEach(clean);
// Other specs count channel rows from zero: leave none behind.
test.afterAll(clean);

test('C15: the driver gets a push the moment a request is ready, the owner sees it in the log', async ({
	page
}) => {
	await login(page, 'driver');
	expect(
		(await page.request.post(API, { headers: JSON_HEADERS, data: device('driver') })).status()
	).toBe(200);
	await logout(page);
	// The sign-out removes the device the browser holds; this one was added over the API, so it stays.
	expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);

	const number = await readyRequest(page);

	await expect(async () => {
		const sent = db
			.select()
			.from(notifications)
			.where(eq(notifications.userId, userId('driver')))
			.all();
		expect(
			sent.filter((row) => row.eventKey === 'request.ready' && row.status === 'sent')
		).toHaveLength(1);
	}).toPass({ timeout: QUEUE_TIMEOUT });

	await login(page, 'owner');
	await page.goto('/crm/settings/notifications/log');
	const line = page
		.getByTestId('delivery-log')
		.getByTestId('data-table-row')
		.filter({ hasText: number })
		.first();
	await expect(line).toContainText('Заявка готова к выдаче');
	await expect(line.getByTestId('delivery-status')).toHaveText('Отправлено');
	const body = await (await page.request.get('/crm/settings/notifications/log/__data.json')).text();
	expect(purchaseMoneyKeys(body)).toEqual([]);
});

test('C15: a person without a device gets the bell and no push row', async ({ page }) => {
	await readyRequest(page);
	await login(page, 'driver');

	await expect(async () => {
		await page.goto('/crm');
		await expect(page.getByTestId('bell-count')).toBeVisible({ timeout: 500 });
	}).toPass({ timeout: QUEUE_TIMEOUT });
	expect(db.select().from(notifications).all()).toEqual([]);
});

test('C15: the owner edits a template, previews it and the change is audited', async ({ page }) => {
	await login(page, 'owner');
	await page.goto('/crm/settings/notifications/templates');
	const card = page.getByTestId('template-card').filter({ hasText: 'Заявка готова к выдаче' });

	await card.getByLabel('Текст').fill('Заберите заявку {{number}}');
	await expect(card.getByTestId('template-preview')).toContainText('Заберите заявку 2026-0042');
	await card.getByTestId('template-save').click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Шаблон сохранён' })).toBeVisible();

	await page.reload();
	await expect(card.getByLabel('Текст')).toHaveValue('Заберите заявку {{number}}');
	const [entry] = db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1).all();
	expect(entry?.action).toBe('notifications.template.update');

	await card.getByLabel('Текст').fill('Сумма {{totalMinor}}');
	await card.getByTestId('template-save').click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Переменной нет у этого события' })
	).toBeVisible();

	await card.getByLabel('Текст').fill('Изделия готовы к выдаче');
	await card.getByTestId('template-save').click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Шаблон сохранён' })).toBeVisible();
});

test('C15: the test send asks for a device first and then reaches it', async ({ page }) => {
	await login(page, 'owner');
	await page.goto('/crm/settings/notifications/templates');
	const card = page.getByTestId('template-card').first();

	await card.getByTestId('template-test').click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Включите уведомления на этом устройстве' })
	).toBeVisible();

	await page.request.post(API, { headers: JSON_HEADERS, data: device('owner') });
	await card.getByTestId('template-test').click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Отправлено на устройств: 1' })
	).toBeVisible();
	expect(db.select().from(notifications).all()).toEqual([]);
});

test('C15: templates and the log answer 403 to the administrator and the driver', async ({
	page
}) => {
	for (const role of ['manager', 'driver'] as const) {
		await login(page, role);
		expect((await page.goto('/crm/settings/notifications/templates'))?.status()).toBe(403);
		expect((await page.goto('/crm/settings/notifications/log'))?.status()).toBe(403);
		const forged = await page.request.post('/crm/settings/notifications/templates?/save', {
			headers: { origin: ORIGIN },
			form: { eventKey: 'request.ready', title: 'x', body: 'y', isActive: 'on' }
		});
		expect(forged.status()).toBe(403);
		await page.goto('/crm');
		await logout(page);
	}
});

test('C15: the subscription endpoint serves both contours and refuses the rest', async ({
	page
}) => {
	const guest = await page.request.post(API, {
		headers: JSON_HEADERS,
		data: device('guest'),
		maxRedirects: 0
	});
	expect(guest.status()).toBe(303);

	await login(page, 'cp_employee');
	expect(
		(await page.request.post(API, { headers: JSON_HEADERS, data: device('portal') })).status()
	).toBe(200);
	expect(
		(
			await page.request.post(API, { headers: JSON_HEADERS, data: { endpoint: 'http://x' } })
		).status()
	).toBe(400);
	const plain = await page.request.post(API, {
		headers: { origin: ORIGIN, 'content-type': 'application/json' },
		data: device('portal')
	});
	expect(plain.status()).toBe(403);
	await logout(page);

	await login(page, 'manager');
	const foreign = await page.request.delete(API, {
		headers: JSON_HEADERS,
		data: { endpoint: device('portal').endpoint }
	});
	expect(foreign.status()).toBe(404);
	expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
});

test('C15: the personal page offers push and says so when it is not configured', async ({
	page
}) => {
	await login(page, 'driver');
	await page.goto('/crm/notifications');

	// The e2e server runs without VAPID keys, so the device can never be subscribed here.
	await expect(page.getByTestId('push-toggle')).toContainText(
		'Уведомления на устройства пока не настроены'
	);
	await expect(page.getByTestId('push-enable')).toHaveCount(0);
	await page.goto('/crm/delivery');
	await expect(page.getByTestId('push-banner')).toHaveCount(0);
});
```

The template test restores the default text itself, so a rerun on the same database starts from the seeded row. Drop the unused `notificationTemplates` import if the linter reports it.

- [ ] **Step 2: Run the e2e and fix what C15 moved**

Run: `lsof -ti :4173 | xargs kill 2>/dev/null; SESSION_SECRET=e2e-session-secret-value-at-least-32-chars pnpm playwright test tests/e2e/crm-push.e2e.ts tests/e2e/pwa.e2e.ts tests/e2e/crm-notifications.e2e.ts tests/e2e/notifications.e2e.ts tests/e2e/notification-feed.e2e.ts tests/e2e/ui-shell.e2e.ts tests/e2e/visual-shell.e2e.ts`
Expected: PASS after the edits below.

- `crm-notifications.e2e.ts`: the test «an event sends no letter and writes no channel row» keeps its meaning (nobody has a device); rename it to «…and writes no channel row without a device». The matrix test stays.
- Menu label «Матрица уведомлений» became «Уведомления»: fix selectors that used it.
- Visual snapshots of pages that gained the install prompt or the tabs: review the diff, then update with `--update-snapshots` for those files only.

- [ ] **Step 3: Deploy notes**

`docs/deploy.md`, a section «Web Push»: generate the pair on the VPS with `pnpm dlx web-push generate-vapid-keys`; set `PUSH_DRIVER=webpush`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:<адрес владельца>` in the stand `.env`; keep the pair in a password manager, because a new pair kills every subscription; the app refuses to boot with `PUSH_DRIVER=webpush` and no keys; HTTPS is required and Caddy already gives it; manual acceptance list: install on Android Chrome, install on iOS Safari 16.4 or newer through «Поделиться, На экран Домой», enable push on `/crm/notifications`, move a request to `ready`, tap the notification, land on `/crm/delivery`.

`compose.yml`: pass the four variables through to the app service the way the SMTP ones are passed.

- [ ] **Step 4: Full gate**

Run, with `SESSION_SECRET` exported and port 4173 free:

```bash
pnpm lint && pnpm check && pnpm test:unit && pnpm test:e2e && pnpm build
```

Expected: all green; coverage of `lib/domain/**` at 90% lines or more. Then on a clean database: `rm -f data/gate.db && DATABASE_PATH=./data/gate.db pnpm db:migrate && DATABASE_PATH=./data/gate.db pnpm seed`. Expected: no error, ten rows in `notification_templates`.

Check file sizes: `wc -l` on every file this plan created or touched, none above 250.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e docs/deploy.md compose.yml
git commit -m "test(crm): walk the push from a ready request to the log"
```

- [ ] **Step 6: Manual acceptance on the stand**

After deploy with real keys: the list of Step 3. The slice DoD is closed only when the push arrives on both an Android phone and an iPhone and Cache Storage is empty in DevTools.
