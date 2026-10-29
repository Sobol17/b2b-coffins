import { z } from 'zod';
import { SHOP_JOB_MAX } from '$lib/types/crm-shop';
import { WORK_ROLES } from '$lib/types/roles';

const id = z.coerce.number().int().positive();

/** «Взять в работу» and «Выполнено» name the visit only. */
export const shopTaskSchema = z.object({ taskId: id });

/** The counter of a job takes the new count, not an increment (tech.md §20.4). */
export const shopProgressSchema = z.object({
	jobId: id,
	doneQty: z.coerce
		.number({ error: 'Укажите количество' })
		.int({ error: 'Количество должно быть целым' })
		.min(0, { error: 'Не меньше нуля' })
		.max(SHOP_JOB_MAX, { error: `Не больше ${SHOP_JOB_MAX} штук` })
});
export type ShopProgressInput = z.infer<typeof shopProgressSchema>;

/** The station switch of the heads. A tampered value shows the default, not a 422 page. */
export const shopStationSchema = z.enum(WORK_ROLES).optional().catch(undefined);

/** The number search of the shop. A tampered value is dropped, not turned into a 422 page. */
export const shopSearchSchema = z
	.string()
	.trim()
	.max(32)
	.optional()
	.catch(undefined)
	.transform((value) => (value === '' ? undefined : value));
