# Правки портала P10–P13: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть шесть правок бизнеса от 19.09.2026 четырьмя слайсами портала: чистка профиля, обязательная отгрузка в заявке, фид уведомлений с колокольчиком и канал МАКС в контракте, примеры работ и блок фонда на лендинге.

**Architecture:** Каждый слайс повторяет эталонную вертикаль `src/routes/(portal)/portal/profile` (K5): `+page.server.ts` → Zod-схема из `lib/validation` → сервис на `BaseService` → репозиторий на `BaseRepository` → аудит → DTO-маппер → компонент из `lib/ui` → тесты. Правила отгрузки живут в чистом домене (`lib/domain/request/state-machine.ts`) guard-ом `deliveryFilled`, а не в сервисе: так они проверяются property-based тестами по всем парам переходов. Фид уведомлений отдельная таблица, а не канал: одно событие даёт строку на канал, и колокольчик показал бы одно и то же дважды.

**Tech Stack:** SvelteKit 2 + Svelte 5 (руны), TypeScript strict, Drizzle ORM поверх SQLite (better-sqlite3), Zod 4, shadcn-svelte, Vitest, Playwright, fast-check.

**Spec:** `docs/superpowers/specs/2026-09-19-portal-edits-design.md`

**Ядро:** `tech.md` v1.33. Контракт уже обновлён и закоммичен, слайсы идут по нему.

## Global Constraints

- TypeScript strict, `any` запрещён. `exactOptionalPropertyTypes` включён: необязательный проп пробрасывается через `definedProps` из `$lib/utils/props`.
- Сервисы наследуют `BaseService`, репозитории `BaseRepository`. Роут тонкий: без бизнес-логики и без Drizzle.
- Домен в `src/lib/domain/**` чистый: без БД, `fs`, `fetch`, SvelteKit.
- Права проверяются на сервере на каждое действие и каждый переход статуса. Скрытие в UI защитой не считается.
- Row-level фильтр по `counterpartyId` из `ActorContext` в каждом портальном запросе, через `this.scopedWhere(ctx, ...)`.
- Цены роли без цен не приходят из БД: вырезает `select` и DTO-маппер, не шаблон.
- Весь вход через Zod на сервере, включая `FormData` и query.
- Деньги в целых копейках, поля с суффиксом `_minor`.
- Файл не длиннее 250 строк, функция не длиннее 40.
- Миграции только `pnpm db:generate` из схемы. Файлы в `drizzle/` руками не правим.
- UI только на shadcn-svelte из `$lib/ui`. Свои таблицы, модалки и цвета не заводим, хардкод цвета повод для отката.
- Плейсхолдеры полей короткие: «Введите …» или «Выберите …», без примеров и объяснений.
- Комментарии на английском, объясняют **почему**. TODO и закомментированный код в мёрдж не идут.
- Коммиты Conventional Commits на английском: `type(scope): summary`, императив, строчная буква, без точки, до 50 символов. Автор берётся из `git config`, `--author` не используем. Следов нейросети в сообщениях нет.
- Один слайс = одна ветка = один PR. Ветки: `feat/portal-profile-cleanup` (P10), `feat/request-delivery-required` (P11), `feat/notification-feed` (P12), `feat/landing-works-charity` (P13).
- Перед PR локально зелёные `pnpm lint`, `pnpm check`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm build`.
- Порог покрытия `src/lib/domain/**` — 90% строк.
- Локальный прогон e2e и `vite build` требует `SESSION_SECRET` в окружении: ни Playwright, ни сборка не читают `.env`.
- Тесты очереди работают на реальных часах: `visible_at` целые секунды, замороженные часы воркера пропускают джобы.

---

## File Structure

### P10. Профиль контрагента

- Modify `src/lib/types/counterparty.ts` — `CounterpartyCardDto` теряет реквизиты и скидку.
- Modify `src/lib/server/counterparty/dto.ts` — маппер перестаёт их класть.
- Modify `src/lib/server/counterparty/counterparty.repository.ts` — `findOwn` перестаёт выбирать колонки карточки. `discountPercent` остаётся: его читает `DraftCalculator`.
- Modify `src/lib/portal/profile/CounterpartyOverview.svelte` — уходят карточка «Реквизиты» и плитка скидки.
- Modify `src/lib/portal/search/portal-sections.ts` — из алиасов «Профиль» уходит «реквизиты».
- Test `tests/unit/counterparty.spec.ts`, `tests/unit/portal-sections.spec.ts`, `tests/e2e/profile.e2e.ts`.

### P11. Заявка: обязательная отгрузка

- Modify `src/lib/types/request.ts` — `GUARD_CODES`, `DraftDto`, `RequestCardDto`.
- Modify `src/lib/domain/request/state-machine.ts` — guard `deliveryFilled` на `draft -> new`.
- Create `src/lib/domain/request/delivery.ts` — чистая проверка заполненности отгрузки.
- Modify `src/lib/server/db/schema/requests.ts` — `delivery_at`, `deceased_name`, удаление `is_pickup`.
- Modify `src/lib/validation/request.ts` — `draftDetailsSchema`.
- Modify `src/lib/server/request/draft.repository.ts`, `draft.dto.ts`, `draft.service.ts`, `request-submit.service.ts`, `request-card.repository.ts`, `card.dto.ts`.
- Modify `src/lib/portal/cart/DeliveryPanel.svelte`, `src/routes/(portal)/portal/requests/[id]/+page.svelte`.
- Test `tests/unit/delivery-guard.spec.ts` (create), `tests/unit/request-transition.spec.ts`, `tests/unit/draft.spec.ts`, `tests/unit/request-submit.spec.ts`, `tests/unit/request-card.spec.ts`, `tests/e2e/cart.e2e.ts`.

### P12. Фид уведомлений и канал МАКС

- Modify `src/lib/types/notifications.ts` — `NOTIFICATION_CHANNELS`, DTO фида.
- Modify `src/lib/server/db/schema/system.ts` — enum каналов через `NOTIFICATION_CHANNELS`, таблица `notification_feed`.
- Create `src/lib/server/notifications/notification-feed.repository.ts`.
- Create `src/lib/server/notifications/notification-feed.service.ts`.
- Modify `src/lib/server/queue/handlers/notification-fanout.ts` — запись строки фида.
- Create `src/lib/ui/shell/BellMenu.svelte`; modify `src/lib/ui/ContourShell.svelte`, `src/lib/ui/shell/PortalHeader.svelte`, `src/lib/ui/shell/types.ts`.
- Create `src/routes/(portal)/portal/notifications/+server.ts` — отметка прочтения.
- Modify `src/routes/(portal)/+layout.server.ts`, `src/routes/(portal)/+layout.svelte`.
- Test `tests/unit/notification-feed.spec.ts` (create), `tests/unit/notification-queue.spec.ts`, `tests/unit/notification-settings.spec.ts`, `tests/e2e/notifications.e2e.ts`.

### P13. Лендинг

- Create `src/lib/server/landing/landing.service.ts`, `src/lib/server/landing/works.repository.ts`.
- Create `src/routes/api/public/works/[id]/+server.ts`.
- Create `src/lib/portal/landing/LandingWorks.svelte`, `src/lib/portal/landing/LandingCharity.svelte`.
- Modify `src/lib/server/settings/org.service.ts` — публичные данные фонда.
- Modify `src/routes/+page.server.ts`, `src/routes/+page.svelte`.
- Test `tests/unit/landing.spec.ts` (create), `tests/e2e/landing.e2e.ts` (create).

---

# Слайс P10. Профиль контрагента

Ветка: `git checkout -b feat/portal-profile-cleanup`

### Task 1: Профиль контрагента без реквизитов и скидки

**Files:**

- Modify: `src/lib/types/counterparty.ts`
- Modify: `src/lib/server/counterparty/dto.ts`
- Modify: `src/lib/server/counterparty/counterparty.repository.ts`
- Modify: `src/lib/portal/profile/CounterpartyOverview.svelte`
- Modify: `src/lib/portal/search/portal-sections.ts`
- Test: `tests/unit/counterparty.spec.ts`, `tests/unit/portal-sections.spec.ts`, `tests/e2e/profile.e2e.ts`

**Interfaces:**

- Consumes: `CounterpartyRepository.findOwn(ctx): CounterpartyRow | undefined`, `CounterpartyDtoMapper.toCard(row, parts): CounterpartyCardDto`.
- Produces: `CounterpartyCardDto` без ключей `legalName`, `inn`, `kpp`, `address`, `phone`, `email`, `settlementScheme`, `discountPercent`. `CounterpartyRow` сохраняет `discountPercent`: его читает `DraftCalculator`, и P11 на него опирается.

Задача одна, а не две: тип, маппер, репозиторий и компонент правятся вместе, иначе между коммитами остаётся красный тайпчек.

- [ ] **Step 1: Прочитать существующий тест карточки**

Run: `sed -n '1,80p' tests/unit/counterparty.spec.ts`

Понять, как тест собирает `ActorContext` и зовёт `CounterpartyService.card()`. Дальше опираться на те же хелперы и имена контекстов.

- [ ] **Step 2: Написать падающий контрактный тест**

Добавить в `tests/unit/counterparty.spec.ts`:

```ts
const CARD_FORBIDDEN_KEYS = [
	'legalName',
	'inn',
	'kpp',
	'address',
	'phone',
	'email',
	'settlementScheme',
	'discountPercent'
] as const;

it('карточка профиля не отдаёт реквизиты и скидку ни одной роли', () => {
	for (const ctx of [adminCtx, employeeCtx]) {
		const keys = Object.keys(new CounterpartyService(ctx).card());
		for (const forbidden of CARD_FORBIDDEN_KEYS) {
			expect(keys).not.toContain(forbidden);
		}
	}
});

it('карточка профиля оставляет договор, менеджера и деньги администратору', () => {
	const card = new CounterpartyService(adminCtx).card();
	expect(card).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
	expect(card.debtMinor).toBeTypeOf('number');
	expect(card.yearPurchasesMinor).toBeTypeOf('number');
});
```

- [ ] **Step 3: Написать падающий тест подсказок поиска**

Добавить в `tests/unit/portal-sections.spec.ts`:

```ts
it('подсказка «реквизиты» больше не ведёт в профиль', () => {
	const sections = portalSections({ staff: true, prices: true });
	expect(matchSections(sections, 'реквизиты')).toHaveLength(0);
});
```

- [ ] **Step 4: Написать падающий e2e**

Добавить в `tests/e2e/profile.e2e.ts`:

```ts
test('профиль не показывает реквизиты и скидку по договору', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/portal/profile');
	await expect(page.getByRole('heading', { name: 'Реквизиты' })).toHaveCount(0);
	await expect(page.getByText('Скидка по договору')).toHaveCount(0);
	await expect(page.getByText('Задолженность')).toBeVisible();
	await expect(page.getByText('Закупка за год')).toBeVisible();
});
```

Имя хелпера входа взять из уже существующих тестов файла.

- [ ] **Step 5: Прогнать все три, убедиться, что падают**

Run: `pnpm vitest run tests/unit/counterparty.spec.ts tests/unit/portal-sections.spec.ts`
Expected: FAIL, `expect(keys).not.toContain('legalName')` и найденная секция «реквизиты».

Run: `SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e tests/e2e/profile.e2e.ts`
Expected: FAIL, заголовок «Реквизиты» найден.

- [ ] **Step 6: Убрать поля из типа**

В `src/lib/types/counterparty.ts` заменить тело `CounterpartyCardDto` на:

```ts
/** Counterparty card of the portal profile. Requisites and the contract discount left in v1.33. */
export interface CounterpartyCardDto {
	readonly id: number;
	readonly name: string;
	readonly contract: ContractDto | null;
	readonly manager: ContactDto | null;
	readonly staffPreview: readonly StaffPreviewDto[];
	readonly staffCount: number;
	readonly staffLimit: number;
	readonly debtMinor?: number;
	readonly yearPurchasesMinor?: number;
	readonly yearDeliveries?: number;
}
```

Сам тип `SettlementScheme` оставить в файле: его ведёт карточка контрагента CRM (C3). Импорт, ставший лишним, убрать.

- [ ] **Step 7: Убрать поля из маппера**

В `src/lib/server/counterparty/dto.ts` заменить тело `toCard` на:

```ts
	static toCard(row: CounterpartyRow, parts: CardParts): CounterpartyCardDto {
		return {
			id: row.id,
			name: row.name,
			contract: parts.contract
				? {
						number: parts.contract.number,
						signedAt: parts.contract.signedAt?.toISOString() ?? null,
						validUntil: parts.contract.validUntil?.toISOString() ?? null
					}
				: null,
			manager: parts.manager ? CounterpartyDtoMapper.toContact(parts.manager) : null,
			staffPreview: parts.staff.rows.map((member): StaffPreviewDto => ({
				...CounterpartyDtoMapper.toContact(member),
				role: asPortalRole(member.role)
			})),
			staffCount: parts.staff.total,
			staffLimit: row.staffLimit,
			...definedProps({
				debtMinor: parts.money?.debtMinor,
				yearPurchasesMinor: parts.money?.yearPurchasesMinor,
				yearDeliveries: parts.money?.yearDeliveries
			})
		};
	}
