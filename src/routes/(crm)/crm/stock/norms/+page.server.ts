import { formAction, orHttpStatus } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { BomImportService } from '$lib/server/crm-bom/bom-import.service';
import { BomService } from '$lib/server/crm-bom/bom.service';
import { stockActor } from '$lib/server/crm-stock/route';
import {
	bomNormCreateSchema,
	bomNormDeleteSchema,
	bomNormUpdateSchema,
	bomVersionCreateSchema,
	bomVersionParam,
	bomVersionSchema
} from '$lib/validation/crm-bom';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const actor = stockActor(event);
	const service = new BomService(actor);
	const param = (key: string) =>
		bomVersionParam.parse(event.url.searchParams.get(key) ?? undefined);
	const bom = service.page(param('version'));
	const imported = param('import');
	return orHttpStatus(() => ({
		bom,
		norms: bom.shown ? service.norms(bom.shown.id, parseListQuery(event.url)) : null,
		choices: bom.canEdit ? service.choices() : null,
		// The banner of a just confirmed import; the import service is for `stock.manage` only.
		importState:
			bom.canManage && imported !== undefined ? new BomImportService(actor).state(imported) : null
	}));
};

export const actions = {
	createVersion: (event) => {
		const service = new BomService(stockActor(event));
		return formAction(event.request, 'createVersion', bomVersionCreateSchema, () =>
			service.createVersion()
		);
	},
	activate: (event) => {
		const service = new BomService(stockActor(event));
		return formAction(event.request, 'activate', bomVersionSchema, ({ versionId }) =>
			service.activate(versionId)
		);
	},
	normCreate: (event) => {
		const service = new BomService(stockActor(event));
		return formAction(event.request, 'normCreate', bomNormCreateSchema, (input) =>
			service.createNorm(input)
		);
	},
	normUpdate: (event) => {
		const service = new BomService(stockActor(event));
		return formAction(event.request, 'normUpdate', bomNormUpdateSchema, (input) =>
			service.updateNorm(input)
		);
	},
	normDelete: (event) => {
		const service = new BomService(stockActor(event));
		return formAction(event.request, 'normDelete', bomNormDeleteSchema, ({ normId }) =>
			service.deleteNorm(normId)
		);
	}
} satisfies Actions;
