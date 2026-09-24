import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from '../../src/lib/server/auth/password';
import type { Db } from '../../src/lib/server/db/client';
import {
	counterparties,
	deliveryAddresses,
	priceLists,
	roles,
	settings,
	userRoles,
	users
} from '../../src/lib/server/db/schema';
import { staffLimitDefaultSchema } from '../../src/lib/validation/settings';
import { definedProps } from '../../src/lib/utils/props';
import { readOptions, STRING_OPTION } from './args';

const schema = z.object({
	name: z.string().min(1),
	'price-list': z.string().min(1),
	discount: z.coerce.number().int().min(0).max(100).default(0),
	scheme: z.enum(['on_fact', 'weekly', 'monthly']).default('on_fact'),
	inn: z.string().optional(),
	address: z.string().optional(),
	phone: z.string().optional(),
	email: z.email().optional(),
	'admin-email': z.email(),
	'admin-name': z.string().min(1),
	'admin-password': z.string().min(12)
});

/** The owner sets the seats of a new counterparty in the CRM (C1); the column default is the fallback. */
function defaultStaffLimit(db: Db): number | undefined {
	const [row] = db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, 'counterparty.staff_limit_default'))
		.all();
	const parsed = staffLimitDefaultSchema.safeParse(row?.value);
	return parsed.success ? parsed.data : undefined;
}

export async function counterpartyCreate(db: Db, argv: readonly string[]): Promise<void> {
	const input = readOptions(
		argv,
		{
			name: STRING_OPTION,
			'price-list': STRING_OPTION,
			discount: STRING_OPTION,
			scheme: STRING_OPTION,
			inn: STRING_OPTION,
			address: STRING_OPTION,
			phone: STRING_OPTION,
			email: STRING_OPTION,
			'admin-email': STRING_OPTION,
			'admin-name': STRING_OPTION,
			'admin-password': STRING_OPTION
		},
		schema
	);

	const [priceList] = db
		.select({ id: priceLists.id })
		.from(priceLists)
		.where(eq(priceLists.title, input['price-list']))
		.all();
	if (!priceList) throw new Error(`price list "${input['price-list']}" not found`);

	const [adminRole] = db
		.select({ id: roles.id })
		.from(roles)
		.where(eq(roles.code, 'cp_admin'))
		.all();
	if (!adminRole) throw new Error('role cp_admin is missing, run the seed first');

	const passwordHash = await hashPassword(input['admin-password']);
	const staffLimit = defaultStaffLimit(db);

	// One transaction: a counterparty without its administrator cannot log in and cannot be fixed
	// from the portal, so a half-applied command would leave dead data behind.
	const result = db.transaction((tx) => {
		const [counterparty] = tx
			.insert(counterparties)
			.values({
				name: input.name,
				inn: input.inn ?? null,
				address: input.address ?? null,
				phone: input.phone ?? null,
				email: input.email ?? null,
				priceListId: priceList.id,
				discountPercent: input.discount,
				settlementScheme: input.scheme,
				...definedProps({ staffLimit })
			})
			.returning()
			.all();
		if (!counterparty) throw new Error(`failed to create counterparty ${input.name}`);

		if (input.address) {
			tx.insert(deliveryAddresses)
				.values({
					counterpartyId: counterparty.id,
					title: 'Основной адрес',
					address: input.address,
					isDefault: true
				})
				.run();
		}

		const [admin] = tx
			.insert(users)
			.values({
				email: input['admin-email'],
				passwordHash,
				fullName: input['admin-name'],
				scope: 'portal',
				counterpartyId: counterparty.id,
				mustChangePassword: true
			})
			.returning()
			.all();
		if (!admin) throw new Error(`failed to create administrator ${input['admin-email']}`);

		tx.insert(userRoles).values({ userId: admin.id, roleId: adminRole.id }).run();
		return { counterpartyId: counterparty.id, adminId: admin.id };
	});

	console.log(JSON.stringify({ ...result, name: input.name, admin: input['admin-email'] }));
}
