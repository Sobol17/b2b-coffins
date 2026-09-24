import { fail } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { AppError, httpStatusFor, userMessage } from '$lib/server/core/errors';
import { parseListQuery } from '$lib/server/core/list';
import { CrmUserService } from '$lib/server/crm-user/crm-user.service';
import { mailDriver } from '$lib/server/notifications/drivers/mail/select';
import {
	createCrmUserSchema,
	crmUserFiltersSchema,
	crmUserFormFields,
	crmUserIdSchema,
	crmUserRolesSchema
} from '$lib/validation/crm-user';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

type UserAction = 'create' | 'roles' | 'disable' | 'enable' | 'reset';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function userService(locals: App.Locals, url: URL): CrmUserService {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	return new CrmUserService(requireAction(actor, 'settings.manage'), mailDriver());
}

function refused(action: UserAction, err: unknown) {
	if (!(err instanceof AppError)) throw err;
	return fail(httpStatusFor(err), { action, formError: userMessage(err) });
}

/** Switching access of one existing account: the table reloads, so only the outcome goes back. */
function toggle(action: 'disable' | 'enable') {
	return async ({ request, locals, url }: RequestEvent) => {
		const service = userService(locals, url);
		const parsed = crmUserIdSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(422, { action, formError: 'Нет пользователя' });
		try {
			service.setActive(parsed.data.id, action === 'enable');
			return { action, done: true };
		} catch (err) {
			return refused(action, err);
		}
	};
}

export const load: PageServerLoad = ({ locals, url }) => {
	const service = userService(locals, url);
	const filters = crmUserFiltersSchema.parse(Object.fromEntries(url.searchParams));
	return { users: service.list(parseListQuery(url, filters)) };
};

export const actions = {
	create: async ({ request, locals, url }) => {
		const service = userService(locals, url);
		const parsed = createCrmUserSchema.safeParse(crmUserFormFields(await request.formData()));
		if (!parsed.success) {
			return fail(422, { action: 'create' as const, errors: parsed.error.flatten().fieldErrors });
		}
		try {
			return { action: 'create' as const, access: await service.create(parsed.data) };
		} catch (err) {
			return refused('create', err);
		}
	},

	roles: async ({ request, locals, url }) => {
		const service = userService(locals, url);
		const parsed = crmUserRolesSchema.safeParse(crmUserFormFields(await request.formData()));
		if (!parsed.success) {
			return fail(422, { action: 'roles' as const, formError: 'Выберите хотя бы одну роль' });
		}
		try {
			return {
				action: 'roles' as const,
				user: service.setRoles(parsed.data.id, parsed.data.roles)
			};
		} catch (err) {
			return refused('roles', err);
		}
	},

	disable: toggle('disable'),
	enable: toggle('enable'),
	reset: async (event) => {
		const service = userService(event.locals, event.url);
		const parsed = crmUserIdSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success)
			return fail(422, { action: 'reset' as const, formError: 'Нет пользователя' });
		try {
			return { action: 'reset' as const, access: await service.resetPassword(parsed.data.id) };
		} catch (err) {
			return refused('reset', err);
		}
	}
} satisfies Actions;
