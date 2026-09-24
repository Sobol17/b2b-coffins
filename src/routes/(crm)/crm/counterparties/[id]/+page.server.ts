import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { CounterpartyAccessService } from '$lib/server/crm-counterparty/counterparty-access.service';
import { CounterpartyDetailService } from '$lib/server/crm-counterparty/counterparty-detail.service';
import { CounterpartyLedgerService } from '$lib/server/crm-counterparty/counterparty-ledger.service';
import { CrmCounterpartyService } from '$lib/server/crm-counterparty/crm-counterparty.service';
import { mailDriver } from '$lib/server/notifications/drivers/mail/select';
import {
	addressInputSchema,
	contractInputSchema,
	entityIdSchema,
	issueAdminSchema,
	notesInputSchema,
	requisitesInputSchema,
	termsInputSchema
} from '$lib/validation/crm-counterparty';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const withId = <T extends z.ZodType>(schema: T) => z.intersection(entityIdSchema, schema);

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function context(event: RequestEvent) {
	const parsed = entityIdSchema.shape.id.safeParse(event.params.id);
	if (!parsed.success) error(404, { code: 'not_found', message: 'Контрагент не найден' });
	const actor = requireAction(
		requireScope(event.locals.actor, 'crm', event.url.pathname),
		'counterparty.manage'
	);
	return {
		id: parsed.data,
		actor,
		cards: () => new CrmCounterpartyService(actor),
		details: () => new CounterpartyDetailService(actor),
		access: () => new CounterpartyAccessService(actor, mailDriver()),
		request: event.request
	};
}

export const load: PageServerLoad = (event) => {
	const { id, actor, cards } = context(event);
	const service = cards();
	const ledger = new CounterpartyLedgerService(actor);
	return orHttpStatus(() => ({
		card: service.card(id),
		choices: service.choices(),
		requests: ledger.requests(id, parseListQuery(event.url, undefined, 'req')),
		// Every payment row is an amount: a role without prices gets no registry at all.
		payments: actor.canSeePrices
			? ledger.payments(id, parseListQuery(event.url, undefined, 'pay'))
			: null
	}));
};

export const actions = {
	requisites: (event) => {
		const { id, cards, request } = context(event);
		return formAction(request, 'requisites', requisitesInputSchema, (input) =>
			cards().updateRequisites(id, input)
		);
	},
	terms: (event) => {
		const { id, cards, request } = context(event);
		return formAction(request, 'terms', termsInputSchema, (input) =>
			cards().updateTerms(id, input)
		);
	},
	notes: (event) => {
		const { id, cards, request } = context(event);
		return formAction(request, 'notes', notesInputSchema, (input) =>
			cards().updateNotes(id, input.notes)
		);
	},
	contractAdd: (event) => {
		const { id, details, request } = context(event);
		return formAction(request, 'contractAdd', contractInputSchema, (input) =>
			details().addContract(id, input)
		);
	},
	contractUpdate: (event) => {
		const { id, details, request } = context(event);
		return formAction(request, 'contractUpdate', withId(contractInputSchema), (input) =>
			details().updateContract(id, input.id, input)
		);
	},
	contractDelete: (event) => {
		const { id, details, request } = context(event);
		return formAction(request, 'contractDelete', entityIdSchema, (input) =>
			details().deleteContract(id, input.id)
		);
	},
	addressAdd: (event) => {
		const { id, details, request } = context(event);
		return formAction(request, 'addressAdd', addressInputSchema, (input) =>
			details().addAddress(id, input)
		);
	},
	addressUpdate: (event) => {
		const { id, details, request } = context(event);
		return formAction(request, 'addressUpdate', withId(addressInputSchema), (input) =>
			details().updateAddress(id, input.id, input)
		);
	},
	addressDelete: (event) => {
		const { id, details, request } = context(event);
		return formAction(request, 'addressDelete', entityIdSchema, (input) =>
			details().removeAddress(id, input.id)
		);
	},
	addressDefault: (event) => {
		const { id, details, request } = context(event);
		return formAction(request, 'addressDefault', entityIdSchema, (input) =>
			details().setDefaultAddress(id, input.id)
		);
	},
	adminIssue: (event) => {
		const { id, access, request } = context(event);
		return formAction(request, 'adminIssue', issueAdminSchema, (input) =>
			access().issueAdmin(id, input)
		);
	},
	adminPromote: (event) => {
		const { id, access, request } = context(event);
		return formAction(request, 'adminPromote', entityIdSchema, (input) =>
			access().promoteAdmin(id, input.id)
		);
	},
	accessResend: (event) => {
		const { id, access, request } = context(event);
		return formAction(request, 'accessResend', entityIdSchema, (input) =>
			access().resendAccess(id, input.id)
		);
	}
} satisfies Actions;
