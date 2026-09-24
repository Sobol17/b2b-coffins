import { NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { OrgService } from '../settings/org.service';
import { CounterpartyBaseService } from './counterparty-base.service';
import {
	CounterpartyDetailRepository,
	type AddressRecord,
	type ContractRecord,
	type ContractValues
} from './counterparty-detail.repository';
import { CrmCounterpartyRepository } from './crm-counterparty.repository';
import { CrmCounterpartyDtoMapper } from './dto';
import { startOfDayInZone } from '$lib/domain/time/zone';
import type { ActorContext } from '$lib/types/actor';
import type { CrmContractDto, CrmDeliveryAddressDto } from '$lib/types/crm-counterparty';
import type { AddressInput, ContractInput } from '$lib/validation/crm-counterparty';

/** Contracts and delivery addresses of a counterparty (C3). */
export class CounterpartyDetailService extends CounterpartyBaseService {
	constructor(
		ctx: ActorContext,
		counterparties: CrmCounterpartyRepository = new CrmCounterpartyRepository(),
		private readonly details: CounterpartyDetailRepository = new CounterpartyDetailRepository()
	) {
		super(ctx, counterparties);
	}

	addContract(counterpartyId: number, input: ContractInput): CrmContractDto {
		return this.audited({ action: 'counterparty.contract_create', entity: 'contracts' }, (tx) => {
			this.requireCounterparty(counterpartyId, tx);
			const id = this.details.insertContract(counterpartyId, this.contractValues(input), tx);
			return {
				result: this.contractDto(counterpartyId, id, tx),
				entityId: id,
				after: { counterpartyId, number: input.number }
			};
		});
	}

	updateContract(counterpartyId: number, id: number, input: ContractInput): CrmContractDto {
		return this.audited({ action: 'counterparty.contract_update', entity: 'contracts' }, (tx) => {
			const old = this.requireContract(counterpartyId, id, tx);
			this.details.updateContract(id, this.contractValues(input), tx);
			return {
				result: this.contractDto(counterpartyId, id, tx),
				entityId: id,
				before: { number: old.number },
				after: { number: input.number }
			};
		});
	}

	deleteContract(counterpartyId: number, id: number): void {
		this.audited({ action: 'counterparty.contract_delete', entity: 'contracts' }, (tx) => {
			const old = this.requireContract(counterpartyId, id, tx);
			this.details.deleteContract(id, tx);
			return { result: undefined, entityId: id, before: { counterpartyId, number: old.number } };
		});
	}

	addAddress(counterpartyId: number, input: AddressInput): CrmDeliveryAddressDto {
		return this.audited(
			{ action: 'counterparty.address_create', entity: 'delivery_addresses' },
			(tx) => {
				this.requireCounterparty(counterpartyId, tx);
				if (input.isDefault) this.details.clearDefault(counterpartyId, tx);
				const id = this.details.insertAddress(counterpartyId, input, tx);
				return {
					result: this.requireAddress(counterpartyId, id, tx),
					entityId: id,
					after: { counterpartyId, isDefault: input.isDefault }
				};
			}
		);
	}

	updateAddress(counterpartyId: number, id: number, input: AddressInput): CrmDeliveryAddressDto {
		return this.audited(
			{ action: 'counterparty.address_update', entity: 'delivery_addresses' },
			(tx) => {
				const old = this.requireAddress(counterpartyId, id, tx);
				if (input.isDefault) this.details.clearDefault(counterpartyId, tx);
				this.details.updateAddress(id, input, tx);
				return {
					result: this.requireAddress(counterpartyId, id, tx),
					entityId: id,
					before: { isDefault: old.isDefault },
					after: { isDefault: input.isDefault }
				};
			}
		);
	}

	/** Soft: sent requests keep pointing at the address they were delivered to. */
	removeAddress(counterpartyId: number, id: number): void {
		this.audited({ action: 'counterparty.address_delete', entity: 'delivery_addresses' }, (tx) => {
			const old = this.requireAddress(counterpartyId, id, tx);
			this.details.softDeleteAddress(id, tx);
			return {
				result: undefined,
				entityId: id,
				before: { counterpartyId, isDefault: old.isDefault }
			};
		});
	}

	setDefaultAddress(counterpartyId: number, id: number): CrmDeliveryAddressDto {
		return this.audited(
			{ action: 'counterparty.address_default', entity: 'delivery_addresses' },
			(tx) => {
				this.requireAddress(counterpartyId, id, tx);
				this.details.clearDefault(counterpartyId, tx);
				this.details.setDefaultAddress(id, tx);
				return {
					result: this.requireAddress(counterpartyId, id, tx),
					entityId: id,
					after: { counterpartyId }
				};
			}
		);
	}

	/** Dates of the form are calendar days of the workshop, stored as the instant the day starts. */
	private contractValues(input: ContractInput): ContractValues {
		const zone = OrgService.timezone();
		const day = (value: string | null): Date | null => {
			if (value === null) return null;
			const start = startOfDayInZone(value, zone);
			if (start === null) throw new ValidationError('Выберите дату');
			return start;
		};
		return {
			number: input.number,
			signedAt: day(input.signedAt),
			validUntil: day(input.validUntil)
		};
	}

	private contractDto(counterpartyId: number, id: number, tx: Tx): CrmContractDto {
		return CrmCounterpartyDtoMapper.toContract(this.requireContract(counterpartyId, id, tx));
	}

	/** Looked up inside the counterparty of the route: another counterparty's id answers 404. */
	private requireContract(counterpartyId: number, id: number, tx: Tx): ContractRecord {
		this.requireCounterparty(counterpartyId, tx);
		const row = this.details.findContract(counterpartyId, id, tx);
		if (!row) throw new NotFoundError('contract');
		return row;
	}

	private requireAddress(counterpartyId: number, id: number, tx: Tx): AddressRecord {
		this.requireCounterparty(counterpartyId, tx);
		const row = this.details.findAddress(counterpartyId, id, tx);
		if (!row) throw new NotFoundError('delivery address');
		return row;
	}
}
