import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, createdAt, money, pk, ts, updatedAt } from './_shared';
import { dictItems } from './catalog';
import { requests } from './requests';
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

export const workRateVersions = sqliteTable('work_rate_versions', {
	id: pk(),
	version: integer('version').notNull(),
	validFrom: ts('valid_from').notNull(),
	importedById: integer('imported_by_id').references(() => users.id),
	createdAt: createdAt()
});

export const workRates = sqliteTable(
	'work_rates',
	{
		id: pk(),
		versionId: integer('version_id')
			.notNull()
			.references(() => workRateVersions.id, { onDelete: 'cascade' }),
		workTypeId: integer('work_type_id')
			.notNull()
			.references(() => dictItems.id), // dict = 'work_type'
		unitId: integer('unit_id')
			.notNull()
			.references(() => dictItems.id),
		rateMinor: money('rate_minor')
	},
	(t) => [uniqueIndex('work_rates_uq').on(t.versionId, t.workTypeId)]
);

export const workDays = sqliteTable(
	'work_days',
	{
		id: pk(),
		staffId: integer('staff_id')
			.notNull()
			.references(() => staff.id),
		workDate: ts('work_date').notNull(),
		present: bool('present').notNull().default(true),
		totalMinor: money('total_minor'), // recalculated on every entry change
		createdById: integer('created_by_id')
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [uniqueIndex('work_days_uq').on(t.staffId, t.workDate)]
);

export const workEntries = sqliteTable('work_entries', {
	id: pk(),
	workDayId: integer('work_day_id')
		.notNull()
		.references(() => workDays.id, { onDelete: 'cascade' }),
	workTypeId: integer('work_type_id')
		.notNull()
		.references(() => dictItems.id),
	qty: integer('qty').notNull(),
	rateMinor: money('rate_minor'), // frozen rate at entry time
	amountMinor: money('amount_minor'),
	requestId: integer('request_id').references(() => requests.id)
});

export const payrollPeriods = sqliteTable(
	'payroll_periods',
	{
		id: pk(),
		startsOn: ts('starts_on').notNull(),
		endsOn: ts('ends_on').notNull(),
		status: text('status', { enum: ['open', 'calculated', 'paid'] })
			.notNull()
			.default('open'),
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
