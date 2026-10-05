import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';
import { PayrollExportService } from '../../src/lib/server/crm-payroll/payroll-export.service';
import { PayrollReportService } from '../../src/lib/server/crm-payroll/payroll-report.service';
import { PayrollWeekService } from '../../src/lib/server/crm-payroll/payroll-week.service';
import { WorkDayService } from '../../src/lib/server/crm-payroll/work-day.service';
import { WorkTypeService } from '../../src/lib/server/crm-payroll/work-type.service';
import { auditLog, jobQueue } from '../../src/lib/server/db/schema';
import { payrollAdjustSchema, payrollReopenSchema } from '../../src/lib/validation/crm-payroll';
import {
	calendarAt,
	clearPayroll,
	insertStaff,
	insertWorkType,
	payrollActor
} from './helpers/crm-payroll';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const managerId = insertUser({
	email: 'manager@ws.example',
	role: 'manager',
	counterpartyId: null,
	fullName: 'Марина Круглова'
});
const actor = payrollActor(managerId);

// Sunday 11 October 2026: the whole week of 5–11 October can be marked.
const NOW = '2026-10-11T15:00:00Z';
const WEEK = '2026-10-05';
const calendar = () => calendarAt(NOW);
const days = () => new WorkDayService(actor, calendar());
const weeks = () => new PayrollWeekService(actor, calendar());
const closing = () => new PayrollCloseService(actor, calendar());

let anna = 0;
let boris = 0;
let viktor = 0;
let gleb = 0;
let assembly = 0;
let sanding = 0;
let lacquer = 0;

/**
 * The control sample of the slice. Prices: assembly 200, sanding 80, lacquer 120 roubles a unit.
 * Mon: Anna, Boris, Viktor, 10 assemblies = 2000, 666 each (0,67 of a rouble a head stays).
 * Tue: Anna, Boris, 6 assemblies and 5 sandings = 1600, 800 each.
 * Wed: all four, 7 lacquers = 840, 210 each.
 * Thu: Gleb alone, 3 sandings = 240.
 * Fri: Anna, Viktor, 5 assemblies and 1 lacquer = 1120, 560 each.
 */
function markControlWeek(): void {
	const mark = (date: string, staffIds: number[], entries: [number, number][]) =>
		days().save({
			date,
			staffIds,
			entries: entries.map(([workTypeId, qty]) => ({ workTypeId, qty }))
		});
	mark('2026-10-05', [anna, boris, viktor], [[assembly, 10]]);
	mark(
		'2026-10-06',
		[anna, boris],
		[
			[assembly, 6],
			[sanding, 5]
		]
	);
	mark('2026-10-07', [anna, boris, viktor, gleb], [[lacquer, 7]]);
	mark('2026-10-08', [gleb], [[sanding, 3]]);
	mark(
		'2026-10-09',
		[anna, viktor],
		[
			[assembly, 5],
			[lacquer, 1]
		]
	);
}

const figures = () =>
	weeks()
		.week(WEEK)
		.lines.map((line) => [
			line.fullName,
			line.daysWorked,
			line.accruedMinor,
			line.adjustmentMinor,
			line.payoutMinor
		]);

const adjust = (
	staffId: number,
	direction: 'plus' | 'minus',
	roubles: number,
	comment = 'Причина'
) => weeks().adjust({ week: WEEK, staffId, direction, amountMinor: roubles * 100, comment });

const lineOf = (staffId: number) => {
	const line = weeks()
		.week(WEEK)
		.lines.find((row) => row.staffId === staffId);
	if (!line || line.id === null) throw new Error('no stored line');
	return line.id;
};

beforeEach(() => {
	clearPayroll();
	anna = insertStaff('Анна');
	boris = insertStaff('Борис');
	viktor = insertStaff('Виктор');
	gleb = insertStaff('Глеб');
	assembly = insertWorkType('Сборка', 20_000);
	sanding = insertWorkType('Шлифовка', 8_000);
	lacquer = insertWorkType('Лакировка', 12_000);
});

