import type { RoleCode, Scope } from './roles';

/** Built once in hooks.server.ts and passed into every service. */
export interface ActorContext {
	readonly userId: number;
	readonly roles: readonly RoleCode[];
	readonly scope: Scope;
	/** Row-level filter for portal users. Null for CRM. */
	readonly counterpartyId: number | null;
	/** False for cp_employee, carpenter, painter, driver. */
	readonly canSeePrices: boolean;
	/** Owner only. */
	readonly canSeeCost: boolean;
	/** Correlation id for logs and audit. */
	readonly requestId: string;
}
