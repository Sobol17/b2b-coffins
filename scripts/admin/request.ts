import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PolicyService } from '../../src/lib/server/auth/policy';
import type { Db } from '../../src/lib/server/db/client';
import { dictItems, requests, roles, userRoles, users } from '../../src/lib/server/db/schema';
import { RequestTransitionService } from '../../src/lib/server/request/request-transition.service';
import type { ActorContext } from '../../src/lib/types/actor';
import { REQUEST_STATUSES } from '../../src/lib/types/request';
import { ROLE_CODES, type RoleCode } from '../../src/lib/types/roles';
import { readOptions, STRING_OPTION } from './args';

const schema = z.object({
	request: z.string().min(1),
	to: z.enum(REQUEST_STATUSES),
	actor: z.email(),
	reason: z.string().optional(),
	comment: z.string().optional()
});

/**
 * Runs a status move through the same service the application uses, so the console and the screen
 * can never disagree about what tech.md 6.2 allows. The automatic step that follows a move is the
 * service's business, so `delivered` reaches `awaiting_payment` without a second command.
 */
export function requestTransition(db: Db, argv: readonly string[]): void {
	const input = readOptions(
		argv,
		{
			request: STRING_OPTION,
			to: STRING_OPTION,
			actor: STRING_OPTION,
			reason: STRING_OPTION,
			comment: STRING_OPTION
		},
		schema
	);

	const [row] = db
		.select({ id: requests.id })
		.from(requests)
		.where(eq(requests.number, input.request))
		.all();
	if (!row) throw new Error(`request ${input.request} not found`);

	const moved = new RequestTransitionService(actorContext(db, input.actor)).move(row.id, {
		to: input.to,
		reasonId: input.reason ? refusalReasonId(db, input.reason) : null,
		comment: input.comment ?? null
	});

	console.log(JSON.stringify(moved));
}

/** The console acts as a real user: the same roles, the same counterparty, the same rights. */
function actorContext(db: Db, email: string): ActorContext {
	const [user] = db
		.select({ id: users.id, counterpartyId: users.counterpartyId })
		.from(users)
		.where(and(eq(users.email, email), eq(users.isActive, true)))
		.all();
	if (!user) throw new Error(`user ${email} not found`);

	const codes = db
		.select({ code: roles.code })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(eq(userRoles.userId, user.id))
		.all()
		.map((role) => role.code)
		.filter((code): code is RoleCode => (ROLE_CODES as readonly string[]).includes(code));
	if (codes.length === 0) throw new Error(`user ${email} has no role`);

	return {
		userId: user.id,
		roles: codes,
		scope: PolicyService.scopeOf(codes),
		counterpartyId: user.counterpartyId,
		canSeePrices: PolicyService.canSeePrices(codes),
		canSeeCost: PolicyService.canSeeCost(codes),
		requestId: 'admin-cli'
	};
}

function refusalReasonId(db: Db, code: string): number {
	const [item] = db
		.select({ id: dictItems.id })
		.from(dictItems)
		.where(and(eq(dictItems.dict, 'refusal_reason'), eq(dictItems.code, code)))
		.all();
	if (!item) throw new Error(`refusal reason ${code} not found`);
	return item.id;
}
