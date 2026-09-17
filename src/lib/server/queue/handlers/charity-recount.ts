import { CharityRepository } from '../../charity/charity.repository';
import { CharityTotalsRepository } from '../../charity/charity-totals.repository';
import { withTransaction } from '../../core/tx';
import { streamSnapshot } from '../../events/sse';
import { streamHub, type StreamHub } from '../../events/stream';
import { OrgService } from '../../settings/org.service';
import { defineHandler, InvalidPayloadError } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';
import { parseCharityScope, tallyCharity } from '$lib/domain/charity/rate';

export interface CharityRecountDeps {
	readonly requests: CharityRepository;
	readonly totals: CharityTotalsRepository;
	readonly hub: StreamHub;
	readonly timeZone: () => string;
}

/**
 * `charity.recount` of tech.md 7.2: rebuilds one row of `charity_totals` from the frozen amounts
 * and pushes the public numbers to the `charity` stream. A full rebuild makes a rerun harmless.
 */
export function createCharityRecountHandler(deps: CharityRecountDeps) {
	return defineHandler({
		topic: 'charity.recount',
		schema: JOB_PAYLOAD_SCHEMAS['charity.recount'],
		async handle(payload, ctx) {
			const scope = parseCharityScope(payload.scope);
			if (!scope) throw new InvalidPayloadError(`unknown charity scope ${payload.scope}`);
			const timeZone = deps.timeZone();

			const total = withTransaction((tx) => {
				const tally = tallyCharity(deps.requests.frozenRows(scope, tx), scope, timeZone);
				deps.totals.put(payload.scope, tally, tx);
				return tally;
			});
			ctx.logger.info({ scope: payload.scope, ...total }, 'charity totals rebuilt');

			// A counterparty row is private: the public stream has nothing new to say about it.
			if (scope.kind !== 'counterparty') {
				deps.hub.publish(streamSnapshot('charity', ctx.now, timeZone));
			}
		}
	});
}

export const charityRecountHandler = createCharityRecountHandler({
	requests: new CharityRepository(),
	totals: new CharityTotalsRepository(),
	hub: streamHub,
	timeZone: () => OrgService.timezone()
});
