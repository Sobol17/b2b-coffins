import { AuditJournalService } from '$lib/server/audit/audit-journal.service';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { parseListQuery } from '$lib/server/core/list';
import { auditFiltersSchema } from '$lib/validation/audit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	const service = new AuditJournalService(requireAction(actor, 'audit.read'));
	const filters = auditFiltersSchema.parse(Object.fromEntries(url.searchParams));
	return { journal: service.list(parseListQuery(url, filters)) };
};
