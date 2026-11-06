import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { WORK_ROLES } from '$lib/types/roles';
import { bool, createdAt, pk, ts, updatedAt } from './_shared';
import { requestItems, requests } from './requests';
import { stockMoves } from './stock';
import { users } from './users';

/** A visit of one request to one station. It holds «Взять в работу» and «Выполнено»; its jobs are the pieces. */
export const shopTasks = sqliteTable(
	'shop_tasks',
	{
		id: pk(),
		requestId: integer('request_id')
			.notNull()
			.references(() => requests.id, { onDelete: 'cascade' }),
		station: text('station', { enum: WORK_ROLES }).notNull(),
		takenAt: ts('taken_at'),
		takenById: integer('taken_by_id').references(() => users.id),
		completedAt: ts('completed_at'),
		// Null when the dispatch emptied the visit rather than a person closing it.
		completedById: integer('completed_by_id').references(() => users.id),
		createdAt: createdAt()
	},
	(t) => [
		index('shop_tasks_station_idx').on(t.station, t.completedAt),
		index('shop_tasks_request_idx').on(t.requestId)
	]
);

/** Pieces of one request line the stations make. The job rides from visit to visit until the upholsterer. */
export const shopJobs = sqliteTable(
	'shop_jobs',
	{
		id: pk(),
		requestItemId: integer('request_item_id')
			.notNull()
			.references(() => requestItems.id, { onDelete: 'cascade' }),
		// The current visit, the last one once finished.
		taskId: integer('task_id')
			.notNull()
			.references(() => shopTasks.id),
		qty: integer('qty').notNull(),
		// Pieces done at the current station.
		doneQty: integer('done_qty').notNull().default(0),
		finishedAt: ts('finished_at'),
		productionMoveId: integer('production_move_id').references(() => stockMoves.id),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('shop_jobs_item_idx').on(t.requestItemId, t.finishedAt),
		index('shop_jobs_task_idx').on(t.taskId)
	]
);

/** Stable physical pieces; jobs may merge while a piece keeps its station history. */
export const shopUnits = sqliteTable(
	'shop_units',
	{
		id: pk(),
		requestItemId: integer('request_item_id').references(() => requestItems.id, {
			onDelete: 'set null'
		}),
		jobId: integer('job_id').references(() => shopJobs.id, { onDelete: 'set null' }),
		productTitle: text('product_title').notNull(),
		requestNumber: text('request_number').notNull(),
		legacyDone: bool('legacy_done').notNull().default(false)
	},
	(t) => [index('shop_units_job_idx').on(t.jobId)]
);