describe('the weekly sheet against the control sample', () => {
	it('matches the sample to the kopeck', () => {
		markControlWeek();
		adjust(boris, 'plus', 5000, 'Премия');
		adjust(gleb, 'minus', 200, 'Аванс');

		const week = weeks().week('2026-10-08');
		expect(week).toMatchObject({ startsOn: '2026-10-05', endsOn: '2026-10-11', status: 'open' });
		expect(figures()).toEqual([
			['Анна', 4, 223_600, 0, 223_600],
			['Борис', 3, 167_600, 500_000, 667_600],
			['Виктор', 3, 143_600, 0, 143_600],
			['Глеб', 2, 45_000, -20_000, 25_000]
		]);
		expect(week.totalPayoutMinor).toBe(1_059_800);
		expect(week.days.map((day) => [day.presentCount, day.totalMinor, day.shareMinor])).toEqual([
			[3, 200_000, 66_600],
			[2, 160_000, 80_000],
			[4, 84_000, 21_000],
			[1, 24_000, 24_000],
			[2, 112_000, 56_000],
			[0, 0, 0],
			[0, 0, 0]
		]);
	});

	it('gives the same figures in the XLSX sheet', async () => {
		markControlWeek();
		adjust(boris, 'plus', 5000, 'Премия');
		closing().close(WEEK);
		closing().pay({ lineId: lineOf(anna), comment: null });

		const { body } = await new PayrollExportService(actor, weeks()).sheet(WEEK);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(body as unknown as ArrayBuffer);
		const rows: unknown[][] = [];
		workbook.getWorksheet('Ведомость')?.eachRow((row) => {
			rows.push((row.values as unknown[]).slice(1));
		});

		expect(rows[0]).toEqual([
			'Сотрудник',
			'Должность',
			'Дней',
			'Начислено, ₽',
			'Корректировка, ₽',
			'Комментарий',
			'К выплате, ₽',
			'Выплачено'
		]);
		expect(rows[1]).toEqual(['Анна', '', 4, 2236, 0, '', 2236, '11.10.2026']);
		expect(rows[2]).toEqual(['Борис', '', 3, 1676, 5000, 'Премия', 6676, '']);
		expect(rows.at(-1)?.[0]).toBe('Итого');
		expect(rows.at(-1)?.[6]).toBe(2236 + 6676 + 1436 + 450);
	});

	it('lists the idle active crew with zeros and hides a switched-off idle worker', () => {
		insertStaff('Захар', false);
		days().save({ date: WEEK, staffIds: [anna], entries: [{ workTypeId: assembly, qty: 1 }] });
		expect(figures()).toEqual([
			['Анна', 1, 20_000, 0, 20_000],
			['Борис', 0, 0, 0, 0],
			['Виктор', 0, 0, 0, 0],
			['Глеб', 0, 0, 0, 0]
		]);
	});

	it('shows a week nobody touched as open and without a period', () => {
		expect(weeks().week('2026-09-30')).toMatchObject({
			periodId: null,
			startsOn: '2026-09-28',
			status: 'open',
			totalPayoutMinor: 0
		});
	});
});

describe('adjustments', () => {
	it('adds and withholds with a comment, and zero clears it', () => {
		markControlWeek();
		adjust(anna, 'minus', 236, 'Штраф');
		expect(weeks().week(WEEK).lines[0]).toMatchObject({
			adjustmentMinor: -23_600,
			adjustmentComment: 'Штраф',
			payoutMinor: 200_000
		});
		adjust(anna, 'plus', 0);
		expect(weeks().week(WEEK).lines[0]).toMatchObject({
			adjustmentMinor: 0,
			adjustmentComment: null,
			payoutMinor: 223_600
		});
		const rows = db.select().from(auditLog).all();
		expect(rows.at(-2)).toMatchObject({
			action: 'payroll.adjust',
			after: { staffId: anna, adjustmentMinor: -23_600, comment: 'Штраф' }
		});
	});

	it('never lets a payout go below zero', () => {
		markControlWeek();
		expect(() => adjust(gleb, 'minus', 451)).toThrow(ValidationError);
		expect(adjust(gleb, 'minus', 450).lines[3]?.payoutMinor).toBe(0);
	});

	it('gives a bonus to a worker without a day in the week, and refuses a stranger', () => {
		expect(adjust(boris, 'plus', 1000).lines[1]).toMatchObject({
			daysWorked: 0,
			payoutMinor: 100_000
		});
		expect(() => adjust(9999, 'plus', 1000)).toThrow(NotFoundError);
	});

	it('requires the reason of a non-zero adjustment and whole roubles', () => {
		const base = { week: WEEK, staffId: 1, direction: 'plus', amountMinor: 10_000 };
		expect(payrollAdjustSchema.safeParse({ ...base, comment: ' ' }).success).toBe(false);
		expect(payrollAdjustSchema.safeParse({ ...base, comment: 'Премия' }).success).toBe(true);
		expect(payrollAdjustSchema.safeParse({ ...base, amountMinor: 0, comment: '' }).success).toBe(
			true
		);
		expect(payrollAdjustSchema.safeParse({ ...base, amountMinor: 150, comment: 'x' }).success).toBe(
			false
		);
	});
});

