import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { auditLog, requests } from '../../src/lib/server/db/schema';
import { DraftService } from '../../src/lib/server/request/draft.service';
import { migratedDatabase } from './helpers/db';
import {
	optionId,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const admin = () => new DraftService(portalActor('cp_admin', world.adminId, world.cpId));
const employee = () => new DraftService(portalActor('cp_employee', world.employeeId, world.cpId));

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const MATTE = optionId(db, 'Матовая отделка');
const GLOSS = optionId(db, 'Глянцевая отделка');
const SATIN = optionId(db, 'Обивка атлас');

beforeEach(() => resetRequests(db));

describe('the portal draft (P4)', () => {
	it('opens a numbered draft with the default address on the first line', () => {
		const draft = admin().addItem({ variantId: VOLGA_180, qty: 2, optionIds: [SATIN, MATTE] });

		expect(draft.number).toMatch(/^З-\d{4}-\d{5}$/);
		expect(draft.deliveryAddressId).toBe(world.homeAddressId);
		expect(draft.items).toHaveLength(1);
		expect(draft.items[0]?.options.map((option) => option.title).sort()).toEqual([
			'Матовая отделка',
			'Обивка атлас'
		]);
	});

	it('merges the same variant and options into one line and keeps other options apart', () => {
		admin().addItem({ variantId: VOLGA_180, qty: 2, optionIds: [MATTE, SATIN] });
		admin().addItem({ variantId: VOLGA_180, qty: 3, optionIds: [SATIN, MATTE] });
		const draft = admin().addItem({ variantId: VOLGA_180, qty: 1, optionIds: [GLOSS, SATIN] });

		expect(draft.items.map((item) => item.qty)).toEqual([5, 1]);
		expect(draft.unitCount).toBe(6);
	});

	it('prices lines at the personal price with surcharges and takes the contract discount off the sum', () => {
		const draft = admin().addItem({ variantId: VOLGA_180, qty: 5, optionIds: [MATTE, SATIN] });

		// Partner list 8 300 ₽ + satin 800 ₽ + matte 0 ₽ = 9 100 ₽ a piece.
		expect(draft.items[0]).toMatchObject({ unitPriceMinor: 910_000, lineTotalMinor: 4_550_000 });
		expect(draft).toMatchObject({
			itemsTotalMinor: 4_550_000,
			discountPercent: 5,
			discountMinor: 227_500,
			totalMinor: 4_322_500
		});
	});

	it('stores the totals of an employee draft but sends the employee no money at all', () => {
		const draft = employee().addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });

		expect(JSON.stringify(draft)).not.toContain('Minor');
		expect(draft).not.toHaveProperty('discountPercent');
		const [row] = db
			.select({ total: requests.totalMinor })
			.from(requests)
			.where(eq(requests.id, draft.id))
			.all();
		expect(row?.total).toBe(Math.round(830_000 * 0.95));
	});

	it('refuses on the server an option outside the matrix, two of a kind and an unknown variant', () => {
		const hardwarePremium = optionId(db, 'Фурнитура премиум');
		const economy = variantId(db, 'MDL-101-180-CHB');

		expect(() =>
			admin().addItem({ variantId: economy, qty: 1, optionIds: [hardwarePremium] })
		).toThrow(ValidationError);
		expect(() =>
			admin().addItem({ variantId: VOLGA_180, qty: 1, optionIds: [MATTE, GLOSS] })
		).toThrow(ValidationError);
		expect(() => admin().addItem({ variantId: 999_999, qty: 1, optionIds: [] })).toThrow(
			NotFoundError
		);
		expect(db.select().from(requests).all()).toHaveLength(0);
	});

	it('changes the quantity, removes a line and clears, and never touches another draft', () => {
		const adminDraft = admin().addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });
		const lineId = adminDraft.items[0]?.id ?? 0;
		employee().addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });

		expect(admin().setQty(lineId, 7).items[0]?.qty).toBe(7);
		expect(() => employee().setQty(lineId, 1)).toThrow(NotFoundError);
		expect(() => employee().removeItem(lineId)).toThrow(NotFoundError);
		expect(admin().removeItem(lineId).items).toHaveLength(0);
		expect(employee().clear()?.items).toHaveLength(0);
	});

	it('saves delivery details but refuses an address of another counterparty', () => {
		admin().addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });

		expect(() =>
			admin().saveDetails({
				deliveryAddressId: world.foreignAddressId,
				isPickup: false,
				comment: null,
				externalNumber: null
			})
		).toThrow(NotFoundError);
		const draft = admin().saveDetails({
			deliveryAddressId: null,
			isPickup: true,
			comment: 'После 14:00',
			externalNumber: 'РС-77'
		});
		expect(draft).toMatchObject({
			isPickup: true,
			comment: 'После 14:00',
			externalNumber: 'РС-77'
		});
		expect(draft.addresses.map((address) => address.id)).toEqual([world.homeAddressId]);
	});

	it('numbers the drafts of different people one after another', () => {
		const first = admin().addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] }).number;
		const second = employee().addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] }).number;

		expect(Number(second.slice(-5))).toBe(Number(first.slice(-5)) + 1);
	});

	it('refuses a workshop role and journals draft changes without money', () => {
		const manager = new DraftService(portalActor('manager', world.adminId, null));
		expect(() => manager.addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] })).toThrow(
			ForbiddenError
		);

		admin().addItem({ variantId: VOLGA_180, qty: 2, optionIds: [] });
		const entries = db
			.select()
			.from(auditLog)
			.where(eq(auditLog.action, 'request.draft_item_add'))
			.all();
		expect(entries).toHaveLength(1);
		expect(JSON.stringify(entries)).not.toContain('Minor');
	});
});
