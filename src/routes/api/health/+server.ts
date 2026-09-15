import { json } from '@sveltejs/kit';
import { queueHealth } from '$lib/server/queue/runtime';
import type { RequestHandler } from './$types';

// Smoke target for the CI gate and for the local `node build` run. Reading the queue counters
// doubles as the database check: a dead connection throws and the response becomes a 500.
export const GET: RequestHandler = async () => {
	const queue = queueHealth();
	return json({
		status: queue.workerRunning ? 'ok' : 'degraded',
		uptimeSec: Math.round(process.uptime()),
		queue
	});
};
