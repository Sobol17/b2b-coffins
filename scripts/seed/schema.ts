import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { OPTION_KINDS } from '../../src/lib/types/catalog';
import { DICT_CODES } from '../../src/lib/types/dicts';
import { unknownVariables } from '../../src/lib/domain/notification/template';
import { EVENT_KEYS } from '../../src/lib/types/events';
import { NOTIFICATION_CHANNELS } from '../../src/lib/types/notifications';
import { ROLE_CODES } from '../../src/lib/types/roles';

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures');

export const roleFixture = z.object({ code: z.enum(ROLE_CODES), title: z.string().min(1) });

export const dictFixture = z.object({
	dict: z.enum(DICT_CODES),
	code: z.string().min(1),
	title: z.string().min(1),
	sortOrder: z.number().int().default(0)
});

export const numberingFixture = z.object({
	key: z.string().min(1),
	prefix: z.string(),
	period: z.enum(['none', 'year', 'month'])
});

export const notificationRuleFixture = z.object({
	eventKey: z.enum(EVENT_KEYS),
	roleCode: z.enum(ROLE_CODES),
	channel: z.enum(NOTIFICATION_CHANNELS),
	enabled: z.boolean()
});

// A placeholder the renderer does not know would fail every send, so the seed refuses it up front.
const templateText = z
	.string()
	.min(1)
	.refine((text) => unknownVariables(text).length === 0, 'unknown template variable');

export const notificationTemplateFixture = z.object({
	eventKey: z.enum(EVENT_KEYS),
	channel: z.enum(NOTIFICATION_CHANNELS),
	subject: templateText,
	body: templateText
});

const variantFixture = z.object({
	sku: z.string().min(1),
	sizeCode: z.string().min(1),
	material: z.string().min(1),
	lengthMm: z.number().int().positive(),
	widthMm: z.number().int().positive(),
	heightMm: z.number().int().positive(),
	weightG: z.number().int().positive(),
	basePriceMinor: z.number().int().nonnegative(),
	costPriceMinor: z.number().int().nonnegative()
});

export const catalogFixture = z.object({
	categories: z.array(
		z.object({ code: z.string().min(1), title: z.string().min(1), sortOrder: z.number().int() })
	),
	options: z.array(
		z.object({
			code: z.string().min(1),
			kind: z.enum(OPTION_KINDS),
			title: z.string().min(1),
			priceDeltaMinor: z.number().int()
		})
	),
	products: z.array(
		z.object({
			sku: z.string().min(1),
			title: z.string().min(1),
			category: z.string().min(1),
			sortOrder: z.number().int(),
			description: z.string(),
			variants: z.array(variantFixture).min(1),
			options: z.array(z.string().min(1))
		})
	)
});

export const priceListFixture = z.object({
	code: z.string().min(1),
	title: z.string().min(1),
	isBase: z.boolean(),
	comment: z.string().optional(),
	items: z.array(
		z.object({ variantSku: z.string().min(1), priceMinor: z.number().int().nonnegative() })
	)
});

const portalUserFixture = z.object({
	email: z.email(),
	fullName: z.string().min(1),
	phone: z.string().optional(),
	role: z.enum(['cp_admin', 'cp_employee']),
	password: z.string().min(8)
});

export const counterpartyFixture = z.object({
	name: z.string().min(1),
	legalName: z.string().optional(),
	inn: z.string().optional(),
	kpp: z.string().optional(),
	address: z.string().optional(),
	phone: z.string().optional(),
	email: z.email().optional(),
	priceList: z.string().min(1),
	discountPercent: z.number().int().min(0).max(100),
	settlementScheme: z.enum(['on_fact', 'weekly', 'monthly']),
	staffLimit: z.number().int().positive(),
	/** E-mail of a CRM user; the seed of CRM users runs first. */
	manager: z.email().optional(),
	addresses: z.array(
		z.object({
			title: z.string().min(1),
			address: z.string().min(1),
			contactName: z.string().optional(),
			contactPhone: z.string().optional(),
			isDefault: z.boolean()
		})
	),
	users: z.array(portalUserFixture).min(1)
});

export const crmUserFixture = z.object({
	email: z.email(),
	fullName: z.string().min(1),
	role: z.enum(ROLE_CODES),
	password: z.string().min(8),
	staffPosition: z.string().min(1)
});

export const staffFixture = z.object({
	fullName: z.string().min(1),
	position: z.string().min(1)
});

/** Opening balance of a stock item, posted once as an `inventory` move. */
export const stockBalanceFixture = z.object({
	stockItem: z.string().min(1),
	qty: z.number().int().positive()
});

export const stockItemFixture = z.object({
	kind: z.enum(['product', 'component']),
	code: z.string().min(1),
	title: z.string().min(1),
	unit: z.string().min(1),
	minThreshold: z.number().int().nonnegative()
});

/** Fixtures are untrusted input like any other file import, so they go through Zod too. */
export function loadFixture<T>(file: string, schema: z.ZodType<T>): T {
	const raw: unknown = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8'));
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		throw new Error(`fixture ${file} is invalid: ${z.prettifyError(parsed.error)}`);
	}
	return parsed.data;
}
