import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ConflictError,
	NotFoundError,
	RateLimitError,
	ValidationError
} from '../../src/lib/server/core/errors';
import {
	auditLog,
	jobQueue,
	priceListItems,
	productVariants,
	rateLimits,
	requestStatusHistory,
	requests
} from '../../src/lib/server/db/schema';
import { DraftService } from '../../src/lib/server/request/draft.service';
import { RequestRepeatService } from '../../src/lib/server/request/request-repeat.service';
import { RequestSubmitService } from '../../src/lib/server/request/request-submit.service';
import { migratedDatabase } from './helpers/db';
import {
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const adminCtx = portalActor('cp_admin', world.adminId, world.cpId);
const employeeCtx = portalActor('cp_employee', world.employeeId, world.cpId);
const outsiderCtx = portalActor('cp_admin', world.outsiderId, world.otherCpId);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const LADA_180 = variantId(db, 'MDL-101-180-CHB');
const pickup = { deliveryAddressId: null, isPickup: true, comment: null, externalNumber: null };
const toHome = () => ({
	deliveryAddressId: world.homeAddressId,
	isPickup: false,
	comment: 'Разгрузка после 14:00',
	externalNumber: 'РС-12'
});

function row(id: number) {
	return db.select().from(requests).where(eq(requests.id, id)).all()[0];
}

beforeEach(() => resetRequests(db));

describe('sending a request (P4)', () => {
	it('moves the draft to new with the time, a history line, the event and an audit row', () => {
		const draft = new DraftService(adminCtx).addItem({
			variantId: VOLGA_180,
			qty: 2,
			optionIds: []
		});

		const sent = new RequestSubmitService(adminCtx).submit(toHome());

		expect(sent).toEqual({ id: draft.id, number: draft.number, status: 'new' });
		expect(row(draft.id)).toMatchObject({
			status: 'new',
			comment: 'Разгрузка после 14:00',
			externalNumber: 'РС-12'
		});
		expect(row(draft.id)?.submittedAt).toBeInstanceOf(Date);
		expect(
			db
				.select()
				.from(requestStatusHistory)
				.where(eq(requestStatusHistory.requestId, draft.id))
				.all()
		).toMatchObject([{ fromStatus: 'draft', toStatus: 'new', actorId: world.adminId }]);
		expect(db.select().from(jobQueue).all()).toMatchObject([
			{ topic: 'notification.fanout', idempotencyKey: `fanout:request.submitted:${draft.id}` }
		]);
		expect(
			db.select().from(auditLog).where(eq(auditLog.action, 'request.submit')).all()
		).toHaveLength(1);
		expect(new DraftService(adminCtx).current()).toBeNull();
	});

	it('refuses to send without a delivery choice and leaves the draft as it was', () => {
		const draft = new DraftService(adminCtx).addItem({
			variantId: VOLGA_180,
			qty: 1,
			optionIds: []
		});

		expect(() => new RequestSubmitService(adminCtx).submit({ ...pickup, isPickup: false })).toThrow(
			ValidationError
		);
		expect(row(draft.id)?.status).toBe('draft');
		expect(db.select().from(jobQueue).all()).toHaveLength(0);
	});

	it('refuses an empty draft, an address of another counterparty and a second send', () => {
		new DraftService(adminCtx).addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });
		new DraftService(adminCtx).clear();
		expect(() => new RequestSubmitService(adminCtx).submit(pickup)).toThrow(ConflictError);

		new DraftService(adminCtx).addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });
		expect(() =>
			new RequestSubmitService(adminCtx).submit({
				...toHome(),
				deliveryAddressId: world.foreignAddressId
			})
		).toThrow(NotFoundError);

		new RequestSubmitService(adminCtx).submit(pickup);
		expect(() => new RequestSubmitService(adminCtx).submit(pickup)).toThrow(ConflictError);
	});

	it('refuses a position that left the storefront after it was added', () => {
		new DraftService(adminCtx).addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });
		db.update(productVariants)
			.set({ isPublished: false })
			.where(eq(productVariants.id, VOLGA_180))
			.run();
		try {
			expect(() => new RequestSubmitService(adminCtx).submit(pickup)).toThrow(ValidationError);
		} finally {
			db.update(productVariants)
				.set({ isPublished: true })
				.where(eq(productVariants.id, VOLGA_180))
				.run();
		}
	});

	it('takes the prices of the moment of sending, not of the moment of adding', () => {
		const draft = new DraftService(adminCtx).addItem({
			variantId: VOLGA_180,
			qty: 1,
			optionIds: []
		});
		const entry = and(
			eq(priceListItems.variantId, VOLGA_180),
			eq(priceListItems.priceMinor, 830_000)
		);
		db.update(priceListItems).set({ priceMinor: 800_000 }).where(entry).run();
		try {
			new RequestSubmitService(adminCtx).submit(pickup);
			expect(row(draft.id)).toMatchObject({
				itemsTotalMinor: 800_000,
				discountMinor: 40_000,
				totalMinor: 760_000
			});
		} finally {
			db.update(priceListItems)
				.set({ priceMinor: 830_000 })
				.where(and(eq(priceListItems.variantId, VOLGA_180), eq(priceListItems.priceMinor, 800_000)))
				.run();
		}
	});

	it('rate limits sending per person', () => {
		new DraftService(adminCtx).addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });
		db.insert(rateLimits)
			.values({ key: `request.submit:${world.adminId}`, hits: 30, windowStart: new Date() })
			.run();

		expect(() => new RequestSubmitService(adminCtx).submit(pickup)).toThrow(RateLimitError);
	});
});

describe('repeating a sent request (P4)', () => {
	function sentByAdmin(): number {
		new DraftService(adminCtx).addItem({ variantId: VOLGA_180, qty: 3, optionIds: [] });
		new DraftService(adminCtx).addItem({ variantId: LADA_180, qty: 2, optionIds: [] });
		return new RequestSubmitService(adminCtx).submit(pickup).id;
	}

	it('copies the lines into a new draft and skips what the storefront no longer offers', () => {
		const sentId = sentByAdmin();
		db.update(productVariants)
			.set({ isPublished: false })
			.where(eq(productVariants.id, LADA_180))
			.run();
		try {
			expect(new RequestRepeatService(adminCtx).repeat(sentId)).toEqual({ copied: 1, skipped: 1 });
			const draft = new DraftService(adminCtx).current();
			expect(draft?.items.map((item) => [item.sku, item.qty])).toEqual([['MDL-201-180-PIN', 3]]);
			expect(draft?.id).not.toBe(sentId);
		} finally {
			db.update(productVariants)
				.set({ isPublished: true })
				.where(eq(productVariants.id, LADA_180))
				.run();
		}
	});

	it('shows the last sent request with its total to the administrator only', () => {
		const sentId = sentByAdmin();

		expect(new RequestRepeatService(adminCtx).lastSent()).toMatchObject({
			id: sentId,
			itemCount: 2,
			unitCount: 5
		});
		expect(new RequestRepeatService(adminCtx).lastSent()?.totalMinor).toEqual(expect.any(Number));
		// An employee sees only the own requests, and has sent none.
		expect(new RequestRepeatService(employeeCtx).lastSent()).toBeNull();
	});

	it('does not let an employee or another counterparty repeat the administrator request', () => {
		const sentId = sentByAdmin();

		expect(() => new RequestRepeatService(employeeCtx).repeat(sentId)).toThrow(NotFoundError);
		expect(() => new RequestRepeatService(outsiderCtx).repeat(sentId)).toThrow(NotFoundError);
	});
});
