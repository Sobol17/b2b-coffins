import { z } from 'zod';

export const mediaIdSchema = z.coerce.number().int().positive();

/** One attached file of a request: the owner plus the file itself, both from the same FormData. */
export const attachmentUploadSchema = z.object({
	requestId: z.coerce.number().int().positive(),
	file: z.instanceof(File, { error: 'Выберите файл' })
});
