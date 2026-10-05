import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { PAYROLL_PERIOD_STATUSES } from '$lib/types/crm-payroll';
import { bool, createdAt, money, pk, ts, updatedAt } from './_shared';
import { users } from './users';

export const staff = sqliteTable('staff', {
	id: pk(),
	fullName: text('full_name').notNull(),
	position: text('position'),
	userId: integer('user_id').references(() => users.id), // optional system account
	hiredAt: ts('hired_at'),
	firedAt: ts('fired_at'),
	isActive: bool('is_active').notNull().default(true),
	createdAt: createdAt()
});

export const workTypes = sqliteTable(
	'work_types',
	{
		id: pk(),
		title: text('title').notNull(),
		rateMinor: money('rate_minor'), // price of one unit of the work
		isActive: bool('is_active').notNull().default(true),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('work_types_title_uq').on(t.title)]
);

export const workDays = sqliteTable(
	'work_days',
	{
		id: pk(),
		workDate: ts('work_date').notNull(), // start of the calendar day in org.timezone
		totalMinor: money('total_minor'), // sum of the entries
		shareMinor: money('share_minor'), // one worker's pay for the day, whole roubles (v1.48)
		createdById: integer('created_by_id')
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [uniqueIndex('work_days_uq').on(t.workDate)]
);

export const workDayStaff = sqliteTable(
	'work_day_staff',
	{
		id: pk(),
		workDayId: integer('work_day_id')
			.notNull()
			.references(() => workDays.id, { onDelete: 'cascade' }),
		staffId: integer('staff_id')
			.notNull()
			.references(() => staff.id)
	},
	(t) => [uniqueIndex('work_day_staff_uq').on(t.workDayId, t.staffId)]
);

export const workEntries = sqliteTable(
	'work_entries',
	{
		id: pk(),
		workDayId: integer('work_day_id')
			.notNull()
			.references(() => workDays.id, { onDelete: 'cascade' }),
		workTypeId: integer('work_type_id')
			.notNull()
			.references(() => workTypes.id),
		qty: integer('qty').notNull(),
		rateMinor: money('rate_minor'), // frozen price at entry time
		amountMinor: money('amount_minor')
	},
	(t) => [uniqueIndex('work_entries_uq').on(t.workDayId, t.workTypeId)]
);

export const payrollPeriods = sqliteTable(
	'payroll_periods',
	{
		id: pk(),
		startsOn: ts('starts_on').notNull(),
		endsOn: ts('ends_on').notNull(),
		status: text('status', { enum: PAYROLL_PERIOD_STATUSES }).notNull().default('open'),
		closedById: integer('closed_by_id').references(() => users.id),
		closedAt: ts('closed_at'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('payroll_periods_uq').on(t.startsOn)]
);

export const payrollLines = sqliteTable(
	'payroll_lines',
	{
		id: pk(),
		periodId: integer('period_id')
			.notNull()
			.references(() => payrollPeriods.id, { onDelete: 'cascade' }),
		staffId: integer('staff_id')
			.notNull()
			.references(() => staff.id),
		daysWorked: integer('days_worked').notNull().default(0),
		accruedMinor: money('accrued_minor'),
		adjustmentMinor: integer('adjustment_minor').notNull().default(0),
		adjustmentComment: text('adjustment_comment'),
		payoutMinor: money('payout_minor'),
		paidAt: ts('paid_at'),
		paidComment: text('paid_comment')
	},
	(t) => [uniqueIndex('payroll_lines_uq').on(t.periodId, t.staffId)]
);
