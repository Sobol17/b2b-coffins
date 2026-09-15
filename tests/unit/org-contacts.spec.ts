import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../../src/lib/server/db/schema';
import { OrgService } from '../../src/lib/server/settings/org.service';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();

beforeEach(() => {
	db.delete(settings).run();
});

describe('public contacts of the landing page', () => {
	it('exposes the phone and the address and nothing else from the requisites', () => {
		db.insert(settings)
			.values({
				key: 'org.requisites',
				value: {
					name: 'ООО «Столярная мастерская»',
					inn: '7701234567',
					account: '40702810000000000001',
					phone: '+7 495 000-00-00',
					address: 'г. Москва, ул. Промышленная, д. 4'
				}
			})
			.run();

		const contacts = OrgService.publicContacts();

		expect(contacts).toEqual({
			phone: '+7 495 000-00-00',
			address: 'г. Москва, ул. Промышленная, д. 4'
		});
		expect(JSON.stringify(contacts)).not.toContain('7701234567');
	});

	it('answers with empty contacts when the setting is missing', () => {
		expect(OrgService.publicContacts()).toEqual({ phone: null, address: null });
	});

	it('answers with empty contacts when the setting is malformed', () => {
		db.insert(settings).values({ key: 'org.requisites', value: 'not an object' }).run();

		expect(OrgService.publicContacts()).toEqual({ phone: null, address: null });
	});
});