describe('closing a week', () => {
	it('freezes the sheet: later prices and days do not move it', () => {
		markControlWeek();
		adjust(boris, 'plus', 5000, 'Премия');
		closing().close('2026-10-09');

		const closed = weeks().week(WEEK);
		expect(closed).toMatchObject({ status: 'calculated', closedByName: 'Марина Круглова' });
		expect(closed.closedAt).toBe('2026-10-11T15:00:00.000Z');
		new WorkTypeService(actor).update({ id: assembly, title: 'Сборка', rateMinor: 99_900 });
		expect(() => days().save({ date: WEEK, staffIds: [], entries: [] })).toThrow(ConflictError);
		expect(() => adjust(anna, 'plus', 1)).toThrow(ConflictError);
		expect(figures()).toEqual([
			['Анна', 4, 223_600, 0, 223_600],
			['Борис', 3, 167_600, 500_000, 667_600],
			['Виктор', 3, 143_600, 0, 143_600],
			['Глеб', 2, 45_000, 0, 45_000]
		]);
	});

	it('leaves the idle crew off a closed sheet', () => {
		days().save({ date: WEEK, staffIds: [anna], entries: [{ workTypeId: assembly, qty: 1 }] });
		adjust(boris, 'plus', 100);
		adjust(boris, 'plus', 0);
		closing().close(WEEK);
		expect(figures()).toEqual([['Анна', 1, 20_000, 0, 20_000]]);
	});

	it('publishes payroll.week_closed and journals the close', () => {
		markControlWeek();
		closing().close(WEEK);
		const periodId = weeks().week(WEEK).periodId;

		expect(db.select().from(jobQueue).all()).toEqual([
			expect.objectContaining({
				topic: 'notification.fanout',
				payload: { eventKey: 'payroll.week_closed', entityId: periodId },
				idempotencyKey: `fanout:payroll.week_closed:${periodId}`
			})
		]);
		expect(db.select().from(auditLog).all().at(-1)).toMatchObject({
			action: 'payroll.close',
			entity: 'payroll_periods',
			entityId: periodId,
			after: { startsOn: WEEK, lines: 4, totalPayoutMinor: 579_800 }
		});
	});

	it('refuses an empty week and a second close', () => {
		expect(() => closing().close(WEEK)).toThrow(ValidationError);
		markControlWeek();
		closing().close(WEEK);
		expect(() => closing().close(WEEK)).toThrow(ConflictError);
	});

	it('refuses to close while a withholding exceeds what the days now give', () => {
		days().save({ date: WEEK, staffIds: [anna], entries: [{ workTypeId: assembly, qty: 5 }] });
		adjust(anna, 'minus', 900);
		days().save({ date: WEEK, staffIds: [anna], entries: [{ workTypeId: assembly, qty: 1 }] });
		expect(() => closing().close(WEEK)).toThrow(ValidationError);
	});
});

describe('opening a closed week again', () => {
	it('lets the days change again and journals the reason', () => {
		markControlWeek();
		closing().close(WEEK);
		const periodId = weeks().week(WEEK).periodId ?? 0;

		closing().reopen({ periodId, comment: 'Забыли пятницу' });
		expect(weeks().week(WEEK)).toMatchObject({ status: 'open', closedAt: null });
		expect(db.select().from(auditLog).all().at(-1)).toMatchObject({
			action: 'payroll.reopen',
			entityId: periodId,
			before: { status: 'calculated' },
			after: { status: 'open', comment: 'Забыли пятницу' }
		});
		days().save({
			date: '2026-10-10',
			staffIds: [gleb],
			entries: [{ workTypeId: sanding, qty: 1 }]
		});
		expect(figures()[3]).toEqual(['Глеб', 3, 53_000, 0, 53_000]);
		// A second close of the same week must not trip over the event it already published.
		closing().close(WEEK);
		expect(weeks().week(WEEK).status).toBe('calculated');
	});

	it('refuses an open week, an unknown one and a week with a payout marked', () => {
		markControlWeek();
		const periodId = weeks().week(WEEK).periodId ?? 0;
		expect(() => closing().reopen({ periodId, comment: 'x' })).toThrow(ConflictError);
		expect(() => closing().reopen({ periodId: 9999, comment: 'x' })).toThrow(NotFoundError);
		closing().close(WEEK);
		closing().pay({ lineId: lineOf(anna), comment: null });
		expect(() => closing().reopen({ periodId, comment: 'x' })).toThrow(ConflictError);
		closing().unpay(lineOf(anna));
		closing().reopen({ periodId, comment: 'Ошибка в среде' });
		expect(weeks().week(WEEK).status).toBe('open');
	});

	it('requires a reason', () => {
		expect(payrollReopenSchema.safeParse({ periodId: 1, comment: '  ' }).success).toBe(false);
	});
});

