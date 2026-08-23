import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Smoke target for the CI gate and for the local `node build` run.
export const GET: RequestHandler = async () => {
	return json({ status: 'ok', uptimeSec: Math.round(process.uptime()) });
};
