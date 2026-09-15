import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { actionFailure, invalidForm } from '$lib/server/core/http';
import { DraftService } from '$lib/server/request/draft.service';
import { RequestRepeatService } from '$lib/server/request/request-repeat.service';
import { RequestSubmitService } from '$lib/server/request/request-submit.service';
import type { ActorContext } from '$lib/types/actor';
import {
	draftDetailsSchema,
	draftItemQtySchema,
	draftItemSchema,
	repeatRequestSchema
} from '$lib/validation/request';
import type { Actions, PageServerLoad } from './$types';

const repeatNoticeSchema = z.object({
	copied: z.coerce.number().int().min(0),
	skipped: z.coerce.number().int().min(0)
});

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function orderer(locals: App.Locals, url: URL): ActorContext {
	return requireAction(requireScope(locals.actor, 'portal', url.pathname), 'request.create');
}

async function fields(request: Request): Promise<Record<string, unknown>> {
	return Object.fromEntries(await request.formData());
}

export const load: PageServerLoad = ({ locals, url }) => {
	const repeated = repeatNoticeSchema.safeParse(Object.fromEntries(url.searchParams));
	return {
		draft: new DraftService(orderer(locals, url)).current(),
		repeated: repeated.success ? repeated.data : null
	};
};

export const actions = {
	qty: async ({ request, locals, url }) => {
		const service = new DraftService(orderer(locals, url));
		const parsed = draftItemQtySchema.safeParse(await fields(request));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			service.setQty(parsed.data.itemId, parsed.data.qty);
			return { updated: true };
		} catch (err) {
			return actionFailure(err);
		}
	},

	remove: async ({ request, locals, url }) => {
		const service = new DraftService(orderer(locals, url));
		const parsed = draftItemSchema.safeParse(await fields(request));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			service.removeItem(parsed.data.itemId);
			return { updated: true };
		} catch (err) {
			return actionFailure(err);
		}
	},

	clear: async ({ locals, url }) => {
		new DraftService(orderer(locals, url)).clear();
		return { updated: true };
	},

	details: async ({ request, locals, url }) => {
		const service = new DraftService(orderer(locals, url));
		const parsed = draftDetailsSchema.safeParse(await fields(request));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			service.saveDetails(parsed.data);
			return { saved: true };
		} catch (err) {
			return actionFailure(err);
		}
	},

	submit: async ({ request, locals, url }) => {
		const service = new RequestSubmitService(orderer(locals, url));
		const parsed = draftDetailsSchema.safeParse(await fields(request));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { submitted: service.submit(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},

	repeat: async ({ request, locals, url }) => {
		const service = new RequestRepeatService(orderer(locals, url));
		const parsed = repeatRequestSchema.safeParse(await fields(request));
		if (!parsed.success) return invalidForm(parsed.error);
		let result;
		try {
			result = service.repeat(parsed.data.requestId);
		} catch (err) {
			return actionFailure(err);
		}
		// Posted from the portal home as well: land on the cart with what was copied and skipped.
		redirect(303, `/portal/cart?copied=${result.copied}&skipped=${result.skipped}`);
	}
} satisfies Actions;
