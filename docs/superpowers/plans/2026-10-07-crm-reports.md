# C13. Отчёты и аналитика: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Руководитель видит в CRM дашборд, пять отчётов за период с выгрузкой в XLSX и ведёт реестр перечислений в фонд со сторно.

**Architecture:** Модуль `src/lib/server/crm-reports`: на отчёт репозиторий с одним агрегирующим запросом и сервис, наследник `ReportBaseService`. Арифметика отчётов (период и бакеты, дни запаса, доли воронки, остаток фонда) лежит чистыми функциями в `lib/domain`. Роуты `/crm/reports/*` тонкие, выгрузка синхронная из того же DTO, что и экран.

**Tech Stack:** SvelteKit 2, Svelte 5, Drizzle на SQLite, Zod, exceljs, Vitest, fast-check, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-crm-reports-design.md`

## Global Constraints

- `tech.md` v1.51 бампается первой задачей; код не расходится с ним.
- Раздел читает только `owner` (`reports.read`), запись и сторно перечислений по `charity.manage`. Право проверяют роут и конструктор сервиса.
- Деньги в целых копейках, поля с суффиксом `Minor`. Доли в базисных пунктах.
- Период `from`, `to` датами `YYYY-MM-DD` в `org.timezone`, обе границы включены, не длиннее `REPORT_MAX_DAYS = 366`.
- Колонки `ts()` хранят секунды (`mode: 'timestamp'`): сравнение с датой идёт операторами Drizzle (`gte`, `lt`) либо через `sql.param(date, column)`, сырой `Date` в `sql` не подставляется.
- Файл не длиннее 250 строк, функция не длиннее 40. `any` запрещён.
- UI только из `$lib/ui`. Hex-цветов и своих таблиц нет. Плейсхолдеры короткие: «Выберите дату», «Введите сумму».
- Миграция только `pnpm db:generate`.
- Комментарии английские и объясняют «почему». Коммиты Conventional Commits, автор из конфига, без трейлеров и эмодзи.
- Локальный `pnpm test:e2e` и `pnpm build` требуют `SESSION_SECRET` в окружении; порт 4173 от старого превью освобождается перед e2e.

## Review Focus

1. Доставка в 23:30 последнего дня периода по времени мастерской попадает в период, доставка в 00:10 следующего дня не попадает. Тест в задаче 2 (`reportWindow`) и в задаче 5.
2. Период без единой заявки: каждый отчёт отдаёт нули и пустые строки, а не падает на `sum(null)`. Тест в задачах 5, 6, 7, 8.
3. Сторно погрузки («Снять» у водителя) в том же периоде уменьшает «отгружено», а не увеличивает приход оборачиваемости. Тест в задаче 6.
4. Перечисление ровно на остаток проходит, на копейку больше получает 409; после сторно та же сумма снова проходит. Тест в задаче 8.
5. Адрес с `from` позже `to` или периодом длиннее года открывает страницу с подсказкой, а выгрузка отвечает 422, а не 500. Тест в задачах 4 и 10.

---

### Task 1: Контракт v1.51, права и удаление `report.export`

**Files:**
- Modify: `tech.md` (шапка, changelog, §4.4, §5.9, §7.2, §8, §12, §14 C13)
- Modify: `src/lib/server/auth/policy.ts`
- Modify: `src/lib/types/dicts.ts` (`JOB_TOPICS`)
- Modify: `src/lib/server/queue/topics.ts`
- Modify: `tests/unit/queue-contract.spec.ts`, `tests/unit/policy.spec.ts`
- Modify: комментарии со словом `report.export` в `src/lib/server/crm-stock/stock-export.service.ts`, `src/lib/server/crm-request/crm-request-export.service.ts`, `src/lib/server/catalog/price-list-export.service.ts`
- Create: `src/lib/types/crm-reports.ts`

**Interfaces:**
- Produces: действие `'charity.manage'` в `ACTIONS`; все типы из раздела «Типы» спеки в `$lib/types/crm-reports`.

- [ ] **Step 1: Падающий тест прав** в `tests/unit/policy.spec.ts`

```ts
describe('reports and the fund (C13, tech.md v1.51)', () => {
	it('opens the reports to the owner only', () => {
		for (const role of ROLE_CODES) {
			expect(PolicyService.can({ roles: [role] }, 'reports.read')).toBe(role === 'owner');
			expect(PolicyService.can({ roles: [role] }, 'charity.manage')).toBe(role === 'owner');
		}
	});
});
```

Импорт `ROLE_CODES` из `../../src/lib/types/roles`, если его в файле ещё нет.

- [ ] **Step 2:** `pnpm vitest run tests/unit/policy.spec.ts`. Ожидание: FAIL, `charity.manage` не входит в `Action`, `manager` держит `reports.read`.

- [ ] **Step 3: Правка `policy.ts`.** В `ACTIONS` после `'reports.read'` добавить `'charity.manage'`. Из гранта `manager` убрать `'reports.read'`. Грант `owner` считается фильтром и получает действие сам.

- [ ] **Step 4: Убрать топик.** Из `JOB_TOPICS` в `src/lib/types/dicts.ts` убрать `'report.export'`, из `JOB_PAYLOAD_SCHEMAS` убрать его схему, из образцов в `tests/unit/queue-contract.spec.ts` убрать его строку. В трёх сервисах выгрузки переписать комментарий: вместо отсылки к очереди `// Built on the click: exports are synchronous, there is no export job (tech.md v1.51).`

- [ ] **Step 5: Создать `src/lib/types/crm-reports.ts`** дословно по блоку «Типы» спеки. Импорты: `Page` из `./list`, `RequestStatus` из `./request`, `StockKind` из `./crm-stock`.

- [ ] **Step 6: `tech.md`.**
  - Шапка: `**Версия ядра:** v1.51`.
  - Changelog, новая первая строка: `| v1.51 | Контракт C13 по решениям владельца от 07.10.2026, дизайн в docs/superpowers/specs/2026-10-07-crm-reports-design.md. Раздел отчётов читает только руководитель: reports.read снят с manager. Новое действие charity.manage. charity_transfers получила reversal_of_id: ошибочное перечисление гасится строкой с минусом, перечислить больше остатка нельзя. Топик report.export удалён, выгрузки отчётов синхронные. Продажа это доставленная заявка контрагента по delivered_at. Оборачиваемость в штуках, в днях запаса. Новые types/crm-reports.ts и validation/crm-reports.ts, роуты /crm/reports/*. |`
  - §4.4: в строке `crm/` расписать `reports/` как `reports/ дашборд; sales/, stock/, funnel/, lost/, charity/, у каждого export.xlsx (v1.51)`.
  - §5.9: блок `charityTransfers` заменить блоком из спеки.
  - §7.2: убрать строку `report.export`. §8: убрать из `JOB_TOPICS`, добавить блок `// crm-reports.ts` с типами.
  - §12 или место, где перечислены действия: добавить `charity.manage`, отметить, что `reports.read` только у `owner`.
  - §14 C13: дописать `(контракт v1.51)` и предложение `Раздел видит только руководитель, перечисление гасится сторно, выгрузка синхронная.`

- [ ] **Step 7:** `pnpm vitest run tests/unit/policy.spec.ts tests/unit/queue-contract.spec.ts && pnpm check`. Ожидание: PASS, ошибок типов нет. Если `pnpm check` показывает место, где `manager` проходил по `reports.read`, это находка: остановиться и разобрать.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "docs(crm): contract of the reports slice, v1.51"
```

---

### Task 2: Домен периода

**Files:**
- Create: `src/lib/domain/report/period.ts`
- Test: `tests/domain/report-period.spec.ts`

**Interfaces:**
- Consumes: `addDays` из `$lib/domain/payroll/calc`, `startOfDayInZone` из `$lib/domain/time/zone`.
- Produces:

```ts
export interface ReportRange { readonly from: string; readonly to: string }
export interface ReportWindow { readonly from: Date; readonly to: Date; readonly days: number } // `to` is exclusive
export type RangeProblem = 'not_a_date' | 'reversed' | 'too_long';
export function rangeDays(range: ReportRange): number;
export function rangeProblem(range: ReportRange, maxDays: number): RangeProblem | null;
export function reportWindow(range: ReportRange, timeZone: string): ReportWindow | null;
export function presetRange(preset: ReportPreset, today: string): ReportRange;
export function bucketOf(day: string, bucket: SalesBucket, range: ReportRange): ReportRange;
export function bucketsOf(range: ReportRange, bucket: SalesBucket): ReportRange[];
```

- [ ] **Step 1: Падающие тесты**

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	bucketOf, bucketsOf, presetRange, rangeDays, rangeProblem, reportWindow
} from '../../src/lib/domain/report/period';
import { addDays } from '../../src/lib/domain/payroll/calc';
import { SALES_BUCKETS } from '../../src/lib/types/crm-reports';

const day = fc.integer({ min: 0, max: 3650 }).map((n) => addDays('2020-01-01', n));
const range = fc.tuple(day, fc.integer({ min: 0, max: 365 }))
	.map(([from, len]) => ({ from, to: addDays(from, len) }));

describe('report period (C13)', () => {
	it('keeps the last evening of the range and drops the next morning', () => {
		const window = reportWindow({ from: '2026-10-01', to: '2026-10-31' }, 'Europe/Moscow');
		expect(window?.from.toISOString()).toBe('2026-09-30T21:00:00.000Z');
		expect(window?.to.toISOString()).toBe('2026-10-31T21:00:00.000Z');
		expect(window?.days).toBe(31);
	});

	it('names what is wrong with a range', () => {
		expect(rangeProblem({ from: '2026-02-31', to: '2026-03-01' }, 366)).toBe('not_a_date');
		expect(rangeProblem({ from: '2026-03-02', to: '2026-03-01' }, 366)).toBe('reversed');
		expect(rangeProblem({ from: '2025-01-01', to: '2026-01-02' }, 366)).toBe('too_long');
		expect(rangeProblem({ from: '2025-01-01', to: '2026-01-01' }, 366)).toBeNull();
	});

	it('opens presets from the start of the current span to today', () => {
		expect(presetRange('week', '2026-10-07')).toEqual({ from: '2026-10-05', to: '2026-10-07' });
		expect(presetRange('month', '2026-10-07')).toEqual({ from: '2026-10-01', to: '2026-10-07' });
		expect(presetRange('quarter', '2026-11-20')).toEqual({ from: '2026-10-01', to: '2026-11-20' });
		expect(presetRange('year', '2026-10-07')).toEqual({ from: '2026-01-01', to: '2026-10-07' });
	});

	it('covers the range with buckets, no gaps and no overlaps', () => {
		fc.assert(fc.property(range, fc.constantFrom(...SALES_BUCKETS), (r, bucket) => {
			const buckets = bucketsOf(r, bucket);
			expect(buckets[0]?.from).toBe(r.from);
			expect(buckets.at(-1)?.to).toBe(r.to);
			for (let i = 1; i < buckets.length; i += 1) {
				expect(buckets[i]?.from).toBe(addDays(buckets[i - 1]?.to ?? '', 1));
			}
			expect(buckets.reduce((sum, b) => sum + rangeDays(b), 0)).toBe(rangeDays(r));
		}));
	});

	it('puts every day of the range into the bucket that holds it', () => {
		fc.assert(fc.property(range, fc.constantFrom(...SALES_BUCKETS), fc.nat(), (r, bucket, n) => {
			const d = addDays(r.from, n % rangeDays(r));
			const b = bucketOf(d, bucket, r);
			expect(b.from <= d && d <= b.to).toBe(true);
			expect(bucketsOf(r, bucket)).toContainEqual(b);
		}));
	});
});
```

- [ ] **Step 2:** `pnpm vitest run tests/domain/report-period.spec.ts`. Ожидание: FAIL, модуля нет.

- [ ] **Step 3: Реализация**

```ts
import { addDays } from '$lib/domain/payroll/calc';
import { startOfDayInZone } from '$lib/domain/time/zone';
import type { ReportPreset, SalesBucket } from '$lib/types/crm-reports';

const DAY_MS = 86_400_000;

export interface ReportRange { readonly from: string; readonly to: string }
/** `to` is the first instant after the range: every filter is a half-open window. */
export interface ReportWindow { readonly from: Date; readonly to: Date; readonly days: number }
export type RangeProblem = 'not_a_date' | 'reversed' | 'too_long';

const utc = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00.000Z`);
const isDate = (isoDate: string): boolean =>
	!Number.isNaN(utc(isoDate)) && new Date(utc(isoDate)).toISOString().slice(0, 10) === isoDate;

/** Both ends count: a range of one date is one day long. */
export function rangeDays(range: ReportRange): number {
	return Math.round((utc(range.to) - utc(range.from)) / DAY_MS) + 1;
}

export function rangeProblem(range: ReportRange, maxDays: number): RangeProblem | null {
	if (!isDate(range.from) || !isDate(range.to)) return 'not_a_date';
	if (range.from > range.to) return 'reversed';
	return rangeDays(range) > maxDays ? 'too_long' : null;
}

export function reportWindow(range: ReportRange, timeZone: string): ReportWindow | null {
	const from = startOfDayInZone(range.from, timeZone);
	const to = startOfDayInZone(addDays(range.to, 1), timeZone);
	return from === null || to === null ? null : { from, to, days: rangeDays(range) };
}

/** Monday of the week that holds the date. */
function weekStart(isoDate: string): string {
	const weekday = (new Date(utc(isoDate)).getUTCDay() + 6) % 7;
	return addDays(isoDate, -weekday);
}

function spanStart(isoDate: string, span: ReportPreset | SalesBucket): string {
	const [year, month] = [isoDate.slice(0, 4), Number(isoDate.slice(5, 7))];
	switch (span) {
		case 'day': return isoDate;
		case 'week': return weekStart(isoDate);
		case 'month': return `${isoDate.slice(0, 7)}-01`;
		case 'quarter': return `${year}-${String(month - ((month - 1) % 3)).padStart(2, '0')}-01`;
		case 'year': return `${year}-01-01`;
	}
}

function spanEnd(start: string, bucket: SalesBucket): string {
	if (bucket === 'day') return start;
	if (bucket === 'week') return addDays(start, 6);
	const next = new Date(utc(start));
	next.setUTCMonth(next.getUTCMonth() + 1);
	return addDays(next.toISOString().slice(0, 10), -1);
}

export function presetRange(preset: ReportPreset, today: string): ReportRange {
	return { from: spanStart(today, preset), to: today };
}

const later = (a: string, b: string): string => (a > b ? a : b);
const earlier = (a: string, b: string): string => (a < b ? a : b);

/** The bucket of the day, cut by the ends of the range. */
export function bucketOf(day: string, bucket: SalesBucket, range: ReportRange): ReportRange {
	const start = spanStart(day, bucket);
	return { from: later(start, range.from), to: earlier(spanEnd(start, bucket), range.to) };
}

export function bucketsOf(range: ReportRange, bucket: SalesBucket): ReportRange[] {
	const buckets: ReportRange[] = [];
	for (let day = range.from; day <= range.to; ) {
		const next = bucketOf(day, bucket, range);
		buckets.push(next);
		day = addDays(next.to, 1);
	}
	return buckets;
}
```

В `crm-reports.ts` добавить `export type ReportPreset = (typeof REPORT_PRESETS)[number];` (и в блок §8 `tech.md`).

- [ ] **Step 4:** `pnpm vitest run tests/domain/report-period.spec.ts`. Ожидание: PASS.

- [ ] **Step 5: Commit** `git commit -am "feat(crm): add the period and buckets of a report"` (новые файлы добавить `git add`).

---

### Task 3: Домен оборачиваемости, воронки и остатка фонда

**Files:**
- Create: `src/lib/domain/stock/turnover.ts`, `src/lib/domain/report/funnel.ts`, `src/lib/domain/charity/balance.ts`
- Test: `tests/domain/stock-turnover.spec.ts`, `tests/domain/report-funnel.spec.ts`, `tests/domain/charity-balance.spec.ts`

**Interfaces:**
- Produces:

```ts
// stock/turnover.ts
export interface PositionMoves { readonly opening: number; readonly income: number; readonly outcome: number; readonly shipped: number }
export function closingQty(moves: PositionMoves): number;
export function turnoverDays(moves: PositionMoves, days: number): number | null;
// report/funnel.ts
export interface StageShare { readonly shareOfPreviousBp: number | null; readonly shareOfFirstBp: number | null }
export function funnelShares(counts: readonly number[]): StageShare[];
// charity/balance.ts
export function fundRemainderMinor(accruedMinor: number, transferAmounts: readonly number[]): number;
export function fitsRemainder(remainderMinor: number, amountMinor: number): boolean;
export function isTransferReversible(row: { readonly reversalOfId: number | null; readonly isReversed: boolean }): boolean;
```

- [ ] **Step 1: Падающие тесты**

```ts
// tests/domain/stock-turnover.spec.ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { closingQty, turnoverDays } from '../../src/lib/domain/stock/turnover';

