import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { matchSections, portalSections } from '../../src/lib/portal/search/portal-sections';

const ADMIN = { staff: true, prices: true };
const EMPLOYEE = { staff: false, prices: false };

const labels = (query: string, rights = ADMIN) =>
	matchSections(portalSections(rights), query).map((section) => section.label);

describe('header search sections', () => {
	it('offers the staff and price pages to the administrator only', () => {
		expect(labels('', ADMIN)).toEqual(expect.arrayContaining(['Мои сотрудники', 'Мои цены']));
		expect(labels('', EMPLOYEE)).not.toContain('Мои сотрудники');
		expect(labels('цены', EMPLOYEE)).toEqual([]);
	});

	it('finds a page by its title in any case and by a word people use for it', () => {
		expect(labels('ЗАЯВКИ')).toEqual(['Мои заявки']);
		expect(labels('корзина')).toEqual(['Заявка']);
		expect(labels('прайс')).toEqual(['Мои цены']);
	});

	it('matches the start of a word, not any fragment inside it', () => {
		expect(labels('мо')).not.toContain('Главная');
		expect(labels('мо')).toContain('Мои цены');
		expect(labels('мои це')).toEqual(['Мои цены']);
	});

	it('never offers a page outside the menu of the role', () => {
		fc.assert(
			fc.property(fc.boolean(), fc.boolean(), fc.string(), (staff, prices, query) => {
				const available = portalSections({ staff, prices });
				const found = matchSections(available, query);
				expect(found.every((section) => available.includes(section))).toBe(true);
			})
		);
	});
});
