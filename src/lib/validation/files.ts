import { z } from 'zod';

export const mediaIdSchema = z.coerce.number().int().positive();

/** One attached file of a request: the owner plus the file itself, both from the same FormData. */
export const attachmentUploadSchema = z.object({
	requestId: z.coerce.number().int().positive(),
	file: z.instanceof(File, { error: 'Выберите файл' })
});

export const productImageUploadSchema = z.object({
	productId: z.coerce.number().int().positive(),
	file: z.instanceof(File, { error: 'Выберите фотографию' })
});

/** A norm file of C9: the marker field tells the collection route which service takes it. */
export const bomImportUploadSchema = z.object({
	bomImport: z.literal('1'),
	file: z.instanceof(File, { error: 'Выберите файл' })
});
