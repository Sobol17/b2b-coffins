import { z } from 'zod';
import type { JobTopic } from '$lib/types/dicts';
import { EVENT_KEYS, type EventKey } from '$lib/types/events';

const id = z.number().int().positive();

/**
 * Payload contract of tech.md 7.2, one strict schema per topic. Enqueue validates against it and
 * the worker validates again before the handler runs, so a stray field fails loudly on both ends.
 */
export const JOB_PAYLOAD_SCHEMAS = {
	'notification.dispatch': z.strictObject({ notificationId: id }),
	'notification.fanout': z.strictObject({ eventKey: z.enum(EVENT_KEYS), entityId: id }),
	'charity.recount': z.strictObject({ scope: z.string().min(1) }),
	'stock.threshold.check': z.strictObject({ stockItemId: id }),
	'import.bom': z.strictObject({ mediaId: id, actorId: id }),
	'import.rates': z.strictObject({ mediaId: id, actorId: id }),
	'payroll.calculate': z.strictObject({ periodId: id }),
	'report.export': z.strictObject({
		reportKey: z.string().min(1),
		filters: z.record(z.string(), z.unknown()),
		userId: id
	}),
	'session.cleanup': z.strictObject({})
} as const satisfies Record<JobTopic, z.ZodType>;

export type JobPayload<T extends JobTopic> = z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]>;

function utcDay(now: Date): string {
	return now.toISOString().slice(0, 10).replaceAll('-', '');
}

/** Idempotency keys in the exact shape of tech.md 7.2. */
export const jobKey = {
	sessionCleanup: (now: Date): string => `cleanup:${utcDay(now)}`,
	fanout: (eventKey: EventKey, entityId: number): string => `fanout:${eventKey}:${entityId}`,
	// One recount per delivered request: an hourly key dropped the second delivery of the hour (v1.18).
	charityRecount: (scope: string, requestId: number): string => `charity:${scope}:${requestId}`
} as const;