```

- [ ] **Step 8: Сузить выборку репозитория**

В `src/lib/server/counterparty/counterparty.repository.ts` заменить `CounterpartyRow` на:

```ts
export interface CounterpartyRow {
	readonly id: number;
	readonly name: string;
	/** Not shown in the portal since v1.33; the draft calculator still prices with it. */
	readonly discountPercent: number;
	readonly staffLimit: number;
	readonly managerId: number | null;
}
```

и `select` в `findOwn` на:

```ts
			.select({
				id: counterparties.id,
				name: counterparties.name,
				discountPercent: counterparties.discountPercent,
				staffLimit: counterparties.staffLimit,
				managerId: counterparties.managerId
			})
```

Импорт `SettlementScheme` из файла убрать.

- [ ] **Step 9: Убрать карточку реквизитов и плитку скидки**

В `src/lib/portal/profile/CounterpartyOverview.svelte`:

- удалить `$derived` со списком `requisites` и константу `SCHEME_LABEL`;
- удалить целиком `Card.Root` с заголовком «Реквизиты»;
- заменить условие и ряд показателей на:

```svelte
{#if card.debtMinor !== undefined}
	<div data-testid="counterparty-money" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div class="rounded-inset bg-surface-muted p-4">
			<div class="text-xs tracking-[0.1em] text-fg-faint uppercase">Задолженность</div>
			<div class="font-heading text-3xl font-semibold">
				<PriceCell valueMinor={card.debtMinor} /> ₽
			</div>
		</div>
		<div class="rounded-inset bg-surface-muted p-4">
			<div class="text-xs tracking-[0.1em] text-fg-faint uppercase">Закупка за год</div>
			<div class="font-heading text-3xl font-semibold">
				<PriceCell valueMinor={card.yearPurchasesMinor} /> ₽
			</div>
			<div class="text-sm text-fg-muted">отгрузок: {card.yearDeliveries ?? 0}</div>
		</div>
	</div>
{/if}
```

Импорт `formatDate` оставить: его читает строка договора.

- [ ] **Step 10: Убрать алиас поиска**

В `src/lib/portal/search/portal-sections.ts`:

```ts
	Профиль: ['аккаунт', 'договор', 'пароль'],
```

- [ ] **Step 11: Прогнать всё**

Run: `pnpm check && pnpm lint && pnpm vitest run`
Expected: 0 ошибок тайпчека, все юнит-тесты зелёные. Если упал `tests/unit/draft.spec.ts`, значит `discountPercent` случайно убрали из `CounterpartyRow`: вернуть.

Run: `SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e tests/e2e/profile.e2e.ts`
Expected: PASS.

- [ ] **Step 12: Коммит**

```bash
git add src/lib/types/counterparty.ts src/lib/server/counterparty src/lib/portal/profile/CounterpartyOverview.svelte src/lib/portal/search/portal-sections.ts tests/unit/counterparty.spec.ts tests/unit/portal-sections.spec.ts tests/e2e/profile.e2e.ts
git commit -m "feat(portal): remove requisites and discount from profile"
```

- [ ] **Step 13: Гейт и PR**

```bash
pnpm lint && pnpm check && pnpm test:unit
SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e
SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm build
git push -u origin feat/portal-profile-cleanup
gh pr create --title "P10: профиль контрагента без реквизитов и скидки" --body "..."
```

---

# Слайс P11. Заявка: обязательная отгрузка

Ветка от свежего `main`: `git checkout main && git pull && git checkout -b feat/request-delivery-required`

### Task 2: Guard `deliveryFilled` в чистом домене

**Files:**

- Create: `src/lib/domain/request/delivery.ts`
- Modify: `src/lib/types/request.ts`
- Modify: `src/lib/domain/request/state-machine.ts`
- Test: `tests/unit/delivery-guard.spec.ts`

**Interfaces:**

- Produces: `isDeliveryFilled(facts: DeliveryFacts): boolean` и тип `DeliveryFacts`; `GUARD_CODES` со значением `'deliveryFilled'`; переход `draft -> new` с `guards: ['deliveryFilled']`.

```ts
export interface DeliveryFacts {
	readonly isStockRequest: boolean;
	readonly deliveryAddressId: number | null;
	readonly deliveryAt: Date | null;
	readonly deceasedName: string | null;
}
```

- [ ] **Step 1: Написать падающие тесты домена**

Создать `tests/unit/delivery-guard.spec.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isDeliveryFilled } from '$lib/domain/request/delivery';
import { TRANSITIONS, checkTransition } from '$lib/domain/request/state-machine';
import type { DeliveryFacts } from '$lib/domain/request/delivery';

const full: DeliveryFacts = {
	isStockRequest: false,
	deliveryAddressId: 7,
	deliveryAt: new Date('2026-09-25T09:00:00.000Z'),
	deceasedName: 'Иванов Иван Иванович'
};

describe('isDeliveryFilled', () => {
	it('пропускает заявку контрагента со всеми тремя полями', () => {
		expect(isDeliveryFilled(full)).toBe(true);
	});

	it('пропускает заявку на склад без единого поля', () => {
		expect(
			isDeliveryFilled({
				isStockRequest: true,
				deliveryAddressId: null,
				deliveryAt: null,
				deceasedName: null
			})
		).toBe(true);
	});

	it('не пропускает заявку контрагента без любого из трёх полей', () => {
		expect(isDeliveryFilled({ ...full, deliveryAddressId: null })).toBe(false);
		expect(isDeliveryFilled({ ...full, deliveryAt: null })).toBe(false);
		expect(isDeliveryFilled({ ...full, deceasedName: null })).toBe(false);
	});

	it('не считает заполненным ФИО из пробелов', () => {
		expect(isDeliveryFilled({ ...full, deceasedName: '   ' })).toBe(false);
	});
});

