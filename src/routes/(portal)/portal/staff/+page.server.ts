import { fail } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { AppError, httpStatusFor } from '$lib/server/core/errors';
import { parseListQuery } from '$lib/server/core/list';
import { mailDriver } from '$lib/server/notifications/drivers/mail/select';
import { StaffService } from '$lib/server/staff/staff.service';
import {
	createStaffSchema,
	staffFiltersSchema,
	staffMemberSchema,
	staffRoleSchema
} from '$lib/validation/staff';
import type { Actions, PageServerLoad } from './$types';

type StaffAction = 'create' | 'disable' | 'enable' | 'role';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function staffService(locals: App.Locals, url: URL): StaffService {
	const actor = requireScope(locals.actor, 'portal', url.pathname);
	return new StaffService(requireAction(actor, 'counterparty.staff.manage'), mailDriver());
}

function refused(action: StaffAction, err: unknown) {
	if (!(err instanceof AppError)) throw err;
	return fail(httpStatusFor(err), { action, formError: err.message });
}

async function memberId(request: Request) {
	return staffMemberSchema.safeParse(Object.fromEntries(await request.formData()));
}

export const load: PageServerLoad = ({ locals, url }) => {
	const service = staffService(locals, url);
	const filters = staffFiltersSchema.parse(Object.fromEntries(url.searchParams));
	return { staff: service.list(parseListQuery(url, filters)) };
};

export const actions = {
	create: async ({ request, locals, url }) => {
		const service = staffService(locals, url);
		const parsed = createStaffSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) {
			return fail(422, { action: 'create' as const, errors: parsed.error.flatten().fieldErrors });
		}
		try {
			return { action: 'create' as const, created: await service.create(parsed.data) };
		} catch (err) {
			return refused('create', err);
		}
	},

	disable: async ({ request, locals, url }) => {
		const service = staffService(locals, url);
		const parsed = await memberId(request);
		if (!parsed.success)
			return fail(422, { action: 'disable' as const, formError: 'Нет сотрудника' });
		try {
			return { action: 'disable' as const, member: service.setActive(parsed.data.id, false) };
		} catch (err) {
			return refused('disable', err);
		}
	},

	enable: async ({ request, locals, url }) => {
		const service = staffService(locals, url);
		const parsed = await memberId(request);
		if (!parsed.success)
			return fail(422, { action: 'enable' as const, formError: 'Нет сотрудника' });
		try {
			return { action: 'enable' as const, member: service.setActive(parsed.data.id, true) };
		} catch (err) {
			return refused('enable', err);
		}
	},

	role: async ({ request, locals, url }) => {
		const service = staffService(locals, url);
		const parsed = staffRoleSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(422, { action: 'role' as const, formError: 'Неверная роль' });
		try {
			return {
				action: 'role' as const,
				member: service.setRole(parsed.data.id, parsed.data.role)
			};
		} catch (err) {
			return refused('role', err);
		}
	}
} satisfies Actions;
