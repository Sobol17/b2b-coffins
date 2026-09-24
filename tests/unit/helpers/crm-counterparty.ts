import { PolicyService } from '../../../src/lib/server/auth/policy';
import { roles } from '../../../src/lib/server/db/schema';
import type { ActorContext } from '../../../src/lib/types/actor';
import { ROLE_CODES, type RoleCode } from '../../../src/lib/types/roles';
import { createCounterpartySchema } from '../../../src/lib/validation/crm-counterparty';
import { migratedDatabase } from './db';

/** A migrated database with every role, so portal accounts can be created by code. */
export function counterpartyDatabase() {
	const db = migratedDatabase();
	for (const code of ROLE_CODES)
		db.insert(roles).values({ code, title: code }).onConflictDoNothing().run();
	return db;
}

export function actorOf(
	role: RoleCode,
	userId: number,
	counterpartyId: number | null = null
): ActorContext {
	const codes = [role];
	return {
		userId,
		roles: codes,
		scope: PolicyService.scopeOf(codes),
		counterpartyId,
		canSeePrices: PolicyService.canSeePrices(codes),
		canSeeCost: PolicyService.canSeeCost(codes),
		requestId: 'crm-counterparty-test'
	};
}

let sequence = 0;

/** The parsed form of "new counterparty", each call with its own administrator login. */
export function newCounterparty(patch: Record<string, string> = {}) {
	sequence += 1;
	return createCounterpartySchema.parse({
		name: `Агентство ${sequence}`,
		legalName: '',
		inn: '7701234567',
		kpp: '',
		address: '',
		phone: '',
		email: '',
		priceListId: '',
		discountPercent: '3',
		settlementScheme: 'weekly',
		managerId: '',
		adminFullName: 'Анна Смирнова',
		adminEmail: `admin${sequence}@agency.example`,
		adminPhone: '',
		...patch
	});
}
