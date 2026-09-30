import { z } from 'zod';
import { SHOP_PRODUCE_MAX } from '$lib/types/crm-shop';
import { checkbox } from './fields';

const id = z.coerce.number().int().positive();

/** One loading mark: pieces of a request line put on board (tech.md v1.43). */
export const deliveryLoadSchema = z.object({
	itemId: id,
	qty: z.coerce
		.number({ error: 'Укажите количество' })
		.int({ error: 'Количество должно быть целым' })
		.min(1, { error: 'Не меньше одной штуки' })
		.max(SHOP_PRODUCE_MAX, { error: `Не больше ${SHOP_PRODUCE_MAX} штук за раз` })
});
export type DeliveryLoadInput = z.infer<typeof deliveryLoadSchema>;

/** Withdraws every loading of the line, while the request is still assembled. */
export const deliveryUnloadSchema = z.object({ itemId: id });
export type DeliveryUnloadInput = z.infer<typeof deliveryUnloadSchema>;

/** «Доставлено», with the cash checkbox beside it. */
export const deliveryDoneSchema = z.object({ requestId: id, cashCollected: checkbox });
export type DeliveryDoneInput = z.infer<typeof deliveryDoneSchema>;