describe('guard deliveryFilled в машине состояний', () => {
	it('стоит ровно на переходе draft -> new', () => {
		const withGuard = TRANSITIONS.filter((t) => (t.guards ?? []).includes('deliveryFilled'));
		expect(withGuard).toHaveLength(1);
		expect(withGuard[0]).toMatchObject({ from: 'draft', to: 'new' });
	});

	it('не пускает отправку, пока guard не прошёл', () => {
		const check = checkTransition({
			from: 'draft',
			to: 'new',
			actorRoles: ['cp_admin'],
			isOwnRequest: true,
			isAssigned: false,
			hasReason: false,
			guards: { deliveryFilled: false }
		});
		expect(check).toMatchObject({
			ok: false,
			denial: { code: 'guard_failed', guard: 'deliveryFilled' }
		});
	});

	it('ни один другой переход не требует deliveryFilled', () => {
		fc.assert(
			fc.property(fc.constantFrom(...TRANSITIONS), (transition) => {
				if (transition.from === 'draft' && transition.to === 'new') return true;
				return !(transition.guards ?? []).includes('deliveryFilled');
			})
		);
	});
});
```

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `pnpm vitest run tests/unit/delivery-guard.spec.ts`
Expected: FAIL, модуль `$lib/domain/request/delivery` не найден.

- [ ] **Step 3: Написать чистую функцию**

Создать `src/lib/domain/request/delivery.ts`:

```ts
/**
 * Delivery facts a request carries when it leaves the draft (tech.md 6.2, invariant 8).
 * A stock request has no counterparty, so it has no address, no deadline and no deceased.
 */
export interface DeliveryFacts {
	readonly isStockRequest: boolean;
	readonly deliveryAddressId: number | null;
	readonly deliveryAt: Date | null;
	readonly deceasedName: string | null;
}

export function isDeliveryFilled(facts: DeliveryFacts): boolean {
	if (facts.isStockRequest) return true;
	return (
		facts.deliveryAddressId !== null &&
		facts.deliveryAt !== null &&
		(facts.deceasedName ?? '').trim() !== ''
	);
}
```

- [ ] **Step 4: Добавить код guard-а**

В `src/lib/types/request.ts`:

```ts
export const GUARD_CODES = ['hasAssignee', 'pricesFixed', 'fullyPaid', 'deliveryFilled'] as const;
```

- [ ] **Step 5: Повесить guard на переход**

В `src/lib/domain/request/state-machine.ts`:

```ts
	{
		from: 'draft',
		to: 'new',
		roles: ['cp_admin', 'cp_employee', 'manager', 'owner'],
		ownOnly: true,
		guards: ['deliveryFilled']
	},
```

- [ ] **Step 6: Прогнать домен**

Run: `pnpm vitest run tests/unit/delivery-guard.spec.ts tests/unit/request-transition.spec.ts`
Expected: `delivery-guard.spec.ts` PASS. `request-transition.spec.ts` может упасть на сценариях `draft -> new` без guard-а в входных данных: в них добавить `guards: { deliveryFilled: true }`.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/domain/request/delivery.ts src/lib/types/request.ts src/lib/domain/request/state-machine.ts tests/unit/delivery-guard.spec.ts tests/unit/request-transition.spec.ts
git commit -m "feat(request): guard the draft exit on delivery facts"
```

### Task 3: Схема, миграция, репозитории

**Files:**

- Modify: `src/lib/server/db/schema/requests.ts`
- Modify: `src/lib/server/request/draft.repository.ts`
- Modify: `src/lib/server/request/request-card.repository.ts`
- Create: `drizzle/<generated>.sql` через `pnpm db:generate`

**Interfaces:**

- Produces: `DraftRow` и `DraftDetails` с `deliveryAt: Date | null` и `deceasedName: string | null` вместо `isPickup`; те же поля в строке карточки заявки.

- [ ] **Step 1: Поправить схему**

В `src/lib/server/db/schema/requests.ts` заменить строку `isPickup` на:

```ts
		deliveryAt: ts('delivery_at'), // hard deadline, frozen at draft -> new
		deceasedName: text('deceased_name'), // personal data of a third party
```

Если `bool` после этого в файле не используется, убрать его из импорта `./_shared`. Проверить: `isStockRequest` тоже на `bool`, значит импорт остаётся.

- [ ] **Step 2: Сгенерировать миграцию**

Run: `pnpm db:generate`
Expected: новый файл в `drizzle/`. Открыть его и убедиться, что он добавляет две колонки и убирает `is_pickup`. Руками файл не править.

- [ ] **Step 3: Прогнать миграцию на чистой БД**

```bash
rm -f data/app.db && pnpm db:migrate && pnpm seed
```

Expected: миграции проходят, сид наполняет базу.

- [ ] **Step 4: Поправить строки черновика**

В `src/lib/server/request/draft.repository.ts`:

```ts
export interface DraftRow {
	readonly id: number;
	readonly number: string;
	readonly createdById: number;
	readonly deliveryAddressId: number | null;
	readonly deliveryAt: Date | null;
	readonly deceasedName: string | null;
	readonly comment: string | null;
	readonly updatedAt: Date;
}

export interface DraftDetails {
	readonly deliveryAddressId: number | null;
	readonly deliveryAt: Date | null;
	readonly deceasedName: string | null;
	readonly comment: string | null;
}

const DRAFT_COLUMNS = {
	id: requests.id,
	number: requests.number,
	createdById: requests.createdById,
	deliveryAddressId: requests.deliveryAddressId,
	deliveryAt: requests.deliveryAt,
	deceasedName: requests.deceasedName,
	comment: requests.comment,
	updatedAt: requests.updatedAt
};
```

- [ ] **Step 5: Поправить строку карточки**

В `src/lib/server/request/request-card.repository.ts` заменить `isPickup` на `deliveryAt` и `deceasedName` и в интерфейсе строки, и в `select`. Колонку `isStockRequest` добавить в выборку, если её там нет: она нужна guard-у.

- [ ] **Step 6: Тайпчек**

Run: `pnpm check`
Expected: ошибки останутся в сервисах, DTO и компонентах. Это карта работы для Task 4 и Task 5, а не провал шага: коммит схемы и коммит сервисов идут парой в одном PR.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/server/db/schema/requests.ts drizzle src/lib/server/request/draft.repository.ts src/lib/server/request/request-card.repository.ts
git commit -m "feat(request): store delivery deadline and deceased name"
```

### Task 4: Валидация и сервисы

**Files:**

- Modify: `src/lib/validation/request.ts`
- Modify: `src/lib/server/request/draft.service.ts`
- Modify: `src/lib/server/request/request-submit.service.ts`
- Modify: `src/lib/server/request/draft.dto.ts`
- Modify: `src/lib/server/request/card.dto.ts`
- Modify: `src/lib/types/request.ts`
- Test: `tests/unit/request-submit.spec.ts`, `tests/unit/draft.spec.ts`, `tests/unit/request-card.spec.ts`

**Interfaces:**

- Consumes: `isDeliveryFilled` из Task 2, `DraftDetails` из Task 3.
- Produces: `draftDetailsSchema` с выходом `{ deliveryAddressId: number | null; deliveryAt: Date | null; deceasedName: string | null; comment: string | null }`; `DraftDto` и `RequestCardDto` с `deliveryAt: string | null` и `deceasedName: string | null` вместо `isPickup`.

- [ ] **Step 1: Написать падающие тесты отправки**

В `tests/unit/request-submit.spec.ts` заменить константу `pickup` и добавить:

```ts
const filled = {
	deliveryAddressId: 1,
	deliveryAt: new Date('2026-09-25T09:00:00.000Z'),
	deceasedName: 'Иванов Иван Иванович',
	comment: null
};

it('не отправляет заявку без адреса', () => {
	expect(() =>
		new RequestSubmitService(adminCtx).submit({ ...filled, deliveryAddressId: null })
	).toThrow(/адрес/i);
});

it('не отправляет заявку без срока доставки', () => {
	expect(() => new RequestSubmitService(adminCtx).submit({ ...filled, deliveryAt: null })).toThrow(
		/срок|дат/i
	);
});

it('не отправляет заявку без ФИО умершего', () => {
	expect(() =>
		new RequestSubmitService(adminCtx).submit({ ...filled, deceasedName: null })
	).toThrow(/ФИО/i);
});

it('отправляет заявку со всеми тремя полями', () => {
	expect(new RequestSubmitService(adminCtx).submit(filled)).toMatchObject({ status: 'new' });
});
```

Имена контекстов и подготовку черновика взять из существующего файла.

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `pnpm vitest run tests/unit/request-submit.spec.ts`
Expected: FAIL, тип `filled` не подходит под `DraftDetailsInput`.

- [ ] **Step 3: Переписать Zod-схему деталей**

В `src/lib/validation/request.ts` заменить `draftDetailsSchema` на:

```ts
const deliveryDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите дату доставки' });
const deliveryTime = z.string().regex(/^\d{2}:\d{2}$/, { error: 'Укажите время доставки' });

/**
 * Delivery and comment, saved with the draft and at submit. A draft may hold a half-filled form:
 * the send is what the server blocks, so a counterparty can collect the request in several visits.
 */
export const draftDetailsSchema = z
	.object({
		deliveryAddressId: z
			.union([z.literal(''), z.null(), id])
			.optional()
			.transform((value) => (typeof value === 'number' ? value : null)),
		deliveryDate: z.union([z.literal(''), deliveryDate]).optional(),
		deliveryTime: z.union([z.literal(''), deliveryTime]).optional(),
		deceasedName: optionalText(200, 'ФИО не длиннее 200 символов'),
		comment: optionalText(1000, 'Комментарий не длиннее 1000 символов')
	})
	.transform((value) => ({
		deliveryAddressId: value.deliveryAddressId,
		deliveryAt: localMoment(value.deliveryDate, value.deliveryTime),
		deceasedName: value.deceasedName,
		comment: value.comment
	}));

