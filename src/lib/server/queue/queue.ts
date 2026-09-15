import { z } from 'zod';
import { ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { JobRepository } from './job.repository';
import { JOB_PAYLOAD_SCHEMAS, type JobPayload } from './topics';
import type { JobTopic } from '$lib/types/dicts';

/**
 * Transactional outbox of tech.md 7.1. A service passes its own `tx`, so the job exists only if
 * the change that caused it committed.
 */
export class Queue {
	/** @returns false when a job with the same topic and key is already queued. */
	static enqueue<T extends JobTopic>(
		topic: T,
		payload: JobPayload<T>,
		idempotencyKey: string,
		tx?: Tx,
		visibleAt: Date = new Date()
	): boolean {
		const parsed = JOB_PAYLOAD_SCHEMAS[topic].safeParse(payload);
		if (!parsed.success) {
			throw new ValidationError(`invalid payload for ${topic}`, {
				issues: z.prettifyError(parsed.error)
			});
		}
		return new JobRepository().insertIgnore(
			{ topic, payload: parsed.data, idempotencyKey, visibleAt },
			tx
		);
	}
}
