import { eq } from 'drizzle-orm';
import type { Db } from '../../../src/lib/server/db/client';
import { deliveryAddresses, requests, stockMoves } from '../../../src/lib/server/db/schema';
import { DeliveryService } from '../../../src/lib/server/crm-delivery/delivery.service';
import { ShopService } from '../../../src/lib/server/crm-shop/shop.service';
import { DraftService } from '../../../src/lib/server/request/draft.service';
import { RequestSubmitService } from '../../../src/lib/server/request/request-submit.service';
import { insertUser } from './db';
import { crmActor, optionId, portalActor, seedOrderingWorld, variantId } from './portal-requests';
import { move } from './transitions';

const DAY_MS = 86_400_000;

/** The ordering world of P4 with the people of the delivery screen (C6, tech.md v1.43). */
export function seedDeliveryWorld(db: Db) {
	const world = seedOrderingWorld(db);
	const ids = {
		manager: insertUser({ email: 'mgr@c6.example', role: 'manager', counterpartyId: null }),
		owner: insertUser({ email: 'own@c6.example', role: 'owner', counterpartyId: null }),
		driver: insertUser({ email: 'drv@c6.example', role: 'driver', counterpartyId: null }),
		carpenter: insertUser({ email: 'carp@c6.example', role: 'carpenter', counterpartyId: null })
	};
	const actors = {
		admin: portalActor('cp_admin', world.adminId, world.cpId),
		manager: crmActor('manager', ids.manager),
		owner: crmActor('owner', ids.owner),
		driver: crmActor('driver', ids.driver),
		carpenter: crmActor('carpenter', ids.carpenter)
	};
	const volga = variantId(db, 'MDL-201-180-PIN');
	const walnut = optionId(db, 'Орех');

	// The driver needs a person and a pin at the door; the seeded address has neither.
	db.update(deliveryAddresses)
		.set({ contactName: 'Пётр Волков', contactPhone: '+7 900 000-00-01', lat: 55.8, lon: 37.7 })
		.where(eq(deliveryAddresses.id, world.homeAddressId))
		.run();

	/** A counterparty request accepted into work, in walnut. */
	function inWork(qty: number): number {
		new DraftService(actors.admin).addItem({ variantId: volga, qty, optionIds: [walnut] });
		const { id } = new RequestSubmitService(actors.admin).submit({
			deliveryAddressId: world.homeAddressId,
			deliveryAt: new Date(Date.now() + 5 * DAY_MS),
			deceasedName: 'Иванов Иван Иванович',
			comment: null
		});
		move(actors.manager, id, 'in_work');
		return id;
	}

	/** Made on the shop floor and assembled: the request waits on the shelf for the driver. */
	function assembled(qty: number): number {
		const id = inWork(qty);
		produce(qty);
		move(actors.manager, id, 'ready');
		return id;
	}

	function produce(qty: number): void {
		new ShopService(actors.manager).produce({ variantId: volga, optionId: walnut, qty });
	}

	/** Pieces lost from the shelf outside the fill: the count a loading cannot rely on. */
	function writeOff(qty: number): void {
		const [move] = db.select().from(stockMoves).all();
		if (!move) throw new Error('nothing on the shelf');
		db.insert(stockMoves)
			.values({
				stockItemId: move.stockItemId,
				optionId: walnut,
				qty: -qty,
				type: 'adjustment',
				occurredAt: new Date()
			})
			.run();
	}

	function delivery(ctx = actors.driver): DeliveryService {
		return new DeliveryService(ctx);
	}

	function stop(id: number, ctx = actors.driver) {
		const screen = delivery(ctx).overview();
		return [...screen.ready, ...screen.planned].find((row) => row.id === id);
	}

	/** The only line of a one-line request. */
	function lineOf(id: number) {
		const line = stop(id, actors.manager)?.lines[0];
		if (!line) throw new Error(`request ${id} has no line on the screen`);
		return line;
	}

	function toStock(id: number): void {
		db.update(requests)
			.set({ isStockRequest: true, counterpartyId: null, deliveryAddressId: null })
			.where(eq(requests.id, id))
			.run();
	}

	return {
		world,
		ids,
		actors,
		inWork,
		assembled,
		produce,
		writeOff,
		delivery,
		stop,
		lineOf,
		toStock
	};
}