/** Both halves of the deadline come from the form; either one missing means no deadline yet. */
function localMoment(date: string | undefined, time: string | undefined): Date | null {
	if (!date || !time) return null;
	const moment = new Date(`${date}T${time}:00`);
	return Number.isNaN(moment.getTime()) ? null : moment;
}
```

Зону `org.timezone` схема не читает: домен чист, а браузер шлёт локальное время контрагента. Если понадобится жёсткая привязка к зоне мастерской, это отдельная задача и отдельный CONTRACT GAP.

- [ ] **Step 4: Переписать проверку отправки**

В `src/lib/server/request/request-submit.service.ts` заменить `assertDelivery` на:

```ts
	private assertDelivery(details: DraftDetailsInput, tx: Tx): void {
		if (details.deliveryAddressId === null) {
			throw new ValidationError('Выберите адрес доставки', { field: 'deliveryAddressId' });
		}
		if (details.deliveryAt === null) {
			throw new ValidationError('Укажите дату и время доставки', { field: 'deliveryDate' });
		}
		if ((details.deceasedName ?? '').trim() === '') {
			throw new ValidationError('Укажите ФИО умершего', { field: 'deceasedName' });
		}
		if (!this.addresses.findOwn(this.ctx, details.deliveryAddressId, tx)) {
			throw new NotFoundError('delivery address');
		}
	}
```

И передать guard в машину состояний. В `assertTransition` заменить `guards: {}` на:

```ts
	private assertTransition(draft: DraftRow, details: DraftDetailsInput): void {
		const check = checkTransition({
			from: 'draft',
			to: 'new',
			actorRoles: this.ctx.roles,
			isOwnRequest: draft.createdById === this.ctx.userId,
			isAssigned: false,
			hasReason: false,
			guards: {
				deliveryFilled: isDeliveryFilled({
					isStockRequest: false,
					deliveryAddressId: details.deliveryAddressId,
					deliveryAt: details.deliveryAt,
					deceasedName: details.deceasedName
				})
			}
		});
		if (!check.ok) throw new ForbiddenError('request.submit', { denial: check.denial.code });
	}
```

Вызов в `submit` поменять на `this.assertTransition(draft, details);`. Импортировать `isDeliveryFilled` из `$lib/domain/request/delivery`.

- [ ] **Step 5: Поправить запись деталей черновика**

В `src/lib/server/request/draft.service.ts` в `saveDetails` заменить строку аудита:

```ts
return {
	result: undefined,
	entityId: draft.id,
	after: { deliveryAddressId: details.deliveryAddressId }
};
```

- [ ] **Step 6: Поправить DTO**

В `src/lib/types/request.ts` заменить в `DraftDto`:

```ts
	readonly deliveryAddressId: number | null;
	readonly deliveryAt: string | null;
	readonly deceasedName: string | null;
	readonly comment: string | null;
```

и в `RequestCardDto`:

```ts
	readonly deliveryAddress: string | null;
	readonly deliveryAt: string | null;
	readonly deceasedName: string | null;
```

В `src/lib/server/request/draft.dto.ts` заменить `isPickup: draft.isPickup,` на:

```ts
			deliveryAddressId: draft.deliveryAddressId,
			deliveryAt: draft.deliveryAt?.toISOString() ?? null,
			deceasedName: draft.deceasedName,
```

В `src/lib/server/request/card.dto.ts` заменить пару строк `isPickup` и `deliveryAddress` на:

```ts
			deliveryAddress: row.deliveryAddress,
			deliveryAt: row.deliveryAt?.toISOString() ?? null,
			deceasedName: row.deceasedName,
```

- [ ] **Step 7: Закрыть ПДн тестом**

Правило §12: `deceased_name` не подставляется в шаблоны уведомлений. Переменных шаблона всего пять (§7.3), и ФИО среди них нет, но это должно остаться правдой после правок. Добавить в `tests/unit/notification-settings.spec.ts`:

```ts
it('шаблон уведомления не знает переменной под ФИО умершего', () => {
	for (const template of new NotificationTemplateRepository().all()) {
		expect(template.body).not.toMatch(/deceased/i);
		expect(template.subject ?? '').not.toMatch(/deceased/i);
	}
});
```

Если у репозитория шаблонов нет метода `all`, взять чтение шаблонов тем же способом, каким это делает `notification-dispatch.ts`.

- [ ] **Step 8: Прогнать серверные тесты**

Run: `pnpm vitest run tests/unit/request-submit.spec.ts tests/unit/draft.spec.ts tests/unit/request-card.spec.ts tests/unit/request-transition.spec.ts`
Expected: PASS. Фикстуры с `isPickup` в `tests/unit/helpers/charity.ts` и `tests/unit/helpers/registry.ts` заменить на заполненную отгрузку.

- [ ] **Step 9: Коммит**

```bash
git add src/lib/validation/request.ts src/lib/server/request src/lib/types/request.ts tests/unit
git commit -m "feat(request): require address, deadline and deceased name"
```

### Task 5: Корзина и карточка заявки

**Files:**

- Modify: `src/lib/portal/cart/DeliveryPanel.svelte`
- Modify: `src/routes/(portal)/portal/requests/[id]/+page.svelte`
- Test: `tests/e2e/cart.e2e.ts`

**Interfaces:**

- Consumes: `DraftDto` и `RequestCardDto` из Task 4.
- Produces: форма отгрузки с полями `deliveryAddressId`, `deliveryDate`, `deliveryTime`, `deceasedName`, `comment` под тем же `DRAFT_FORM_ID`.

- [ ] **Step 1: Написать падающий e2e**

Добавить в `tests/e2e/cart.e2e.ts`:

```ts
test('заявка без обязательных полей отгрузки не уходит', async ({ page }) => {
	await loginAsAdmin(page);
	await addFirstProductToCart(page);
	await page.goto('/portal/cart');
	await page.getByRole('button', { name: 'Оформить заявку' }).click();
	await expect(page.getByTestId('draft-error')).toContainText(/адрес|дат|ФИО/i);
	await expect(page).toHaveURL(/\/portal\/cart/);
});

test('заявка со всеми полями отгрузки уходит', async ({ page }) => {
	await loginAsAdmin(page);
	await addFirstProductToCart(page);
	await page.goto('/portal/cart');
	await page.getByLabel('Адрес доставки').selectOption({ index: 1 });
	await page.getByLabel('Дата доставки').fill('2026-12-01');
	await page.getByLabel('Время доставки').fill('10:00');
	await page.getByLabel('ФИО умершего').fill('Иванов Иван Иванович');
	await page.getByRole('button', { name: 'Оформить заявку' }).click();
	await expect(page.getByText(/отправлена/)).toBeVisible();
});
```

Хелперы входа и наполнения корзины взять из существующего файла.

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e tests/e2e/cart.e2e.ts`
Expected: FAIL, поля «Дата доставки» нет.

- [ ] **Step 3: Переписать панель отгрузки**

В `src/lib/portal/cart/DeliveryPanel.svelte` заменить импорт `RadioGroup` на `DatePicker`, `Input` и `Select`, убрать `$derived` `options` и `delivery`, и заменить тело формы между заголовком и комментарием на:

```svelte
<Select
	name="deliveryAddressId"
	label="Адрес доставки"
	placeholder="Выберите адрес"
	options={draft.addresses.map((address) => ({
		value: String(address.id),
		label: `${address.title}: ${address.address}`
	}))}
	bind:value={address}
	required
/>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
	<DatePicker name="deliveryDate" label="Дата доставки" bind:value={date} required />
	<Input
		name="deliveryTime"
		type="time"
		label="Время доставки"
		placeholder="Введите время"
		bind:value={time}
		required
	/>
</div>

<Input
	name="deceasedName"
	label="ФИО умершего"
	placeholder="Введите ФИО"
	bind:value={deceased}
	maxlength={200}
	required
/>
```

Состояние формы объявить рунами над разметкой:

```ts
// The draft may hold half of the form: the server is what blocks the send.
let address = $state(draft.deliveryAddressId === null ? '' : String(draft.deliveryAddressId));
let date = $state(draft.deliveryAt?.slice(0, 10) ?? '');
let time = $state(draft.deliveryAt?.slice(11, 16) ?? '');
let deceased = $state(draft.deceasedName ?? '');
```

Если у `Input` вките нет пропа `type`, добавить поле времени тем контролом, который есть, и сверить с `routes/(dev)/kitchen-sink`. Свой контрол не писать.

- [ ] **Step 4: Показать поля в карточке заявки**

В `src/routes/(portal)/portal/requests/[id]/+page.svelte` заменить строку «Отгрузка: …» на:

```svelte
<dl class="flex flex-col gap-2">
	<div class="flex justify-between gap-4">
		<dt class="text-fg-muted">Адрес доставки</dt>
		<dd class="text-right">{request.deliveryAddress ?? '—'}</dd>
	</div>
	<div class="flex justify-between gap-4">
		<dt class="text-fg-muted">Срок доставки</dt>
		<dd class="text-right">
			{request.deliveryAt ? formatDateTime(request.deliveryAt, data.timezone) : '—'}
		</dd>
	</div>
	<div class="flex justify-between gap-4">
		<dt class="text-fg-muted">ФИО умершего</dt>
		<dd class="text-right">{request.deceasedName ?? '—'}</dd>
	</div>
</dl>
```

Форматтер взять из `$lib/utils/format`. Если функции `formatDateTime` там нет, добавить её рядом с `formatDate` и покрыть тестом в `tests/unit/format.spec.ts`.

