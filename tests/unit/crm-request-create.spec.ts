import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { CrmRequestCreateService } from '../../src/lib/server/crm-request/crm-request-create.service';
import { auditLog, productVariants, requestItems, requests } from '../../src/lib/server/db/schema';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
import { crmRequestCreateSchema } from '../../src/lib/validation/crm-request';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	optionId,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import { fanouts, history } from './helpers/transitions';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const managerId = insertUser({ email: 'mgr@ws.example', role: 'manager', counterpartyId: null });
const carpenterId = insertUser({
	email: 'carp@ws.example',
	role: 'carpenter',
	counterpartyId: null
});
const manager = crmActor('manager', managerId);
const service = () => new CrmRequestCreateService(manager);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const WALNUT = optionId(db, 'Орех');

function form(patch: Record<string, unknown> = {}) {
	return crmRequestCreateSchema.parse({
		kind: 'counterparty',
		counterpartyId: String(world.cpId),
		deliveryAddressId: String(world.homeAddressId),
		deliveryDate: '2026-12-01',
		deliveryTime: '10:00',
		deceasedName: 'Иванов Иван Иванович',
		priority: 'urgent',
		comment: 'Принято по телефону',
		lines: [{ variantId: String(VOLGA_180), optionId: String(WALNUT), qty: '2' }],
		...patch
	});
}

function requestRow(id: number) {
	return db.select().from(requests).where(eq(requests.id, id)).all()[0];
}

beforeEach(() => resetRequests(db));

describe('a request entered by the workshop (C4)', () => {
	it('lands in new with a number, the delivery and the prices of the counterparty', () => {
		const created = service().create(form());
		expect(created.number).toMatch(/^З-\d{4}-\d{5}$/);

		expect(requestRow(created.id)).toMatchObject({
			status: 'new',
			counterpartyId: world.cpId,
			isStockRequest: false,
			createdById: managerId,
			priority: 'urgent',
			deliveryAddressId: world.homeAddressId,
			deceasedName: 'Иванов Иван Иванович',
			comment: 'Принято по телефону',
			// Partner price 8 300 ₽ a piece and the contract discount of 5 %, as in the cart.
			itemsTotalMinor: 1_660_000,
			discountMinor: 83_000,
			totalMinor: 1_577_000
		});
		// 10:00 on the wall clock of the workshop in Moscow.
		expect(requestRow(created.id)?.deliveryAt?.toISOString()).toBe('2026-12-01T07:00:00.000Z');
		expect(requestRow(created.id)?.submittedAt).toBeInstanceOf(Date);
	});

	it('writes the send into history, the event into the outbox and one audit row', () => {
		const created = service().create(form());
		expect(history(created.id).map((row) => [row.fromStatus, row.toStatus, row.actorId])).toEqual([
			['draft', 'new', managerId]
		]);
		const [job] = fanouts('request.submitted');
		expect(JOB_PAYLOAD_SCHEMAS['notification.fanout'].parse(job?.payload)).toEqual({
			eventKey: 'request.submitted',
			entityId: created.id
		});
		const audit = db.select().from(auditLog).where(eq(auditLog.action, 'request.create')).all();
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({ actorId: managerId, entityId: created.id });
		expect(JSON.stringify(audit[0]?.after)).not.toContain('Иванов');
	});

	it('makes a stock request without a counterparty, a delivery or a discount', () => {
		const created = service().create(
			crmRequestCreateSchema.parse({
				kind: 'stock',
				lines: [{ variantId: String(VOLGA_180), qty: '3' }]
			})
		);
		const row = requestRow(created.id);
		expect(row).toMatchObject({
			status: 'new',
			counterpartyId: null,
			isStockRequest: true,
			deliveryAddressId: null,
			deceasedName: null,
			discountMinor: 0
		});
		const [line] = db
			.select()
			.from(requestItems)
			.where(eq(requestItems.requestId, created.id))
			.all();
		expect(line?.unitPriceMinor).toBeGreaterThan(0);
		expect(row?.totalMinor).toBe((line?.unitPriceMinor ?? 0) * 3);
	});

	it('merges the same position and colour into one line', () => {
		const line = { variantId: String(VOLGA_180), optionId: String(WALNUT), qty: '2' };
		const created = service().create(form({ lines: [line, { ...line, qty: '1' }] }));
		const lines = db
			.select()
			.from(requestItems)
			.where(eq(requestItems.requestId, created.id))
			.all();
		expect(lines.map((row) => row.qty)).toEqual([3]);
	});
});

describe('what the creation refuses (C4)', () => {
	function nothingWritten(): void {
		expect(db.select().from(requests).all()).toHaveLength(0);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	}

	it('refuses an address of another counterparty and an unknown counterparty', () => {
		expect(() =>
			service().create(form({ deliveryAddressId: String(world.foreignAddressId) }))
		).toThrow(ValidationError);
		expect(() => service().create(form({ counterpartyId: '999' }))).toThrow(ValidationError);
		nothingWritten();
	});

	it('refuses a colour outside the matrix and a hidden position, leaving nothing behind', () => {
		const foreignColour = { variantId: String(VOLGA_180), optionId: '999', qty: '1' };
		expect(() => service().create(form({ lines: [foreignColour] }))).toThrow(ValidationError);
		db.update(productVariants)
			.set({ isPublished: false })
			.where(eq(productVariants.id, VOLGA_180))
			.run();
		try {
			expect(() => service().create(form())).toThrow(NotFoundError);
		} finally {
			db.update(productVariants)
				.set({ isPublished: true })
				.where(eq(productVariants.id, VOLGA_180))
				.run();
		}
		nothingWritten();
	});

	it('lets neither the crew nor the portal create a workshop request', () => {
		expect(() => new CrmRequestCreateService(crmActor('carpenter', carpenterId))).toThrow(
			ForbiddenError
		);
		expect(
			() => new CrmRequestCreateService(portalActor('cp_admin', world.adminId, world.cpId))
		).toThrow(ForbiddenError);
	});
});
