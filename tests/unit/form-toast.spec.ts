import { afterEach, describe, expect, it, vi } from 'vitest';
import { FORM_TOAST_TEXT, toastForResult } from '../../src/lib/ui/form-toast';
import { toast } from '../../src/lib/ui/toast.svelte';

describe('form action feedback', () => {
	afterEach(() => {
		toast.clear();
		vi.unstubAllGlobals();
	});

	it('confirms a successful action with the given text', () => {
		toastForResult({ type: 'success', status: 200 }, { success: 'Данные сохранены' });

		expect(toast.items).toEqual([
			expect.objectContaining({ kind: 'success', title: 'Данные сохранены' })
		]);
	});

	it('builds the confirmation from the action answer', () => {
		toastForResult(
			{ type: 'success', status: 200, data: { number: 'З-26-00007' } },
			{
				success: (data) => ({
					kind: 'info',
					title: `Заявка ${String(data?.['number'])} отправлена`
				})
			}
		);

		expect(toast.items[0]).toMatchObject({ kind: 'info', title: 'Заявка З-26-00007 отправлена' });
	});

	it('stays silent when the page asked for no confirmation', () => {
		toastForResult({ type: 'success', status: 200 }, { success: () => null });
		toastForResult({ type: 'success', status: 200 });

		expect(toast.items).toHaveLength(0);
	});

	it('confirms before a redirect so the notice survives the navigation', () => {
		toastForResult(
			{ type: 'redirect', status: 303, location: '/portal/cart' },
			{ success: 'Позиции скопированы' }
		);

		expect(toast.items[0]?.title).toBe('Позиции скопированы');
	});

	it('shows the server refusal as the error text', () => {
		toastForResult({
			type: 'failure',
			status: 409,
			data: { formError: 'Черновика нет: заявка уже отправлена' }
		});

		expect(toast.items[0]).toMatchObject({
			kind: 'error',
			title: 'Черновика нет: заявка уже отправлена'
		});
	});

	it('points to the fields when only field errors came back', () => {
		toastForResult({
			type: 'failure',
			status: 422,
			data: { errors: { fullName: ['Укажите имя'] } }
		});

		expect(toast.items[0]).toMatchObject({
			kind: 'error',
			title: FORM_TOAST_TEXT.invalid,
			description: FORM_TOAST_TEXT.invalidHint
		});
	});

	it('never shows the text of an unexpected server error', () => {
		toastForResult({ type: 'error', status: 500, error: new Error('SQLITE_BUSY at users.ts:42') });

		expect(toast.items[0]).toMatchObject({ kind: 'error', title: FORM_TOAST_TEXT.failed });
		expect(JSON.stringify(toast.items)).not.toContain('SQLITE');
	});

	it('names a lost connection instead of a generic failure', () => {
		vi.stubGlobal('navigator', { onLine: false });
		toastForResult({ type: 'error', error: new TypeError('Failed to fetch') });

		expect(toast.items[0]?.title).toBe(FORM_TOAST_TEXT.offline);
	});
});
