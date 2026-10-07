import { describe, expect, it } from 'vitest';
import { isIosDevice } from '../../src/lib/ui/install.svelte';
import { detectPush } from '../../src/lib/notifications/push-browser';
import {
	leaveOnLogout,
	PushState,
	type PushBrowser
} from '../../src/lib/notifications/push-state.svelte';

const SUB = { endpoint: 'https://push.example/sub/1', p256dh: 'k', auth: 'a' };

function browser(over: Partial<PushBrowser> = {}) {
	const calls: string[] = [];
	const fake: PushBrowser = {
		supported: true,
		needsInstall: false,
		permission: () => 'default',
		requestPermission: () => Promise.resolve('granted'),
		current: () => Promise.resolve(null),
		subscribe: (key) => {
			calls.push(`subscribe:${key}`);
			return Promise.resolve(SUB);
		},
		unsubscribe: () => {
			calls.push('unsubscribe');
			return Promise.resolve();
		},
		send: (method, body) => {
			calls.push(`${method}:${JSON.stringify(body)}`);
			return Promise.resolve();
		},
		...over
	};
	return { fake, calls };
}

const granted = { permission: () => 'granted' as const, current: () => Promise.resolve(SUB) };

describe('push state of a device (C15)', () => {
	it('never subscribes when the server has no public key', async () => {
		const { fake, calls } = browser();
		const state = new PushState(fake, '');

		await state.enable();

		expect(state.status).toBe('unconfigured');
		expect(calls).toEqual([]);
	});

	it('subscribes with the public key and tells the server', async () => {
		const { fake, calls } = browser();
		const state = new PushState(fake, 'public-key');

		await state.enable();

		expect(calls).toEqual(['subscribe:public-key', `POST:${JSON.stringify(SUB)}`]);
		expect(state.status).toBe('on');
	});

	it('stays off and asks no more when the person refused', async () => {
		const { fake, calls } = browser({ requestPermission: () => Promise.resolve('denied') });
		const state = new PushState(fake, 'public-key');

		await state.enable();

		expect(state.status).toBe('blocked');
		expect(calls).toEqual([]);
	});

	it('asks to install first on iOS outside the home screen', () => {
		const state = new PushState(browser({ needsInstall: true }).fake, 'public-key');
		expect(state.status).toBe('needs_install');
	});

	it('reports a browser without push as unsupported', () => {
		const state = new PushState(browser({ supported: false }).fake, 'public-key');
		expect(state.status).toBe('unsupported');
	});

	it('sends the live subscription again on sync', async () => {
		const { fake, calls } = browser(granted);
		const state = new PushState(fake, 'public-key');
		expect(state.ready).toBe(false);

		await state.sync();

		expect(state.ready).toBe(true);

		expect(calls).toEqual([`POST:${JSON.stringify(SUB)}`]);
		expect(state.status).toBe('on');
	});

	it('does nothing on sync before the person gave a permission', async () => {
		const { fake, calls } = browser({ current: () => Promise.resolve(SUB) });
		const state = new PushState(fake, 'public-key');

		await state.sync();

		expect(calls).toEqual([]);
		expect(state.status).toBe('off');
	});

	it('removes the device on the server before it unsubscribes the browser', async () => {
		const { fake, calls } = browser(granted);
		const state = new PushState(fake, 'public-key');
		await state.sync();
		calls.length = 0;

		await state.disable();

		expect(calls).toEqual([`DELETE:${JSON.stringify({ endpoint: SUB.endpoint })}`, 'unsubscribe']);
		expect(state.status).toBe('off');
	});

	it('stays off when the server refuses the subscription', async () => {
		const { fake } = browser({ send: () => Promise.reject(new Error('500')) });
		const state = new PushState(fake, 'public-key');

		await expect(state.enable()).rejects.toThrow('500');
		expect(state.status).toBe('off');
		expect(state.busy).toBe(false);
	});

	it('stops the browser listening even when the server cannot be reached', async () => {
		const { fake, calls } = browser(granted);
		const state = new PushState(fake, 'public-key');
		await state.sync();
		calls.length = 0;
		fake.send = () => Promise.reject(new Error('offline'));

		await state.disable();

		// The dead endpoint answers 410 on the next push and the server retires the row itself.
		expect(calls).toEqual(['unsubscribe']);
		expect(state.status).toBe('off');
	});

	it('has nothing to remove on a device that was never subscribed', async () => {
		const { fake, calls } = browser();

		await new PushState(fake, 'public-key').disable();

		expect(calls).toEqual([]);
	});
});

