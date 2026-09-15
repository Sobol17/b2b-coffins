import type { Logger } from 'pino';
import type { ZodType } from 'zod';
import type { JobTopic } from '$lib/types/dicts';

export interface JobContext {
	readonly jobId: number;
	readonly attempt: number;
	readonly now: Date;
	readonly logger: Logger;
}

/** Handler contract of tech.md 7.1. Running it twice with one payload must give one effect. */
export interface JobHandler<T> {
	readonly topic: JobTopic;
	readonly schema: ZodType<T>;
	handle(payload: T, ctx: JobContext): Promise<void>;
}

/** Type-erased form the worker keeps: the schema check is closed over, so no cast is needed. */
export interface RegisteredHandler {
	readonly topic: JobTopic;
	run(payload: unknown, ctx: JobContext): Promise<void>;
}

/** A payload the schema refused. Retrying cannot fix it, so the worker marks the job dead. */
export class InvalidPayloadError extends Error {}

export class JobTimeoutError extends Error {}

export function defineHandler<T>(handler: JobHandler<T>): RegisteredHandler {
	return {
		topic: handler.topic,
		async run(payload, ctx) {
			const parsed = handler.schema.safeParse(payload);
			if (!parsed.success) throw new InvalidPayloadError(`payload rejected for ${handler.topic}`);
			await handler.handle(parsed.data, ctx);
		}
	};
}
