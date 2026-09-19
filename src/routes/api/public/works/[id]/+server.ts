import { error } from '@sveltejs/kit';
import { LandingService } from '$lib/server/landing/landing.service';
import type { FileContent } from '$lib/server/files/storage';
import { mediaIdSchema } from '$lib/validation/files';
import type { RequestHandler } from './$types';

/*
 * The whole public surface of the catalog (P13): the cover of a published model, no actor asked.
 * `/api/files/[id]` stays closed and keeps checking `catalog.read`; a photo of a hidden, deleted
 * or unknown model answers 404 here, exactly like the model itself does.
 */
export const GET: RequestHandler = async ({ params }) => {
	const id = mediaIdSchema.safeParse(params.id);
	if (!id.success) error(404, { code: 'not_found', message: 'Файл не найден' });

	const file: FileContent | null = await new LandingService().cover(id.data);
	if (file === null) error(404, { code: 'not_found', message: 'Файл не найден' });

	return new Response(new Uint8Array(file.bytes), {
		headers: {
			'content-type': file.mime,
			'content-length': String(file.bytes.length),
			// The answer is the same for everyone, so a shared cache may keep it.
			'cache-control': 'public, max-age=3600'
		}
	});
};
