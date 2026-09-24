import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { contracts, deliveryAddresses } from '../db/schema';
import type { AddressInput } from '$lib/validation/crm-counterparty';

export interface ContractRecord {
	readonly id: number;
	readonly number: string;
	readonly signedAt: Date | null;
	readonly validUntil: Date | null;
}

export interface ContractValues {
	readonly number: string;
	readonly signedAt: Date | null;
	readonly validUntil: Date | null;
}

export interface AddressRecord {
	readonly id: number;
	readonly title: string;
	readonly address: string;
	readonly contactName: string | null;
	readonly contactPhone: string | null;
	readonly isDefault: boolean;
}

const CONTRACT = {
	id: contracts.id,
	number: contracts.number,
	signedAt: contracts.signedAt,
	validUntil: contracts.validUntil
};

const ADDRESS = {
	id: deliveryAddresses.id,
	title: deliveryAddresses.title,
	address: deliveryAddresses.address,
	contactName: deliveryAddresses.contactName,
	contactPhone: deliveryAddresses.contactPhone,
	isDefault: deliveryAddresses.isDefault
};

/** Contracts and delivery addresses of one counterparty. Every method names the counterparty. */
export class CounterpartyDetailRepository extends BaseRepository<typeof contracts> {
	constructor() {
		super(contracts);
	}

	/** The newest first, the same order the portal uses to pick the one it shows. */
	contracts(counterpartyId: number, tx?: Tx): ContractRecord[] {
		return this.db(tx)
			.select(CONTRACT)
			.from(contracts)
			.where(eq(contracts.counterpartyId, counterpartyId))
			.orderBy(desc(contracts.signedAt), desc(contracts.id))
			.all();
	}

	findContract(counterpartyId: number, id: number, tx?: Tx): ContractRecord | undefined {
		return this.contracts(counterpartyId, tx).find((row) => row.id === id);
	}

	insertContract(counterpartyId: number, values: ContractValues, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(contracts)
			.values({ ...values, counterpartyId })
			.returning({ id: contracts.id })
			.all();
		if (!row) throw new Error('failed to insert a contract');
		return row.id;
	}

	updateContract(id: number, values: ContractValues, tx: Tx): void {
		this.db(tx).update(contracts).set(values).where(eq(contracts.id, id)).run();
	}

	deleteContract(id: number, tx: Tx): void {
		this.db(tx).delete(contracts).where(eq(contracts.id, id)).run();
	}

	/** Live addresses only: a removed one stays in the table for the requests that point at it. */
	addresses(counterpartyId: number, tx?: Tx): AddressRecord[] {
		return this.db(tx)
			.select(ADDRESS)
			.from(deliveryAddresses)
			.where(this.live(counterpartyId))
			.orderBy(
				desc(deliveryAddresses.isDefault),
				asc(deliveryAddresses.title),
				asc(deliveryAddresses.id)
			)
			.all();
	}

	findAddress(counterpartyId: number, id: number, tx?: Tx): AddressRecord | undefined {
		const [row] = this.db(tx)
			.select(ADDRESS)
			.from(deliveryAddresses)
			.where(and(this.live(counterpartyId), eq(deliveryAddresses.id, id)))
			.all();
		return row;
	}

	insertAddress(counterpartyId: number, input: AddressInput, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(deliveryAddresses)
			.values({ ...input, counterpartyId })
			.returning({ id: deliveryAddresses.id })
			.all();
		if (!row) throw new Error('failed to insert a delivery address');
		return row.id;
	}

	updateAddress(id: number, input: AddressInput, tx: Tx): void {
		this.db(tx).update(deliveryAddresses).set(input).where(eq(deliveryAddresses.id, id)).run();
	}

	softDeleteAddress(id: number, tx: Tx): void {
		this.db(tx)
			.update(deliveryAddresses)
			.set({ deletedAt: new Date(), isDefault: false })
			.where(eq(deliveryAddresses.id, id))
			.run();
	}

	setDefaultAddress(id: number, tx: Tx): void {
		this.db(tx)
			.update(deliveryAddresses)
			.set({ isDefault: true })
			.where(eq(deliveryAddresses.id, id))
			.run();
	}

	/** One default per counterparty: choosing a new one takes the flag off the previous. */
	clearDefault(counterpartyId: number, tx: Tx): void {
		this.db(tx)
			.update(deliveryAddresses)
			.set({ isDefault: false })
			.where(eq(deliveryAddresses.counterpartyId, counterpartyId))
			.run();
	}

	private live(counterpartyId: number) {
		return and(
			eq(deliveryAddresses.counterpartyId, counterpartyId),
			isNull(deliveryAddresses.deletedAt)
		);
	}
}