describe('marking payouts', () => {
	it('turns the week paid with the last payout and back when one is taken off', () => {
		markControlWeek();
		closing().close(WEEK);
		for (const staffId of [anna, boris, viktor]) {
			closing().pay({ lineId: lineOf(staffId), comment: 'Наличными' });
		}
		expect(weeks().week(WEEK).status).toBe('calculated');
		closing().pay({ lineId: lineOf(gleb), comment: null });

		const paid = weeks().week(WEEK);
		expect(paid.status).toBe('paid');
		expect(paid.lines[0]).toMatchObject({
			paidAt: '2026-10-11T15:00:00.000Z',
			paidComment: 'Наличными'
		});
		expect(() => days().save({ date: WEEK, staffIds: [], entries: [] })).toThrow(ConflictError);

		closing().unpay(lineOf(gleb));
		expect(weeks().week(WEEK).status).toBe('calculated');
		expect(weeks().week(WEEK).lines[3]).toMatchObject({ paidAt: null, paidComment: null });
		expect(db.select({ action: auditLog.action }).from(auditLog).all().slice(-2)).toEqual([
			{ action: 'payroll.pay' },
			{ action: 'payroll.unpay' }
		]);
	});

	it('refuses a payout in an open week, a second one and a line with nothing to pay', () => {
		markControlWeek();
		adjust(gleb, 'minus', 450, 'Аванс');
		expect(() => closing().pay({ lineId: lineOf(gleb), comment: null })).toThrow(ConflictError);
		closing().close(WEEK);
		expect(() => closing().pay({ lineId: lineOf(gleb), comment: null })).toThrow(ValidationError);
		closing().pay({ lineId: lineOf(anna), comment: null });
		expect(() => closing().pay({ lineId: lineOf(anna), comment: null })).toThrow(ConflictError);
		expect(() => closing().unpay(lineOf(boris))).toThrow(ConflictError);
		expect(() => closing().pay({ lineId: 9999, comment: null })).toThrow(NotFoundError);
	});

	it('counts a week paid when the only unpaid line owes nothing', () => {
		markControlWeek();
		adjust(gleb, 'minus', 450, 'Аванс');
		closing().close(WEEK);
		for (const staffId of [anna, boris, viktor])
			closing().pay({ lineId: lineOf(staffId), comment: null });
		expect(weeks().week(WEEK).status).toBe('paid');
	});
});

describe('the report over any dates', () => {
	const report = (from: string, to: string) =>
		new PayrollReportService(actor, calendar()).report({ from, to });

	it('sums earnings by worker and output by work, adjustments aside', () => {
		markControlWeek();
		adjust(boris, 'plus', 5000, 'Премия');

		const whole = report('2026-10-05', '2026-10-11');
		expect(whole.staff).toEqual([
			{ staffId: anna, fullName: 'Анна', daysWorked: 4, accruedMinor: 223_600 },
			{ staffId: boris, fullName: 'Борис', daysWorked: 3, accruedMinor: 167_600 },
			{ staffId: viktor, fullName: 'Виктор', daysWorked: 3, accruedMinor: 143_600 },
			{ staffId: gleb, fullName: 'Глеб', daysWorked: 2, accruedMinor: 45_000 }
		]);
		expect(whole.works).toEqual([
			{ workTypeId: lacquer, title: 'Лакировка', qty: 8, amountMinor: 96_000 },
			{ workTypeId: assembly, title: 'Сборка', qty: 21, amountMinor: 420_000 },
			{ workTypeId: sanding, title: 'Шлифовка', qty: 8, amountMinor: 64_000 }
		]);
		expect(whole.worksTotalMinor).toBe(580_000);
		// Monday keeps 2 roubles of the split: 2000 − 3 × 666.
		expect(whole.accruedTotalMinor).toBe(579_800);
	});

	it('keeps to the dates asked for, both ends included', () => {
		markControlWeek();
		const part = report('2026-10-06', '2026-10-07');
		expect(part.staff.map((row) => [row.fullName, row.daysWorked])).toEqual([
			['Анна', 2],
			['Борис', 2],
			['Виктор', 1],
			['Глеб', 1]
		]);
		expect(part.worksTotalMinor).toBe(244_000);
		expect(report('2026-09-01', '2026-09-30')).toMatchObject({ staff: [], works: [] });
	});

	it('refuses a reversed range and one longer than a year', () => {
		expect(() => report('2026-10-07', '2026-10-06')).toThrow(ValidationError);
		expect(() => report('2025-01-01', '2026-10-06')).toThrow(ValidationError);
	});

	it('opens with the current week up to today', () => {
		expect(new PayrollReportService(actor, calendar()).defaultRange()).toEqual({
			from: '2026-10-05',
			to: '2026-10-11'
		});
	});
});