- [ ] **Step 5: Прогнать всё**

Run: `pnpm check && pnpm lint && pnpm vitest run && SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e`
Expected: всё зелёное.

- [ ] **Step 6: Коммит и PR**

```bash
git add src/lib/portal/cart/DeliveryPanel.svelte "src/routes/(portal)/portal/requests/[id]/+page.svelte" src/lib/utils/format.ts tests
git commit -m "feat(portal): ask for delivery details in the cart"
git push -u origin feat/request-delivery-required
gh pr create --title "P11: обязательная отгрузка в заявке" --body "..."
```

---

# Слайс P12. Фид уведомлений и канал МАКС

Ветка от свежего `main`: `git checkout main && git pull && git checkout -b feat/notification-feed`

### Task 6: Канал `max` и таблица фида

**Files:**

- Modify: `src/lib/types/notifications.ts`
- Modify: `src/lib/server/db/schema/system.ts`
- Create: `src/lib/server/notifications/notification-feed.repository.ts`
- Test: `tests/unit/notification-feed.spec.ts`

**Interfaces:**

- Produces:
  - `NOTIFICATION_CHANNELS = ['email', 'push', 'max']`, `LIVE_CHANNELS = ['email']`;
  - таблица `notificationFeed`;
  - `NotificationFeedRepository` с `insert(row, tx): boolean`, `unreadCount(userId): number`, `recent(userId, limit): FeedRow[]`, `markRead(userId, ids, tx): void`.

```ts
export interface FeedRow {
	readonly id: number;
	readonly eventKey: EventKey;
	readonly entityId: number;
	readonly requestNumber: string | null;
	readonly readAt: Date | null;
	readonly createdAt: Date;
}
```

- [ ] **Step 1: Написать падающий тест репозитория**

Создать `tests/unit/notification-feed.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationFeedRepository } from '$lib/server/notifications/notification-feed.repository';

describe('NotificationFeedRepository', () => {
	let repo: NotificationFeedRepository;

	beforeEach(() => {
		repo = new NotificationFeedRepository();
	});

	it('кладёт строку и считает её непрочитанной', () => {
		expect(repo.insert({ userId: 1, eventKey: 'request.submitted', entityId: 10 })).toBe(true);
		expect(repo.unreadCount(1)).toBe(1);
	});

	it('второй раз ту же пару не кладёт', () => {
		repo.insert({ userId: 1, eventKey: 'request.submitted', entityId: 10 });
		expect(repo.insert({ userId: 1, eventKey: 'request.submitted', entityId: 10 })).toBe(false);
		expect(repo.unreadCount(1)).toBe(1);
	});

	it('отметка прочтения обнуляет счётчик', () => {
		repo.insert({ userId: 1, eventKey: 'request.submitted', entityId: 10 });
		const [row] = repo.recent(1, 10);
		repo.markRead(1, [row.id]);
		expect(repo.unreadCount(1)).toBe(0);
	});

	it('чужие строки не отдаёт', () => {
		repo.insert({ userId: 1, eventKey: 'request.submitted', entityId: 10 });
		expect(repo.unreadCount(2)).toBe(0);
		expect(repo.recent(2, 10)).toHaveLength(0);
	});
});
```

Подготовку пользователей и заявки взять из `tests/unit/helpers`: тот же приём, что в `notification-queue.spec.ts`.

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `pnpm vitest run tests/unit/notification-feed.spec.ts`
Expected: FAIL, модуль репозитория не найден.

- [ ] **Step 3: Расширить список каналов**

В `src/lib/types/notifications.ts`:

```ts
export const NOTIFICATION_CHANNELS = ['email', 'push', 'max'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// push joins in C15, max in C16: until then the fanout creates rows for email only.
export const LIVE_CHANNELS = ['email'] as const satisfies readonly NotificationChannel[];
```

- [ ] **Step 4: Свести enum схемы к одному источнику**

В `src/lib/server/db/schema/system.ts` заменить все четыре литерала `{ enum: ['email', 'push'] }` на `{ enum: NOTIFICATION_CHANNELS }` и добавить импорт:

```ts
import { NOTIFICATION_CHANNELS } from '$lib/types/notifications';
```

- [ ] **Step 5: Добавить таблицу фида**

Там же, сразу после таблицы `notifications`:

```ts
// The in-app feed of the bell. One row per (user, event), whatever channels the matrix picked:
// a channel row would show the same event twice. The unique index makes the fanout job idempotent.
export const notificationFeed = sqliteTable(
	'notification_feed',
	{
		id: pk(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		eventKey: text('event_key', { enum: EVENT_KEYS }).notNull(),
		entityId: integer('entity_id').notNull(),
		readAt: ts('read_at'),
		createdAt: createdAt()
	},
	(t) => [
		index('feed_user_idx').on(t.userId, t.createdAt),
		uniqueIndex('feed_uq').on(t.userId, t.eventKey, t.entityId)
	]
);
```

Проверить, что `notificationFeed` реэкспортируется из `src/lib/server/db/schema/index.ts`.

- [ ] **Step 6: Сгенерировать и прогнать миграцию**

```bash
pnpm db:generate && rm -f data/app.db && pnpm db:migrate && pnpm seed
```

- [ ] **Step 7: Написать репозиторий**

Создать `src/lib/server/notifications/notification-feed.repository.ts`:

```ts
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { notificationFeed, requests } from '../db/schema';
import type { EventKey } from '$lib/types/events';

export interface FeedKey {
	readonly userId: number;
	readonly eventKey: EventKey;
	readonly entityId: number;
}

export interface FeedRow {
	readonly id: number;
	readonly eventKey: EventKey;
	readonly entityId: number;
	readonly requestNumber: string | null;
	readonly readAt: Date | null;
	readonly createdAt: Date;
}

/** The bell's feed (tech.md 5.9). Rows are per user, so the user id is the only filter there is. */
export class NotificationFeedRepository extends BaseRepository<typeof notificationFeed> {
	constructor() {
		super(notificationFeed);
	}

	/** False when the pair is already there: the unique index is what makes the job idempotent. */
	insert(key: FeedKey, tx?: Tx): boolean {
		const inserted = this.db(tx)
			.insert(notificationFeed)
			.values({ ...key })
			.onConflictDoNothing()
			.returning({ id: notificationFeed.id })
			.all();
		return inserted.length > 0;
	}

	unreadCount(userId: number, tx?: Tx): number {
		const [row] = this.db(tx)
			.select({ total: sql<number>`count(*)` })
			.from(notificationFeed)
			.where(and(eq(notificationFeed.userId, userId), isNull(notificationFeed.readAt)))
			.all();
		return row?.total ?? 0;
	}

	recent(userId: number, limit: number, tx?: Tx): FeedRow[] {
		return this.db(tx)
			.select({
				id: notificationFeed.id,
				eventKey: notificationFeed.eventKey,
				entityId: notificationFeed.entityId,
				requestNumber: requests.number,
				readAt: notificationFeed.readAt,
				createdAt: notificationFeed.createdAt
			})
			.from(notificationFeed)
			.leftJoin(requests, eq(requests.id, notificationFeed.entityId))
			.where(eq(notificationFeed.userId, userId))
			.orderBy(desc(notificationFeed.createdAt))
			.limit(limit)
			.all();
	}

	markRead(userId: number, ids: readonly number[], tx?: Tx): void {
		if (ids.length === 0) return;
		this.db(tx)
			.update(notificationFeed)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(notificationFeed.userId, userId),
					inArray(notificationFeed.id, [...ids]),
					isNull(notificationFeed.readAt)
				)
			)
			.run();
	}
}
```

- [ ] **Step 8: Прогнать тест**

Run: `pnpm vitest run tests/unit/notification-feed.spec.ts`
Expected: PASS.

- [ ] **Step 9: Коммит**

```bash
git add src/lib/types/notifications.ts src/lib/server/db/schema/system.ts src/lib/server/notifications/notification-feed.repository.ts drizzle tests/unit/notification-feed.spec.ts
git commit -m "feat(queue): add the max channel and the feed table"
```

### Task 7: Фид наполняется из `notification.fanout`

**Files:**

- Modify: `src/lib/server/queue/handlers/notification-fanout.ts`
- Test: `tests/unit/notification-queue.spec.ts`

**Interfaces:**

- Consumes: `NotificationFeedRepository.insert` из Task 6.
- Produces: `FanoutDeps` с полем `feed: NotificationFeedRepository`.

- [ ] **Step 1: Написать падающий тест идемпотентности**

Добавить в `tests/unit/notification-queue.spec.ts`:

```ts
it('фанаут пишет строку фида каждому адресату', async () => {
	await runFanout({ eventKey: 'request.submitted', entityId: requestId });
	expect(new NotificationFeedRepository().unreadCount(adminUserId)).toBe(1);
});

it('повторный фанаут второй строки фида не создаёт', async () => {
	await runFanout({ eventKey: 'request.submitted', entityId: requestId });
	await runFanout({ eventKey: 'request.submitted', entityId: requestId });
	expect(new NotificationFeedRepository().unreadCount(adminUserId)).toBe(1);
});

it('фид получает и тот, кому канал выключен настройками', async () => {
	disableEmailFor(employeeUserId, 'request.submitted');
	await runFanout({ eventKey: 'request.submitted', entityId: requestId });
	expect(new NotificationFeedRepository().unreadCount(employeeUserId)).toBe(1);
});
```

Хелперы `runFanout` и выключение канала взять из существующего файла: там уже есть прогон хендлера и работа с `user_notification_prefs`.

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `pnpm vitest run tests/unit/notification-queue.spec.ts`
Expected: FAIL, счётчик 0.

