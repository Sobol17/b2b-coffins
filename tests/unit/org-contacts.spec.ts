import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../../src/lib/server/db/schema';
import { OrgService } from '../../src/lib/server/settings/org.service';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();

beforeEach(() => {
	db.delete(settings).run();
});

describe('public contacts of the landing page', () => {
	it('exposes the contacts and the operator, never the bank details or the KPP', () => {
		db.insert(settings)
			.values({
				key: 'org.requisites',
				value: {
					name: 'ООО «Столярная мастерская»',
					inn: '7701234567',
					kpp: '770101001',
					ogrn: '1027700132195',
					email: 'office@workshop.example',
					bank: 'ПАО Банк',
					bik: '044525000',
					account: '40702810000000000001',
					phone: '+7 495 000-00-00',
					address: 'г. Москва, ул. Промышленная, д. 4'
				}
			})
			.run();

		const contacts = OrgService.publicContacts();

		expect(contacts).toEqual({
			phone: '+7 495 000-00-00',
			address: 'г. Москва, ул. Промышленная, д. 4',
			operator: {
				name: 'ООО «Столярная мастерская»',
				inn: '7701234567',
				ogrn: '1027700132195',
				email: 'office@workshop.example'
			}
		});
		const body = JSON.stringify(contacts);
		for (const secret of ['770101001', '044525000', '40702810000000000001', 'ПАО Банк']) {
			expect(body).not.toContain(secret);
		}
	});

	it('answers with empty contacts when the setting is missing', () => {
		expect(OrgService.publicContacts()).toEqual({ phone: null, address: null, operator: null });
	});

	it('answers with empty contacts when the setting is malformed', () => {
		db.insert(settings).values({ key: 'org.requisites', value: 'not an object' }).run();

		expect(OrgService.publicContacts()).toEqual({ phone: null, address: null, operator: null });
	});
});
