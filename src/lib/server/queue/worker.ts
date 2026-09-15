import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { logger } from '../logger';
import { nextVisibleAt } from './backoff';
import { InvalidPayloadError, JobTimeoutError, type RegisteredHandler } from './job-handler';
import { JobRepository, type JobRow } from './job.repository';
import type { JobTopic } from '$lib/types/dicts';

export interface WorkerOptions {
	readonly handlers: readonly RegisteredHandler[];
	readonly pollMs?: number;
	readonly timeoutMs?: number;
	/** How long a `running` job may stay locked before a restart hands it back to the queue. */
	readonly staleAfterMs?: number;
	readonly clock?: () => Date;
	readonly onTick?: (now: Date) => void;
}

const DEFAULT_POLL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_STALE_AFTER_MS = 10 * 60_000;

/** In-process poller of tech.md 7.1. It claims only topics it has a handler for. */
export class Worker {
	readonly id = `worker-${randomUUID()}`;
	private readonly handlers: ReadonlyMap<JobTopic, RegisteredHandler>;
	private readonly repo = new JobRepository();
	private timer: ReturnType<typeof setInterval> | null = null;
	private busy = false;

	constructor(private readonly options: WorkerOptions) {
		this.handlers = new Map(options.handlers.map((handler) => [handler.topic, handler]));
	}

	get isRunning(): boolean {
		return this.timer !== null;
	}

	start(): void {
		if (this.timer) return;
		this.recoverStale();
		this.timer = setInterval(() => void this.poll(), this.options.pollMs ?? DEFAULT_POLL_MS);
		// The poller must not keep a process alive that has nothing else to do.
		this.timer.unref();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	/** A crash leaves jobs in `running`; once the lease is over they return to `pending`. */
	recoverStale(): number {
		const staleAfter = this.options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
		return this.repo.releaseStale(new Date(this.now().getTime() - staleAfter));
	}

	/** Runs at most one due job. */
	async tick(): Promise<boolean> {
		const now = this.now();
		const job = this.repo.claimNext([...this.handlers.keys()], this.id, now);
		if (!job) return false;
		await this.execute(job, now);
		return true;
	}

	async drain(limit = 100): Promise<number> {
		let ran = 0;
		while (ran < limit && (await this.tick())) ran += 1;
		return ran;
	}

	private async poll(): Promise<void> {
		// Intervals overlap while a slow handler runs; a second pass would only contend for the lock.
		if (this.busy) return;
		this.busy = true;
		try {
			this.options.onTick?.(this.now());
			await this.drain();
		} catch (err) {
			logger.error({ err }, 'queue poll failed');
		} finally {
			this.busy = false;
		}
	}

	private async execute(job: JobRow, now: Date): Promise<void> {
		const attempt = job.attempts + 1;
		const jobLogger = logger.child({ jobId: job.id, topic: job.topic, attempt });
		try {
			const handler = this.handlers.get(job.topic);
			if (!handler) throw new InvalidPayloadError(`no handler for ${job.topic}`);
			await this.withTimeout(
				handler.run(job.payload, { jobId: job.id, attempt, now, logger: jobLogger })
			);
			this.repo.markDone(job.id, attempt, this.now());
		} catch (err) {
			this.fail(job, attempt, err, jobLogger);
		}
	}

	private fail(job: JobRow, attempt: number, err: unknown, jobLogger: Logger): void {
		const message = err instanceof Error ? err.message : String(err);
		if (err instanceof InvalidPayloadError || attempt >= job.maxAttempts) {
			this.repo.markDead(job.id, attempt, message, this.now());
			jobLogger.error({ lastError: message }, 'job moved to dead');
			return;
		}
		const visibleAt = nextVisibleAt(this.now(), attempt);
		this.repo.reschedule(job.id, attempt, visibleAt, message);
		jobLogger.warn({ lastError: message, visibleAt }, 'job failed, retry scheduled');
	}

	private withTimeout(work: Promise<void>): Promise<void> {
		const ms = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new JobTimeoutError(`job exceeded ${ms} ms`)), ms);
		});
		// A timed-out handler may still finish later. Handlers are idempotent, so the retry is safe.
		return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
	}

	private now(): Date {
		return this.options.clock?.() ?? new Date();
	}
}
