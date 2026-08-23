import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from '../../src/lib/server/auth/password';
import type { Db } from '../../src/lib/server/db/client';
import { counterparties, roles, userRoles, users } from '../../src/lib/server/db/schema';
import { CRM_ROLES, PORTAL_ROLES, ROLE_CODES, type RoleCode } from '../../src/lib/types/roles';
import { readOptions, STRING_OPTION } from './args';

const schema = z
	.object({
		email: z.email(),
		name: z.string().min(1),
		role: z.enum(ROLE_CODES),
		password: z.string().min(12),
		counterparty: z.string().optional(),
		phone: z.string().optional()
	})
	.refine((v) => !isPortalRole(v.role) || v.counterparty !== undefined, {
		error: 'portal roles require --counterparty',
		path: ['counterparty']
	});

function isPortalRole(role: RoleCode): boolean {
	return (PORTAL_ROLES as readonly RoleCode[]).includes(role);
}

function counterpartyIdByName(db: Db, name: string): number {
	const [row] = db
		.select({ id: counterparties.id })
		.from(counterparties)
		.where(eq(counterparties.name, name))
		.all();
	if (!row) throw new Error(`counterparty "${name}" not found`);
	return row.id;
}

export async function userCreate(db: Db, argv: readonly string[]): Promise<void> {
	const input = readOptions(
		argv,
		{
			email: STRING_OPTION,
			name: STRING_OPTION,
			role: STRING_OPTION,
			password: STRING_OPTION,
			counterparty: STRING_OPTION,
			phone: STRING_OPTION
		},
		schema
	);

	const scope = (CRM_ROLES as readonly RoleCode[]).includes(input.role) ? 'crm' : 'portal';
	const counterpartyId = input.counterparty ? counterpartyIdByName(db, input.counterparty) : null;

	const [role] = db.select({ id: roles.id }).from(roles).where(eq(roles.code, input.role)).all();
	if (!role) throw new Error(`role ${input.role} is missing, run the seed first`);

	const [created] = db
		.insert(users)
		.values({
			email: input.email,
			passwordHash: await hashPassword(input.password),
			fullName: input.name,
			phone: input.phone ?? null,
			scope,
			counterpartyId,
			// CLI hands out a temporary password: the account must change it on first login.
			mustChangePassword: true
		})
		.returning()
		.all();
	if (!created) throw new Error(`failed to create user ${input.email}`);

	db.insert(userRoles).values({ userId: created.id, roleId: role.id }).run();
	console.log(JSON.stringify({ id: created.id, email: created.email, scope, role: input.role }));
}
