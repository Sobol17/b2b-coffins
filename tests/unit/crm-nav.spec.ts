import { describe, expect, it } from 'vitest';
import { crmNav, type CrmNavRights } from '../../src/lib/crm/nav';

const NONE: CrmNavRights = {
	requests: false,
	shop: false,
	delivery: false,
	stock: false,
	payroll: false,
	reports: false,
	catalog: false,
	counterparties: false,
	support: false,
	settings: false,
	audit: false
};

const work = (rights: CrmNavRights) =>
	crmNav(rights)
		.filter((link) => link.group === 'Работа')
		.map((link) => link.label);

describe('CRM sections and support threads (v1.57)', () => {
	it('closes the work group with «Обращения» for a role that answers counterparties', () => {
		expect(work({ ...NONE, requests: true, shop: true, delivery: true, support: true })).toEqual([
			'Доска',
			'Заявки',
			'Цех',
			'Доставка',
			'Обращения'
		]);
	});

	it('leaves «Обращения» out for a role without the right', () => {
		expect(work({ ...NONE, delivery: true })).toEqual(['Доставка']);
	});
});