const qty = fc.integer({ min: 0, max: 10_000 });
const moves = fc.record({ opening: fc.integer({ min: -100, max: 10_000 }), income: qty, outcome: qty, shipped: fc.integer({ min: -50, max: 10_000 }) });

describe('stock turnover (C13)', () => {
	it('counts days of stock from the average balance', () => {
		// 10 on the shelf at both ends, 30 shipped in 30 days: the shelf lasts 10 days.
		expect(turnoverDays({ opening: 10, income: 30, outcome: 30, shipped: 30 }, 30)).toBe(10);
	});

	it('gives days only when something was shipped from a positive shelf', () => {
		fc.assert(fc.property(moves, fc.integer({ min: 1, max: 366 }), (m, days) => {
			const result = turnoverDays(m, days);
			const average = (m.opening + closingQty(m)) / 2;
			expect(result === null).toBe(m.shipped <= 0 || average <= 0);
			if (result !== null) expect(result).toBeGreaterThanOrEqual(0);
			expect(closingQty(m)).toBe(m.opening + m.income - m.outcome);
		}));
	});
});
```

```ts
// tests/domain/report-funnel.spec.ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { funnelShares } from '../../src/lib/domain/report/funnel';

const falling = fc.array(fc.nat(1000), { minLength: 5, maxLength: 5 })
	.map((steps) => steps.reduce<number[]>((acc, step) => [...acc, Math.max(0, (acc.at(-1) ?? 5000) - step)], []));

describe('funnel shares (C13)', () => {
	it('counts shares in basis points', () => {
		expect(funnelShares([10, 8, 4, 4, 1])).toEqual([
			{ shareOfPreviousBp: null, shareOfFirstBp: 10_000 },
			{ shareOfPreviousBp: 8000, shareOfFirstBp: 8000 },
			{ shareOfPreviousBp: 5000, shareOfFirstBp: 4000 },
			{ shareOfPreviousBp: 10_000, shareOfFirstBp: 4000 },
			{ shareOfPreviousBp: 2500, shareOfFirstBp: 1000 }
		]);
	});

	it('has no share of an empty stage', () => {
		expect(funnelShares([0, 0])).toEqual([
			{ shareOfPreviousBp: null, shareOfFirstBp: null },
			{ shareOfPreviousBp: null, shareOfFirstBp: null }
		]);
	});

	it('stays within 0..10000 while the counts do not grow', () => {
		fc.assert(fc.property(falling, (counts) => {
			for (const share of funnelShares(counts)) {
				for (const bp of [share.shareOfPreviousBp, share.shareOfFirstBp]) {
					if (bp !== null) expect(bp >= 0 && bp <= 10_000).toBe(true);
				}
			}
		}));
	});
});
```

```ts
// tests/domain/charity-balance.spec.ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fitsRemainder, fundRemainderMinor, isTransferReversible } from '../../src/lib/domain/charity/balance';

describe('fund balance (C13)', () => {
	it('returns to the same remainder after a reversal', () => {
		fc.assert(fc.property(fc.nat(1e9), fc.array(fc.integer({ min: 1, max: 1e6 })), fc.integer({ min: 1, max: 1e6 }), (accrued, sent, amount) => {
			const before = fundRemainderMinor(accrued, sent);
			expect(fundRemainderMinor(accrued, [...sent, amount, -amount])).toBe(before);
			expect(before).toBe(accrued - sent.reduce((sum, value) => sum + value, 0));
		}));
	});

	it('takes exactly the remainder and not a kopeck more', () => {
		expect(fitsRemainder(500, 500)).toBe(true);
		expect(fitsRemainder(500, 501)).toBe(false);
		expect(fitsRemainder(500, 0)).toBe(false);
		expect(fitsRemainder(-10, 1)).toBe(false);
	});

	it('reverses a plain transfer once', () => {
		expect(isTransferReversible({ reversalOfId: null, isReversed: false })).toBe(true);
		expect(isTransferReversible({ reversalOfId: null, isReversed: true })).toBe(false);
		expect(isTransferReversible({ reversalOfId: 3, isReversed: false })).toBe(false);
	});
});
```

- [ ] **Step 2:** `pnpm vitest run tests/domain/stock-turnover.spec.ts tests/domain/report-funnel.spec.ts tests/domain/charity-balance.spec.ts`. Ожидание: FAIL, модулей нет.

- [ ] **Step 3: Реализация**

```ts
// src/lib/domain/stock/turnover.ts
export interface PositionMoves {
	readonly opening: number;
	readonly income: number;
	readonly outcome: number;
	/** Shipments net of their reversals; below zero when a period only holds the reversal. */
	readonly shipped: number;
}

export function closingQty(moves: PositionMoves): number {
	return moves.opening + moves.income - moves.outcome;
}

/** Days the average shelf lasts at the shipping pace of the period, or null when it says nothing. */
export function turnoverDays(moves: PositionMoves, days: number): number | null {
	const average = (moves.opening + closingQty(moves)) / 2;
	if (moves.shipped <= 0 || average <= 0) return null;
	return Math.round((average * days) / moves.shipped);
}
```

```ts
// src/lib/domain/report/funnel.ts
const FULL_BP = 10_000;

export interface StageShare {
	readonly shareOfPreviousBp: number | null;
	readonly shareOfFirstBp: number | null;
}

const share = (count: number, of: number | undefined): number | null =>
	of === undefined || of === 0 ? null : Math.round((count * FULL_BP) / of);

/** Share of each stage in the one before it and in the first one, in basis points. */
export function funnelShares(counts: readonly number[]): StageShare[] {
	return counts.map((count, index) => ({
		shareOfPreviousBp: index === 0 ? null : share(count, counts[index - 1]),
		shareOfFirstBp: share(count, counts[0])
	}));
}
```

```ts
// src/lib/domain/charity/balance.ts
/** Accrued but not sent to the fund yet. A reversal row carries a negative amount. */
export function fundRemainderMinor(accruedMinor: number, transferAmounts: readonly number[]): number {
	return accruedMinor - transferAmounts.reduce((sum, amount) => sum + amount, 0);
}

/** The workshop cannot send more than it owes the fund (tech.md v1.51). */
export function fitsRemainder(remainderMinor: number, amountMinor: number): boolean {
	return amountMinor > 0 && amountMinor <= remainderMinor;
}

export function isTransferReversible(row: {
	readonly reversalOfId: number | null;
	readonly isReversed: boolean;
}): boolean {
	return row.reversalOfId === null && !row.isReversed;
}
```

- [ ] **Step 4:** те же три файла тестов. Ожидание: PASS.

- [ ] **Step 5: Commit** `feat(crm): add turnover, funnel and fund balance rules`.

---

### Task 4: Миграция `reversal_of_id` и схемы входа

**Files:**
- Modify: `src/lib/server/db/schema/system.ts`
- Create: миграция в `drizzle/` командой, `src/lib/validation/crm-reports.ts`
- Test: `tests/unit/crm-reports-validation.spec.ts`

**Interfaces:**
- Produces: колонка `charityTransfers.reversalOfId`; схемы и типы входа:

```ts
export const reportRangeSchema, salesReportSchema, stockTurnoverSchema, lostReportSchema,
	charityTransferSchema, charityTransferReverseSchema;
export type ReportRangeInput = { from: string; to: string };
export type SalesReportInput = ReportRangeInput & { group: SalesGroup; bucket: SalesBucket; counterpartyId: number | null };
export type StockTurnoverInput = ReportRangeInput & { kind: StockKind | null };
export type LostReportInput = ReportRangeInput & { status: LostStatus | null };
export type CharityTransferInput = { amountMinor: number; transferredOn: string; documentRef: string | null; comment: string | null };
export type CharityTransferReverseInput = { transferId: number; comment: string };
```

- [ ] **Step 1: Колонка.** В `charityTransfers` после `comment`:

```ts
	// Set on a row that cancels an earlier transfer; the original is never edited (tech.md v1.51).
	reversalOfId: integer('reversal_of_id').references((): AnySQLiteColumn => charityTransfers.id),
```

Импорт `type AnySQLiteColumn` из `drizzle-orm/sqlite-core`.

- [ ] **Step 2:** `pnpm db:generate`. Ожидание: один новый файл в `drizzle/` с `ALTER TABLE charity_transfers ADD reversal_of_id`. Если генератор предлагает пересоздать таблицу и просит TTY, остановиться: в памяти проекта записан обход (генерировать drop и create раздельно), применить его и описать в коммите.

- [ ] **Step 3:** прогнать миграцию на чистой БД и на копии дев-базы:

```bash
DATABASE_URL=/tmp/c13-clean.db pnpm db:migrate && cp data/app.db /tmp/c13-dev.db && DATABASE_URL=/tmp/c13-dev.db pnpm db:migrate
```

Имя переменной и путь к дев-базе сверить с `src/lib/server/config.ts` перед запуском. Ожидание: обе команды без ошибок.

- [ ] **Step 4: Падающие тесты схем**

```ts
import { describe, expect, it } from 'vitest';
import {
	charityTransferReverseSchema, charityTransferSchema, reportRangeSchema, salesReportSchema
} from '../../src/lib/validation/crm-reports';

