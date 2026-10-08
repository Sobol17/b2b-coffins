import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isLocalPath } from '../../src/lib/utils/local-path';

const HOST = 'https://arhangel.example';

describe('redirect target after login (tech.md 12)', () => {
	it('keeps a path of the application with its query', () => {
		expect(isLocalPath('/crm/requests/42')).toBe(true);
		expect(isLocalPath('/portal/requests?status=new')).toBe(true);
	});

	it('refuses an address that leaves the host', () => {
		for (const target of [
			'//evil.example',
			'/\\evil.example',
			'/\t/evil.example',
			'https://evil.example',
			'evil.example',
			''
		]) {
			expect(isLocalPath(target), JSON.stringify(target)).toBe(false);
		}
	});

	it('never accepts a target a browser resolves to another origin', () => {
		const property = fc.property(fc.string(), (target) => {
			if (!isLocalPath(target)) return true;
			return new URL(target, HOST).origin === HOST;
		});

		expect(() => fc.assert(property, { numRuns: 2000 })).not.toThrow();
	});
});
