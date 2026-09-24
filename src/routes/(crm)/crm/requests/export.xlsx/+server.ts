import { requireAction, requireScope } from '$lib/server/auth/guard';
import { rethrowAsHttp } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import {
	CrmRequestExportService,
	XLSX_MIME
} from '$lib/server/crm-request/crm-request-export.service';
import { crmRequestFiltersSchema } from '$lib/validation/crm-request';
import type { RequestHandler } from './$types';

// The same query string as the registry page: the sheet is what the manager is looking at.
export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'crm', url.pathname), 'request.read.any');
	const filters = crmRequestFiltersSchema.parse(Object.fromEntries(url.searchParams));
	let body: Buffer;
	try {
		body = await new CrmRequestExportService(actor).workbook(parseListQuery(url, filters));
	} catch (err) {
		rethrowAsHttp(err);
	}
	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': XLSX_MIME,
			'content-disposition': `attachment; filename="requests.xlsx"; filename*=UTF-8''${encodeURIComponent('Заявки.xlsx')}`,
			'cache-control': 'private, no-store'
		}
	});
};