- [ ] **Step 3: Добавить зависимость в хендлер**

В `src/lib/server/queue/handlers/notification-fanout.ts`:

```ts
export interface FanoutDeps {
	readonly rules: NotificationRuleRepository;
	readonly notifications: NotificationRepository;
	readonly feed: NotificationFeedRepository;
	readonly isEnabled: () => boolean;
}
```

В `fanOutTo` первой строкой, до цикла по каналам:

```ts
// The feed mirrors the event itself: personal channel settings do not reach it (tech.md 7.3).
deps.feed.insert({ userId: person.userId, eventKey, entityId: request.id }, tx);
```

В конце файла в `createNotificationFanoutHandler(...)` добавить `feed: new NotificationFeedRepository(),`.

- [ ] **Step 4: Прогнать тесты очереди**

Run: `pnpm vitest run tests/unit/notification-queue.spec.ts tests/unit/queue-contract.spec.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/server/queue/handlers/notification-fanout.ts tests/unit/notification-queue.spec.ts
git commit -m "feat(queue): mirror every event into the bell feed"
```

### Task 8: Сервис фида и роут отметки прочтения

**Files:**

- Create: `src/lib/server/notifications/notification-feed.service.ts`
- Create: `src/routes/(portal)/portal/notifications/+server.ts`
- Modify: `src/lib/types/notifications.ts`
- Test: `tests/unit/notification-feed.spec.ts`

**Interfaces:**

- Produces:
  - `NotificationFeedService extends BaseService` с `bell(limit = 10): NotificationBellDto` и `markRead(ids: readonly number[]): void`;
  - `POST /portal/notifications` с телом `{ ids: number[] }`.

```ts
export interface NotificationFeedItemDto {
	readonly id: number;
	readonly eventKey: EventKey;
	readonly requestId: number | null;
	readonly requestNumber: string | null;
	readonly isRead: boolean;
	readonly createdAt: string;
}
export interface NotificationBellDto {
	readonly unread: number;
	readonly items: readonly NotificationFeedItemDto[];
}
```

- [ ] **Step 1: Написать падающий тест сервиса**

Добавить в `tests/unit/notification-feed.spec.ts`:

```ts
describe('NotificationFeedService', () => {
	it('отдаёт непрочитанное и последние события своему пользователю', () => {
		new NotificationFeedRepository().insert({
			userId: adminCtx.userId,
			eventKey: 'request.submitted',
			entityId: requestId
		});
		const bell = new NotificationFeedService(adminCtx).bell();
		expect(bell.unread).toBe(1);
		expect(bell.items[0]).toMatchObject({ eventKey: 'request.submitted', isRead: false });
		expect(bell.items[0].requestNumber).toBeTypeOf('string');
	});

	it('отмечает прочитанным только свои строки', () => {
		const repo = new NotificationFeedRepository();
		repo.insert({ userId: otherCtx.userId, eventKey: 'request.submitted', entityId: requestId });
		const [foreign] = repo.recent(otherCtx.userId, 10);
		new NotificationFeedService(adminCtx).markRead([foreign.id]);
		expect(repo.unreadCount(otherCtx.userId)).toBe(1);
	});
});
```

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `pnpm vitest run tests/unit/notification-feed.spec.ts`
Expected: FAIL, модуль сервиса не найден.

- [ ] **Step 3: Добавить DTO**

В `src/lib/types/notifications.ts` добавить два интерфейса из блока Interfaces выше.

- [ ] **Step 4: Написать сервис**

Создать `src/lib/server/notifications/notification-feed.service.ts`:

```ts
import { BaseService } from '../core/service';
import { NotificationFeedRepository, type FeedRow } from './notification-feed.repository';
import type { ActorContext } from '$lib/types/actor';
import type { NotificationBellDto, NotificationFeedItemDto } from '$lib/types/notifications';

const BELL_LIMIT = 10;

/** The bell of the portal header (tech.md 18.5). The feed is per user, never per counterparty. */
export class NotificationFeedService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly feed: NotificationFeedRepository = new NotificationFeedRepository()
	) {
		super(ctx);
	}

	unread(): number {
		return this.feed.unreadCount(this.ctx.userId);
	}

	bell(limit: number = BELL_LIMIT): NotificationBellDto {
		return {
			unread: this.feed.unreadCount(this.ctx.userId),
			items: this.feed.recent(this.ctx.userId, limit).map(toItem)
		};
	}

	/** Rows of another person are filtered out by the repository, not trusted from the request. */
	markRead(ids: readonly number[]): void {
		this.feed.markRead(this.ctx.userId, ids);
	}
}

function toItem(row: FeedRow): NotificationFeedItemDto {
	return {
		id: row.id,
		eventKey: row.eventKey,
		requestId: row.requestNumber === null ? null : row.entityId,
		requestNumber: row.requestNumber,
		isRead: row.readAt !== null,
		createdAt: row.createdAt.toISOString()
	};
}
```

- [ ] **Step 5: Написать роут отметки прочтения**

Создать `src/routes/(portal)/portal/notifications/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { NotificationFeedService } from '$lib/server/notifications/notification-feed.service';
import type { RequestHandler } from './$types';

const markReadSchema = z.object({ ids: z.array(z.number().int().positive()).max(100) });

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'portal.access');
	const parsed = markReadSchema.safeParse(await request.json());
	if (!parsed.success) return json({ code: 'validation' }, { status: 422 });

	const service = new NotificationFeedService(actor);
	service.markRead(parsed.data.ids);
	return json({ unread: service.unread() });
};
```

Проверить в соседних `+server.ts`, требует ли проект заголовок `x-requested-with` на мутациях (§12), и если да, повторить ту же проверку.

- [ ] **Step 6: Прогнать тесты**

Run: `pnpm vitest run tests/unit/notification-feed.spec.ts && pnpm check`
Expected: PASS, 0 ошибок тайпчека.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/server/notifications/notification-feed.service.ts "src/routes/(portal)/portal/notifications/+server.ts" src/lib/types/notifications.ts tests/unit/notification-feed.spec.ts
git commit -m "feat(portal): serve the bell feed and mark it read"
```

### Task 9: Колокольчик в шапке

**Files:**

- Create: `src/lib/ui/shell/BellMenu.svelte`
- Modify: `src/lib/ui/shell/types.ts`
- Modify: `src/lib/ui/ContourShell.svelte`
- Modify: `src/lib/ui/shell/PortalHeader.svelte`
- Modify: `src/routes/(portal)/+layout.server.ts`
- Modify: `src/routes/(portal)/+layout.svelte`
- Test: `tests/e2e/notifications.e2e.ts`, `tests/unit/ui-contract.spec.ts`

**Interfaces:**

- Consumes: `NotificationBellDto` из Task 8.
- Produces: `BellLink` в `src/lib/ui/shell/types.ts`:

```ts
export interface BellLink {
	readonly href: ResolvedPathname;
	readonly unread: number;
	readonly items: readonly {
		readonly id: number;
		readonly label: string;
		readonly href: ResolvedPathname | null;
		readonly createdAt: string;
	}[];
	readonly onOpen?: (() => void) | undefined;
}
```

Кит не импортирует код портала: подписи событий собирает портал и передаёт готовыми строками.

- [ ] **Step 1: Написать падающий e2e**

Добавить в `tests/e2e/notifications.e2e.ts`:

```ts
test('колокольчик показывает непрочитанное и обнуляет счётчик', async ({ page }) => {
	await loginAsAdmin(page);
	await submitRequest(page);
	await page.goto('/portal');
	const bell = page.getByTestId('bell-unread');
	await expect(bell).toHaveText('1');
	await page.getByTestId('bell-trigger').click();
	await expect(page.getByTestId('bell-item').first()).toBeVisible();
	await page.reload();
	await expect(page.getByTestId('bell-unread')).toHaveCount(0);
});
```

Хелпер отправки заявки взять из `tests/e2e/portal-flow.ts`.

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e tests/e2e/notifications.e2e.ts`
Expected: FAIL, элемента `bell-unread` нет.

- [ ] **Step 3: Описать проп в типах кита**

В `src/lib/ui/shell/types.ts` добавить:

```ts
/** The bell of the portal header. The kit never imports portal code, so labels arrive ready. */
export interface BellItem {
	readonly id: number;
	readonly label: string;
	readonly href: ResolvedPathname | null;
	readonly createdAt: string;
}

export interface BellLink {
	readonly href: ResolvedPathname;
	readonly unread: number;
	readonly items: readonly BellItem[];
	readonly onOpen?: (() => void) | undefined;
}
```

- [ ] **Step 4: Написать компонент кита**

Создать `src/lib/ui/shell/BellMenu.svelte`:

