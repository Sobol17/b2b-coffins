import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAction, requireScope } from '../auth/guard';
import { PolicyService } from '../auth/policy';
import { XLSX_MIME } from './stock-export.service';
import type { ActorContext } from '$lib/types/actor';

const idSchema = z.coerce.number().int().positive();

/**
 * Layout guards do not run for actions and endpoints, so every entry point of the warehouse checks
 * the contour and `stock.read` itself; the services check `stock.manage` on each write.
 */
export function stockActor(event: {
	readonly locals: App.Locals;
	readonly url: URL;
}): ActorContext {
	return requireAction(requireScope(event.locals.actor, 'crm', event.url.pathname), 'stock.read');
}

/** A route parameter that is not an id is a missing page, not a broken form. */
export function routeId(value: string | undefined, message: string): number {
	const parsed = idSchema.safeParse(value);
	if (!parsed.success) error(404, { code: 'not_found', message });
	return parsed.data;
}

/** For the page only: which buttons to draw. The services decide on every write again. */
export function canManageStock(actor: ActorContext): boolean {
	return PolicyService.can(actor, 'stock.manage');
}

export function xlsxResponse(body: Buffer, asciiName: string, title: string): Response {
	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': XLSX_MIME,
			'content-disposition': `attachment; filename="${asciiName}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${title}.xlsx`)}`,
			'cache-control': 'private, no-store'
		}
	});
}
