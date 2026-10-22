import { z } from 'zod';
import {
	SUPPORT_BODY_MAX,
	SUPPORT_SIDES,
	SUPPORT_SUBJECT_MAX,
	SUPPORT_SUBJECT_MIN,
	SUPPORT_THREAD_STATUSES
} from '$lib/types/support';

const id = z.coerce.number().int().positive();

/** The `[id]` of a thread route: user input like any other. */
export const supportThreadIdSchema = id;

const subjectError = `Тема от ${SUPPORT_SUBJECT_MIN} до ${SUPPORT_SUBJECT_MAX} символов`;

const body = z
	.string()
	.trim()
	.min(1, { error: 'Напишите сообщение' })
	.max(SUPPORT_BODY_MAX, { error: `Сообщение длиннее ${SUPPORT_BODY_MAX} символов` });

export const supportPostSchema = z.object({ body });

export const supportOpenSchema = z.object({
	subject: z
		.string()
		.trim()
		.min(SUPPORT_SUBJECT_MIN, { error: subjectError })
		.max(SUPPORT_SUBJECT_MAX, { error: subjectError }),
	body,
	// The select sends an empty string for «no request».
	requestId: z.preprocess((value) => (value === '' ? undefined : value), id.optional())
});

/** Filters from the query string. A tampered value is dropped, not turned into a 422 page. */
export const supportFiltersSchema = z.object({
	status: z.enum(SUPPORT_THREAD_STATUSES).optional().catch(undefined),
	awaiting: z.enum(SUPPORT_SIDES).optional().catch(undefined),
	counterpartyId: id.optional().catch(undefined),
	q: z.string().trim().max(100).optional().catch(undefined)
});

export type SupportOpenInput = z.infer<typeof supportOpenSchema>;
export type SupportPostInput = z.infer<typeof supportPostSchema>;
