import { describe, expect, it } from 'vitest';
import {
	addressInputSchema,
	contractInputSchema,
	counterpartyFiltersSchema,
	createCounterpartySchema,
	issueAdminSchema,
	notesInputSchema,
	requisitesInputSchema,
	termsInputSchema
} from '../../src/lib/validation/crm-counterparty';

const requisites = {
	name: 'Ритуал-Сервис',
	legalName: '',
	inn: '',
	kpp: '',
	address: '',
	phone: '',
	email: ''
};
const terms = { priceListId: '', discountPercent: '5', settlementScheme: 'weekly', managerId: '3' };
const admin = { adminFullName: 'Анна Смирнова', adminEmail: ' Anna@RS.example ', adminPhone: '' };

describe('C3 counterparty forms', () => {
	it('stores an empty requisite as null and needs only the name', () => {
		expect(requisitesInputSchema.parse(requisites)).toEqual({
			name: 'Ритуал-Сервис',
			legalName: null,
			inn: null,
			kpp: null,
			address: null,
			phone: null,
			email: null
		});
		expect(requisitesInputSchema.safeParse({ ...requisites, name: ' ' }).success).toBe(false);
	});

	it('checks INN, KPP and the mail address the way the workshop requisites do', () => {
		const check = (patch: Record<string, string>) =>
			requisitesInputSchema.safeParse({ ...requisites, ...patch }).success;
		expect(check({ inn: '7701234567' })).toBe(true);
		expect(check({ inn: '770123456789' })).toBe(true);
		expect(check({ inn: '77012345' })).toBe(false);
		expect(check({ kpp: '770101001' })).toBe(true);
		expect(check({ kpp: '7701' })).toBe(false);
		expect(check({ email: 'not-an-address' })).toBe(false);
	});

	it('keeps the contract discount a whole percent and the staff limit within 1..1000', () => {
		expect(termsInputSchema.parse({ ...terms, staffLimit: '10' })).toEqual({
			priceListId: null,
			discountPercent: 5,
			settlementScheme: 'weekly',
			managerId: 3,
			staffLimit: 10
		});
		expect(
			termsInputSchema.safeParse({ ...terms, staffLimit: '10', discountPercent: '101' }).success
		).toBe(false);
		expect(
			termsInputSchema.safeParse({ ...terms, staffLimit: '10', discountPercent: '2.5' }).success
		).toBe(false);
		expect(termsInputSchema.safeParse({ ...terms, staffLimit: '0' }).success).toBe(false);
		expect(
			termsInputSchema.safeParse({ ...terms, staffLimit: '10', settlementScheme: 'daily' }).success
		).toBe(false);
	});

	it('creates a counterparty only together with its administrator', () => {
		const parsed = createCounterpartySchema.parse({ ...requisites, ...terms, ...admin });
		expect(parsed.admin).toEqual({
			fullName: 'Анна Смирнова',
			email: 'anna@rs.example',
			phone: null
		});
		expect(parsed.requisites.name).toBe('Ритуал-Сервис');
		expect(parsed.terms).toEqual({
			priceListId: null,
			discountPercent: 5,
			settlementScheme: 'weekly',
			managerId: 3
		});
		expect(createCounterpartySchema.safeParse({ ...requisites, ...terms }).success).toBe(false);
	});

	it('refuses a contract that ends before it is signed', () => {
		const contract = { number: '201-О', signedAt: '2026-01-10', validUntil: '2026-12-31' };
		expect(contractInputSchema.parse(contract)).toEqual(contract);
		expect(contractInputSchema.parse({ number: '1', signedAt: '', validUntil: '' })).toEqual({
			number: '1',
			signedAt: null,
			validUntil: null
		});
		expect(contractInputSchema.safeParse({ ...contract, validUntil: '2025-12-31' }).success).toBe(
			false
		);
		expect(contractInputSchema.safeParse({ ...contract, signedAt: '2026-02-31' }).success).toBe(
			false
		);
		expect(contractInputSchema.safeParse({ ...contract, number: '' }).success).toBe(false);
	});

	it('needs a title and an address for a delivery point', () => {
		expect(
			addressInputSchema.parse({
				title: 'Склад',
				address: 'ул. Ленина, 1',
				contactName: '',
				contactPhone: '',
				isDefault: 'on'
			})
		).toEqual({
			title: 'Склад',
			address: 'ул. Ленина, 1',
			contactName: null,
			contactPhone: null,
			isDefault: true
		});
		expect(addressInputSchema.safeParse({ title: 'Склад', address: '' }).success).toBe(false);
	});

	it('lower-cases the login of a new administrator', () => {
		expect(
			issueAdminSchema.parse({ fullName: 'Иван Петров', email: 'IVAN@rs.example', phone: '' })
		).toEqual({
			fullName: 'Иван Петров',
			email: 'ivan@rs.example',
			phone: null
		});
	});

	it('treats empty notes as none and caps their length', () => {
		expect(notesInputSchema.parse({ notes: '  ' })).toEqual({ notes: null });
		expect(notesInputSchema.safeParse({ notes: 'а'.repeat(5001) }).success).toBe(false);
	});

	it('drops a tampered filter instead of failing the page', () => {
		expect(
			counterpartyFiltersSchema.parse({ managerId: 'x', scheme: 'daily', hasDebt: 'maybe' })
		).toEqual({});
		expect(
			counterpartyFiltersSchema.parse({ managerId: '4', scheme: 'monthly', hasDebt: 'true' })
		).toEqual({
			managerId: 4,
			scheme: 'monthly',
			hasDebt: true
		});
	});
});
