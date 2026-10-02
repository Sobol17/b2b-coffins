import { z } from 'zod';
import { normMilli } from '$lib/domain/stock/bom-import';

const id = z.coerce.number().int().positive();
const pickedId = (error: string) => id.catch(0).refine((value) => value > 0, { error });

/** The norm is typed as on paper, "0,35"; the server keeps thousandths (tech.md v1.46). */
const qtyPerUnitMilli = z.string({ error: 'Введите норму' }).transform((value, ctx) => {
	const milli = normMilli(value);
	if (milli === null) {
		ctx.addIssue({ code: 'custom', message: 'Норма больше нуля, не точнее трёх знаков' });
		return z.NEVER;
	}
	return milli;
});

export const bomNormCreateSchema = z.object({
	variantId: pickedId('Выберите вариант'),
	componentId: pickedId('Выберите комплектующее'),
	qtyPerUnitMilli
});
export type BomNormCreateInput = z.infer<typeof bomNormCreateSchema>;

/** The pair of a norm stays as created: another pair is another norm. */
export const bomNormUpdateSchema = z.object({ normId: id, qtyPerUnitMilli });
export type BomNormUpdateInput = z.infer<typeof bomNormUpdateSchema>;

export const bomNormDeleteSchema = z.object({ normId: id });
export const bomVersionSchema = z.object({ versionId: id });
export const bomImportSchema = z.object({ mediaId: id });

/** Query of the norms screen. A tampered id is dropped, not turned into a 422 page. */
export const bomVersionParam = id.optional().catch(undefined);
