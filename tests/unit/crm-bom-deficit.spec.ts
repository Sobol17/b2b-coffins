import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { BomDeficitService } from '../../src/lib/server/crm-bom/bom-deficit.service';
import { BomService } from '../../src/lib/server/crm-bom/bom.service';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { StockMoveService } from '../../src/lib/server/crm-stock/stock-move.service';
import { bomVersions } from '../../src/lib/server/db/schema';
import { DraftService } from '../../src/lib/server/request/draft.service';
import { RequestSubmitService } from '../../src/lib/server/request/request-submit.service';
import { stockItemId } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	optionId,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import { move } from './helpers/transitions';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const admin = portalActor('cp_admin', world.adminId, world.cpId);
const managerId = insertUser({ email: 'mgr@c9d.example', role: 'manager', counterpartyId: null });
const manager = crmActor('manager', managerId);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const WALNUT = optionId(db, 'Орех');
const PINE = stockItemId(db, 'CMP-BOARD-PINE');
const LACQUER = stockItemId(db, 'CMP-LACQUER');
const SATIN = stockItemId(db, 'CMP-FABRIC-SATIN');

/** A counterparty request in work or still new: only the first feeds the production queue. */
function request(qty: number, accept = true): number {
	new DraftService(admin).addItem({ variantId: VOLGA_180, qty, optionIds: [WALNUT] });
	const { id } = new RequestSubmitService(admin).submit({
		deliveryAddressId: world.homeAddressId,
		deliveryAt: new Date(Date.now() + 10 * 86_400_000),
		deceasedName: 'Иванов Иван Иванович',
		comment: null
	});
	if (accept) move(manager, id, 'in_work');
	return id;
}

function purchase(itemId: number, qty: number) {
	new StockMoveService(manager).create(itemId, {
		type: 'purchase',
		optionId: null,
		qty,
		reasonId: null,
		comment: null
	});
}

const deficit = (ctx = manager) => new BomDeficitService(ctx).list();

beforeEach(() => {
	resetRequests(db);
	db.delete(bomVersions).run();
	const bom = new BomService(manager);
	bom.createVersion();
	bom.createNorm({ variantId: VOLGA_180, componentId: PINE, qtyPerUnitMilli: 2400 });
	bom.createNorm({ variantId: VOLGA_180, componentId: LACQUER, qtyPerUnitMilli: 350 });
	bom.createNorm({ variantId: VOLGA_180, componentId: SATIN, qtyPerUnitMilli: 1000 });
});

describe('need and deficit of components (C9 DoD)', () => {
	it('counts the need from the requests in work and lists the deficit first', () => {
		request(3);
		request(2);
		request(50, false);
		purchase(PINE, 5);
		purchase(SATIN, 20);

		const { version, rows } = deficit();

		expect(version).toBe(1);
		expect(rows.map((row) => [row.code, row.needMilli, row.balance, row.deficitMilli])).toEqual([
			['CMP-BOARD-PINE', 12_000, 5, 7000],
			['CMP-LACQUER', 1750, 0, 1750],
			['CMP-FABRIC-SATIN', 5000, 20, 0]
		]);
		expect(rows[0]).toMatchObject({ title: 'Доска сосновая 25 мм', unitTitle: 'м2' });
	});

	it('drops the need by the pieces already made', () => {
		request(5);
		purchase(PINE, 100);

		new ShopService(manager).produce({ variantId: VOLGA_180, optionId: WALNUT, qty: 4 });

		const pine = deficit().rows.find((row) => row.componentId === PINE);
		// 100 on the shelf, 4 pieces took 9,6: nine whole units are written off, one piece is left.
		expect(pine).toMatchObject({ needMilli: 2400, balance: 91, deficitMilli: 0 });
	});

	it('is empty when nothing is in work or no version is active', () => {
		expect(deficit().rows).toEqual([]);
		request(2);
		db.update(bomVersions).set({ isActive: false }).run();

		expect(deficit()).toEqual({ version: null, rows: [] });
	});

	it('carries no money and no request data', () => {
		request(1);

		expect(JSON.stringify(deficit())).not.toMatch(/Minor|requestId|counterparty/);
	});

	it('opens with stock.read and stays closed to the driver and the portal', () => {
		expect(deficit(crmActor('carpenter', managerId)).rows).toEqual([]);
		expect(() => deficit(crmActor('driver', managerId))).toThrow(ForbiddenError);
		expect(() => deficit(admin)).toThrow(ForbiddenError);
	});
});