```svelte
<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import Button from '../base/button/button.svelte';
	import type { BellLink } from './types';

	let { bell }: { bell: BellLink } = $props();

	let open = $state(false);

	// The unread badge clears on the server, so the menu tells the page it was opened.
	function toggle(): void {
		open = !open;
		if (open) bell.onOpen?.();
	}
</script>

<div class="relative">
	<Button
		variant="secondary"
		size="sm"
		data-testid="bell-trigger"
		class="gap-2 px-3 sm:px-4"
		aria-expanded={open}
		aria-label="Уведомления, непрочитанных: {bell.unread}"
		onclick={toggle}
	>
		<BellIcon />
		{#if bell.unread > 0}
			<span
				data-testid="bell-unread"
				class="rounded-pill bg-brand px-2 text-xs text-brand-fg tabular-nums"
			>
				{bell.unread}
			</span>
		{/if}
	</Button>

	{#if open}
		<!-- Click-away closes the menu without a library: the overlay is a sibling, not a wrapper. -->
		<button
			type="button"
			class="fixed inset-0 z-10 cursor-default"
			aria-label="Закрыть уведомления"
			onclick={() => (open = false)}
		></button>
		<div
			class="absolute right-0 z-20 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-card bg-surface-raised p-2 shadow-lg"
		>
			{#each bell.items as item (item.id)}
				<a
					data-testid="bell-item"
					href={item.href ?? undefined}
					class="flex flex-col gap-0.5 rounded-inset px-3 py-2 hover:bg-surface-muted"
					onclick={() => (open = false)}
				>
					<span class="text-sm">{item.label}</span>
					<span class="text-xs text-fg-faint">{item.createdAt}</span>
				</a>
			{:else}
				<p class="px-3 py-6 text-center text-sm text-fg-muted">Уведомлений пока нет</p>
			{/each}
			<a
				href={bell.href}
				class="mt-1 rounded-inset px-3 py-2 text-sm text-link hover:bg-surface-muted"
				onclick={() => (open = false)}
			>
				Все уведомления
			</a>
		</div>
	{/if}
</div>
```

`createdAt` приходит уже отформатированной строкой: кит не знает ни зоны мастерской, ни формата дат портала.

- [ ] **Step 5: Пробросить проп через оболочку**

В `src/lib/ui/ContourShell.svelte` добавить `bell` в деструктуризацию и в тип пропсов:

```ts
		bell?: BellLink | undefined;
```

и отдать его в шапку: `<PortalHeader {title} {userName} {roles} {links} {accountHref} {cart} {bell} {search} />`. Импортировать тип из `./shell/types`.

В `src/lib/ui/shell/PortalHeader.svelte` добавить `bell` в пропсы тем же способом, импортировать `BellMenu` и отрисовать его сразу после блока корзины:

```svelte
{#if bell}
	<BellMenu {bell} />
{/if}
```

- [ ] **Step 6: Отдать данные из layout**

В `src/routes/(portal)/+layout.server.ts` добавить в возвращаемый объект:

```ts
		bell: new NotificationFeedService(actor).bell(),
```

и импорт сервиса.

В `src/routes/(portal)/+layout.svelte` собрать `BellLink` и отдать его в `ContourShell`:

```ts
const bell = $derived({
	href: resolve('/portal/profile/notifications'),
	unread: data.bell.unread,
	items: data.bell.items.map((item) => ({
		id: item.id,
		label: EVENT_LABEL[item.eventKey] + (item.requestNumber ? ` ${item.requestNumber}` : ''),
		href: item.requestId === null ? null : resolve(`/portal/requests/${item.requestId}`),
		createdAt: formatDateTime(item.createdAt, data.timezone)
	})),
	onOpen: markRead
});

// Opening the menu is what marks it read: the count must not survive a reload.
async function markRead(): Promise<void> {
	const ids = data.bell.items.filter((item) => !item.isRead).map((item) => item.id);
	if (ids.length === 0) return;
	await fetch('/portal/notifications', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
		body: JSON.stringify({ ids })
	});
	await invalidateAll();
}
```

`EVENT_LABEL` взять из `$lib/portal/notifications/labels`, `invalidateAll` из `$app/navigation`, `formatDateTime` из `$lib/utils/format` (та же функция, что добавлена в P11). Передать проп: `bell={bell}`.

- [ ] **Step 7: Дописать контрактный тест кита**

В `tests/unit/ui-contract.spec.ts` добавить проверку, что `ContourShell` принимает `bell`, по образцу уже существующей проверки для `cart`.

- [ ] **Step 8: Прогнать всё**

Run: `pnpm check && pnpm lint && pnpm vitest run && SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e`
Expected: всё зелёное.

- [ ] **Step 9: Коммит и PR**

```bash
git add src/lib/ui "src/routes/(portal)" tests
git commit -m "feat(ui): add the notification bell to the portal header"
git push -u origin feat/notification-feed
gh pr create --title "P12: фид уведомлений и канал МАКС" --body "..."
```

---

# Слайс P13. Лендинг

Ветка от свежего `main`: `git checkout main && git pull && git checkout -b feat/landing-works-charity`

### Task 10: Публичные примеры работ и данные фонда

**Files:**

- Create: `src/lib/server/landing/works.repository.ts`
- Create: `src/lib/server/landing/landing.service.ts`
- Create: `src/routes/api/public/works/[id]/+server.ts`
- Modify: `src/lib/server/settings/org.service.ts`
- Test: `tests/unit/landing.spec.ts`

**Interfaces:**

- Produces:
  - `LandingService.works(limit = 9): WorkDto[]`, где `WorkDto = { mediaId: number; title: string }`;
  - `LandingService.openCover(mediaId): Promise<FileContent>` — бросает `NotFoundError` для скрытой, черновой и удалённой модели;
  - `OrgService.publicCharity(): { title: string | null; url: string | null; ratePercent: number | null }`.

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/unit/landing.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '$lib/server/core/errors';
import { LandingService } from '$lib/server/landing/landing.service';
import { OrgService } from '$lib/server/settings/org.service';

