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
	finance: false,
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

describe('CRM sections and finance (v1.58)', () => {
	const books = (rights: CrmNavRights) =>
		crmNav(rights)
			.filter((link) => link.group === 'Учёт')
			.map((link) => link.label);

	it('ends the books group with «Финансы» for the owner', () => {
		expect(books({ ...NONE, stock: true, payroll: true, reports: true, finance: true })).toEqual([
			'Склад',
			'Выплаты',
			'Отчёты',
			'Финансы'
		]);
	});

	it('leaves «Финансы» out without the right', () => {
		expect(books({ ...NONE, stock: true, payroll: true, reports: true })).not.toContain('Финансы');
	});
});

describe('CRM sections of the shop crew (tech.md §20.4)', () => {
	it('puts «Цех» first for a shop role, with the stations in its hint', () => {
		const [first] = crmNav({ ...NONE, shop: true, stock: true });
		expect(first).toMatchObject({ label: 'Цех', hint: 'Заявки на станциях и отметка сделанного' });
	});
});
