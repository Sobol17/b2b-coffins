import { describe, expect, it } from 'vitest';
import { LazyComponent } from '../../src/lib/ui/lazy.svelte';

const panel = { name: 'panel' };

describe('a panel loaded on the first open', () => {
	it('is not loaded before the control is opened', () => {
		let calls = 0;
		const lazy = new LazyComponent(() => {
			calls += 1;
			return Promise.resolve({ default: panel });
		});

		expect(calls).toBe(0);
		expect(lazy.component).toBeNull();
	});

	it('imports once however many times the control is opened', async () => {
		let calls = 0;
		const lazy = new LazyComponent(() => {
			calls += 1;
			return Promise.resolve({ default: panel });
		});

		lazy.request();
		lazy.request();
		await Promise.resolve();
		lazy.request();

		expect(calls).toBe(1);
		expect(lazy.component).toBe(panel);
	});

	it('reports a failed import instead of leaving the popover empty', async () => {
		const lazy = new LazyComponent(() => Promise.reject(new Error('offline')));

		lazy.request();
		await Promise.resolve();
		await Promise.resolve();

		expect(lazy.failed).toBe(true);
		expect(lazy.component).toBeNull();
	});
});
