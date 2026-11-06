import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { ShopService } from '$lib/server/crm-shop/shop.service';
import { ShopTaskService } from '$lib/server/crm-shop/shop-task.service';
import { ShopUnitService } from '$lib/server/crm-shop/shop-unit.service';
import { PolicyService } from '$lib/server/auth/policy';
import type { ActorContext } from '$lib/types/actor';
import {
	shopProgressSchema,
	shopTaskIdSchema,
	shopTaskSchema,
	shopUnitSchema
} from '$lib/validation/crm-shop';
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
	return {
		task: orHttpStatus(() => new ShopService(actor).task(id)),
		canManual: PolicyService.can(actor, 'payroll.manage')
	};
};

export const actions = {
	takeUnit: ({ locals, request, url }) => {
		const actor = worker(locals, url);
		return formAction(request, 'takeUnit', shopUnitSchema, ({ unitId }) =>
			new ShopUnitService(actor).take(unitId)
		);
	},
	completeUnit: ({ locals, request, url }) => {
		const actor = worker(locals, url);
		return formAction(request, 'completeUnit', shopUnitSchema, ({ unitId }) =>
			new ShopUnitService(actor).complete(unitId)
		);
	},
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