describe('report input (C13)', () => {
	it('refuses a reversed range and one longer than a year', () => {
		expect(reportRangeSchema.safeParse({ from: '2026-03-02', to: '2026-03-01' }).success).toBe(false);
		expect(reportRangeSchema.safeParse({ from: '2025-01-01', to: '2026-01-02' }).success).toBe(false);
		expect(reportRangeSchema.safeParse({ from: '2026-02-31', to: '2026-03-01' }).success).toBe(false);
		expect(reportRangeSchema.parse({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
	});

	it('fills the grouping of the sales report in', () => {
		expect(salesReportSchema.parse({ from: '2026-10-01', to: '2026-10-31' }))
			.toMatchObject({ group: 'counterparty', bucket: 'month', counterpartyId: null });
		expect(salesReportSchema.parse({ from: '2026-10-01', to: '2026-10-31', group: 'period', bucket: 'week', counterpartyId: '4' }))
			.toMatchObject({ group: 'period', bucket: 'week', counterpartyId: 4 });
	});

	it('takes a transfer in whole kopecks and trims its texts', () => {
		expect(charityTransferSchema.parse({ amountMinor: '150000', transferredOn: '2026-10-07', documentRef: ' ПП 15 ', comment: '' }))
			.toEqual({ amountMinor: 150000, transferredOn: '2026-10-07', documentRef: 'ПП 15', comment: null });
		expect(charityTransferSchema.safeParse({ amountMinor: '0', transferredOn: '2026-10-07' }).success).toBe(false);
		expect(charityTransferSchema.safeParse({ amountMinor: '10.5', transferredOn: '2026-10-07' }).success).toBe(false);
	});

	it('wants a reason for a reversal', () => {
		expect(charityTransferReverseSchema.safeParse({ transferId: '3', comment: '  ' }).success).toBe(false);
		expect(charityTransferReverseSchema.parse({ transferId: '3', comment: ' Не тот счёт ' }))
			.toEqual({ transferId: 3, comment: 'Не тот счёт' });
	});
});
```

- [ ] **Step 5:** запустить тест. Ожидание: FAIL, модуля нет.

- [ ] **Step 6: Реализация `src/lib/validation/crm-reports.ts`**

```ts
import { z } from 'zod';
import { rangeProblem, type RangeProblem } from '$lib/domain/report/period';
import {
	CHARITY_TRANSFER_MAX_MINOR, LOST_STATUSES, REPORT_MAX_DAYS, SALES_BUCKETS, SALES_GROUPS
} from '$lib/types/crm-reports';
import { STOCK_KINDS } from '$lib/types/crm-stock';

const RANGE_MESSAGE: Readonly<Record<RangeProblem, string>> = {
	not_a_date: 'Выберите даты периода',
	reversed: 'Начало периода позже конца',
	too_long: 'Период не длиннее года'
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите даты периода' });
const id = z.coerce.number().int().positive();
// An empty query value means "no filter", not a broken one.
const blankToNull = (value: unknown) => (value === '' || value === undefined ? null : value);
const optionalText = (max: number) =>
	z.preprocess(
		(value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null),
		z.string().max(max, { error: `Не длиннее ${max} символов` }).nullable()
	);

const rangeShape = { from: day, to: day };
const checkRange = (value: { from: string; to: string }, ctx: z.RefinementCtx): void => {
	const problem = rangeProblem(value, REPORT_MAX_DAYS);
	if (problem !== null) ctx.addIssue({ code: 'custom', path: ['to'], message: RANGE_MESSAGE[problem] });
};

export const reportRangeSchema = z.object(rangeShape).superRefine(checkRange);

export const salesReportSchema = z
	.object({
		...rangeShape,
		group: z.enum(SALES_GROUPS).default('counterparty'),
		bucket: z.enum(SALES_BUCKETS).default('month'),
		counterpartyId: z.preprocess(blankToNull, id.nullable())
	})
	.superRefine(checkRange);

export const stockTurnoverSchema = z
	.object({ ...rangeShape, kind: z.preprocess(blankToNull, z.enum(STOCK_KINDS).nullable()) })
	.superRefine(checkRange);

export const lostReportSchema = z
	.object({ ...rangeShape, status: z.preprocess(blankToNull, z.enum(LOST_STATUSES).nullable()) })
	.superRefine(checkRange);

export const charityTransferSchema = z.object({
	amountMinor: z.coerce
		.number({ error: 'Введите сумму' })
		.int({ error: 'Введите сумму' })
		.min(1, { error: 'Введите сумму' })
		.max(CHARITY_TRANSFER_MAX_MINOR, { error: 'Сумма слишком большая' }),
	transferredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Выберите дату перечисления' }),
	documentRef: optionalText(100),
	comment: optionalText(500)
});

export const charityTransferReverseSchema = z.object({
	transferId: id,
	comment: z.string().trim().min(1, { error: 'Напишите причину сторно' }).max(500)
});

export type ReportRangeInput = z.infer<typeof reportRangeSchema>;
export type SalesReportInput = z.infer<typeof salesReportSchema>;
export type StockTurnoverInput = z.infer<typeof stockTurnoverSchema>;
export type LostReportInput = z.infer<typeof lostReportSchema>;
export type CharityTransferInput = z.infer<typeof charityTransferSchema>;
export type CharityTransferReverseInput = z.infer<typeof charityTransferReverseSchema>;
```

Отдельной `charityReportSchema` нет: отчёт по фонду берёт `reportRangeSchema`, а пагинацию реестра разбирает `parseListQuery`. В спеке и в §8 `tech.md` строку про `charityReportSchema` привести к этому.

- [ ] **Step 7:** тест схем. Ожидание: PASS. `pnpm check` чистый.

- [ ] **Step 8: Commit** `feat(crm): store a reversal of a fund transfer`.

---

### Task 5: Отчёт продаж

**Files:**
- Create: `src/lib/server/crm-reports/report-base.service.ts`, `sales-report.repository.ts`, `sales-report.service.ts`
- Create: `tests/unit/helpers/crm-reports.ts`
- Test: `tests/unit/crm-reports-sales.spec.ts`

**Interfaces:**
- Consumes: `reportWindow`, `bucketOf`, `bucketsOf` (задача 2); `SalesReportInput` (задача 4).
- Produces:

```ts
export abstract class ReportBaseService extends BaseService {
	protected constructor(ctx: ActorContext, protected readonly timeZone: string, protected readonly now: () => Date);
	today(): string;                                   // 'YYYY-MM-DD' in org.timezone
	defaultRange(): ReportRange;                       // presetRange('month', today)
	protected window(range: ReportRange): ReportWindow; // throws ValidationError
}
export class SalesReportService extends ReportBaseService {
	constructor(ctx: ActorContext, repo?: SalesReportRepository, timeZone?: string, now?: () => Date);
	report(input: SalesReportInput): SalesReportDto;
	totals(range: ReportRange): SalesTotalsDto;
	top(range: ReportRange, limit: number): { counterparties: SalesByCounterpartyRowDto[]; models: SalesByModelRowDto[] };
}
// tests/unit/helpers/crm-reports.ts
export function seedReportWorld(db: Db): ReturnType<typeof seedDeliveryWorld> & {
	owner: ActorContext;
	delivered(qty?: number, at?: Date): number;        // delivered without cash; `at` rewrites delivered_at
};
```

- [ ] **Step 1: Хелпер мира** `tests/unit/helpers/crm-reports.ts`

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '../../../src/lib/server/db/client';
import { requests } from '../../../src/lib/server/db/schema';
import { RequestTransitionService } from '../../../src/lib/server/request/request-transition.service';
import { seedDeliveryWorld } from './crm-delivery';

/** The delivery world of C6 seen by the owner: reports read what the crew has done. */
export function seedReportWorld(db: Db) {
	const base = seedDeliveryWorld(db);

	/** A counterparty request handed over without cash; `at` moves the delivery into a period. */
	function delivered(qty = 2, at?: Date): number {
		const id = base.assembled(qty);
		const line = base.lineOf(id);
		base.delivery().load({ itemId: line.itemId, qty: line.qty });
		new RequestTransitionService(base.actors.driver).deliver(id, false);
		if (at) db.update(requests).set({ deliveredAt: at }).where(eq(requests.id, id)).run();
		return id;
	}

	return { ...base, owner: base.actors.owner, delivered };
}
```

- [ ] **Step 2: Падающий тест** `tests/unit/crm-reports-sales.spec.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { SalesReportService } from '../../src/lib/server/crm-reports/sales-report.service';
import { salesReportSchema } from '../../src/lib/validation/crm-reports';
import { migratedDatabase } from './helpers/db';
import { seedReportWorld } from './helpers/crm-reports';
import { resetRequests } from './helpers/portal-requests';
import { totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { owner, actors, delivered, inWork, toStock, world } = seedReportWorld(db);
const TZ = 'Europe/Moscow';
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };
const at = (iso: string) => new Date(iso);
const report = (patch: Record<string, string> = {}) =>
	new SalesReportService(owner, undefined, TZ).report(salesReportSchema.parse({ ...OCTOBER, ...patch }));

beforeEach(() => resetRequests(db));

describe('sales report (C13, tech.md v1.51)', () => {
	it('counts delivered counterparty requests by the day of delivery in the workshop zone', () => {
		const inside = delivered(2, at('2026-10-31T20:30:00Z'));   // 23:30 Moscow on the 31st
		delivered(1, at('2026-10-31T21:10:00Z'));                  // 00:10 Moscow on November 1st
		const stock = delivered(3, at('2026-10-10T09:00:00Z'));
		toStock(stock);
		inWork(5);

		const result = report();

		expect(result.totals).toMatchObject({ requestCount: 1, qty: 2, totalMinor: totalOf(inside) });
		expect(result.group === 'counterparty' && result.rows).toEqual([
			expect.objectContaining({ counterpartyId: world.cpId, requestCount: 1, totalMinor: totalOf(inside) })
		]);
	});

	it('agrees between the three groupings', () => {
		delivered(2, at('2026-10-03T09:00:00Z'));
		delivered(1, at('2026-10-20T09:00:00Z'));

		const byCp = report();
		const byModel = report({ group: 'model' });
		const byPeriod = report({ group: 'period', bucket: 'week' });

		expect(byModel.totals).toEqual(byCp.totals);
		expect(byPeriod.totals).toEqual(byCp.totals);
		const sum = (rows: readonly { totalMinor: number }[]) => rows.reduce((s, r) => s + r.totalMinor, 0);
		if (byCp.group !== 'counterparty' || byModel.group !== 'model' || byPeriod.group !== 'period') throw new Error('group');
		expect(sum(byCp.rows)).toBe(byCp.totals.totalMinor);
		expect(sum(byPeriod.rows)).toBe(byCp.totals.totalMinor);
		expect(byModel.rows.reduce((s, r) => s + r.linesTotalMinor, 0)).toBe(byCp.totals.itemsTotalMinor);
		expect(byModel.rows.reduce((s, r) => s + r.qty, 0)).toBe(byCp.totals.qty);
		// Every week of the range is a row, an empty one too: the owner reads the gaps as well.
		expect(byPeriod.rows.map((r) => r.bucketFrom)).toEqual(['2026-10-01', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
	});

	it('narrows to one counterparty', () => {
		delivered(2, at('2026-10-03T09:00:00Z'));
		expect(report({ counterpartyId: String(world.otherCpId) }).totals.requestCount).toBe(0);
		expect(report({ counterpartyId: String(world.cpId) }).totals.requestCount).toBe(1);
	});

	it('answers an empty period with zeros', () => {
		expect(report().totals).toEqual({ requestCount: 0, qty: 0, itemsTotalMinor: 0, discountMinor: 0, totalMinor: 0, paidMinor: 0 });
		expect(report({ group: 'model' }).rows).toEqual([]);
	});

	it('is closed to the manager', () => {
		expect(() => new SalesReportService(actors.manager)).toThrow(ForbiddenError);
	});
});
```

- [ ] **Step 3:** запуск теста. Ожидание: FAIL, сервиса нет.

- [ ] **Step 4: `report-base.service.ts`**

```ts
import { PolicyService } from '../auth/policy';
import { ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { presetRange, reportWindow, type ReportRange, type ReportWindow } from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';
import { isoDay } from '$lib/utils/format';

/**
 * Reports of C13 (tech.md v1.51): only the owner reads them. Every report turns its dates into one
 * half-open window of `org.timezone` here, so two reports never cut a day differently.
 */
export abstract class ReportBaseService extends BaseService {
	protected constructor(
		ctx: ActorContext,
		protected readonly timeZone: string,
		protected readonly now: () => Date
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'reports.read'), 'reports.read');
	}

	today(): string {
		return isoDay(this.now().toISOString(), this.timeZone);
	}

	/** The current calendar month up to today: what a report opens with. */
	defaultRange(): ReportRange {
		return presetRange('month', this.today());
	}

	/** @throws ValidationError for dates the calendar does not have. */
	protected window(range: ReportRange): ReportWindow {
		const window = reportWindow(range, this.timeZone);
		if (window === null) throw new ValidationError('Выберите даты периода', { field: 'from' });
		return window;
	}
}
```

- [ ] **Step 5: `sales-report.repository.ts`**

```ts
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { counterparties, productVariants, products, requestItems, requests } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import type { RequestStatus } from '$lib/types/request';

/** A sale is a counterparty request that reached the door (tech.md v1.51). */
export const SALE_STATUSES: readonly RequestStatus[] = ['delivered', 'awaiting_payment', 'paid'];

export interface SaleRow {
	readonly counterpartyId: number;
	readonly counterpartyName: string;
	readonly deliveredAt: Date;
	readonly qty: number;
	readonly itemsTotalMinor: number;
	readonly discountMinor: number;
	readonly totalMinor: number;
	readonly paidMinor: number;
}

export interface ModelSaleRow {
	readonly modelId: number;
	readonly title: string;
	readonly requestCount: number;
	readonly qty: number;
	readonly linesTotalMinor: number;
}

const QTY = sql<number>`coalesce((select sum(i.qty) from request_items i where i.request_id = ${requests.id}), 0)`;

export class SalesReportRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	private sold(window: ReportWindow, counterpartyId: number | null) {
		return and(
			eq(requests.isStockRequest, false),
			inArray(requests.status, [...SALE_STATUSES]),
			gte(requests.deliveredAt, window.from),
			lt(requests.deliveredAt, window.to),
			counterpartyId === null ? undefined : eq(requests.counterpartyId, counterpartyId)
		);
	}

	/** One row per sold request: the service folds them by counterparty and by bucket. */
	sales(window: ReportWindow, counterpartyId: number | null): SaleRow[] {
		const rows = this.db()
			.select({
				counterpartyId: requests.counterpartyId,
				counterpartyName: counterparties.name,
				deliveredAt: requests.deliveredAt,
				qty: QTY,
				itemsTotalMinor: requests.itemsTotalMinor,
				discountMinor: requests.discountMinor,
				totalMinor: requests.totalMinor,
				paidMinor: requests.paidMinor
			})
			.from(requests)
			.innerJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(this.sold(window, counterpartyId))
			.all();
		return rows.flatMap((row) =>
			row.counterpartyId === null || row.deliveredAt === null
				? []
				: [{ ...row, counterpartyId: row.counterpartyId, deliveredAt: row.deliveredAt }]
		);
	}

	/** Lines of the sold requests by model, best seller first. */
	byModel(window: ReportWindow, counterpartyId: number | null): ModelSaleRow[] {
		const total = sql<number>`coalesce(sum(${requestItems.lineTotalMinor}), 0)`;
		return this.db()
			.select({
				modelId: products.id,
				title: products.title,
				requestCount: sql<number>`count(distinct ${requests.id})`,
				qty: sql<number>`coalesce(sum(${requestItems.qty}), 0)`,
				linesTotalMinor: total
			})
			.from(requestItems)
			.innerJoin(requests, eq(requests.id, requestItems.requestId))
			.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(this.sold(window, counterpartyId))
			.groupBy(products.id)
			.orderBy(desc(total), products.title)
			.all();
	}
}
```

- [ ] **Step 6: `sales-report.service.ts`**

```ts
import { OrgService } from '../settings/org.service';
import { ReportBaseService } from './report-base.service';
import { SalesReportRepository, type SaleRow } from './sales-report.repository';
import { bucketOf, bucketsOf, type ReportRange } from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';
import type {
	SalesBucket, SalesByCounterpartyRowDto, SalesByModelRowDto, SalesByPeriodRowDto,
	SalesReportDto, SalesTotalsDto
} from '$lib/types/crm-reports';
import { isoDay } from '$lib/utils/format';
import type { SalesReportInput } from '$lib/validation/crm-reports';

const ZERO: SalesTotalsDto = {
	requestCount: 0, qty: 0, itemsTotalMinor: 0, discountMinor: 0, totalMinor: 0, paidMinor: 0
};

function add(sum: SalesTotalsDto, row: SaleRow): SalesTotalsDto {
	return {
		requestCount: sum.requestCount + 1,
		qty: sum.qty + row.qty,
		itemsTotalMinor: sum.itemsTotalMinor + row.itemsTotalMinor,
		discountMinor: sum.discountMinor + row.discountMinor,
		totalMinor: sum.totalMinor + row.totalMinor,
		paidMinor: sum.paidMinor + row.paidMinor
	};
}

/** Sales by counterparty, model and period (C13). All three read one set of sold requests. */
export class SalesReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: SalesReportRepository = new SalesReportRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(input: SalesReportInput): SalesReportDto {
		const range = { from: input.from, to: input.to };
		const window = this.window(range);
		const sales = this.repo.sales(window, input.counterpartyId);
		const head = { range, counterpartyId: input.counterpartyId, totals: sales.reduce(add, ZERO) };
		switch (input.group) {
			case 'counterparty':
				return { ...head, group: 'counterparty', rows: this.byCounterparty(sales) };
			case 'model':
				return { ...head, group: 'model', rows: this.repo.byModel(window, input.counterpartyId) };
			case 'period':
				return { ...head, group: 'period', bucket: input.bucket, rows: this.byPeriod(sales, range, input.bucket) };
		}
	}

	totals(range: ReportRange): SalesTotalsDto {
		return this.repo.sales(this.window(range), null).reduce(add, ZERO);
	}

	top(range: ReportRange, limit: number) {
		const window = this.window(range);
		return {
			counterparties: this.byCounterparty(this.repo.sales(window, null)).slice(0, limit),
			models: this.repo.byModel(window, null).slice(0, limit) satisfies SalesByModelRowDto[]
		};
	}

	private byCounterparty(sales: readonly SaleRow[]): SalesByCounterpartyRowDto[] {
		const rows = new Map<number, SalesByCounterpartyRowDto>();
		for (const sale of sales) {
			const seen = rows.get(sale.counterpartyId) ?? {
				...ZERO, counterpartyId: sale.counterpartyId, title: sale.counterpartyName
			};
			rows.set(sale.counterpartyId, { ...seen, ...add(seen, sale) });
		}
		return [...rows.values()].sort(
			(a, b) => b.totalMinor - a.totalMinor || a.title.localeCompare(b.title, 'ru')
		);
	}

	private byPeriod(sales: readonly SaleRow[], range: ReportRange, bucket: SalesBucket): SalesByPeriodRowDto[] {
		const sums = new Map<string, SalesTotalsDto>();
		for (const sale of sales) {
			const day = isoDay(sale.deliveredAt.toISOString(), this.timeZone);
			const key = bucketOf(day, bucket, range).from;
			sums.set(key, add(sums.get(key) ?? ZERO, sale));
		}
		return bucketsOf(range, bucket).map((b) => ({
			bucketFrom: b.from, bucketTo: b.to, ...(sums.get(b.from) ?? ZERO)
		}));
	}
}
```

`add` принимает `SalesTotalsDto`, а в `byCounterparty` получает строку с лишними полями; если строгий режим ругается, вынести суммы строки отдельным объектом. Проверить на шаге 7.

- [ ] **Step 7:** `pnpm vitest run tests/unit/crm-reports-sales.spec.ts && pnpm check`. Ожидание: PASS. Если тест «agrees between the three groupings» падает на равенстве `linesTotalMinor` и `itemsTotalMinor`, значит сумма строк хранится без надбавок опций: это находка для владельца, остановиться и показать цифры, спеку не править молча.

- [ ] **Step 8: Commit** `feat(crm): report sales by counterparty, model and period`.

---

### Task 6: Оборотная ведомость склада

**Files:**
- Create: `src/lib/server/crm-reports/stock-turnover.repository.ts`, `stock-turnover.service.ts`
- Test: `tests/unit/crm-reports-stock.spec.ts`

**Interfaces:**
- Consumes: `closingQty`, `turnoverDays` (задача 3), `ReportBaseService` (задача 5).
- Produces: `class StockTurnoverService { constructor(ctx, repo?, timeZone?, now?); report(input: StockTurnoverInput): StockTurnoverReportDto }`.

- [ ] **Step 1: Падающий тест**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { stockMoves } from '../../src/lib/server/db/schema';
import { StockTurnoverService } from '../../src/lib/server/crm-reports/stock-turnover.service';
import { stockTurnoverSchema } from '../../src/lib/validation/crm-reports';
import { migratedDatabase } from './helpers/db';
import { seedReportWorld } from './helpers/crm-reports';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { owner, assembled, produce, delivery, lineOf } = seedReportWorld(db);
const TZ = 'Europe/Moscow';
const report = (from: string, to: string) =>
	new StockTurnoverService(owner, undefined, TZ).report(stockTurnoverSchema.parse({ from, to }));
const today = () => new Date().toISOString().slice(0, 10);
/** Moves every move of the shelf to one instant: the test owns the calendar. */
const stamp = (iso: string) => db.update(stockMoves).set({ occurredAt: new Date(iso) }).run();

beforeEach(() => {
	resetRequests(db);
	db.delete(stockMoves).run();
});

describe('stock turnover report (C13)', () => {
	it('splits the shelf into opening, income, outcome and closing', () => {
		produce(10);
		stamp('2026-09-15T09:00:00Z');
		const id = assembled(4);                       // makes 4 more and holds them for the request
		const line = lineOf(id);
		delivery().load({ itemId: line.itemId, qty: 4 });

		const [row] = report(today(), today()).rows;

		expect(row).toMatchObject({ openingQty: 10, incomeQty: 4, outcomeQty: 4, closingQty: 10, shippedQty: 4 });
		// Average shelf 10, one day, 4 shipped: 10 * 1 / 4 rounds to 3 days.
		expect(row?.turnoverDays).toBe(3);
	});

	it('takes a loading the driver took back out of the shipped pieces', () => {
		const id = assembled(4);
		const line = lineOf(id);
		delivery().load({ itemId: line.itemId, qty: 4 });
		delivery().unload({ itemId: line.itemId });

		const [row] = report(today(), today()).rows;

		expect(row).toMatchObject({ shippedQty: 0, closingQty: 4, turnoverDays: null });
	});

	it('lists only positions that had a shelf or a move, and nothing for an empty period', () => {
		produce(3);
		expect(report('2020-01-01', '2020-01-31').rows).toEqual([]);
		expect(report(today(), today()).rows).toHaveLength(1);
	});
});
```

Имя метода «Снять» (`unload` здесь) сверить с `src/lib/server/crm-delivery/delivery.service.ts` и подставить настоящее.

- [ ] **Step 2:** запуск. Ожидание: FAIL.

- [ ] **Step 3: `stock-turnover.repository.ts`**

```ts
import { and, eq, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { BaseRepository } from '../core/repository';
import { dictItems, options, stockItems, stockMoves } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import type { StockKind } from '$lib/types/crm-stock';

export interface TurnoverRow {
	readonly stockItemId: number;
	readonly optionId: number | null;
	readonly code: string;
	readonly title: string;
	readonly optionTitle: string | null;
	readonly unitTitle: string;
	readonly opening: number;
	readonly income: number;
	readonly outcome: number;
	readonly shipped: number;
	readonly movesInWindow: number;
}

/** The moves of a position folded into one row of the turnover sheet (C13). */
export class StockTurnoverRepository extends BaseRepository<typeof stockMoves> {
	constructor() {
		super(stockMoves);
	}

	rows(window: ReportWindow, kind: StockKind | null): TurnoverRow[] {
		// The reversed move tells a taken-back loading from any other reversal.
		const undone = alias(stockMoves, 'undone');
		const inWindow = sql`${stockMoves.occurredAt} >= ${sql.param(window.from, stockMoves.occurredAt)}`;
		const sumIf = (when: ReturnType<typeof sql>, value: ReturnType<typeof sql>) =>
			sql<number>`coalesce(sum(case when ${when} then ${value} else 0 end), 0)`;
		const shipment = sql`(${stockMoves.type} = 'shipment' or ${undone.type} = 'shipment')`;
		return this.db()
			.select({
				stockItemId: stockMoves.stockItemId,
				optionId: stockMoves.optionId,
				code: stockItems.code,
				title: stockItems.title,
				optionTitle: options.title,
				unitTitle: dictItems.title,
				opening: sumIf(sql`not ${inWindow}`, sql`${stockMoves.qty}`),
				income: sumIf(sql`${inWindow} and ${stockMoves.qty} > 0`, sql`${stockMoves.qty}`),
				outcome: sumIf(sql`${inWindow} and ${stockMoves.qty} < 0`, sql`-${stockMoves.qty}`),
				shipped: sumIf(sql`${inWindow} and ${shipment}`, sql`-${stockMoves.qty}`),
				movesInWindow: sumIf(inWindow, sql`1`)
			})
			.from(stockMoves)
			.innerJoin(stockItems, eq(stockItems.id, stockMoves.stockItemId))
			.innerJoin(dictItems, eq(dictItems.id, stockItems.unitId))
			.leftJoin(options, eq(options.id, stockMoves.optionId))
			.leftJoin(undone, eq(undone.id, stockMoves.reversalOfId))
			.where(and(lt(stockMoves.occurredAt, window.to), kind === null ? undefined : eq(stockItems.kind, kind)))
			.groupBy(stockMoves.stockItemId, stockMoves.optionId)
			.orderBy(stockItems.title, options.title)
			.all();
	}
}
```

- [ ] **Step 4: `stock-turnover.service.ts`**

```ts
import { OrgService } from '../settings/org.service';
import { ReportBaseService } from './report-base.service';
import { StockTurnoverRepository } from './stock-turnover.repository';
import { closingQty, turnoverDays } from '$lib/domain/stock/turnover';
import type { ActorContext } from '$lib/types/actor';
import type { StockTurnoverReportDto } from '$lib/types/crm-reports';
import type { StockTurnoverInput } from '$lib/validation/crm-reports';

/** The turnover sheet of the warehouse in pieces: there is no money value of a shelf (v1.51). */
export class StockTurnoverService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: StockTurnoverRepository = new StockTurnoverRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(input: StockTurnoverInput): StockTurnoverReportDto {
		const range = { from: input.from, to: input.to };
		const window = this.window(range);
		const rows = this.repo
			.rows(window, input.kind)
			// A position that neither stood on the shelf nor moved has nothing to show.
			.filter((row) => row.opening !== 0 || row.movesInWindow > 0)
			.map(({ opening, income, outcome, shipped, movesInWindow: _moves, ...position }) => ({
				...position,
				openingQty: opening,
				incomeQty: income,
				outcomeQty: outcome,
				closingQty: closingQty({ opening, income, outcome, shipped }),
				shippedQty: shipped,
				turnoverDays: turnoverDays({ opening, income, outcome, shipped }, window.days)
			}));
		return { range, kind: input.kind, rows };
	}
}
```

Если линтер запрещает `_moves`, собрать объект явным перечислением полей.

- [ ] **Step 5:** `pnpm vitest run tests/unit/crm-reports-stock.spec.ts`. Ожидание: PASS. Если «Снять» пишет движение не типа `reversal` с `reversalOfId`, а иначе, остановиться: правило «отгружено» в спеке опирается на `reversal_of_id`.

- [ ] **Step 6: Commit** `feat(crm): report stock turnover in pieces`.

---

### Task 7: Воронка и потерянные заявки

**Files:**
- Create: `src/lib/server/crm-reports/funnel-report.repository.ts`, `funnel-report.service.ts`, `lost-report.repository.ts`, `lost-report.service.ts`
- Test: `tests/unit/crm-reports-funnel.spec.ts`, `tests/unit/crm-reports-lost.spec.ts`

**Interfaces:**
- Produces:

```ts
export class FunnelReportService { report(range: ReportRangeInput): FunnelReportDto }
export class LostReportService {
	report(input: LostReportInput, query: ListQuery<unknown>): LostReportDto;
	exportRows(input: LostReportInput): LostRequestRowDto[];   // up to LOST_EXPORT_LIMIT = 10_000 rows
}
```

- [ ] **Step 1: Падающие тесты**

```ts
// tests/unit/crm-reports-funnel.spec.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { FunnelReportService } from '../../src/lib/server/crm-reports/funnel-report.service';
import { migratedDatabase } from './helpers/db';
import { seedReportWorld } from './helpers/crm-reports';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { owner, inWork, assembled, delivered, toStock } = seedReportWorld(db);
const today = new Date().toISOString().slice(0, 10);
const report = (from = today, to = today) => new FunnelReportService(owner).report({ from, to });

beforeEach(() => resetRequests(db));

describe('request funnel (C13)', () => {
	it('counts how far the requests sent in the period got', () => {
		inWork(1);
		assembled(1);
		delivered(1);
		toStock(inWork(1));

		const result = report();

		expect(result.stages.map((s) => [s.stage, s.count])).toEqual([
			['new', 3], ['in_work', 3], ['ready', 2], ['delivered', 1], ['paid', 0]
		]);
		expect(result.stages[2]).toMatchObject({ shareOfPreviousBp: 6667, shareOfFirstBp: 6667 });
	});

	it('answers an empty period with zero stages and no shares', () => {
		const result = report('2020-01-01', '2020-01-31');
		expect(result.stages.every((s) => s.count === 0 && s.shareOfFirstBp === null)).toBe(true);
		expect(result).toMatchObject({ cancelledCount: 0, rejectedCount: 0 });
	});
});
```

```ts
// tests/unit/crm-reports-lost.spec.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { LostReportService } from '../../src/lib/server/crm-reports/lost-report.service';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { lostReportSchema } from '../../src/lib/validation/crm-reports';
import { migratedDatabase } from './helpers/db';
import { seedCharityWorld } from './helpers/charity';
import { insertUser } from './helpers/db';
import { crmActor, resetRequests } from './helpers/portal-requests';
import { dictId } from './helpers/crm-stock';
import { move, totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { actors, sent } = seedCharityWorld(db);
const owner = crmActor('owner', insertUser({ email: 'own@lost.example', role: 'owner', counterpartyId: null }));
const today = new Date().toISOString().slice(0, 10);
const report = (patch: Record<string, string> = {}) =>
	new LostReportService(owner).report(
		lostReportSchema.parse({ from: today, to: today, ...patch }),
		normalizeListQuery({})
	);

beforeEach(() => resetRequests(db));

describe('cancelled and rejected requests (C13)', () => {
	it('lists the request with who lost it, why and for how much', () => {
		const cancelled = sent();
		move(actors.admin, cancelled, 'cancelled');
		const rejected = sent();
		const reasonId = dictId(db, 'refusal_reason', 'no_capacity');
		move(actors.manager, rejected, 'rejected', { reasonId, comment: 'Нет материала' });

		const result = report();

		expect(result).toMatchObject({ cancelledCount: 1, rejectedCount: 1, totalMinor: totalOf(cancelled) + totalOf(rejected) });
		expect(result.page.rows).toEqual(expect.arrayContaining([
			expect.objectContaining({ requestId: rejected, status: 'rejected', comment: 'Нет материала', totalMinor: totalOf(rejected) }),
			expect.objectContaining({ requestId: cancelled, status: 'cancelled', reasonTitle: null })
		]));
		expect(result.reasons.find((r) => r.reasonId === null)).toMatchObject({ title: 'Без причины', count: 1 });
		expect(report({ status: 'rejected' }).page.total).toBe(1);
	});

	it('is empty for a period without losses', () => {
		expect(report({ from: '2020-01-01', to: '2020-01-31' })).toMatchObject({
			cancelledCount: 0, rejectedCount: 0, totalMinor: 0, reasons: []
		});
	});
});
```

Код причины отказа (`no_capacity`) и сигнатуру `move` с причиной сверить с `tests/unit/helpers/transitions.ts` и сидом справочника `refusal_reason`, подставить существующие.

- [ ] **Step 2:** запуск обоих файлов. Ожидание: FAIL.

- [ ] **Step 3: Воронка**

```ts
// funnel-report.repository.ts
import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { requests } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';

export interface FunnelCounts {
	readonly new: number; readonly in_work: number; readonly ready: number;
	readonly delivered: number; readonly paid: number;
	readonly cancelled: number; readonly rejected: number;
}

const inStatus = (status: 'cancelled' | 'rejected') =>
	sql<number>`coalesce(sum(case when ${requests.status} = ${status} then 1 else 0 end), 0)`;

export class FunnelReportRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	/** The cohort: counterparty requests sent inside the window, wherever they stand now. */
	counts(window: ReportWindow): FunnelCounts {
		const [row] = this.db()
			.select({
				new: count(),
				// count(column) skips nulls: a stamp is set once the request reaches the stage.
				in_work: count(requests.acceptedAt),
				ready: count(requests.readyAt),
				delivered: count(requests.deliveredAt),
				paid: count(requests.paidAt),
				cancelled: inStatus('cancelled'),
				rejected: inStatus('rejected')
			})
			.from(requests)
			.where(and(
				eq(requests.isStockRequest, false),
				gte(requests.submittedAt, window.from),
				lt(requests.submittedAt, window.to)
			))
			.all();
		return row ?? { new: 0, in_work: 0, ready: 0, delivered: 0, paid: 0, cancelled: 0, rejected: 0 };
	}
}
```

```ts
// funnel-report.service.ts
import { OrgService } from '../settings/org.service';
import { FunnelReportRepository } from './funnel-report.repository';
import { ReportBaseService } from './report-base.service';
import { funnelShares } from '$lib/domain/report/funnel';
import type { ActorContext } from '$lib/types/actor';
import { FUNNEL_STAGES, type FunnelReportDto } from '$lib/types/crm-reports';
import type { ReportRangeInput } from '$lib/validation/crm-reports';

/** How far the requests sent in a period got (C13): a cohort, not a cut by transition dates. */
export class FunnelReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: FunnelReportRepository = new FunnelReportRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(range: ReportRangeInput): FunnelReportDto {
		const counts = this.repo.counts(this.window(range));
		const shares = funnelShares(FUNNEL_STAGES.map((stage) => counts[stage]));
		return {
			range: { from: range.from, to: range.to },
			stages: FUNNEL_STAGES.map((stage, index) => ({
				stage,
				count: counts[stage],
				shareOfPreviousBp: shares[index]?.shareOfPreviousBp ?? null,
				shareOfFirstBp: shares[index]?.shareOfFirstBp ?? null
			})),
			cancelledCount: counts.cancelled,
			rejectedCount: counts.rejected
		};
	}
}
```

- [ ] **Step 4: Потерянные**

```ts
// lost-report.repository.ts
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { counterparties, dictItems, requestStatusHistory, requests } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import { LOST_STATUSES, type LostStatus } from '$lib/types/crm-reports';
import type { ListQuery } from '$lib/types/list';

export interface LostRow {
	readonly requestId: number; readonly number: string; readonly status: LostStatus;
	readonly at: Date;
	readonly counterpartyId: number | null; readonly counterpartyTitle: string | null;
	readonly reasonTitle: string | null; readonly comment: string | null;
	readonly totalMinor: number;
}
export interface LostReasonRow { readonly reasonId: number | null; readonly title: string | null; readonly status: LostStatus; readonly count: number; readonly totalMinor: number }

/** Terminal transitions of the period with the request each one closed (C13). */
export class LostReportRepository extends BaseRepository<typeof requestStatusHistory> {
	constructor() {
		super(requestStatusHistory);
	}

	private lost(window: ReportWindow, status: LostStatus | null) {
		return and(
			inArray(requestStatusHistory.toStatus, status === null ? [...LOST_STATUSES] : [status]),
			gte(requestStatusHistory.createdAt, window.from),
			lt(requestStatusHistory.createdAt, window.to)
		);
	}

	rows(window: ReportWindow, status: LostStatus | null, query: ListQuery<unknown>): LostRow[] {
		return this.db()
			.select({
				requestId: requests.id,
				number: requests.number,
				status: sql<LostStatus>`${requestStatusHistory.toStatus}`,
				at: requestStatusHistory.createdAt,
				counterpartyId: requests.counterpartyId,
				counterpartyTitle: counterparties.name,
				reasonTitle: dictItems.title,
				comment: requestStatusHistory.comment,
				totalMinor: requests.totalMinor
			})
			.from(requestStatusHistory)
			.innerJoin(requests, eq(requests.id, requestStatusHistory.requestId))
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.leftJoin(dictItems, eq(dictItems.id, requestStatusHistory.reasonId))
			.where(this.lost(window, status))
			.orderBy(desc(requestStatusHistory.createdAt), desc(requestStatusHistory.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
	}

	total(window: ReportWindow, status: LostStatus | null): number {
		const [row] = this.db().select({ total: countExpression }).from(requestStatusHistory)
			.where(this.lost(window, status)).all();
		return row?.total ?? 0;
	}

	/** One row per reason and status: the service folds them into the summary and the counters. */
	reasons(window: ReportWindow, status: LostStatus | null): LostReasonRow[] {
		return this.db()
			.select({
				reasonId: requestStatusHistory.reasonId,
				title: dictItems.title,
				status: sql<LostStatus>`${requestStatusHistory.toStatus}`,
				count: countExpression,
				totalMinor: sql<number>`coalesce(sum(${requests.totalMinor}), 0)`
			})
			.from(requestStatusHistory)
			.innerJoin(requests, eq(requests.id, requestStatusHistory.requestId))
			.leftJoin(dictItems, eq(dictItems.id, requestStatusHistory.reasonId))
			.where(this.lost(window, status))
			.groupBy(requestStatusHistory.reasonId, requestStatusHistory.toStatus)
			.all();
	}
}
```

```ts
// lost-report.service.ts
import { normalizeListQuery } from '../core/list';
import { OrgService } from '../settings/org.service';
import { LostReportRepository, type LostRow } from './lost-report.repository';
import { ReportBaseService } from './report-base.service';
import type { ActorContext } from '$lib/types/actor';
import type { LostReasonRowDto, LostReportDto, LostRequestRowDto } from '$lib/types/crm-reports';
import type { ListQuery } from '$lib/types/list';
import type { LostReportInput } from '$lib/validation/crm-reports';

/** Rows one sheet may hold: a workshop loses far fewer requests in a year. */
export const LOST_EXPORT_LIMIT = 10_000;
const NO_REASON = 'Без причины';

const toDto = (row: LostRow): LostRequestRowDto => ({ ...row, at: row.at.toISOString() });

/** Cancelled and rejected requests by the day they were lost (C13). */
export class LostReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: LostReportRepository = new LostReportRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(input: LostReportInput, query: ListQuery<unknown>): LostReportDto {
		const window = this.window(input);
		const grouped = this.repo.reasons(window, input.status);
		const reasons = new Map<number | null, LostReasonRowDto>();
		for (const row of grouped) {
			const seen = reasons.get(row.reasonId) ?? { reasonId: row.reasonId, title: row.title ?? NO_REASON, count: 0, totalMinor: 0 };
			reasons.set(row.reasonId, { ...seen, count: seen.count + row.count, totalMinor: seen.totalMinor + row.totalMinor });
		}
		const countOf = (status: string) => grouped.filter((r) => r.status === status).reduce((s, r) => s + r.count, 0);
		return {
			range: { from: input.from, to: input.to },
			status: input.status,
			cancelledCount: countOf('cancelled'),
			rejectedCount: countOf('rejected'),
			totalMinor: grouped.reduce((sum, row) => sum + row.totalMinor, 0),
			reasons: [...reasons.values()].sort((a, b) => b.count - a.count),
			page: {
				rows: this.repo.rows(window, input.status, query).map(toDto),
				total: this.repo.total(window, input.status),
				page: query.page,
				perPage: query.perPage
			}
		};
	}

	exportRows(input: LostReportInput): LostRequestRowDto[] {
		// The repository reads perPage as is: the registry clamp of 200 rows is not for a sheet.
		const query = { ...normalizeListQuery({}), perPage: LOST_EXPORT_LIMIT };
		return this.repo.rows(this.window(input), input.status, query).map(toDto);
	}
}
```

Форму `Page<T>` сверить с `src/lib/types/list.ts` и привести объект `page` к ней.

- [ ] **Step 5:** оба файла тестов. Ожидание: PASS.

- [ ] **Step 6: Commit** `feat(crm): report the funnel and lost requests`.

---

### Task 8: Фонд: отчёт, перечисление и сторно

**Files:**
- Create: `src/lib/server/crm-reports/charity-transfer.repository.ts`, `charity-transfer.service.ts`, `charity-report.service.ts`
- Test: `tests/unit/crm-reports-charity.spec.ts`

**Interfaces:**
- Consumes: `fundRemainderMinor`, `fitsRemainder`, `isTransferReversible` (задача 3); `CharityRepository.frozenRows`, `tallyCharity`, `countsTowardFund`.
- Produces:

```ts
export class CharityReportService {
	report(range: ReportRangeInput, query: ListQuery<unknown>): CharityReportDto;
	summary(range: ReportRange): { accruedInRangeMinor: number; remainderMinor: number };
}
export class CharityTransferService {          // asserts charity.manage in the constructor
	transfer(input: CharityTransferInput): number;             // id of the new row
	reverse(input: CharityTransferReverseInput): void;
}
```

- [ ] **Step 1: Падающий тест**

```ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharityRepository } from '../../src/lib/server/charity/charity.repository';
import { CharityTotalsRepository } from '../../src/lib/server/charity/charity-totals.repository';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { withTransaction } from '../../src/lib/server/core/tx';
import { CharityReportService } from '../../src/lib/server/crm-reports/charity-report.service';
import { CharityTransferService } from '../../src/lib/server/crm-reports/charity-transfer.service';
import { auditLog, charityTransfers } from '../../src/lib/server/db/schema';
import { tallyCharity } from '../../src/lib/domain/charity/rate';
import { charityTransferReverseSchema, charityTransferSchema } from '../../src/lib/validation/crm-reports';
import { charityOf } from './helpers/charity';
import { seedReportWorld } from './helpers/crm-reports';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { owner, actors, delivered, toStock, world } = seedReportWorld(db);
const TZ = 'Europe/Moscow';
const today = new Date().toISOString().slice(0, 10);
const report = (from = today, to = today) =>
	new CharityReportService(owner, undefined, undefined, TZ).report({ from, to }, normalizeListQuery({}));
const transfer = (amountMinor: number, patch: Record<string, string> = {}) =>
	new CharityTransferService(owner).transfer(
		charityTransferSchema.parse({ amountMinor: String(amountMinor), transferredOn: today, ...patch })
	);
const reverse = (transferId: number, comment = 'Не тот счёт') =>
	new CharityTransferService(owner).reverse(charityTransferReverseSchema.parse({ transferId: String(transferId), comment }));
const audit = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action)).all();

beforeEach(() => {
	db.delete(charityTransfers).run();
	resetRequests(db);
});

describe('fund report and transfers (C13, tech.md v1.51)', () => {
	it('shows the same accrued total the banner is rebuilt from', () => {
		const a = delivered(2);
		delivered(1);
		toStock(delivered(1));
		const banner = withTransaction((tx) => {
			const tally = tallyCharity(new CharityRepository().frozenRows({ kind: 'all' }, tx), { kind: 'all' }, TZ);
			new CharityTotalsRepository().put('all', tally, tx);
			return tally;
		});

		const result = report();

		expect(result.accruedAllMinor).toBe(banner.amountMinor);
		expect(result.accruedAllMinor).toBe(new CharityTotalsRepository().findByScope('all')?.amountMinor);
		expect(result.accruedInRangeMinor).toBe(result.accruedAllMinor);
		expect(result.accruals).toEqual([
			{ counterpartyId: world.cpId, title: expect.any(String), requestCount: 2, amountMinor: result.accruedAllMinor }
		]);
		expect(charityOf(db, a).amountMinor).toBeGreaterThan(0);
	});

	it('takes exactly the remainder and refuses a kopeck more', () => {
		delivered(2);
		const due = report().remainderMinor;

		expect(() => transfer(due + 1)).toThrow(ConflictError);
		const id = transfer(due, { documentRef: 'ПП 15' });

		expect(report()).toMatchObject({ transferredAllMinor: due, remainderMinor: 0, transferredInRangeMinor: due });
		expect(report().transfers.rows).toEqual([
			expect.objectContaining({ id, amountMinor: due, transferredOn: today, documentRef: 'ПП 15', reversalOfId: null, isReversed: false })
		]);
		expect(audit('charity.transfer')).toHaveLength(1);
	});

	it('gives the remainder back on a reversal and reverses a transfer once', () => {
		delivered(2);
		const due = report().remainderMinor;
		const id = transfer(due);

		reverse(id);

		expect(report()).toMatchObject({ transferredAllMinor: 0, remainderMinor: due, transferredInRangeMinor: 0 });
		const rows = report().transfers.rows;
		expect(rows).toHaveLength(2);
		expect(rows.find((r) => r.id === id)?.isReversed).toBe(true);
		const undo = rows.find((r) => r.reversalOfId === id);
		expect(undo).toMatchObject({ amountMinor: -due, comment: 'Не тот счёт' });
		expect(() => reverse(id)).toThrow(ConflictError);
		expect(() => reverse(undo?.id ?? 0)).toThrow(ConflictError);
		expect(audit('charity.transfer.reverse')).toHaveLength(1);
		expect(transfer(due)).toBeGreaterThan(id);
	});

	it('refuses a transfer dated tomorrow', () => {
		delivered(2);
		const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
		expect(() => transfer(100, { transferredOn: tomorrow })).toThrow(ValidationError);
	});

	it('shows zeros with nothing delivered and keeps the manager out', () => {
		expect(report()).toMatchObject({ accruedAllMinor: 0, transferredAllMinor: 0, remainderMinor: 0, accruals: [] });
		expect(() => new CharityReportService(actors.manager)).toThrow(ForbiddenError);
		expect(() => new CharityTransferService(actors.manager)).toThrow(ForbiddenError);
	});
});
```

- [ ] **Step 2:** запуск. Ожидание: FAIL.

- [ ] **Step 3: `charity-transfer.repository.ts`**

```ts
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { charityTransfers, counterparties, users } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import type { ListQuery } from '$lib/types/list';

export interface TransferRow {
	readonly id: number; readonly amountMinor: number; readonly transferredAt: Date;
	readonly documentRef: string | null; readonly comment: string | null;
	readonly createdByName: string; readonly createdAt: Date;
	readonly reversalOfId: number | null; readonly isReversed: boolean;
}
export interface NewTransfer {
	readonly amountMinor: number; readonly transferredAt: Date;
	readonly documentRef: string | null; readonly comment: string | null;
	readonly createdById: number; readonly reversalOfId?: number;
}

const IS_REVERSED = sql<number>`exists (select 1 from charity_transfers as undo where undo.reversal_of_id = ${charityTransfers.id})`;
const COLUMNS = {
	id: charityTransfers.id, amountMinor: charityTransfers.amountMinor,
	transferredAt: charityTransfers.transferredAt, documentRef: charityTransfers.documentRef,
	comment: charityTransfers.comment, createdByName: users.fullName,
	createdAt: charityTransfers.createdAt, reversalOfId: charityTransfers.reversalOfId,
	isReversed: IS_REVERSED.mapWith(Boolean)
};

/** Transfers to the fund: an append-only registry, a mistake is cancelled by a reversal row. */
export class CharityTransferRepository extends BaseRepository<typeof charityTransfers> {
	constructor() {
		super(charityTransfers);
	}

	private within(window: ReportWindow) {
		return and(gte(charityTransfers.transferredAt, window.from), lt(charityTransfers.transferredAt, window.to));
	}

	find(id: number, tx?: Tx): TransferRow | undefined {
		const [row] = this.db(tx).select(COLUMNS).from(charityTransfers)
			.innerJoin(users, eq(users.id, charityTransfers.createdById))
			.where(eq(charityTransfers.id, id)).all();
		return row;
	}

	/** Signed amounts of the whole registry: a reversal carries the negated amount. */
	amounts(tx?: Tx): number[] {
		return this.db(tx).select({ amount: charityTransfers.amountMinor }).from(charityTransfers).all()
			.map((row) => row.amount);
	}

	sumWithin(window: ReportWindow): number {
		const [row] = this.db()
			.select({ sum: sql<number>`coalesce(sum(${charityTransfers.amountMinor}), 0)` })
			.from(charityTransfers).where(this.within(window)).all();
		return row?.sum ?? 0;
	}

	page(window: ReportWindow, query: ListQuery<unknown>): { rows: TransferRow[]; total: number } {
		const rows = this.db().select(COLUMNS).from(charityTransfers)
			.innerJoin(users, eq(users.id, charityTransfers.createdById))
			.where(this.within(window))
			.orderBy(desc(charityTransfers.transferredAt), desc(charityTransfers.id))
			.limit(query.perPage).offset(offsetFor(query)).all();
		const [count] = this.db().select({ total: countExpression }).from(charityTransfers)
			.where(this.within(window)).all();
		return { rows, total: count?.total ?? 0 };
	}

	insert(transfer: NewTransfer, tx: Tx): number {
		const [row] = this.db(tx).insert(charityTransfers).values(transfer)
			.returning({ id: charityTransfers.id }).all();
		if (!row) throw new Error('failed to write a fund transfer');
		return row.id;
	}

	counterpartyNames(ids: readonly number[]): Map<number, string> {
		if (ids.length === 0) return new Map();
		return new Map(
			this.db().select({ id: counterparties.id, name: counterparties.name }).from(counterparties)
				.where(inArray(counterparties.id, [...ids])).all().map((row) => [row.id, row.name])
		);
	}
}
```

- [ ] **Step 4: `charity-transfer.service.ts`**

```ts
import { PolicyService } from '../auth/policy';
import { CharityRepository } from '../charity/charity.repository';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { OrgService } from '../settings/org.service';
import { CharityTransferRepository } from './charity-transfer.repository';
import { fitsRemainder, fundRemainderMinor, isTransferReversible } from '$lib/domain/charity/balance';
import { tallyCharity } from '$lib/domain/charity/rate';
import { startOfDayInZone } from '$lib/domain/time/zone';
import type { ActorContext } from '$lib/types/actor';
import type { CharityTransferInput, CharityTransferReverseInput } from '$lib/validation/crm-reports';

/**
 * The registry of transfers to the fund (C13, tech.md v1.51). A row is never edited: a mistake is
 * cancelled by a row of the opposite sign, and the workshop cannot send more than it has accrued.
 */
export class CharityTransferService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly transfers: CharityTransferRepository = new CharityTransferRepository(),
		private readonly accrued: CharityRepository = new CharityRepository(),
		private readonly timeZone: string = OrgService.timezone(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'charity.manage'), 'charity.manage');
	}

	/** @throws ValidationError for a date in the future, ConflictError for an amount above the rest. */
	transfer(input: CharityTransferInput): number {
		const transferredAt = this.transferredAt(input.transferredOn);
		return this.audited({ action: 'charity.transfer', entity: 'charity_transfers' }, (tx) => {
			// Read inside the write transaction: two transfers cannot both fit the same remainder.
			if (!fitsRemainder(this.remainder(tx), input.amountMinor)) {
				throw new ConflictError('Сумма больше остатка к перечислению');
			}
			const id = this.transfers.insert(
				{
					amountMinor: input.amountMinor, transferredAt,
					documentRef: input.documentRef, comment: input.comment, createdById: this.ctx.userId
				},
				tx
			);
			return { result: id, entityId: id, after: { amountMinor: input.amountMinor, transferredOn: input.transferredOn } };
		});
	}

	/** @throws NotFoundError for an unknown row, ConflictError for a reversal or a row already cancelled. */
	reverse(input: CharityTransferReverseInput): void {
		this.audited({ action: 'charity.transfer.reverse', entity: 'charity_transfers' }, (tx) => {
			const row = this.transfers.find(input.transferId, tx);
			if (!row) throw new NotFoundError('charity_transfer');
			if (!isTransferReversible(row)) throw new ConflictError('Это перечисление нельзя сторнировать');
			const id = this.transfers.insert(
				{
					amountMinor: -row.amountMinor, transferredAt: row.transferredAt,
					documentRef: row.documentRef, comment: input.comment,
					createdById: this.ctx.userId, reversalOfId: row.id
				},
				tx
			);
			return {
				result: undefined, entityId: id,
				before: { amountMinor: row.amountMinor },
				after: { reversalOfId: row.id, amountMinor: -row.amountMinor }
			};
		});
	}

	private remainder(tx: Tx): number {
		const all = { kind: 'all' } as const;
		const accrued = tallyCharity(this.accrued.frozenRows(all, tx), all, this.timeZone).amountMinor;
		return fundRemainderMinor(accrued, this.transfers.amounts(tx));
	}

	/** The day of the transfer in the workshop zone; money cannot leave tomorrow. */
	private transferredAt(isoDate: string): Date {
		const at = startOfDayInZone(isoDate, this.timeZone);
		if (at === null) throw new ValidationError('Выберите дату перечисления', { field: 'transferredOn' });
		if (at.getTime() > this.now().getTime()) {
			throw new ValidationError('Дата перечисления не может быть позже сегодняшней', { field: 'transferredOn' });
		}
		return at;
	}
}
```

- [ ] **Step 5: `charity-report.service.ts`**

```ts
import { PolicyService } from '../auth/policy';
import { CharityRepository } from '../charity/charity.repository';
import { OrgService } from '../settings/org.service';
import { CharityTransferRepository, type TransferRow } from './charity-transfer.repository';
import { ReportBaseService } from './report-base.service';
import { fundRemainderMinor } from '$lib/domain/charity/balance';
import { countsTowardFund, tallyCharity, type DeliveredCharityRow } from '$lib/domain/charity/rate';
import type { ReportRange, ReportWindow } from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';
import type { CharityAccrualRowDto, CharityReportDto, CharityTransferDto } from '$lib/types/crm-reports';
import type { ListQuery } from '$lib/types/list';
import { isoDay } from '$lib/utils/format';

