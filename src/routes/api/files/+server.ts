import { error, json } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { ProductImageService } from '$lib/server/crm-catalog/product-image.service';
import { rethrowAsHttp } from '$lib/server/core/http';
import { RequestAttachmentService } from '$lib/server/request/request-attachment.service';
import { attachmentUploadSchema, productImageUploadSchema } from '$lib/validation/files';
import type { RequestAttachmentDto } from '$lib/types/request';
import type { RequestHandler } from './$types';

/** Portal request attachments and CRM product photos share the guarded file collection. */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (
		request.headers.get('x-requested-with') !== 'XMLHttpRequest' ||
		request.headers.get('origin') !== url.origin
	) {
		error(403, { code: 'forbidden', message: 'Доступ запрещён' });
	}
	const form = Object.fromEntries(await request.formData());
	if ('productId' in form) {
		const actor = requireAction(requireScope(locals.actor, 'crm', url.pathname), 'catalog.manage');
		const parsed = productImageUploadSchema.safeParse(form);
		if (!parsed.success) error(422, { code: 'validation', message: 'Выберите фотографию' });
		try {
			const image = await new ProductImageService(actor).upload(parsed.data.productId, {
				mime: parsed.data.file.type,
				bytes: Buffer.from(await parsed.data.file.arrayBuffer())
			});
			return json(image, { status: 201 });
		} catch (err) {
			rethrowAsHttp(err);
		}
	}
	const actor = requireAction(
		requireScope(locals.actor, 'portal', url.pathname),
		'request.read.own'
	);
	const parsed = attachmentUploadSchema.safeParse(form);
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
