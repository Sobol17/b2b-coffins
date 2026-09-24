import { fail } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { AppError, httpStatusFor, userMessage } from '$lib/server/core/errors';
import { parseListQuery } from '$lib/server/core/list';
import { DictService } from '$lib/server/dicts/dict.service';
import {
	createDictItemSchema,
	dictFiltersSchema,
	dictItemIdSchema,
	updateDictItemSchema
} from '$lib/validation/dicts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

type DictAction = 'create' | 'update' | 'disable' | 'enable';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function dictService(locals: App.Locals, url: URL): DictService {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	return new DictService(requireAction(actor, 'settings.manage'));
}

function refused(action: DictAction, err: unknown) {
	if (!(err instanceof AppError)) throw err;
	return fail(httpStatusFor(err), { action, formError: userMessage(err) });
}

/** Switching an item on or off: the table reloads, so only the outcome goes back. */
function toggle(action: 'disable' | 'enable') {
	return async ({ request, locals, url }: RequestEvent) => {
		const service = dictService(locals, url);
		const parsed = dictItemIdSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(422, { action, formError: 'Нет записи справочника' });
		try {
			service.setActive(parsed.data.id, action === 'enable');
			return { action, done: true };
		} catch (err) {
			return refused(action, err);
		}
	};
}

export const load: PageServerLoad = ({ locals, url }) => {
	const service = dictService(locals, url);
	const filters = dictFiltersSchema.parse(Object.fromEntries(url.searchParams));
	return { dict: filters.dict, items: service.list(parseListQuery(url, filters)) };
};

export const actions = {
	create: async ({ request, locals, url }) => {
		const service = dictService(locals, url);
		const parsed = createDictItemSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) {
			return fail(422, { action: 'create' as const, errors: parsed.error.flatten().fieldErrors });
		}
		try {
			return { action: 'create' as const, item: service.create(parsed.data) };
		} catch (err) {
			return refused('create', err);
		}
	},

	update: async ({ request, locals, url }) => {
		const service = dictService(locals, url);
		const parsed = updateDictItemSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) {
			return fail(422, { action: 'update' as const, errors: parsed.error.flatten().fieldErrors });
		}
		try {
			return { action: 'update' as const, item: service.update(parsed.data) };
		} catch (err) {
			return refused('update', err);
		}
	},

	disable: toggle('disable'),
	enable: toggle('enable')
} satisfies Actions;
