import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { deliveryAddresses } from '../db/schema';
import type { ActorContext } from '$lib/types/actor';

export interface DeliveryAddressRow {
	readonly id: number;
	readonly title: string;
	readonly address: string;
	readonly isDefault: boolean;
}

const COLUMNS = {
	id: deliveryAddresses.id,
	title: deliveryAddresses.title,
	address: deliveryAddresses.address,
	isDefault: deliveryAddresses.isDefault
};

export class DeliveryAddressRepository extends BaseRepository<typeof deliveryAddresses> {
	constructor() {
		super(deliveryAddresses);
	}

	/** Addresses of the actor's own counterparty, the default one first. */
	listOwn(ctx: ActorContext, tx?: Tx): DeliveryAddressRow[] {
		return this.db(tx)
			.select(COLUMNS)
			.from(deliveryAddresses)
			.where(this.own(ctx))
			.orderBy(desc(deliveryAddresses.isDefault), asc(deliveryAddresses.title))
			.all();
	}

	findOwn(ctx: ActorContext, id: number, tx?: Tx): DeliveryAddressRow | undefined {
		const [row] = this.db(tx)
			.select(COLUMNS)
			.from(deliveryAddresses)
			.where(and(this.own(ctx), eq(deliveryAddresses.id, id)))
			.all();
		return row;
	}

	private own(ctx: ActorContext) {
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(deliveryAddresses.counterpartyId, counterpartyId),
			isNull(deliveryAddresses.deletedAt)
		);
	}
}