/** A logout form as the submit handler sees it. */
function logoutForm(action: string) {
	const log: string[] = [];
	const event = {
		target: { action, submit: () => void log.push('submit') },
		preventDefault: () => void log.push('prevent')
	};
	return { event, log };
}

describe('sign-out releases the device (C15)', () => {
	it('removes the device first and then lets the form go', async () => {
		const { fake, calls } = browser(granted);
		const state = new PushState(fake, 'public-key');
		await state.sync();
		calls.length = 0;
		const { event, log } = logoutForm('http://localhost/logout');

		await leaveOnLogout(event, state);

		expect(log).toEqual(['prevent', 'submit']);
		expect(calls[0]).toContain('DELETE');
	});

	it('still signs out when the device could not be removed', async () => {
		const { fake } = browser({ ...granted, send: () => Promise.resolve() });
		const state = new PushState(fake, 'public-key');
		await state.sync();
		fake.send = () => Promise.reject(new Error('offline'));
		const { event, log } = logoutForm('http://localhost/logout');

		await leaveOnLogout(event, state);

		expect(log).toEqual(['prevent', 'submit']);
	});

	it('ignores a second tap while the first sign-out is on its way', async () => {
		let release = (): void => undefined;
		const held = new Promise<void>((resolve) => (release = resolve));
		const { fake, calls } = browser({ ...granted });
		const state = new PushState(fake, 'public-key');
		await state.sync();
		calls.length = 0;
		fake.send = (method) => {
			calls.push(method);
			return held;
		};
		const first = logoutForm('http://localhost/logout');
		const second = logoutForm('http://localhost/logout');

		const leaving = leaveOnLogout(first.event, state);
		await leaveOnLogout(second.event, state);
		release();
		await leaving;

		expect(calls.filter((call) => call === 'DELETE')).toHaveLength(1);
		expect(first.log).toEqual(['prevent', 'submit']);
		expect(second.log).toEqual(['prevent']);
	});

	it('leaves other forms and a device without push alone', async () => {
		const subscribed = new PushState(browser(granted).fake, 'public-key');
		await subscribed.sync();
		const other = logoutForm('http://localhost/crm/notifications?/save');
		await leaveOnLogout(other.event, subscribed);
		expect(other.log).toEqual([]);

		const logout = logoutForm('http://localhost/logout');
		await leaveOnLogout(logout.event, new PushState(browser().fake, 'public-key'));
		expect(logout.log).toEqual([]);
	});
});

describe('what a browser can do with push (C15)', () => {
	it('asks an iPhone in a Safari tab to install first, though the tab has no Push API', () => {
		expect(detectPush({ ios: true, standalone: false, hasApis: false })).toEqual({
			supported: true,
			needsInstall: true
		});
	});

	it('offers push to an installed iPhone app and to a desktop browser', () => {
		const ready = { supported: true, needsInstall: false };
		expect(detectPush({ ios: true, standalone: true, hasApis: true })).toEqual(ready);
		expect(detectPush({ ios: false, standalone: false, hasApis: true })).toEqual(ready);
	});

	it('reports a browser without the Push API as unsupported', () => {
		expect(detectPush({ ios: false, standalone: false, hasApis: false }).supported).toBe(false);
		expect(detectPush({ ios: true, standalone: true, hasApis: false }).supported).toBe(false);
	});

	it('knows an iPad that introduces itself as a Mac', () => {
		const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605';
		expect(isIosDevice(mac, 5)).toBe(true);
		expect(isIosDevice(mac, 0)).toBe(false);
		expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true);
		expect(isIosDevice('Mozilla/5.0 (Linux; Android 14) Chrome/126', 5)).toBe(false);
	});
});