const ALL = { kind: 'all' } as const;

/**
 * What the workshop owes the fund (C13). The accrued total is counted by the code that rebuilds
 * the banner, so the two numbers cannot drift apart.
 */
export class CharityReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly accrued: CharityRepository = new CharityRepository(),
		private readonly transfers: CharityTransferRepository = new CharityTransferRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(range: ReportRange, query: ListQuery<unknown>): CharityReportDto {
		const window = this.window(range);
		const rows = this.accrued.frozenRows(ALL);
		const accruedAllMinor = tallyCharity(rows, ALL, this.timeZone).amountMinor;
		const transferredAllMinor = this.transfers.amounts().reduce((sum, amount) => sum + amount, 0);
		const accruals = this.accruals(rows, window);
		const page = this.transfers.page(window, query);
		return {
			range: { from: range.from, to: range.to },
			accruedAllMinor,
			transferredAllMinor,
			remainderMinor: fundRemainderMinor(accruedAllMinor, [transferredAllMinor]),
			accruedInRangeMinor: accruals.reduce((sum, row) => sum + row.amountMinor, 0),
			transferredInRangeMinor: this.transfers.sumWithin(window),
			accruals,
			transfers: { rows: page.rows.map((row) => this.toDto(row)), total: page.total, page: query.page, perPage: query.perPage },
			canManage: PolicyService.can(this.ctx, 'charity.manage')
		};
	}

	summary(range: ReportRange): { accruedInRangeMinor: number; remainderMinor: number } {
		const rows = this.accrued.frozenRows(ALL);
		const accruedAll = tallyCharity(rows, ALL, this.timeZone).amountMinor;
		return {
			accruedInRangeMinor: this.accruals(rows, this.window(range)).reduce((sum, row) => sum + row.amountMinor, 0),
			remainderMinor: fundRemainderMinor(accruedAll, this.transfers.amounts())
		};
	}

	private accruals(rows: readonly DeliveredCharityRow[], window: ReportWindow): CharityAccrualRowDto[] {
		const sums = new Map<number, { requestCount: number; amountMinor: number }>();
		for (const row of rows) {
			const at = row.deliveredAt?.getTime();
			if (!countsTowardFund(row) || row.counterpartyId === null || at === undefined) continue;
			if (at < window.from.getTime() || at >= window.to.getTime()) continue;
			const seen = sums.get(row.counterpartyId) ?? { requestCount: 0, amountMinor: 0 };
			sums.set(row.counterpartyId, {
				requestCount: seen.requestCount + 1,
				amountMinor: seen.amountMinor + (row.charityAmountMinor ?? 0)
			});
		}
		const names = this.transfers.counterpartyNames([...sums.keys()]);
		return [...sums.entries()]
			.map(([counterpartyId, sum]) => ({ counterpartyId, title: names.get(counterpartyId) ?? '', ...sum }))
			.sort((a, b) => b.amountMinor - a.amountMinor);
	}

	private toDto(row: TransferRow): CharityTransferDto {
		const { transferredAt, createdAt, ...rest } = row;
		return {
			...rest,
			transferredOn: isoDay(transferredAt.toISOString(), this.timeZone),
			createdAt: createdAt.toISOString()
		};
	}
}
```

`counterpartyNames` живёт в репозитории перечислений рядом с единственным потребителем.

- [ ] **Step 6:** `pnpm vitest run tests/unit/crm-reports-charity.spec.ts`. Ожидание: PASS.

- [ ] **Step 7: Commit** `feat(crm): keep the registry of fund transfers`.

---

### Task 9: Дашборд

**Files:**
- Create: `src/lib/server/crm-reports/dashboard.repository.ts`, `dashboard.service.ts`
- Modify: `src/lib/server/counterparty/debt.repository.ts` (метод `total`)
- Test: `tests/unit/crm-reports-dashboard.spec.ts`

**Interfaces:**
- Consumes: `SalesReportService.totals/top`, `CharityReportService.summary`, `PayrollReportService.report`.
- Produces: `class DashboardService { constructor(ctx, ...); dashboard(range: ReportRangeInput): DashboardDto }`, `DebtRepository.total(tx?): number`.

- [ ] **Step 1: Падающий тест**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DashboardService } from '../../src/lib/server/crm-reports/dashboard.service';
import { seedReportWorld } from './helpers/crm-reports';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';
import { totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { owner, inWork, assembled, delivered, world } = seedReportWorld(db);
const today = new Date().toISOString().slice(0, 10);
const dashboard = (from = today, to = today) => new DashboardService(owner).dashboard({ from, to });

beforeEach(() => resetRequests(db));

describe('owner dashboard (C13)', () => {
	it('puts the period figures and the state of the workshop on one screen', () => {
		inWork(1);
		assembled(1);
		const sold = delivered(2);

		const result = dashboard();

		expect(result.sales).toMatchObject({ requestCount: 1, totalMinor: totalOf(sold) });
		expect(result.debtMinor).toBe(totalOf(sold));
		expect(result.statusCounts).toMatchObject({ new: 0, in_work: 1, ready: 1, awaiting_payment: 1, paid: 0 });
		expect(result.charityAccruedInRangeMinor).toBeGreaterThan(0);
		expect(result.charityRemainderMinor).toBe(result.charityAccruedInRangeMinor);
		expect(result.topCounterparties).toEqual([expect.objectContaining({ counterpartyId: world.cpId })]);
		expect(result.topModels).toHaveLength(1);
		expect(result.payrollAccruedMinor).toBe(0);
	});

	it('keeps the state of today when the period is empty', () => {
		inWork(1);
		const result = dashboard('2020-01-01', '2020-01-31');
		expect(result.sales.requestCount).toBe(0);
		expect(result.statusCounts.in_work).toBe(1);
		expect(result.topCounterparties).toEqual([]);
	});
});
```

