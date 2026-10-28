import { ValidationError } from '../core/errors';
import { startOfDayInZone } from '$lib/domain/time/zone';

/**
 * The day of a payment in the workshop zone; money cannot arrive tomorrow.
 * @throws ValidationError for a malformed date or one after today.
 */
export function paymentDay(isoDate: string, timeZone: string, now: Date): Date {
	const paidAt = startOfDayInZone(isoDate, timeZone);
	if (paidAt === null) throw new ValidationError('Выберите дату оплаты', { field: 'paidAt' });
	if (paidAt.getTime() > now.getTime()) {
		throw new ValidationError('Дата оплаты не может быть позже сегодняшней', { field: 'paidAt' });
	}
	return paidAt;
}
