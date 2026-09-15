import { HANDLERS } from './handlers';
import { JobRepository, type JobStatus } from './job.repository';
import { Queue } from './queue';
import { jobKey } from './topics';
import { Worker } from './worker';

/**
 * One worker per process. The module holds a process-level poller and no user data, so it is not
 * the per-request singleton that tech.md 15.2 forbids.
 */
let worker: Worker | null = null;

/** Queues the daily cleanup once per UTC day; the idempotency key absorbs restarts and repeats. */
export function dailyCleanupScheduler(): (now: Date) => void {
	let scheduledKey = '';
	return (now) => {
		const key = jobKey.sessionCleanup(now);
		if (key === scheduledKey) return;
		Queue.enqueue('session.cleanup', {}, key, undefined, now);
		scheduledKey = key;
	};
}

export function startWorker(): Worker {
	worker ??= new Worker({ handlers: HANDLERS, onTick: dailyCleanupScheduler() });
	worker.start();
	return worker;
}

export interface QueueHealth {
	readonly workerRunning: boolean;
	readonly pending: number;
	readonly running: number;
	readonly dead: number;
}

export function queueHealth(): QueueHealth {
	const counts: Record<JobStatus, number> = new JobRepository().countByStatus();
	return {
		workerRunning: worker?.isRunning ?? false,
		pending: counts.pending,
		running: counts.running,
		dead: counts.dead
	};
}