- [ ] **Step 2:** запуск. Ожидание: FAIL.

- [ ] **Step 3: `DebtRepository.total`** рядом с `byCounterparty`:

```ts
	/** What all counterparties owe together: the tile of the owner's dashboard (C13). */
	total(tx?: Tx): number {
		const { paid, rest } = this.rest(tx);
		const [row] = this.db(tx)
			.select({ debtMinor: sql<number>`coalesce(sum(${rest}), 0)` })
			.from(requests)
			.leftJoin(paid, eq(paid.requestId, requests.id))
			.where(inArray(requests.status, [...DEBT_STATUSES]))
			.all();
		return row?.debtMinor ?? 0;
	}
```

- [ ] **Step 4: `dashboard.repository.ts`**

```ts
import { and, eq, ne, sql } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import { requests, stockItems } from '../db/schema';
import type { RequestStatus } from '$lib/types/request';

// The same rule the registry of the warehouse filters by (C8): a threshold of zero is no threshold.
const BELOW_THRESHOLD = sql`(${stockItems.minThreshold} > 0 and coalesce((select sum(m.qty) from stock_moves m where m.stock_item_id = ${stockItems.id}), 0) < ${stockItems.minThreshold})`;

/** The state of the workshop right now: it does not depend on the period of the dashboard. */
export class DashboardRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	statusCounts(): Map<RequestStatus, number> {
		return new Map(
			this.db().select({ status: requests.status, count: countExpression }).from(requests)
				.where(ne(requests.status, 'draft')).groupBy(requests.status).all()
				.map((row) => [row.status, row.count])
		);
	}

	belowThresholdCount(): number {
		const [row] = this.db().select({ count: countExpression }).from(stockItems)
			.where(and(eq(stockItems.isActive, true), BELOW_THRESHOLD)).all();
		return row?.count ?? 0;
	}
}
```

