import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CrmCatalogService } from '$lib/server/crm-catalog/crm-catalog.service';
import { ProductImageService } from '$lib/server/crm-catalog/product-image.service';
import { actionFailure, invalidForm, orHttpStatus } from '$lib/server/core/http';
import {
	compatibilityInputSchema,
	entityIdSchema,
	mediaOrderInputSchema,
	productInputSchema,
	statusInputSchema,
	variantInputSchema
} from '$lib/validation/crm-catalog';
import { productIdSchema } from '$lib/validation/catalog';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function context(event: RequestEvent): {
	id: number;
	catalog: CrmCatalogService;
	images: ProductImageService;
} {
	const parsed = productIdSchema.safeParse(event.params.id);
	if (!parsed.success) error(404, { code: 'not_found', message: 'Модель не найдена' });
	const actor = requireAction(
		requireScope(event.locals.actor, 'crm', event.url.pathname),
		'catalog.manage'
	);
	return {
		id: parsed.data,
		catalog: new CrmCatalogService(actor),
		images: new ProductImageService(actor)
	};
}

export const load: PageServerLoad = (event) => {
	const { id, catalog } = context(event);
	return orHttpStatus(() => ({
		product: catalog.getProduct(id),
		categories: catalog.listCategories(),
		choices: catalog.choices(),
		options: catalog.listOptions(),
		canSeeCost: event.locals.actor?.canSeeCost ?? false
	}));
};

export const actions = {
	update: async (event) => {
		const { id, catalog } = context(event);
		const parsed = productInputSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { product: catalog.updateProduct(id, parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	publish: async (event) => {
		const { id, catalog } = context(event);
		const parsed = statusInputSchema.safeParse({
			...Object.fromEntries(await event.request.formData()),
			id
		});
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { product: catalog.setProductPublished(id, parsed.data.isPublished) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	delete: async (event) => {
		const { id, catalog } = context(event);
		try {
			catalog.deleteProduct(id);
			return { id };
		} catch (err) {
			return actionFailure(err);
		}
	},
	createVariant: async (event) => {
		const { id, catalog } = context(event);
		const parsed = variantInputSchema.safeParse({
			...Object.fromEntries(await event.request.formData()),
			productId: id
		});
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { variant: catalog.createVariant(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	updateVariant: async (event) => {
		const { id, catalog } = context(event);
		const form = Object.fromEntries(await event.request.formData());
		const variantId = entityIdSchema.safeParse(form);
		const parsed = variantInputSchema.safeParse({ ...form, productId: id });
		if (!variantId.success) return invalidForm(variantId.error);
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { variant: catalog.updateVariant(variantId.data.id, parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	variantStatus: async (event) => {
		const { catalog } = context(event);
		const parsed = statusInputSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { variant: catalog.setVariantPublished(parsed.data.id, parsed.data.isPublished) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	deleteVariant: async (event) => {
		const { catalog } = context(event);
		const parsed = entityIdSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			catalog.deleteVariant(parsed.data.id);
			return { id: parsed.data.id };
		} catch (err) {
			return actionFailure(err);
		}
	},
	compatibility: async (event) => {
		const { catalog } = context(event);
		const form = await event.request.formData();
		const defaultId = Number(form.get('defaultOptionId'));
		const parsed = compatibilityInputSchema.safeParse({
			variantId: form.get('variantId'),
			options: form
				.getAll('optionId')
				.map((value) => ({ optionId: Number(value), isDefault: Number(value) === defaultId }))
		});
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { variant: catalog.setCompatibility(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	mediaOrder: async (event) => {
		const { id, images } = context(event);
		const form = await event.request.formData();
		const parsed = mediaOrderInputSchema.safeParse({
			productId: id,
			mediaIds: form.getAll('mediaId')
		});
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { media: images.setOrder(id, parsed.data.mediaIds) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	mediaRemove: async (event) => {
		const { id, images } = context(event);
		const parsed = entityIdSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			images.remove(id, parsed.data.id);
			return { id: parsed.data.id };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
