import { AuditService } from '../audit/audit.service';
import type { Tx } from '../db/client';
import { ForbiddenError } from './errors';
import { withTransaction } from './tx';
import type { ActorContext } from '$lib/types/actor';
import { definedProps } from '$lib/utils/props';

export interface AuditedOutcome<T> {
	readonly result: T;
	readonly entityId: number | null;
	/** Field names and ids only: contact data and secrets never reach the journal. */
	readonly before?: Record<string, unknown>;
	readonly after?: Record<string, unknown>;
}

export abstract class BaseService {
	protected constructor(protected readonly ctx: ActorContext) {}

	protected assert(allowed: boolean, action: string): void {
		if (!allowed) throw new ForbiddenError(action);
	}

	/**
	 * Wraps a mutation so the change and its audit row commit together (tech.md 4.3): a method
	 * describes what changed, it does not write to audit_log by hand.
	 */
	protected audited<T>(
		meta: { readonly action: string; readonly entity: string },
		run: (tx: Tx) => AuditedOutcome<T>
	): T {
		return withTransaction((tx) => {
			const outcome = run(tx);
			AuditService.record(
				{
					actorId: this.ctx.userId,
					action: meta.action,
					entity: meta.entity,
					entityId: outcome.entityId,
					requestId: this.ctx.requestId,
					...definedProps({ before: outcome.before, after: outcome.after })
				},
				tx
			);
			return outcome.result;
		});
	}
}
