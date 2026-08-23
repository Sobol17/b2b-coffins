import type { Page } from '@playwright/test';

/** Same credentials the seed writes, so e2e and dev never drift onto different data. */
export const ACCOUNTS = {
	owner: { email: 'owner@workshop.example', password: 'Crm!Owner1', scope: 'crm' },
	manager: { email: 'manager@workshop.example', password: 'Crm!Manager1', scope: 'crm' },
	carpenter: { email: 'carpenter@workshop.example', password: 'Crm!Carp1', scope: 'crm' },
	painter: { email: 'painter@workshop.example', password: 'Crm!Paint1', scope: 'crm' },
	driver: { email: 'driver@workshop.example', password: 'Crm!Driver1', scope: 'crm' },
	cp_admin: { email: 'admin@ritual-service.example', password: 'Portal!Admin1', scope: 'portal' },
	cp_employee: {
		email: 'employee@ritual-service.example',
		password: 'Portal!Empl1',
		scope: 'portal'
	}
} as const satisfies Record<string, { email: string; password: string; scope: 'portal' | 'crm' }>;

export type RoleKey = keyof typeof ACCOUNTS;

/** Accounts the suite mutates. global-setup rewrites them before every run. */
export const TEMP_ACCOUNTS = {
	mustChange: { email: 'temp.change@workshop.example', password: 'Temp!Access1' },
	lockout: { email: 'temp.lock@workshop.example', password: 'Temp!Access2' },
	weakChange: { email: 'temp.weak@workshop.example', password: 'Temp!Access3' }
} as const;

export const HOME_BY_SCOPE = { crm: '/crm', portal: '/portal' } as const;

export async function login(page: Page, role: RoleKey): Promise<void> {
	const account = ACCOUNTS[role];
	await page.goto('/login');
	await page.fill('input[name="email"]', account.email);
	await page.fill('input[name="password"]', account.password);
	await page.click('button[type="submit"]');
	await page.waitForURL(HOME_BY_SCOPE[account.scope]);
}
