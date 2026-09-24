import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import {
	auditLog,
	options,
	productVariants,
	requests,
	stockMoves
} from '../../src/lib/server/db/schema';
import { DraftService } from '../../src/lib/server/request/draft.service';
import { RequestSubmitService } from '../../src/lib/server/request/request-submit.service';
import type { RoleCode } from '../../src/lib/types/roles';
import { shopProduceSchema } from '../../src/lib/validation/crm-shop';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	optionId,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import { move, statusOf } from './helpers/transitions';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const admin = portalActor('cp_admin', world.adminId, world.cpId);
const managerId = insertUser({ email: 'mgr@c5.example', role: 'manager', counterpartyId: null });
const ownerId = insertUser({ email: 'own@c5.example', role: 'owner', counterpartyId: null });
const manager = crmActor('manager', managerId);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const LADA_180 = variantId(db, 'MDL-101-180-CHB');
const WALNUT = optionId(db, 'Орех');
const WHITE = optionId(db, 'Белый');
const DAY_MS = 86_400_000;

/** A counterparty request accepted into work: the shop sees only those (tech.md v1.41). */
function inWork(qty: number, opts: { inDays?: number; urgent?: boolean; colour?: number } = {}) {
	new DraftService(admin).addItem({
		variantId: VOLGA_180,
		qty,
		optionIds: [opts.colour ?? WALNUT]
	});
	const { id } = new RequestSubmitService(admin).submit({
		deliveryAddressId: world.homeAddressId,
		deliveryAt: new Date(Date.now() + (opts.inDays ?? 10) * DAY_MS),
		deceasedName: 'Иванов Иван Иванович',
		comment: null
	});
	if (opts.urgent) db.update(requests).set({ priority: 'urgent' }).where(eq(requests.id, id)).run();
	move(manager, id, 'in_work');
	return id;
}

function shop(ctx = manager) {
	return new ShopService(ctx);
}

function produce(qty: number, colour: number | null = WALNUT) {
	shop().produce({ variantId: VOLGA_180, optionId: colour, qty });
}

function fillOf(id: number) {
	return shop()
		.overview()
		.requests.find((request) => request.id === id);
}

beforeEach(() => resetRequests(db));

describe('rights on the shop floor (C5)', () => {
	it('opens to the manager and the owner', () => {
		expect(shop().overview().queue).toEqual([]);
		expect(shop(crmActor('owner', ownerId)).overview().requests).toEqual([]);
	});

	it('is closed to the crew, the driver and the portal: they get 403', () => {
		const strangers: RoleCode[] = ['carpenter', 'painter', 'driver'];
		for (const role of strangers) {
			expect(() => shop(crmActor(role, managerId))).toThrow(ForbiddenError);
		}
		expect(() => shop(admin)).toThrow(ForbiddenError);
	});
});

