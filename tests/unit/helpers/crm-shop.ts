import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../../src/lib/server/db/client';
import {
	productVariants,
	requestItems,
	requests,
	shopJobs,
	shopTasks
} from '../../../src/lib/server/db/schema';
import { CrmRequestCreateService } from '../../../src/lib/server/crm-request/crm-request-create.service';
import { StockMoveService } from '../../../src/lib/server/crm-stock/stock-move.service';
import { DraftService } from '../../../src/lib/server/request/draft.service';
import { RequestSubmitService } from '../../../src/lib/server/request/request-submit.service';
import type { WorkRole } from '../../../src/lib/types/roles';
import { crmRequestCreateSchema } from '../../../src/lib/validation/crm-request';
import { insertUser } from './db';
import { crmActor, optionId, portalActor, seedOrderingWorld, variantId } from './portal-requests';
import { move } from './transitions';

const DAY_MS = 86_400_000;

export interface InWorkOptions {
	readonly inDays?: number;
	readonly urgent?: boolean;
	readonly accept?: boolean;
}

/** The ordering world of P4 with one person per station and the heads of the workshop (C19). */
export function seedShopWorld(db: Db, tag: string) {
	const world = seedOrderingWorld(db);
	const person = (role: Parameters<typeof insertUser>[0]['role']) =>
		insertUser({ email: `${role}@${tag}.example`, role, counterpartyId: null });
	const ids = {
		manager: person('manager'),
		owner: person('owner'),
		carpenter: person('carpenter'),
		grinder: person('grinder'),
		painter: person('painter'),
		upholsterer: person('upholsterer'),
		driver: person('driver')
	};
	const actors = {
		admin: portalActor('cp_admin', world.adminId, world.cpId),
		manager: crmActor('manager', ids.manager),
		owner: crmActor('owner', ids.owner),
		carpenter: crmActor('carpenter', ids.carpenter),
		grinder: crmActor('grinder', ids.grinder),
		painter: crmActor('painter', ids.painter),
		upholsterer: crmActor('upholsterer', ids.upholsterer),
		driver: crmActor('driver', ids.driver)
	};
	const volga = variantId(db, 'MDL-201-180-PIN');
	const walnut = optionId(db, 'Орех');
	const [variant] = db
		.select({ stockItemId: productVariants.stockItemId })
		.from(productVariants)
		.where(eq(productVariants.id, volga))
		.all();
	const stockItemId = variant?.stockItemId ?? 0;

	/** A counterparty request in walnut, accepted into work unless told otherwise. */
	function inWork(qty: number, opts: InWorkOptions = {}): number {
		new DraftService(actors.admin).addItem({ variantId: volga, qty, optionIds: [walnut] });
		const { id } = new RequestSubmitService(actors.admin).submit({
			deliveryAddressId: world.homeAddressId,
			deliveryAt: new Date(Date.now() + (opts.inDays ?? 10) * DAY_MS),
			deceasedName: 'Иванов Иван Иванович',
			comment: null
		});
		if (opts.urgent)
			db.update(requests).set({ priority: 'urgent' }).where(eq(requests.id, id)).run();
		if (opts.accept !== false) move(actors.manager, id, 'in_work');
		return id;
	}

	/** A request for the own shelf, in walnut, accepted into work. */
	function forStock(qty: number): number {
		const { id } = new CrmRequestCreateService(actors.manager).create(
			crmRequestCreateSchema.parse({
				kind: 'stock',
				lines: [{ variantId: String(volga), optionId: String(walnut), qty: String(qty) }]
			})
		);
		move(actors.manager, id, 'in_work');
		return id;
	}

	/** Pieces bought in or found: a manual move, so the services run the dispatch after it. */
	function purchase(qty: number): number {
		return new StockMoveService(actors.manager).create(stockItemId, {
			type: 'purchase',
			optionId: walnut,
			qty,
			reasonId: null,
			comment: null
		});
	}

	/** Open jobs of a request with their station, the carpenter first. */
	function jobsOf(requestId: number) {
		return db
			.select({
				id: shopJobs.id,
				taskId: shopJobs.taskId,
				station: shopTasks.station,
				qty: shopJobs.qty,
				doneQty: shopJobs.doneQty
			})
			.from(shopJobs)
			.innerJoin(shopTasks, eq(shopTasks.id, shopJobs.taskId))
			.innerJoin(requestItems, eq(requestItems.id, shopJobs.requestItemId))
			.where(and(eq(requestItems.requestId, requestId), isNull(shopJobs.finishedAt)))
			.orderBy(asc(shopJobs.id))
			.all();
	}

	function visitsOf(requestId: number, station?: WorkRole) {
		return db
			.select()
			.from(shopTasks)
			.where(
				and(
					eq(shopTasks.requestId, requestId),
					station === undefined ? undefined : eq(shopTasks.station, station)
				)
			)
			.orderBy(asc(shopTasks.id))
			.all();
	}

	return {
		world,
		ids,
		actors,
		volga,
		walnut,
		stockItemId,
		inWork,
		forStock,
		purchase,
		jobsOf,
		visitsOf
	};
}
