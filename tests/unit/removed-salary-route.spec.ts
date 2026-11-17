import { describe, expect, it } from 'vitest';
import { load } from '../../src/routes/(crm)/crm/salary/+page.server';
import type { ActorContext } from '../../src/lib/types/actor';

const actor: ActorContext = {
	userId: 1,
	roles: ['driver'],
	scope: 'crm',
	counterpartyId: null,
	canSeePrices: false,
	canSeeCost: false,
	requestId: 'removed-salary-test'
};

const open = (currentActor: ActorContext | null) =>
	Promise.resolve().then(() =>
		load({
			locals: { actor: currentActor },
			url: new URL('http://localhost/crm/salary?staffId=42&week=invalid')
		} as Parameters<typeof load>[0])
	);

describe('retired personal salary route', () => {
	it('sends an old CRM bookmark home without reading a payroll period or another employee', async () => {
		await expect(open(actor)).rejects.toMatchObject({ status: 303, location: '/crm' });
	});

	it('still requires CRM access before redirecting the bookmark', async () => {
		await expect(open({ ...actor, scope: 'portal', roles: ['cp_employee'] })).rejects.toMatchObject(
			{
				status: 403
			}
		);
		await expect(open(null)).rejects.toMatchObject({
			status: 303,
			location: '/login?redirectTo=%2Fcrm%2Fsalary'
		});
	});
});