describe('production marks (C5 DoD)', () => {
	it('grows the balance of the position by the marked pieces and writes the audit', () => {
		produce(3);

		const moves = db.select().from(stockMoves).all();
		expect(moves).toHaveLength(1);
		expect(moves[0]).toMatchObject({
			qty: 3,
			type: 'production',
			optionId: WALNUT,
			requestId: null,
			actorId: managerId
		});
		const audit = db.select().from(auditLog).where(eq(auditLog.action, 'stock.produce')).all();
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({ entity: 'stock_moves', entityId: moves[0]?.id });
	});

	it('keeps two colours of one variant apart', () => {
		const walnut = inWork(2);
		produce(2, WHITE);

		expect(fillOf(walnut)?.filledCount).toBe(0);
		produce(2);
		expect(fillOf(walnut)?.filledCount).toBe(2);
	});

	it('refuses a colour outside the matrix, a variant without stock item and an unknown one', () => {
		const lada = db
			.select({ stockItemId: productVariants.stockItemId })
			.from(productVariants)
			.where(eq(productVariants.id, LADA_180))
			.all()[0]?.stockItemId;
		// A colour of the catalog that no variant is made in.
		const foreignColour =
			db
				.insert(options)
				.values({ kind: 'color', title: 'Синий C5' })
				.returning({ id: options.id })
				.all()[0]?.id ?? 0;

		expect(() => produce(1, foreignColour)).toThrow(ValidationError);
		db.update(productVariants)
			.set({ stockItemId: null })
			.where(eq(productVariants.id, LADA_180))
			.run();
		expect(() => shop().produce({ variantId: LADA_180, optionId: null, qty: 1 })).toThrow(
			ValidationError
		);
		db.update(productVariants)
			.set({ stockItemId: lada ?? null })
			.where(eq(productVariants.id, LADA_180))
			.run();
		expect(() => shop().produce({ variantId: 999_999, optionId: null, qty: 1 })).toThrow(
			NotFoundError
		);
		expect(db.select().from(stockMoves).all()).toEqual([]);
	});

	it('takes whole pieces from 1 to 999 and reads an empty colour as the colourless position', () => {
		const parse = (qty: string, colour = '') =>
			shopProduceSchema.safeParse({ variantId: String(VOLGA_180), optionId: colour, qty });

		expect(['0', '1000', '1.5', ''].map((qty) => parse(qty).success)).toEqual([
			false,
			false,
			false,
			false
		]);
		expect(parse('999').data).toEqual({ variantId: VOLGA_180, optionId: null, qty: 999 });
	});
});

describe('the fill of requests in work (C5 DoD)', () => {
	it('fills the urgent request before the one due earlier', () => {
		const soon = inWork(2, { inDays: 1 });
		const urgent = inWork(2, { inDays: 9, urgent: true });

		produce(3);

		expect([fillOf(urgent)?.filledCount, fillOf(soon)?.filledCount]).toEqual([2, 1]);
		expect([fillOf(urgent)?.canAssemble, fillOf(soon)?.canAssemble]).toEqual([true, false]);
	});

	it('asks the shop for exactly the missing pieces, the nearest deadline shown', () => {
		inWork(2, { inDays: 5 });
		const soon = inWork(3, { inDays: 2 });
		produce(1);

		const [row] = shop().overview().queue;
		expect(row).toMatchObject({
			variantId: VOLGA_180,
			optionId: WALNUT,
			colorTitle: 'Орех',
			neededQty: 4,
			stockQty: 1,
			requestCount: 2,
			canProduce: true
		});
		expect(row?.nearestDeliveryAt).toBe(
			db.select().from(requests).where(eq(requests.id, soon)).all()[0]?.deliveryAt?.toISOString()
		);
	});

	it('moves a filled request to ready and keeps its pieces from the next request', () => {
		const first = inWork(2, { inDays: 3 });
		produce(2);
		move(manager, first, 'ready');
		expect(statusOf(first)).toBe('ready');

		// Even an urgent newcomer cannot take pieces an assembled request holds on the shelf.
		const second = inWork(2, { urgent: true });
		expect(fillOf(second)?.filledCount).toBe(0);
		expect(() => move(manager, second, 'ready')).toThrow(ConflictError);
		expect(statusOf(second)).toBe('in_work');
	});

	it('finds a request in work by a part of its number, the queue stays whole', () => {
		const wanted = inWork(1);
		inWork(1);
		const number = db.select().from(requests).where(eq(requests.id, wanted)).all()[0]?.number;

		const found = shop().overview(number?.slice(-5));

		expect(found.requests.map((request) => request.id)).toEqual([wanted]);
		expect(found.requestTotal).toBe(1);
		expect(found.queue[0]?.neededQty).toBe(2);
	});

	it('sends no money key and no line of a request outside work', () => {
		const id = inWork(2);
		produce(1);
		db.update(requests)
			.set({ status: 'new' })
			.where(and(eq(requests.id, id), eq(requests.status, 'in_work')))
			.run();
		inWork(1);

		const body = JSON.stringify(shop(crmActor('owner', ownerId)).overview());

		expect(body).not.toMatch(/Minor"/);
		expect(fillOf(id)).toBeUndefined();
	});
});
