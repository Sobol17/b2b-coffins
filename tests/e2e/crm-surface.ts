import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { desc, isNull, ne, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../src/lib/server/db/client';
import {
	counterparties,
	inventories,
	priceLists,
	products,
	requests,
	stockItems
} from '../../src/lib/server/db/schema';
import type { RoleKey } from './fixtures';

/*
 * The attack surface of the CRM for the acceptance sweep (tech.md 14, C14). The routes are read from
 * the source tree, so a new screen or action joins the sweep by itself; who may open it is written
 * here by hand from tech.md 12 and the slice contracts, and a route without a line fails the run.
 */

const ROUTES_ROOT = 'src/routes/(crm)';
const OWNER: readonly RoleKey[] = ['owner'];
const ADMINS: readonly RoleKey[] = ['owner', 'manager'];
const CRM_ROLES: readonly RoleKey[] = ['owner', 'manager', 'carpenter', 'painter', 'driver'];

interface SectionRights {
	readonly prefix: string;
	readonly readers: readonly RoleKey[];
	/** Who may change the section, when that is narrower than who may read it. */
	readonly writers?: readonly RoleKey[];
}

/** Longest prefix first: a nested section overrides the one it sits in. */
const SECTIONS: readonly SectionRights[] = [
	{ prefix: '/crm/settings', readers: OWNER },
	{ prefix: '/crm/reports', readers: OWNER },
	{ prefix: '/crm/payroll', readers: ADMINS },
	{ prefix: '/crm/stock', readers: [...ADMINS, 'carpenter', 'painter'], writers: ADMINS },
	{ prefix: '/crm/delivery', readers: [...ADMINS, 'driver'] },
	{ prefix: '/crm/shop', readers: ADMINS },
	{ prefix: '/crm/board', readers: ADMINS },
	{ prefix: '/crm/requests', readers: ADMINS },
	{ prefix: '/crm/catalog', readers: ADMINS },
	{ prefix: '/crm/prices', readers: ADMINS },
	{ prefix: '/crm/counterparties', readers: ADMINS },
	{ prefix: '/crm/notifications', readers: CRM_ROLES }
];

function sectionOf(path: string): SectionRights {
	if (path === '/crm') return { prefix: '/crm', readers: CRM_ROLES };
	const section = SECTIONS.find(
		({ prefix }) =>
			path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)
	);
	if (!section) throw new Error(`no rights are declared for ${path}: add its section to SECTIONS`);
	return section;
}

export const readersOf = (path: string): readonly RoleKey[] => sectionOf(path).readers;
export const writersOf = (path: string): readonly RoleKey[] =>
	sectionOf(path).writers ?? sectionOf(path).readers;

export interface Screen {
	readonly path: string;
	/** False when the database holds no object for the route parameter: its owner then gets 404. */
	readonly exists: boolean;
}

export interface ActionTarget {
	readonly path: string;
	/** Where the form posts: the path with `?/name`, or the bare path for the default action. */
	readonly target: string;
}

function routeFiles(dir: string, name: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) return routeFiles(full, name);
		return entry.name === name ? [full] : [];
	});
}

const templateOf = (file: string): string =>
	file.slice(ROUTES_ROOT.length, file.lastIndexOf('/')) || '/';

function lastId(db: Db, table: SQLiteTable, id: AnySQLiteColumn, where?: SQL): number | null {
	const [row] = db.select({ id }).from(table).where(where).orderBy(desc(id)).limit(1).all();
	return typeof row?.id === 'number' ? row.id : null;
}

/** Real ids for the route parameters, so the owner of a screen sees it and not a 404. */
function parameters(db: Db): Readonly<Record<string, number | null>> {
	return {
		// A draft is a cart of the portal: the workshop has no card for it.
		'/crm/requests/[id]': lastId(db, requests, requests.id, ne(requests.status, 'draft')),
		'/crm/stock/[id]': lastId(db, stockItems, stockItems.id),
		'/crm/stock/[id]/export.xlsx': lastId(db, stockItems, stockItems.id),
		'/crm/stock/inventories/[id]': lastId(db, inventories, inventories.id),
		'/crm/counterparties/[id]': lastId(db, counterparties, counterparties.id),
		'/crm/catalog/[id]': lastId(db, products, products.id, isNull(products.deletedAt)),
		'/crm/prices/[id]': lastId(db, priceLists, priceLists.id)
	};
}

const YEAR = new Date().getFullYear();
const RANGE = `?from=${YEAR}-01-01&to=${YEAR}-12-31`;
/** A day that is over in every time zone: the day screen refuses a future date. */
const PAST_DAY = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Query a screen cannot be opened without. */
const QUERIES: Readonly<Record<string, string>> = {
	'/crm/payroll/sheet.xlsx': `?week=${PAST_DAY}`,
	'/crm/reports/sales/export.xlsx': RANGE,
	'/crm/reports/stock/export.xlsx': RANGE,
	'/crm/reports/funnel/export.xlsx': RANGE,
	'/crm/reports/lost/export.xlsx': RANGE,
	'/crm/reports/charity/export.xlsx': RANGE
};

function concrete(template: string, ids: Readonly<Record<string, number | null>>): Screen {
	if (template.includes('[date]')) {
		return { path: template.replace('[date]', PAST_DAY), exists: true };
	}
	if (!template.includes('[id]'))
		return { path: template + (QUERIES[template] ?? ''), exists: true };
	if (!(template in ids)) throw new Error(`no id source is declared for ${template}`);
	const id = ids[template] ?? null;
	return { path: template.replace('[id]', String(id ?? 1)), exists: id !== null };
}

/** Every page and every GET endpoint of the CRM, with real ids in place of the parameters. */
export function crmScreens(db: Db): Screen[] {
	const ids = parameters(db);
	const pages = routeFiles(ROUTES_ROOT, '+page.server.ts').map(templateOf);
	const endpoints = routeFiles(ROUTES_ROOT, '+server.ts')
		.filter((file) => /export const GET\b/.test(readFileSync(file, 'utf8')))
		.map(templateOf);
	// The home screen has no server load of its own: the layout guards it.
	return ['/crm', ...pages, ...endpoints].map((template) => concrete(template, ids));
}

/** Every form action of the CRM. A refusal comes before the lookup, so any id will do. */
export function crmActions(): ActionTarget[] {
	return routeFiles(ROUTES_ROOT, '+page.server.ts').flatMap((file) => {
		const source = readFileSync(file, 'utf8');
		const start = source.indexOf('export const actions = {');
		if (start < 0) return [];
		const block = source.slice(start, source.indexOf('} satisfies Actions', start));
		const path = templateOf(file).replace('[id]', '1').replace('[date]', PAST_DAY);
		return [...block.matchAll(/^\t(\w+):/gm)].map(([, action]) => ({
			path,
			target: action === 'default' ? path : `${path}?/${action}`
		}));
	});
}