Правило порога теперь записано во второй раз (первое в `stock-item.repository.ts`). Экспортировать `BELOW_THRESHOLD` из `stock-item.repository.ts` и импортировать его здесь вместо копии.

- [ ] **Step 5: `dashboard.service.ts`**

```ts
import { DebtRepository } from '../counterparty/debt.repository';
import { PayrollReportService } from '../crm-payroll/payroll-report.service';
import { OrgService } from '../settings/org.service';
import { CharityReportService } from './charity-report.service';
import { DashboardRepository } from './dashboard.repository';
import { ReportBaseService } from './report-base.service';
import { SalesReportService } from './sales-report.service';
import type { ActorContext } from '$lib/types/actor';
import type { DashboardDto } from '$lib/types/crm-reports';
import { REQUEST_STATUSES } from '$lib/types/request';
import type { ReportRangeInput } from '$lib/validation/crm-reports';

const TOP = 5;

/** The owner's first screen of the reports (C13): every tile is a number of a report behind it. */
export class DashboardService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: DashboardRepository = new DashboardRepository(),
		private readonly debts: DebtRepository = new DebtRepository(),
		private readonly sales: SalesReportService = new SalesReportService(ctx),
		private readonly charity: CharityReportService = new CharityReportService(ctx),
		private readonly payroll: PayrollReportService = new PayrollReportService(ctx),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	dashboard(input: ReportRangeInput): DashboardDto {
		const range = { from: input.from, to: input.to };
		const counts = this.repo.statusCounts();
		const top = this.sales.top(range, TOP);
		const fund = this.charity.summary(range);
		const statusCounts = Object.fromEntries(
			REQUEST_STATUSES.filter((status) => status !== 'draft').map((status) => [status, counts.get(status) ?? 0])
		) as DashboardDto['statusCounts'];
		return {
			range,
			sales: this.sales.totals(range),
			debtMinor: this.debts.total(),
			statusCounts,
			payrollAccruedMinor: this.payroll.report(range).accruedTotalMinor,
			charityAccruedInRangeMinor: fund.accruedInRangeMinor,
			charityRemainderMinor: fund.remainderMinor,
			belowThresholdCount: this.repo.belowThresholdCount(),
			topCounterparties: top.counterparties,
			topModels: top.models
		};
	}
}
```

Приведение `as DashboardDto['statusCounts']` допустимо только здесь: `Object.fromEntries` теряет ключи. Если в проекте есть типизированный помощник для этого, взять его.

- [ ] **Step 6:** `pnpm vitest run tests/unit/crm-reports-dashboard.spec.ts && pnpm check`. Ожидание: PASS.

- [ ] **Step 7: Commit** `feat(crm): gather the owner dashboard`.

---

### Task 10: Выгрузки и серверная часть роутов

**Files:**
- Create: `src/lib/server/crm-reports/route.ts`, `report-export.service.ts`, `src/lib/crm/reports/labels.ts`
- Create: `src/routes/(crm)/crm/reports/+page.server.ts` и `+page.server.ts` плюс `export.xlsx/+server.ts` в `sales/`, `stock/`, `funnel/`, `lost/`, `charity/`
- Modify: `src/routes/(crm)/+layout.server.ts` (`can.reports`)
- Test: `tests/unit/crm-reports-export.spec.ts`

**Interfaces:**
- Consumes: сервисы задач 5–9, `xlsxResponse` из `$lib/server/crm-stock/route`, `formAction`, `rethrowAsHttp`, `parseListQuery`.
- Produces:

```ts
// route.ts
export function reportsActor(event: { readonly locals: App.Locals; readonly url: URL }): ActorContext;
export function loadReport<I extends ReportRange, R>(url: URL, schema: ZodType<I>, fallback: ReportRange, run: (input: I) => R):
	{ filters: Record<string, string>; report: R | null; problem: string | null };
export function parseOr422<I>(schema: ZodType<I>, url: URL): I;   // throws ValidationError
// report-export.service.ts
export class ReportExportService {
	sales(dto: SalesReportDto): Promise<Buffer>;
	stock(dto: StockTurnoverReportDto): Promise<Buffer>;
	funnel(dto: FunnelReportDto): Promise<Buffer>;
	lost(dto: LostReportDto, rows: readonly LostRequestRowDto[]): Promise<Buffer>;
	charity(dto: CharityReportDto): Promise<Buffer>;
}
// labels.ts
export const FUNNEL_STAGE_TITLE: Record<FunnelStage, string>;
export const LOST_STATUS_TITLE: Record<LostStatus, string>;
export const SALES_GROUP_TITLE: Record<SalesGroup, string>;
export const SALES_BUCKET_TITLE: Record<SalesBucket, string>;
export function percentOfBp(bp: number | null): string;      // '66,7 %' or the dash
export function daysOrDash(days: number | null): string;
```

- [ ] **Step 1: Падающий тест выгрузки**

```ts
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ReportExportService } from '../../src/lib/server/crm-reports/report-export.service';
import type { SalesReportDto, StockTurnoverReportDto } from '../../src/lib/types/crm-reports';

async function sheetOf(body: Buffer) {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(body as unknown as ArrayBuffer);
	const sheet = workbook.worksheets[0];
	if (!sheet) throw new Error('no sheet');
	return sheet;
}
const range = { from: '2026-10-01', to: '2026-10-31' };
const totals = { requestCount: 2, qty: 3, itemsTotalMinor: 300_000, discountMinor: 30_000, totalMinor: 270_000, paidMinor: 100_000 };

describe('report sheets (C13)', () => {
	it('writes sales in roubles with a total row', async () => {
		const dto: SalesReportDto = {
			range, counterpartyId: null, totals, group: 'counterparty',
			rows: [{ ...totals, counterpartyId: 1, title: 'Ритуал-Сервис' }]
		};
		const sheet = await sheetOf(await new ReportExportService('Europe/Moscow').sales(dto));
		expect(sheet.getRow(1).values).toEqual(expect.arrayContaining(['Контрагент', 'Заявок', 'Итог, ₽', 'Оплачено, ₽']));
		expect(sheet.getRow(2).values).toEqual(expect.arrayContaining(['Ритуал-Сервис', 2, 2700, 1000]));
		expect(sheet.getRow(3).getCell(1).value).toBe('Итого');
	});

	it('leaves the days of stock empty when nothing was shipped', async () => {
		const dto: StockTurnoverReportDto = {
			range, kind: null,
			rows: [{ stockItemId: 1, optionId: 2, code: 'ST-1', title: 'Волга', optionTitle: 'Орех', unitTitle: 'шт', openingQty: 4, incomeQty: 0, outcomeQty: 0, closingQty: 4, shippedQty: 0, turnoverDays: null }]
		};
		const sheet = await sheetOf(await new ReportExportService('Europe/Moscow').stock(dto));
		expect(sheet.getRow(2).values).toEqual(expect.arrayContaining(['ST-1', 'Волга', 'Орех', 4]));
		expect(sheet.getRow(2).getCell(10).value ?? '').toBe('');
	});
});
```

- [ ] **Step 2:** запуск. Ожидание: FAIL.

- [ ] **Step 3: `labels.ts`**

