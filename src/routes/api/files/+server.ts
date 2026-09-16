import { error, json } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { rethrowAsHttp } from '$lib/server/core/http';
import { RequestAttachmentService } from '$lib/server/request/request-attachment.service';
import { attachmentUploadSchema } from '$lib/validation/files';
import type { RequestAttachmentDto } from '$lib/types/request';
import type { RequestHandler } from './$types';

/** Files the portal attaches to its own request (P6). Other owners upload in their own slices. */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const actor = requireAction(
		requireScope(locals.actor, 'portal', url.pathname),
		'request.read.own'
	);
	const parsed = attachmentUploadSchema.safeParse(Object.fromEntries(await request.formData()));
	if (!parsed.success) error(422, { code: 'validation', message: 'Выберите файл' });

	const { requestId, file } = parsed.data;
	let stored: RequestAttachmentDto;
	try {
		stored = await new RequestAttachmentService(actor).attach(requestId, {
			name: file.name,
			mime: file.type,
			bytes: Buffer.from(await file.arrayBuffer())
		});
	} catch (err) {
		rethrowAsHttp(err);
	}
	return json(stored, { status: 201 });
};
