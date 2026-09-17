import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, TOAST_LIMIT, toast } from '../../src/lib/ui/toast.svelte';

describe('the toast store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		toast.clear();
	});

	afterEach(() => {
		toast.clear();
		vi.useRealTimers();
	});

	it('shows an error and removes exactly one toast', () => {
		const first = toast.error('Не удалось сохранить', { durationMs: 0 });
		const second = toast.success('Заявка сохранена', { durationMs: 0 });

		expect(toast.items).toHaveLength(2);
		expect(toast.items[0]).toMatchObject({ kind: 'error', title: 'Не удалось сохранить' });

		toast.dismiss(first);

		expect(toast.items).toHaveLength(1);
		expect(toast.items[0]?.id).toBe(second);
	});

	it('survives dismissing the same toast twice', () => {
		const id = toast.error('Сервер не ответил');
		toast.dismiss(id);
		toast.dismiss(id);

		expect(toast.items).toHaveLength(0);
	});

	it('carries a description and a link when given', () => {
		toast.info('Заявка З-26-00001 отправлена', {
			description: 'Менеджер примет её в работу',
			action: { label: 'Открыть заявку', href: '/portal/requests/1' }
		});

		expect(toast.items[0]).toMatchObject({
			kind: 'info',
			description: 'Менеджер примет её в работу',
			action: { label: 'Открыть заявку' }
		});
	});

	it('keeps an error on screen longer than a confirmation', () => {
		expect(TOAST_DURATION_MS.error).toBeGreaterThan(TOAST_DURATION_MS.success);

		toast.success('Сохранено');
		toast.error('Не сохранено');
		vi.advanceTimersByTime(TOAST_DURATION_MS.success);

		expect(toast.items.map((item) => item.kind)).toEqual(['error']);
		vi.advanceTimersByTime(TOAST_DURATION_MS.error);
		expect(toast.items).toHaveLength(0);
	});

	it('keeps a sticky toast until the user closes it', () => {
		toast.warning('Черновик не сохранён', { durationMs: 0 });
		vi.advanceTimersByTime(60_000);

		expect(toast.items).toHaveLength(1);
	});

	it('merges a repeated notice into the one on screen and restarts its timer', () => {
		const first = toast.success('Данные сохранены');
		vi.advanceTimersByTime(TOAST_DURATION_MS.success - 100);
		const second = toast.success('Данные сохранены');

		expect(second).toBe(first);
		expect(toast.items).toHaveLength(1);

		vi.advanceTimersByTime(200);
		expect(toast.items).toHaveLength(1);
	});

	it('does not merge notices that only share a title', () => {
		toast.success('Готово', { description: 'Цена сохранена' });
		toast.success('Готово', { description: 'Сотрудник добавлен' });

		expect(toast.items).toHaveLength(2);
	});

	it('drops the oldest toast once the stack is full', () => {
		const ids = Array.from({ length: TOAST_LIMIT + 1 }, (_, n) =>
			toast.info(`Сообщение ${n}`, { durationMs: 0 })
		);

		expect(toast.items).toHaveLength(TOAST_LIMIT);
		expect(toast.items.map((item) => item.id)).toEqual(ids.slice(1));
	});

	it('holds a toast while it is paused and lets it go after resume', () => {
		const id = toast.success('Позиция добавлена');
		vi.advanceTimersByTime(1000);
		toast.pause(id);
		vi.advanceTimersByTime(TOAST_DURATION_MS.success * 3);

		expect(toast.items).toHaveLength(1);

		toast.resume(id);
		vi.advanceTimersByTime(TOAST_DURATION_MS.success - 1000 - 1);
		expect(toast.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toast.items).toHaveLength(0);
	});

	it('ignores pause and resume for a toast that is gone', () => {
		const id = toast.success('Удалено');
		toast.dismiss(id);

		expect(() => {
			toast.pause(id);
			toast.resume(id);
		}).not.toThrow();
		expect(toast.items).toHaveLength(0);
	});
});