```ts
import type { FunnelStage, LostStatus, SalesBucket, SalesGroup } from '$lib/types/crm-reports';
import { PRICE_DASH } from '$lib/utils/format';

export const FUNNEL_STAGE_TITLE: Readonly<Record<FunnelStage, string>> = {
	new: 'Отправлено', in_work: 'Принято в работу', ready: 'Готово', delivered: 'Доставлено', paid: 'Оплачено'
};
export const LOST_STATUS_TITLE: Readonly<Record<LostStatus, string>> = { cancelled: 'Отменена', rejected: 'Отклонена' };
export const SALES_GROUP_TITLE: Readonly<Record<SalesGroup, string>> = {
	counterparty: 'По контрагентам', model: 'По моделям', period: 'По периодам'
};
export const SALES_BUCKET_TITLE: Readonly<Record<SalesBucket, string>> = { day: 'По дням', week: 'По неделям', month: 'По месяцам' };

/** Basis points as a percent with one decimal: a funnel of ten requests needs it. */
export function percentOfBp(bp: number | null): string {
	return bp === null ? PRICE_DASH : `${(bp / 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;
}

export function daysOrDash(days: number | null): string {
	return days === null ? PRICE_DASH : String(days);
}
```

- [ ] **Step 4: `report-export.service.ts`**

```ts
import ExcelJS from 'exceljs';
import { FUNNEL_STAGE_TITLE, LOST_STATUS_TITLE } from '$lib/crm/reports/labels';
import type {
	CharityReportDto, FunnelReportDto, LostReportDto, LostRequestRowDto, SalesReportDto,
	SalesTotalsDto, StockTurnoverReportDto
} from '$lib/types/crm-reports';
import { formatDateTime } from '$lib/utils/format';
import { fromMinor } from '$lib/utils/money';

const MONEY = { numFmt: '#,##0.00' };
type Column = { header: string; key: string; width: number; style?: typeof MONEY };

const totalsCells = (t: SalesTotalsDto) => ({
	requests: t.requestCount, qty: t.qty, items: fromMinor(t.itemsTotalMinor),
	discount: fromMinor(t.discountMinor), total: fromMinor(t.totalMinor), paid: fromMinor(t.paidMinor)
});
const TOTALS_COLUMNS: Column[] = [
	{ header: 'Заявок', key: 'requests', width: 9 },
	{ header: 'Штук', key: 'qty', width: 8 },
	{ header: 'Сумма, ₽', key: 'items', width: 16, style: MONEY },
	{ header: 'Скидка, ₽', key: 'discount', width: 14, style: MONEY },
	{ header: 'Итог, ₽', key: 'total', width: 16, style: MONEY },
	{ header: 'Оплачено, ₽', key: 'paid', width: 16, style: MONEY }
];

/**
 * Sheets of the reports (C13). Each one is built on the click from the DTO the screen shows, so
 * the file and the screen cannot disagree. The caller has already checked `reports.read`.
 */
export class ReportExportService {
	constructor(private readonly timeZone: string) {}

	private async build(
		title: string, columns: Column[], rows: readonly Record<string, unknown>[], total?: Record<string, unknown>
	): Promise<Buffer> {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet(title);
		sheet.columns = columns;
		sheet.getRow(1).font = { bold: true };
		for (const row of rows) sheet.addRow(row);
		if (total) sheet.addRow(total).font = { bold: true };
		return Buffer.from(await workbook.xlsx.writeBuffer());
	}

	sales(dto: SalesReportDto): Promise<Buffer> {
		const total = { name: 'Итого', ...totalsCells(dto.totals) };
		switch (dto.group) {
			case 'counterparty':
				return this.build('Продажи', [{ header: 'Контрагент', key: 'name', width: 36 }, ...TOTALS_COLUMNS],
					dto.rows.map((row) => ({ name: row.title, ...totalsCells(row) })), total);
			case 'period':
				return this.build('Продажи', [{ header: 'Период', key: 'name', width: 26 }, ...TOTALS_COLUMNS],
					dto.rows.map((row) => ({ name: `${row.bucketFrom} – ${row.bucketTo}`, ...totalsCells(row) })), total);
			case 'model':
				return this.build('Продажи', [
					{ header: 'Модель', key: 'name', width: 36 },
					{ header: 'Заявок', key: 'requests', width: 9 },
					{ header: 'Штук', key: 'qty', width: 8 },
					{ header: 'Сумма до скидки, ₽', key: 'items', width: 20, style: MONEY }
				], dto.rows.map((row) => ({ name: row.title, requests: row.requestCount, qty: row.qty, items: fromMinor(row.linesTotalMinor) })),
				{ name: 'Итого', qty: dto.totals.qty, items: fromMinor(dto.totals.itemsTotalMinor) });
		}
	}

	stock(dto: StockTurnoverReportDto): Promise<Buffer> {
		return this.build('Оборачиваемость', [
			{ header: 'Код', key: 'code', width: 20 }, { header: 'Позиция', key: 'title', width: 36 },
			{ header: 'Цвет', key: 'color', width: 16 }, { header: 'Ед.', key: 'unit', width: 8 },
			{ header: 'Начало', key: 'opening', width: 10 }, { header: 'Приход', key: 'income', width: 10 },
			{ header: 'Расход', key: 'outcome', width: 10 }, { header: 'Конец', key: 'closing', width: 10 },
			{ header: 'Отгружено', key: 'shipped', width: 12 }, { header: 'Дни запаса', key: 'days', width: 12 }
		], dto.rows.map((row) => ({
			code: row.code, title: row.title, color: row.optionTitle ?? '', unit: row.unitTitle,
			opening: row.openingQty, income: row.incomeQty, outcome: row.outcomeQty, closing: row.closingQty,
			shipped: row.shippedQty, days: row.turnoverDays ?? ''
		})));
	}

	funnel(dto: FunnelReportDto): Promise<Buffer> {
		const percent = (bp: number | null) => (bp === null ? '' : bp / 100);
		return this.build('Воронка', [
			{ header: 'Стадия', key: 'stage', width: 24 }, { header: 'Заявок', key: 'count', width: 10 },
			{ header: 'От предыдущей, %', key: 'previous', width: 18 }, { header: 'От отправленных, %', key: 'first', width: 20 }
		], [
			...dto.stages.map((s) => ({ stage: FUNNEL_STAGE_TITLE[s.stage], count: s.count, previous: percent(s.shareOfPreviousBp), first: percent(s.shareOfFirstBp) })),
			{ stage: LOST_STATUS_TITLE.cancelled, count: dto.cancelledCount },
			{ stage: LOST_STATUS_TITLE.rejected, count: dto.rejectedCount }
		]);
	}

	lost(dto: LostReportDto, rows: readonly LostRequestRowDto[]): Promise<Buffer> {
		return this.build('Потерянные заявки', [
			{ header: 'Дата', key: 'at', width: 17 }, { header: 'Заявка', key: 'number', width: 16 },
			{ header: 'Статус', key: 'status', width: 12 }, { header: 'Контрагент', key: 'cp', width: 32 },
			{ header: 'Причина', key: 'reason', width: 26 }, { header: 'Комментарий', key: 'comment', width: 36 },
			{ header: 'Сумма, ₽', key: 'total', width: 16, style: MONEY }
		], rows.map((row) => ({
			at: formatDateTime(row.at, this.timeZone), number: row.number, status: LOST_STATUS_TITLE[row.status],
			cp: row.counterpartyTitle ?? '', reason: row.reasonTitle ?? '', comment: row.comment ?? '', total: fromMinor(row.totalMinor)
		})), { at: 'Итого', total: fromMinor(dto.totalMinor) });
	}

	charity(dto: CharityReportDto): Promise<Buffer> {
		return this.build('Фонд', [
			{ header: 'Дата', key: 'date', width: 14 }, { header: 'Сумма, ₽', key: 'amount', width: 16, style: MONEY },
			{ header: 'Документ', key: 'document', width: 22 }, { header: 'Комментарий', key: 'comment', width: 36 },
			{ header: 'Кто записал', key: 'author', width: 26 }, { header: 'Сторно', key: 'reversal', width: 10 }
		], dto.transfers.rows.map((row) => ({
			date: row.transferredOn, amount: fromMinor(row.amountMinor), document: row.documentRef ?? '',
			comment: row.comment ?? '', author: row.createdByName,
			reversal: row.reversalOfId !== null ? 'сторно' : row.isReversed ? 'сторнировано' : ''
		})), { date: 'Остаток', amount: fromMinor(dto.remainderMinor) });
	}
}
```

Файл держится у границы 250 строк после форматирования: если перешагнёт, вынести `sales` с `TOTALS_COLUMNS` в `sales-export.ts`. В тире периода стоит короткое тире, не длинное.

- [ ] **Step 5: `route.ts`**

```ts
import type { ZodType } from 'zod';
import { requireAction, requireScope } from '../auth/guard';
import { AppError, userMessage } from '../core/errors';
import type { ReportRange } from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';

/**
 * Layout guards do not run for actions and endpoints, so every entry point of the reports checks
 * the contour and `reports.read` itself; the transfer service checks `charity.manage` again.
 */
export function reportsActor(event: { readonly locals: App.Locals; readonly url: URL }): ActorContext {
	return requireAction(requireScope(event.locals.actor, 'crm', event.url.pathname), 'reports.read');
}

/** A range the report refuses still opens the page: the filter stays to be corrected. */
export function loadReport<I extends ReportRange, R>(
	url: URL, schema: ZodType<I>, fallback: ReportRange, run: (input: I) => R
) {
	const asked = Object.fromEntries(url.searchParams);
	const filters = { ...fallback, ...asked };
	const parsed = schema.safeParse(filters);
	if (!parsed.success) {
		return { filters, report: null, problem: parsed.error.issues[0]?.message ?? 'Выберите даты периода' };
	}
	try {
		return { filters, report: run(parsed.data), problem: null };
	} catch (err) {
		if (!(err instanceof AppError)) throw err;
		return { filters, report: null, problem: userMessage(err) };
	}
}
```

- [ ] **Step 6: Загрузчики страниц.** Все пять по одному образцу. `sales/+page.server.ts`:

```ts
import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import { SalesReportService } from '$lib/server/crm-reports/sales-report.service';
import { salesReportSchema } from '$lib/validation/crm-reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new SalesReportService(reportsActor(event));
	return loadReport(event.url, salesReportSchema, service.defaultRange(), (input) => service.report(input));
};
```

Остальные: `+page.server.ts` дашборда (`DashboardService`, `reportRangeSchema`, `dashboard`), `stock` (`StockTurnoverService`, `stockTurnoverSchema`), `funnel` (`FunnelReportService`, `reportRangeSchema`), `lost` (`LostReportService`, `lostReportSchema`, `(input) => service.report(input, parseListQuery(event.url))`). Фильтр контрагента на странице продаж берёт список из `CrmCounterpartyRepository` или существующего сервиса списка контрагентов: найти метод, который уже отдаёт пары `id, name` для `Select` в форме создания заявки CRM, и вернуть его результат ключом `counterparties`.

`charity/+page.server.ts`:

```ts
import { formAction } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { CharityReportService } from '$lib/server/crm-reports/charity-report.service';
import { CharityTransferService } from '$lib/server/crm-reports/charity-transfer.service';
import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import {
	charityTransferReverseSchema, charityTransferSchema, reportRangeSchema
} from '$lib/validation/crm-reports';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new CharityReportService(reportsActor(event));
	return {
		today: service.today(),
		...loadReport(event.url, reportRangeSchema, service.defaultRange(), (range) =>
			service.report(range, parseListQuery(event.url))
		)
	};
};

export const actions = {
	transfer: (event) => {
		const actor = reportsActor(event);
		return formAction(event.request, 'transfer', charityTransferSchema, (input) =>
			new CharityTransferService(actor).transfer(input)
		);
	},
	reverse: (event) => {
		const actor = reportsActor(event);
		return formAction(event.request, 'reverse', charityTransferReverseSchema, (input) => {
			new CharityTransferService(actor).reverse(input);
		});
	}
} satisfies Actions;
```

- [ ] **Step 7: Роуты выгрузки.** `sales/export.xlsx/+server.ts`:

```ts
import { rethrowAsHttp } from '$lib/server/core/http';
import { ValidationError } from '$lib/server/core/errors';
import { ReportExportService } from '$lib/server/crm-reports/report-export.service';
import { reportsActor } from '$lib/server/crm-reports/route';
import { SalesReportService } from '$lib/server/crm-reports/sales-report.service';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import { OrgService } from '$lib/server/settings/org.service';
import { salesReportSchema } from '$lib/validation/crm-reports';
import type { RequestHandler } from './$types';

// The same query string as the page: the sheet is what the owner is looking at.
export const GET: RequestHandler = async (event) => {
	const actor = reportsActor(event);
	let body: Buffer;
	try {
		const parsed = salesReportSchema.safeParse(Object.fromEntries(event.url.searchParams));
		// A sheet has no filter to correct: a broken range is a 422, not a 500.
		if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Выберите даты периода');
		const dto = new SalesReportService(actor).report(parsed.data);
		body = await new ReportExportService(OrgService.timezone()).sales(dto);
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'sales', 'Продажи');
};
```

Остальные четыре так же: `stock` (`'stock-turnover'`, «Оборачиваемость»), `funnel` (`'funnel'`, «Воронка»), `lost` (`'lost-requests'`, «Потерянные заявки», `lost(dto, service.exportRows(input))`), `charity` (`'charity'`, «Фонд»; реестр целиком: `service.report(range, { ...normalizeListQuery({}), perPage: 10_000 })`). Повтор «разобрать, иначе 422» выносится в `route.ts`:

```ts
/** For sheets: there is no filter to correct, so a broken query is a 422. */
export function parseOr422<I>(schema: ZodType<I>, url: URL): I {
	const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		throw new ValidationError(parsed.error.issues[0]?.message ?? 'Выберите даты периода');
	}
	return parsed.data;
}
```

и все пять роутов зовут её внутри `try`.

- [ ] **Step 8: Навигация.** В `(crm)/+layout.server.ts` в `can` добавить `reports: PolicyService.can(actor, 'reports.read')`.

- [ ] **Step 9:** `pnpm vitest run tests/unit/crm-reports-export.spec.ts && pnpm check`. Ожидание: PASS, тайпчек чистый.

- [ ] **Step 10: Commit** `feat(crm): serve the reports and their sheets`.

---

### Task 11: Экраны раздела

**Files:**
- Create: `src/routes/(crm)/crm/reports/+layout.svelte`, `+page.svelte`, `sales/+page.svelte`, `stock/+page.svelte`, `funnel/+page.svelte`, `lost/+page.svelte`, `charity/+page.svelte`
- Create: `src/lib/crm/reports/ReportFilters.svelte`, `StatTile.svelte`, `TransferModal.svelte`, `ReverseModal.svelte`
- Modify: `src/routes/(crm)/+layout.svelte` (пункт «Отчёты»)
- Move: `src/lib/crm/payroll/ReportTable.svelte` в `src/lib/crm/ReportTable.svelte` (второй потребитель), поправить импорт в `payroll/reports/+page.svelte`

**Interfaces:**
- Consumes: данные загрузчиков задачи 10 (`filters`, `report`, `problem`), `labels.ts`.

- [ ] **Step 1: Пункт меню.** В `links` после «Выплаты»:

```ts
		...(data.can.reports ? [{ href: resolve('/crm/reports'), label: 'Отчёты' }] : []),
```

- [ ] **Step 2: `ReportFilters.svelte`**: период, пресеты и ссылка выгрузки, одна на все отчёты.

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { presetRange } from '$lib/domain/report/period';
	import { REPORT_PRESETS, type ReportPreset } from '$lib/types/crm-reports';
	import { Button, FilterBar, type FilterField } from '$lib/ui';

	let {
		filters = $bindable(),
		today,
		extra = [],
		exportHref
	}: {
		filters: Record<string, string>;
		today: string;
		extra?: readonly FilterField[];
		exportHref?: string;
	} = $props();

	const PRESET_TITLE: Readonly<Record<ReportPreset, string>> = {
		week: 'Неделя', month: 'Месяц', quarter: 'Квартал', year: 'Год'
	};
	const fields = $derived<FilterField[]>([
		{ key: 'from', label: 'С', type: 'date', placeholder: 'Выберите дату' },
		{ key: 'to', label: 'По', type: 'date', placeholder: 'Выберите дату' },
		...extra
	]);
	// The sheet takes the query string of the page: the file is what the owner is looking at.
	const exportUrl = $derived(exportHref === undefined ? undefined : `${exportHref}${page.url.search}`);
	const presetHref = (preset: ReportPreset): string => {
		const params = new URLSearchParams(page.url.searchParams);
		const range = presetRange(preset, today);
		params.set('from', range.from);
		params.set('to', range.to);
		return `?${params}`;
	};
</script>

<div class="flex flex-col gap-3">
	<FilterBar {fields} bind:filters />
	<div class="flex flex-wrap items-center gap-2">
		{#each REPORT_PRESETS as preset (preset)}
			<Button variant="ghost" size="sm" href={presetHref(preset)} data-testid={`preset-${preset}`}>
				{PRESET_TITLE[preset]}
			</Button>
		{/each}
		{#if exportUrl}
			<Button variant="secondary" size="sm" href={exportUrl} data-testid="report-export" class="ms-auto">
				Выгрузить в XLSX
			</Button>
		{/if}
	</div>
</div>
```

Поддерживает ли `Button` проп `href`, сверить с `src/lib/ui`; если нет, взять приём, которым кнопка выгрузки сделана на `/crm/stock`. `today` страницы получают из загрузчика: добавить `today: service.today()` во все пять `load` задачи 10.

- [ ] **Step 3: `StatTile.svelte`**: плитка дашборда на `Card`.

```svelte
<script lang="ts">
	import { Card } from '$lib/ui';

	let { label, value, hint, href, testid }: {
		label: string; value: string; hint?: string; href?: string; testid: string;
	} = $props();
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-1">
		<p class="text-sm text-fg-muted">{label}</p>
		<p class="text-2xl font-medium tabular-nums" data-testid={testid}>{value}</p>
		{#if hint}<p class="text-sm text-fg-muted">{hint}</p>{/if}
		{#if href}<a class="text-sm underline" {href}>Открыть отчёт</a>{/if}
	</Card.Content>
</Card.Root>
```

Если в `src/lib/crm` или в профиле портала уже есть плитка показателя («Задолженность», «Закупка за год» из P10), взять её вместо новой и этот файл не создавать.

