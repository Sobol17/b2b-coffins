import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAction } from '$lib/server/auth/guard';
import { openEventStream } from '$lib/server/events/sse';
import { STREAM_TOPICS } from '$lib/server/events/stream';
import type { RequestHandler } from './$types';

const topicSchema = z.enum(STREAM_TOPICS);

export const GET: RequestHandler = ({ params, locals, request }) => {
	const topic = topicSchema.safeParse(params.topic);
	if (!topic.success) error(404, { code: 'not_found', message: 'Поток не найден' });

	// charity is public by design; request counters belong to the workshop only.
	if (topic.data === 'requests') requireAction(locals.actor, 'crm.access');

	return new Response(openEventStream(topic.data, request.signal), {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
