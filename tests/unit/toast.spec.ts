import { beforeEach, describe, expect, it } from 'vitest';
import { toast } from '../../src/lib/ui/toast.svelte';

describe('the error path of the kit', () => {
	beforeEach(() => {
		toast.clear();
	});

	it('shows an error and removes exactly one toast', () => {
		const first = toast.error('Не удалось сохранить', 0);
		const second = toast.success('Заявка сохранена', 0);

		expect(toast.items).toHaveLength(2);
		expect(toast.items[0]?.kind).toBe('error');
		expect(toast.items[0]?.message).toBe('Не удалось сохранить');

		toast.dismiss(first);

		expect(toast.items).toHaveLength(1);
		expect(toast.items[0]?.id).toBe(second);
	});

	it('survives dismissing the same toast twice', () => {
		const id = toast.error('Сервер не ответил', 0);
		toast.dismiss(id);
		toast.dismiss(id);

		expect(toast.items).toHaveLength(0);
	});

	it('drops a toast on its own once the lifetime is over', async () => {
		toast.error('Таймаут', 5);
		expect(toast.items).toHaveLength(1);

		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(toast.items).toHaveLength(0);
	});
});