- [ ] **Step 4: `+layout.svelte` раздела**: меню отчётов.

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const sections = [
		{ href: resolve('/crm/reports'), label: 'Сводка' },
		{ href: resolve('/crm/reports/sales'), label: 'Продажи' },
		{ href: resolve('/crm/reports/stock'), label: 'Склад' },
		{ href: resolve('/crm/reports/funnel'), label: 'Воронка' },
		{ href: resolve('/crm/reports/lost'), label: 'Отменённые и отклонённые' },
		{ href: resolve('/crm/reports/charity'), label: 'Фонд' },
		{ href: resolve('/crm/payroll/reports'), label: 'Выплаты' }
	];
</script>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<nav class="flex flex-wrap gap-2" aria-label="Отчёты" data-testid="reports-nav">
		{#each sections as section (section.href)}
			<a
				href={section.href}
				class="rounded-full px-3 py-1 text-sm {page.url.pathname === section.href ? 'bg-surface-strong font-medium' : 'text-fg-muted'}"
				aria-current={page.url.pathname === section.href ? 'page' : undefined}
			>
				{section.label}
			</a>
		{/each}
	</nav>
	{@render children()}
</div>
```

Классы фона взять из токенов `app.css` (посмотреть, каким классом подсвечен активный пункт бокового меню профиля); `bg-surface-strong` здесь обозначает этот токен, а не новое имя.

- [ ] **Step 5: Дашборд `+page.svelte`**

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import ReportFilters from '$lib/crm/reports/ReportFilters.svelte';
	import StatTile from '$lib/crm/reports/StatTile.svelte';
	import ReportTable from '$lib/crm/ReportTable.svelte';
	import { STATUS_TITLE } from '$lib/crm/labels';
	import { Card, ErrorState, type DataTableColumn } from '$lib/ui';
	import { formatMinor } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// svelte-ignore state_referenced_locally
	let filters = $state<Record<string, string>>({ ...data.filters });
	const query = $derived(`?from=${data.filters.from}&to=${data.filters.to}`);
	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Название' },
		{ key: 'qty', label: 'Штук', align: 'end' },
		{ key: 'total', label: 'Сумма', align: 'end' }
	];
	const counterparties = $derived((data.report?.topCounterparties ?? []).map((r) => ({ id: r.counterpartyId, title: r.title, qty: r.qty, total: r.totalMinor })));
	const models = $derived((data.report?.topModels ?? []).map((r) => ({ id: r.modelId, title: r.title, qty: r.qty, total: r.linesTotalMinor })));
	type Row = (typeof counterparties)[number];
</script>

<svelte:head><title>Отчёты</title></svelte:head>

<h1 class="text-3xl">Сводка</h1>
<Card.Root><Card.Content><ReportFilters bind:filters today={data.today} /></Card.Content></Card.Root>

{#if data.problem}
	<div data-testid="report-problem"><ErrorState title={data.problem} /></div>
{:else if data.report}
	{@const r = data.report}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<StatTile testid="tile-sales" label="Продажи за период" value={formatMinor(r.sales.totalMinor)} hint={`Заявок: ${r.sales.requestCount}, штук: ${r.sales.qty}`} href={`${resolve('/crm/reports/sales')}${query}`} />
		<StatTile testid="tile-paid" label="Оплачено по ним" value={formatMinor(r.sales.paidMinor)} />
		<StatTile testid="tile-debt" label="Долг контрагентов сейчас" value={formatMinor(r.debtMinor)} href={resolve('/crm/counterparties')} />
		<StatTile testid="tile-payroll" label="Начислено бригаде" value={formatMinor(r.payrollAccruedMinor)} href={`${resolve('/crm/payroll/reports')}${query}`} />
		<StatTile testid="tile-charity" label="Начислено фонду за период" value={formatMinor(r.charityAccruedInRangeMinor)} href={`${resolve('/crm/reports/charity')}${query}`} />
		<StatTile testid="tile-remainder" label="К перечислению фонду" value={formatMinor(r.charityRemainderMinor)} />
		<StatTile testid="tile-threshold" label="Позиций ниже порога" value={String(r.belowThresholdCount)} href={`${resolve('/crm/stock')}?belowThreshold=1`} />
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">Заявки сейчас</h2>
			<dl class="grid gap-3 sm:grid-cols-4" data-testid="status-counts">
				{#each Object.entries(r.statusCounts) as [status, count] (status)}
					<div><dt class="text-sm text-fg-muted">{STATUS_TITLE[status as keyof typeof r.statusCounts]}</dt><dd class="text-xl tabular-nums">{count}</dd></div>
				{/each}
			</dl>
		</Card.Content>
	</Card.Root>

	{#snippet cell(row: Row, column: DataTableColumn)}
		{#if column.key === 'title'}{row.title}
		{:else if column.key === 'qty'}<span class="tabular-nums">{row.qty}</span>
		{:else}<span class="tabular-nums">{formatMinor(row.total)}</span>{/if}
	{/snippet}
	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root><Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">Контрагенты</h2>
			<ReportTable rows={counterparties} {columns} emptyTitle="За эти даты продаж нет" {cell} />
		</Card.Content></Card.Root>
		<Card.Root><Card.Content class="flex flex-col gap-3">
			<h2 class="text-2xl">Модели</h2>
			<ReportTable rows={models} {columns} emptyTitle="За эти даты продаж нет" {cell} />
		</Card.Content></Card.Root>
	</div>
{/if}
```

Имя словаря названий статусов (`STATUS_TITLE`) и имя параметра фильтра склада (`belowThreshold`) сверить с `src/lib/crm/labels.ts` и `stockFiltersSchema`. Если `StatusBadge` рисует подпись сам, взять его вместо словаря.

- [ ] **Step 6: Страницы продаж, склада, воронки и потерянных.** Каждая повторяет каркас дашборда: заголовок, `Card` с `ReportFilters` (с `exportHref` своего роута), `ErrorState` по `data.problem`, таблица на `ReportTable` (у потерянных `DataTable` с серверной пагинацией: `rows`, `total`, `query`, `onQueryChange` как в реестре заявок `/crm/requests`). Колонки и содержимое ячеек:

| Страница | `extra` фильтра | Колонки |
|---|---|---|
| `sales` | `group` (`select`, три значения из `SALES_GROUP_TITLE`), `bucket` (`select`, показывается при `group=period`), `counterpartyId` (`select` из `data.counterparties`, плейсхолдер «Выберите контрагента») | контрагент или период: название, «Заявок», «Штук», «Сумма», «Скидка», «Итог», «Оплачено»; модель: «Модель», «Заявок», «Штук», «Сумма до скидки». Под таблицей строка «Итого» с `data-testid="sales-total"` и `formatMinor(report.totals.totalMinor)` |
| `stock` | `kind` (`select`: «Изделия», «Комплектующие» из `KIND_TITLE`) | «Код», «Позиция», «Цвет», «Начало», «Приход», «Расход», «Конец», «Отгружено», «Дни запаса» (`daysOrDash`) |
| `funnel` | нет | «Стадия» (`FUNNEL_STAGE_TITLE`), «Заявок», «От предыдущей», «От отправленных» (`percentOfBp`); под таблицей два числа: отменено, отклонено |
| `lost` | `status` (`select` из `LOST_STATUS_TITLE`, плейсхолдер «Выберите статус») | свод по причинам: «Причина», «Заявок», «Сумма»; реестр: «Дата» (`formatDateTime` в `data.timezone`), «Заявка» (ссылка на `/crm/requests/[id]`), «Статус», «Контрагент», «Причина», «Комментарий», «Сумма» |

Группировку на странице продаж переключает `Tabs` поверх ссылок с `group` в адресе, а не локальное состояние: выгрузка и перезагрузка страницы обязаны видеть ту же вкладку. Числа в ячейках с классом `tabular-nums`, деньги через `formatMinor`, пустое значение через `PriceCell` или `PRICE_DASH`.

- [ ] **Step 7: Страница фонда и модалки.** `charity/+page.svelte`: три плитки (`tile-accrued-all` «Начислено всего», `tile-transferred` «Перечислено», `tile-remainder` «К перечислению»), таблица начислений за период по контрагентам, реестр перечислений на `DataTable` с колонками «Дата», «Сумма», «Документ», «Комментарий», «Кто записал», «Состояние» (пусто, «Сторно», «Сторнировано») и кнопкой «Сторнировать» в строке, где `canManage && reversalOfId === null && !isReversed`. Кнопка «Записать перечисление» видна при `canManage` и `remainderMinor > 0`.

`TransferModal.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, DatePicker, Input, Modal, MoneyInput, Textarea } from '$lib/ui';
	import { formatMinor } from '$lib/utils/format';

	let { open = $bindable(), today, remainderMinor, error }: {
		open: boolean; today: string; remainderMinor: number; error: string | null;
	} = $props();
	let amountMinor = $state<number | null>(null);
	// svelte-ignore state_referenced_locally
	let transferredOn = $state(today);
</script>

<Modal bind:open title="Перечисление в фонд" onClose={() => (open = false)}>
	{#snippet body()}
		<form method="POST" action="?/transfer" use:enhance class="flex flex-col gap-4">
			<p class="text-sm text-fg-muted">К перечислению: {formatMinor(remainderMinor)}</p>
			<MoneyInput label="Сумма, ₽" placeholder="Введите сумму" bind:valueMinor={amountMinor} required />
			<input type="hidden" name="amountMinor" value={amountMinor ?? ''} />
			<DatePicker label="Дата перечисления" bind:value={transferredOn} />
			<input type="hidden" name="transferredOn" value={transferredOn} />
			<Input name="documentRef" label="Документ" placeholder="Введите номер платёжки" />
			<Textarea name="comment" label="Комментарий" placeholder="Введите комментарий" />
			{#if error}<p class="text-sm text-danger" data-testid="transfer-error">{error}</p>{/if}
			<Button type="submit">Записать</Button>
		</form>
	{/snippet}
</Modal>
```

`ReverseModal.svelte` устроена так же: скрытое `transferId`, обязательное `Textarea name="comment"` с подписью «Причина сторно» и плейсхолдером «Введите причину», кнопка «Сторнировать» с `variant="danger"`, действие `?/reverse`. Как `MoneyInput` и `DatePicker` отдают значение в форму, сверить с `AdjustModal.svelte` из выплат и повторить его приём один в один; ошибку действия страница берёт из `form?.action === 'transfer' ? form.formError : null`, успех закрывает модалку и показывает `toast.success('Перечисление записано')`.

- [ ] **Step 8:** `pnpm check && pnpm lint`. Ожидание: чисто. Затем проверка в браузере: `preview_start` дев-сервера, вход руководителем, пройти все шесть экранов в десктопном и мобильном вьюпорте, консоль без ошибок, горизонтального скролла страницы нет (широкая таблица скроллится внутри карточки).

- [ ] **Step 9: Commit** двумя шагами: `feat(crm): show the reports to the owner` (меню, дашборд, четыре отчёта) и `feat(crm): record fund transfers from the report` (страница фонда и модалки).

---

### Task 12: e2e, гейт и демонстрация DoD

**Files:**
- Create: `tests/e2e/crm-reports.e2e.ts`
- Modify: `scripts/seed-demo.ts` только если на демо-данных нет ни одной доставленной заявки (проверить `pnpm seed:demo`)

- [ ] **Step 1: e2e**

```ts
import { expect, test } from '@playwright/test';
import { charityTransfers } from '../../src/lib/server/db/schema';
import { login } from './fixtures';
import { e2eDb } from './transitions';

const PATHS = ['/crm/reports', '/crm/reports/sales', '/crm/reports/stock', '/crm/reports/funnel', '/crm/reports/lost', '/crm/reports/charity'];
const SHEETS = ['sales', 'stock', 'funnel', 'lost', 'charity'].map((name) => `/crm/reports/${name}/export.xlsx`);
const RANGE = '?from=2026-01-01&to=2026-12-31';

// The file outlives a run: a transfer left by an earlier run would eat the remainder of this one.
test.beforeAll(() => {
	e2eDb().delete(charityTransfers).run();
});

test('C13: the owner reads the period, downloads a sheet and records a transfer', async ({ page }) => {
	await login(page, 'owner');
	await page.getByRole('link', { name: 'Отчёты', exact: true }).click();
	await expect(page.getByTestId('tile-sales')).toBeVisible();

	await page.goto(`/crm/reports/sales${RANGE}`);
	await expect(page.getByTestId('sales-total')).toBeVisible();
	const sheet = await page.request.get(`/crm/reports/sales/export.xlsx${RANGE}`);
	expect(sheet.status()).toBe(200);
	expect(sheet.headers()['content-type']).toContain('spreadsheetml');

	await page.goto(`/crm/reports/charity${RANGE}`);
	const remainder = page.getByTestId('tile-remainder');
	await expect(remainder).toBeVisible();
	const before = await remainder.innerText();
	await expect(async () => {
		await page.getByRole('button', { name: 'Записать перечисление', exact: true }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	const modal = page.getByTestId('modal');
	await modal.getByLabel('Сумма, ₽').fill('1');
	await modal.getByLabel('Документ').fill('E2E ПП 1');
	await modal.getByRole('button', { name: 'Записать', exact: true }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
	await expect(page.getByRole('row', { name: /E2E ПП 1/ })).toBeVisible();
	await expect(remainder).not.toHaveText(before);
});

test('C13: a broken period keeps the page and refuses the sheet', async ({ page }) => {
	await login(page, 'owner');
	await page.goto('/crm/reports/sales?from=2026-03-02&to=2026-03-01');
	await expect(page.getByTestId('report-problem')).toBeVisible();
	expect((await page.request.get('/crm/reports/sales/export.xlsx?from=2026-03-02&to=2026-03-01')).status()).toBe(422);
});

for (const role of ['manager', 'driver', 'cp_admin'] as const) {
	test(`C13: ${role} gets 403 on every report, sheet and action`, async ({ page }) => {
		await login(page, role);
		await expect(page.getByRole('link', { name: 'Отчёты', exact: true })).toHaveCount(0);
		for (const path of PATHS) expect((await page.goto(path))?.status()).toBe(403);
		for (const sheet of SHEETS) expect((await page.request.get(sheet + RANGE)).status()).toBe(403);
		const forged = await page.request.post('/crm/reports/charity?/transfer', {
			form: { amountMinor: '100', transferredOn: '2026-10-07' },
			headers: { origin: 'http://localhost:4173' }
		});
		expect(forged.status()).toBe(403);
	});
}
```

Тест перечисления требует ненулевого остатка: в e2e-базе должна быть доставленная заявка контрагента. Если сид её не даёт, в `beforeAll` довести заявку до `delivered` хелперами из `tests/e2e/transitions.ts` и `crm-flow.ts` (перед этим `emptyCart` и `stockUp`: в e2e-базе остаются черновики и отрицательные полки прошлых прогонов).

- [ ] **Step 2:** освободить порт 4173, затем `SESSION_SECRET=<значение из .env> pnpm test:e2e tests/e2e/crm-reports.e2e.ts`. Ожидание: PASS.

- [ ] **Step 3: Полный гейт**

```bash
pnpm lint && pnpm check && pnpm test:unit && SESSION_SECRET=... pnpm test:e2e && SESSION_SECRET=... pnpm build
```

Ожидание: всё зелёное, покрытие `lib/domain/**` не ниже 90% строк. Упавший чужой e2e, в котором `manager` открывал что-то по `reports.read`, это следствие решения 1 спеки: поправить тест, а не право.

- [ ] **Step 4: DoD на продовой сборке.** `pnpm seed && pnpm seed:demo`, `node build`, войти руководителем: сумма на баннере портала (`/portal`, войти `cp_admin`, значение счётчика «всего») равна плитке «Начислено всего» на `/crm/reports/charity`. Снять скриншоты дашборда и отчёта по фонду.

- [ ] **Step 5: Сверка контракта.** Перечитать `tech.md` v1.51 и спеку против кода: имена DTO, роутов, действий аудита. Расхождение, найденное по ходу (например, `charityReportSchema`), исправить в `tech.md` и спеке тем же коммитом.

- [ ] **Step 6: Commit** `test(crm): walk the reports as the owner and as a stranger`, затем прогон чек-листа «перед PR» из `CLAUDE.md`. PR открывается после слова владельца.
