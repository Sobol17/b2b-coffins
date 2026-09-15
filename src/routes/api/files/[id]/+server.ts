import { error } from '@sveltejs/kit';
import { requireAction } from '$lib/server/auth/guard';
import { rethrowAsHttp } from '$lib/server/core/http';
import { FileAccessService, type FileContent } from '$lib/server/files/file-access.service';
import { mediaIdSchema } from '$lib/validation/files';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const actor = requireAction(locals.actor, 'catalog.read');
	const id = mediaIdSchema.safeParse(params.id);
	if (!id.success) error(404, { code: 'not_found', message: 'Файл не найден' });

	let file: FileContent;
	try {
		file = await new FileAccessService(actor).open(id.data);
	} catch (err) {
		rethrowAsHttp(err);
	}
	return new Response(new Uint8Array(file.bytes), {
		headers: {
			'content-type': file.mime,
			'content-length': String(file.bytes.length),
			// Private: the answer depends on who asks, a shared cache must not keep it.
			'cache-control': 'private, max-age=3600'
		}
	});
};
