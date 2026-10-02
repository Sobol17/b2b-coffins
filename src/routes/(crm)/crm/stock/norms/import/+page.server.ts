import { redirect } from '@sveltejs/kit';
import { requireAction } from '$lib/server/auth/guard';
import { formAction, rethrowAsHttp } from '$lib/server/core/http';
import { BomImportService } from '$lib/server/crm-bom/bom-import.service';
import { stockActor } from '$lib/server/crm-stock/route';
import { bomImportSchema, bomVersionParam } from '$lib/validation/crm-bom';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** The whole import is a write: a reader of the warehouse gets 403 on the page itself. */
function service(event: RequestEvent): BomImportService {
	return new BomImportService(requireAction(stockActor(event), 'stock.manage'));
}

export const load: PageServerLoad = async (event) => {
	const imports = service(event);
	const mediaId = bomVersionParam.parse(event.url.searchParams.get('file') ?? undefined);
	if (mediaId === undefined) return { preview: null };
	try {
		return { preview: await imports.preview(mediaId) };
	} catch (err) {
		rethrowAsHttp(err);
	}
};

export const actions = {
	confirm: (event) => {
		const imports = service(event);
		return formAction(event.request, 'confirm', bomImportSchema, async ({ mediaId }) => {
			await imports.confirm(mediaId);
			// The norms screen shows where the queued import stands.
			redirect(303, `/crm/stock/norms?import=${mediaId}`);
		});
	}
} satisfies Actions;