describe('LandingService.works', () => {
	it('отдаёт обложки опубликованных моделей с названием', () => {
		const works = new LandingService().works(9);
		expect(works.length).toBeGreaterThan(0);
		for (const work of works) {
			expect(work).toMatchObject({ mediaId: expect.any(Number), title: expect.any(String) });
		}
	});

	it('не отдаёт гостю ни артикул, ни цену, ни остаток', () => {
		for (const work of new LandingService().works(9)) {
			expect(Object.keys(work).sort()).toEqual(['mediaId', 'title']);
		}
	});

	it('не берёт больше запрошенного', () => {
		expect(new LandingService().works(2).length).toBeLessThanOrEqual(2);
	});

	it('фото скрытой модели не открывается', async () => {
		const hiddenCover = coverOfHiddenProduct();
		await expect(new LandingService().openCover(hiddenCover)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('OrgService.publicCharity', () => {
	it('отдаёт фонд и ставку процентом', () => {
		expect(OrgService.publicCharity()).toMatchObject({
			title: expect.any(String),
			ratePercent: expect.any(Number)
		});
	});

	it('не отдаёт собранных сумм', () => {
		expect(Object.keys(OrgService.publicCharity()).sort()).toEqual(['ratePercent', 'title', 'url']);
	});
});
```

Хелпер `coverOfHiddenProduct` написать рядом: снять публикацию с модели сида и вернуть идентификатор её обложки.

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `pnpm vitest run tests/unit/landing.spec.ts`
Expected: FAIL, модулей нет.

- [ ] **Step 3: Написать репозиторий обложек**

Создать `src/lib/server/landing/works.repository.ts`:

```ts
import { and, asc, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { media, products } from '../db/schema';

export interface WorkRow {
	readonly productId: number;
	readonly title: string;
	readonly mediaId: number;
	readonly mediaPath: string;
	readonly mime: string;
}

const COVER_COLUMNS = {
	productId: products.id,
	title: products.title,
	mediaId: media.id,
	mediaPath: media.path,
	mime: media.mime
};

/**
 * Photos a guest may see. Published models only, and not one price column is selected here:
 * the catalog stays closed to a guest except for these covers and titles (tech.md 18.5).
 */
export class WorksRepository extends BaseRepository<typeof products> {
	constructor() {
		super(products);
	}

	/** First photo of each published model, in catalog order. */
	covers(limit: number): WorkRow[] {
		const rows = this.db()
			.select(COVER_COLUMNS)
			.from(products)
			.innerJoin(media, and(eq(media.ownerScope, 'product'), eq(media.ownerId, products.id)))
			.where(and(eq(products.isPublished, true), isNull(products.deletedAt)))
			.orderBy(asc(products.sortOrder), asc(products.id), asc(media.sortOrder), asc(media.id))
			.all();

		const seen = new Set<number>();
		const covers: WorkRow[] = [];
		for (const row of rows) {
			if (seen.has(row.productId)) continue;
			seen.add(row.productId);
			covers.push(row);
			if (covers.length === limit) break;
		}
		return covers;
	}

	/** Undefined when the model behind the photo is hidden, draft or deleted. */
	findCover(mediaId: number): WorkRow | undefined {
		const [row] = this.db()
			.select(COVER_COLUMNS)
			.from(media)
			.innerJoin(products, eq(products.id, media.ownerId))
			.where(
				and(
					eq(media.id, mediaId),
					eq(media.ownerScope, 'product'),
					eq(products.isPublished, true),
					isNull(products.deletedAt)
				)
			)
			.all();
		return row;
	}
}
```

- [ ] **Step 4: Написать сервис**

Создать `src/lib/server/landing/landing.service.ts`:

```ts
import { NotFoundError } from '../core/errors';
import type { FileContent } from '../files/file-access.service';
import { readStoredFile } from '../files/storage';
import { WorksRepository } from './works.repository';

const DEFAULT_LIMIT = 9;

export interface WorkDto {
	readonly mediaId: number;
	readonly title: string;
}

/**
 * The landing page of a guest. It has no ActorContext and extends no BaseService on purpose:
 * everything here is safe for anyone on the internet, and that is easier to see with no actor.
 */
export class LandingService {
	constructor(private readonly repo: WorksRepository = new WorksRepository()) {}

	works(limit: number = DEFAULT_LIMIT): WorkDto[] {
		return this.repo.covers(limit).map((row) => ({ mediaId: row.mediaId, title: row.title }));
	}

	/** @throws NotFoundError for a photo of a hidden model, exactly as the model itself answers. */
	async openCover(mediaId: number): Promise<FileContent> {
		const row = this.repo.findCover(mediaId);
		if (!row) throw new NotFoundError('file');
		const bytes = await readStoredFile(row.mediaPath);
		if (!bytes) throw new NotFoundError('file');
		return { mime: row.mime, bytes };
	}
}
```

`FileAccessService` не трогаем: он остаётся строгим, а публичная поверхность сводится к одному новому файлу.

- [ ] **Step 5: Добавить публичные данные фонда**

В `src/lib/server/settings/org.service.ts` добавить тип и метод:

```ts
export interface PublicCharity {
	readonly title: string | null;
	readonly url: string | null;
	readonly ratePercent: number | null;
}
```

```ts
	/** The fund the landing names. Collected sums stay inside: a guest gets no figures (v1.33). */
	static publicCharity(repo: SettingsRepository = new SettingsRepository()): PublicCharity {
		const fund = charityFundSchema.safeParse(repo.findValue('charity.fund'));
		const rate = charityRateSchema.safeParse(repo.findValue('charity.rate_bp'));
		return {
			title: fund.success ? fund.data.title : null,
			url: fund.success ? (fund.data.url ?? null) : null,
			ratePercent: rate.success ? rate.data / 100 : null
		};
	}
```

Импортировать `charityFundSchema` и `charityRateSchema` из `$lib/validation/settings`.

- [ ] **Step 6: Написать публичный роут**

Создать `src/routes/api/public/works/[id]/+server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { rethrowAsHttp } from '$lib/server/core/http';
import { LandingService } from '$lib/server/landing/landing.service';
import { mediaIdSchema } from '$lib/validation/files';
import type { RequestHandler } from './$types';

/**
 * The only file a guest may read (tech.md 12). A separate route instead of loosening
 * `/api/files/[id]`: the public surface stays one file an auditor can read end to end.
 */
export const GET: RequestHandler = async ({ params }) => {
	const id = mediaIdSchema.safeParse(params.id);
	if (!id.success) error(404, { code: 'not_found', message: 'Файл не найден' });

	try {
		const file = await new LandingService().openCover(id.data);
		return new Response(new Uint8Array(file.bytes), {
			headers: {
				'content-type': file.mime,
				'content-length': String(file.bytes.length),
				// Public: the answer is the same for everyone, so a shared cache may keep it.
				'cache-control': 'public, max-age=3600'
			}
		});
	} catch (err) {
		rethrowAsHttp(err);
	}
};
```

- [ ] **Step 7: Прогнать тесты**

Run: `pnpm vitest run tests/unit/landing.spec.ts && pnpm check`
Expected: PASS.

- [ ] **Step 8: Коммит**

```bash
git add src/lib/server/landing "src/routes/api/public" src/lib/server/settings/org.service.ts tests/unit/landing.spec.ts
git commit -m "feat(catalog): serve cover photos to a guest"
```

### Task 11: Секции лендинга

**Files:**

- Create: `src/lib/portal/landing/LandingWorks.svelte`
- Create: `src/lib/portal/landing/LandingCharity.svelte`
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/+page.svelte`
- Test: `tests/e2e/landing.e2e.ts`

**Interfaces:**

- Consumes: `LandingService.works` и `OrgService.publicCharity` из Task 10.
- Produces: `data.works: WorkDto[]` и `data.charity` в загрузке корневой страницы.

- [ ] **Step 1: Написать падающий e2e**

Создать `tests/e2e/landing.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('гость видит примеры работ', async ({ page }) => {
	await page.goto('/');
	const works = page.getByTestId('landing-work');
	await expect(works.first()).toBeVisible();
	await expect(works.first().locator('img')).toHaveAttribute('src', /\/api\/public\/works\/\d+/);
});

test('гость видит блок фонда без цифр сборов', async ({ page }) => {
	await page.goto('/');
	const charity = page.getByTestId('landing-charity');
	await expect(charity).toBeVisible();
	await expect(charity).not.toContainText('₽');
});

test('гостю не отдаются цены и артикулы в разметке примеров', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('landing-work').first()).not.toContainText('₽');
});
```

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e tests/e2e/landing.e2e.ts`
Expected: FAIL, элементов нет.

- [ ] **Step 3: Расширить загрузку страницы**

В `src/routes/+page.server.ts`:

```ts
// Guests get contacts, cover photos and the fund: nothing priced and nothing from a counterparty.
return {
	contacts: OrgService.publicContacts(),
	works: new LandingService().works(),
	charity: OrgService.publicCharity()
};
```

- [ ] **Step 4: Написать секцию примеров работ**

Создать `src/lib/portal/landing/LandingWorks.svelte`:

```svelte
<script lang="ts">
	import type { WorkDto } from '$lib/server/landing/landing.service';

	let { works }: { works: readonly WorkDto[] } = $props();
</script>

{#if works.length > 0}
	<section id="works" class="mx-auto max-w-shell px-4 pt-12 sm:px-6">
		<h2 class="mb-5 px-2 text-3xl sm:text-4xl">Примеры работ</h2>
		<div class="grid grid-cols-2 gap-4 md:grid-cols-3">
			{#each works as work (work.mediaId)}
				<figure data-testid="landing-work" class="rounded-card bg-surface-raised p-3">
					<img
						src="/api/public/works/{work.mediaId}"
						alt={work.title}
						loading="lazy"
						class="aspect-[4/3] w-full rounded-inset bg-surface-muted object-cover"
					/>
					<figcaption class="px-1 pt-3 text-sm text-fg-muted">{work.title}</figcaption>
				</figure>
			{/each}
		</div>
	</section>
{/if}
```

Тип `WorkDto` импортируется из серверного модуля только как тип: рантайм-кода сервера в бандл это не тянет. Если `pnpm check` на это ругается, перенести `WorkDto` в `src/lib/types/landing.ts` и импортировать оттуда и там, и там.

- [ ] **Step 5: Написать секцию фонда**

Создать `src/lib/portal/landing/LandingCharity.svelte`:

```svelte
<script lang="ts">
	import type { PublicCharity } from '$lib/server/settings/org.service';

	let { charity }: { charity: PublicCharity } = $props();

	// The rate is the only figure a guest sees: collected sums stay inside the portal (v1.33).
	const rate = $derived(
		charity.ratePercent === null ? null : `${charity.ratePercent.toString().replace('.', ',')} %`
	);
</script>

{#if charity.title}
	<section id="charity" class="mx-auto max-w-shell px-4 pt-12 pb-4 sm:px-6">
		<div class="rounded-card bg-surface-raised p-6 sm:p-10">
			<h2 class="mb-4 text-3xl sm:text-4xl">Благотворительный проект</h2>
			<p data-testid="landing-charity" class="max-w-2xl text-fg-muted">
				С каждой отгрузки мастерская перечисляет
				{#if rate}<span class="text-fg">{rate}</span> суммы заявки{:else}часть суммы заявки{/if}
				в фонд
				{#if charity.url}
					<a href={charity.url} rel="noreferrer" class="text-link">{charity.title}</a>
				{:else}
					<span class="text-fg">{charity.title}</span>
				{/if}. Отчисление считается в момент доставки и не пересчитывается задним числом.
			</p>
		</div>
	</section>
{/if}
```

- [ ] **Step 6: Вставить секции на страницу**

В `src/routes/+page.svelte` внутри `<main>`:

```svelte
<LandingHero {telHref} />
<LandingAssortment />
<LandingWorks works={data.works} />
<LandingSteps {telHref} />
<LandingCharity charity={data.charity} />
```

Спека ставила примеры работ между «Ассортиментом» и «Производством», но обе секции живут в одном компоненте `LandingAssortment.svelte`. Резать его ради порядка незачем: примеры работ встают сразу за «Производством», и страница читается «ассортимент, производство, примеры, как мы работаем, фонд». Добавить импорты обоих компонентов.

- [ ] **Step 7: Прогнать всё**

Run: `pnpm check && pnpm lint && pnpm vitest run && SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm test:e2e && SESSION_SECRET=dev-secret-dev-secret-dev-secret pnpm build`
Expected: всё зелёное.

- [ ] **Step 8: Коммит и PR**

```bash
git add src/lib/portal/landing src/routes/+page.server.ts src/routes/+page.svelte tests/e2e/landing.e2e.ts
git commit -m "feat(portal): show works and the charity project on landing"
git push -u origin feat/landing-works-charity
gh pr create --title "P13: примеры работ и фонд на лендинге" --body "..."
```

---

## Чек-лист перед каждым PR

- [ ] локально зелёные `pnpm lint`, `pnpm check`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm build`;
- [ ] тесты выведены из критериев приёмки слайса в `tech.md` §14, а не из кода;
- [ ] на каждый новый джоб есть тест идемпотентности (P12, Task 7);
- [ ] на стыке слайса есть контрактный тест (P10 Task 1, P11 Task 2, P12 Task 6, P13 Task 10);
- [ ] выдуманных типов нет, всё из `tech.md` v1.33;
- [ ] серверная проверка прав и row-level фильтр на месте;
- [ ] цены не утекают роли без цен, проверено на теле ответа;
- [ ] UI собран из примитивов `lib/ui`, свои таблицы и цвета не заведены;
- [ ] новые действия пишутся в `audit_log`, переходы в `request_status_history`;
- [ ] миграция сгенерирована из схемы и прогнана на чистой БД;
- [ ] `tech.md` уже на v1.33, дополнительного бампа слайсы не требуют;
- [ ] коммиты по конвенции, автор Sobol17, следов нейросети нет.
