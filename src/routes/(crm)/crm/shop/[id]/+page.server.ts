import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { ShopService } from '$lib/server/crm-shop/shop.service';
import { ShopTaskService } from '$lib/server/crm-shop/shop-task.service';
import type { ActorContext } from '$lib/types/actor';
import { shopProgressSchema, shopTaskIdSchema, shopTaskSchema } from '$lib/validation/crm-shop';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function worker(locals: App.Locals, url: URL): ActorContext {
	return requireAction(requireScope(locals.actor, 'crm', url.pathname), 'shop.work');
}

export const load: PageServerLoad = ({ locals, params, url }) => {
	const actor = worker(locals, url);
	const parsed = shopTaskIdSchema.safeParse(params.id);
	if (!parsed.success) error(404, { code: 'not_found', message: 'Визит не найден' });
	const id = parsed.data;
	return { task: orHttpStatus(() => new ShopService(actor).task(id)) };
};

export const actions = {
	take: ({ locals, params, request, url }) => {
		const actor = worker(locals, url);
		return formAction(
			request,
			'take',
			shopTaskSchema,
			({ taskId }) => new ShopTaskService(actor).take(taskId),
			{ taskId: params.id }
		);
	},
	progress: ({ locals, request, url }) => {
		const actor = worker(locals, url);
		return formAction(request, 'progress', shopProgressSchema, (input) =>
			new ShopTaskService(actor).progress(input)
		);
	},
	complete: ({ locals, params, request, url }) => {
		const actor = worker(locals, url);
		return formAction(
			request,
			'complete',
			shopTaskSchema,
			({ taskId }) => new ShopTaskService(actor).complete(taskId),
			{ taskId: params.id }
		);
	}
} satisfies Actions;
