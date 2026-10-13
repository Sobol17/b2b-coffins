import { randomBytes } from 'node:crypto';
import { consumeRateLimit } from '../auth/rate-limit';
import { PolicyService } from '../auth/policy';
import { NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { config } from '../config';
import { writeStoredFile } from '../files/storage';
import { ProductRepository } from './product.repository';
import { ProductImageRepository } from './product-image.repository';
import { matchesSignature } from '$lib/domain/files/signature';
import type { ActorContext } from '$lib/types/actor';
import type { CrmMediaDto } from '$lib/types/crm-catalog';

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Readonly<Record<string, string>> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export interface ProductImageUpload {
	readonly mime: string;
	readonly bytes: Buffer;
}

/** CRM photo storage. The first row by order is already the portal and landing cover. */
export class ProductImageService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly root: string = config.FILES_DIR,
		private readonly images: ProductImageRepository = new ProductImageRepository(),
		private readonly products: ProductRepository = new ProductRepository()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'catalog.manage'), 'catalog.manage');
	}

	list(productId: number): CrmMediaDto[] {
		this.requireProduct(productId);
		return this.images.list(productId);
	}

	async upload(productId: number, file: ProductImageUpload): Promise<CrmMediaDto> {
		this.requireProduct(productId);
		const extension = Object.hasOwn(EXTENSIONS, file.mime) ? EXTENSIONS[file.mime] : undefined;
		if (
			!extension ||
			file.bytes.length === 0 ||
			file.bytes.length > MAX_BYTES ||
			!matchesSignature(file.mime, file.bytes)
		) {
			throw new ValidationError('Нужен JPEG, PNG или WebP не больше 10 МБ');
		}
		consumeRateLimit('file.upload', String(this.ctx.userId));
		const path = `product/${productId}/${randomBytes(12).toString('hex')}.${extension}`;
		await writeStoredFile(path, file.bytes, this.root);
		return this.audited({ action: 'catalog.media.add', entity: 'media' }, (tx) => {
			const id = this.images.insert(
				{
					productId,
					path,
					mime: file.mime,
					sizeBytes: file.bytes.length,
					uploadedBy: this.ctx.userId
				},
				tx
			);
			const result = this.images.list(productId, tx).find((row) => row.id === id);
			if (!result) throw new Error('inserted image missing');
			return {
				result,
				entityId: id,
				after: { productId, mime: file.mime, sizeBytes: file.bytes.length }
			};
		});
	}

	setOrder(productId: number, mediaIds: readonly number[]): CrmMediaDto[] {
		return this.audited({ action: 'catalog.media.order', entity: 'media' }, (tx) => {
			this.requireProduct(productId);
			const before = this.images.list(productId, tx).map((row) => row.id);
			if (
				before.length !== mediaIds.length ||
				new Set(mediaIds).size !== before.length ||
				mediaIds.some((id) => !before.includes(id))
			)
				throw new ValidationError('Порядок фото не совпадает с галереей');
			this.images.setOrder(productId, mediaIds, tx);
			return {
				result: this.images.list(productId, tx),
				entityId: productId,
				before: { mediaIds: before },
				after: { mediaIds: [...mediaIds] }
			};
		});
	}

	remove(productId: number, mediaId: number): void {
		this.audited({ action: 'catalog.media.remove', entity: 'media' }, (tx) => {
			this.requireProduct(productId);
			if (!this.images.find(productId, mediaId, tx)) throw new NotFoundError('product image');
			this.images.remove(productId, mediaId, tx);
			return {
				result: undefined,
				entityId: mediaId,
				before: { productId },
				after: { removed: true }
			};
		});
	}

	private requireProduct(productId: number): void {
		const product = this.products.findProduct(productId);
		if (!product || product.deletedAt) throw new NotFoundError('product');
	}
}
