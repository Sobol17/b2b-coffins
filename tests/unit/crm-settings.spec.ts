import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { auditLog, numberingSequences, requests, settings } from '../../src/lib/server/db/schema';
import { Numbering } from '../../src/lib/server/numbering/numbering';
import { CrmSettingsService } from '../../src/lib/server/settings/crm-settings.service';
import { OrgService } from '../../src/lib/server/settings/org.service';
import { database } from '../../src/lib/server/db/client';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import {
	charityFormSchema,
	numberingFormSchema,
	requisitesFormSchema,
	staffLimitFormSchema,
	timezoneFormSchema
} from '../../src/lib/validation/settings-form';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const ownerId = insertUser({ email: 'owner@ws.example', role: 'owner', counterpartyId: null });
const NOW = new Date(Date.UTC(2026, 8, 24, 9));

function actor(role: RoleCode = 'owner'): ActorContext {
	const roles = [role];
	return {
		userId: ownerId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'settings-test'
	};
}

const service = (ctx: ActorContext = actor()) => new CrmSettingsService(ctx);

function issue(number: string): void {
	db.insert(requests).values({ number, createdById: ownerId, status: 'new' }).run();
}

beforeEach(() => {
	db.delete(auditLog).run();
	db.delete(settings).run();
	db.delete(requests).run();
	db.delete(numberingSequences).run();
	db.insert(numberingSequences).values({ key: 'request', prefix: 'З-', period: 'year' }).run();
	db.insert(settings).values({ key: 'org.timezone', value: 'Europe/Moscow' }).run();
});

describe('organisation settings of the CRM', () => {
	it('lets only the owner in', () => {
		for (const role of ['manager', 'carpenter', 'driver'] as const) {
			expect(() => service(actor(role))).toThrow(ForbiddenError);
		}
	});

	it('stores the rate typed in percent as basis points and journals old and new value', () => {
		db.insert(settings).values({ key: 'charity.rate_bp', value: 100 }).run();
		const form = charityFormSchema.parse({ rateBp: '1,5', fundTitle: 'Фонд', fundUrl: '' });
		service().saveCharity(form);

		expect(service().read(NOW)).toMatchObject({
			charityRateBp: 150,
			charityFund: { title: 'Фонд' }
		});
		const [entry] = db.select().from(auditLog).all();
		expect(entry).toMatchObject({
			action: 'settings.update',
			entity: 'settings',
			actorId: ownerId
		});
		expect(entry?.before).toEqual({ 'charity.rate_bp': 100, 'charity.fund': null });
		expect(entry?.after).toEqual({ 'charity.rate_bp': 150, 'charity.fund': { title: 'Фонд' } });
	});

	it('rejects a rate above 100 % or with three decimals', () => {
		const base = { fundTitle: 'Фонд', fundUrl: '' };
		expect(charityFormSchema.safeParse({ ...base, rateBp: '100.01' }).success).toBe(false);
		expect(charityFormSchema.safeParse({ ...base, rateBp: '1.555' }).success).toBe(false);
		expect(charityFormSchema.parse({ ...base, rateBp: '0.05' }).rateBp).toBe(5);
	});

	it('drops blank requisites and feeds the new phone to the landing contacts', () => {
		const form = requisitesFormSchema.parse({
			name: 'ООО «Мастерская»',
			inn: '7701234567',
			kpp: '',
			address: ' г. Тверь ',
			phone: '+7 900 000-00-01',
			email: '',
			bank: '',
			bik: '',
			account: ''
		});
		service().saveRequisites(form);

		expect(service().read(NOW).requisites).toEqual({
			name: 'ООО «Мастерская»',
			inn: '7701234567',
			address: 'г. Тверь',
			phone: '+7 900 000-00-01'
		});
		expect(OrgService.publicContacts()).toEqual({ phone: '+7 900 000-00-01', address: 'г. Тверь' });
	});

	it('checks the digits of INN, KPP, BIK and account', () => {
		const base = { name: 'ООО', kpp: '', address: '', phone: '', email: '', bank: '', bik: '' };
		const parse = (patch: Record<string, string>) =>
			requisitesFormSchema.safeParse({ ...base, inn: '', account: '', ...patch }).success;
		expect(parse({ inn: '123' })).toBe(false);
		expect(parse({ inn: '123456789012' })).toBe(true);
		expect(parse({ kpp: '12345678' })).toBe(false);
		expect(parse({ account: '4070281000000000000' })).toBe(false);
		expect(parse({ name: '' })).toBe(false);
	});

	it('keeps the timezone and the staff limit inside their shapes', () => {
		expect(timezoneFormSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
		service().saveTimezone(timezoneFormSchema.parse({ timezone: 'Asia/Yekaterinburg' }).timezone);
		expect(staffLimitFormSchema.safeParse({ staffLimitDefault: '0' }).success).toBe(false);
		service().saveStaffLimitDefault(
			staffLimitFormSchema.parse({ staffLimitDefault: '25' }).staffLimitDefault
		);

		expect(service().read(NOW)).toMatchObject({
			timezone: 'Asia/Yekaterinburg',
			staffLimitDefault: 25
		});
	});
});

describe('request numbering', () => {
	it('shows the next number in the chosen format', () => {
		expect(service().read(NOW).numbering).toEqual({
			key: 'request',
			prefix: 'З-',
			period: 'year',
			nextPreview: 'З-2026-00001'
		});
	});

	it('does not hand out a taken number after returning to an old prefix', () => {
		issue('З-2026-00001');
		issue('З-2026-00002');
		service().saveNumbering(numberingFormSchema.parse({ prefix: 'ЗК-', period: 'year' }), NOW);
		const back = service().saveNumbering(
			numberingFormSchema.parse({ prefix: 'З-', period: 'year' }),
			NOW
		);

		expect(back.nextPreview).toBe('З-2026-00003');
		const next = database.transaction((tx) =>
			new Numbering().next('request', NOW, 'Europe/Moscow', tx)
		);
		expect(next).toBe('З-2026-00003');
		const entries = db.select().from(auditLog).where(eq(auditLog.action, 'numbering.update')).all();
		expect(entries.at(-1)?.after).toEqual({ prefix: 'З-', period: 'year', lastValue: 2 });
	});

	it('refuses a prefix with spaces or longer than ten characters', () => {
		expect(numberingFormSchema.safeParse({ prefix: 'З 1', period: 'year' }).success).toBe(false);
		expect(numberingFormSchema.safeParse({ prefix: 'ЗАЯВКА-2026-', period: 'year' }).success).toBe(
			false
		);
		expect(numberingFormSchema.safeParse({ prefix: '', period: 'none' }).success).toBe(true);
	});
});
