import { BomDeficitService } from '$lib/server/crm-bom/bom-deficit.service';
import { stockActor } from '$lib/server/crm-stock/route';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => ({
	deficit: new BomDeficitService(stockActor(event)).list()
});
