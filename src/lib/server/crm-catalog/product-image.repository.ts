import { and, asc, eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { media } from '../db/schema';
import type { CrmMediaDto } from '$lib/types/crm-catalog';

export class ProductImageRepository extends BaseRepository<typeof media> {
	constructor() {
		super(media);
	}

	list(productId: number, tx?: Tx): CrmMediaDto[] {
		return this.db(tx)
			.select({ id: media.id, sortOrder: media.sortOrder })
			.from(media)
			.where(and(eq(media.ownerScope, 'product'), eq(media.ownerId, productId)))
			.orderBy(asc(media.sortOrder), asc(media.id))
			.all()
			.map((row, index) => ({ ...row, isCover: index === 0 }));
	}

	find(productId: number, mediaId: number, tx?: Tx) {
		return this.db(tx)
			.select({ id: media.id, path: media.path })
			.from(media)
			.where(
				and(eq(media.id, mediaId), eq(media.ownerScope, 'product'), eq(media.ownerId, productId))
			)
			.get();
	}

	insert(
		input: { productId: number; path: string; mime: string; sizeBytes: number; uploadedBy: number },
		tx: Tx
	): number {
		const [max] = this.db(tx)
			.select({ order: sql<number>`coalesce(max(${media.sortOrder}), -1)` })
			.from(media)
			.where(and(eq(media.ownerScope, 'product'), eq(media.ownerId, input.productId)))
			.all();
		const [row] = this.db(tx)
			.insert(media)
			.values({
				path: input.path,
				mime: input.mime,
				sizeBytes: input.sizeBytes,
				ownerScope: 'product',
				ownerId: input.productId,
				sortOrder: (max?.order ?? -1) + 1,
				uploadedBy: input.uploadedBy
			})
			.returning({ id: media.id })
			.all();
		if (!row) throw new Error('failed to insert product image');
		return row.id;
	}

	setOrder(productId: number, mediaIds: readonly number[], tx: Tx): void {
		for (const [index, id] of mediaIds.entries()) {
			this.db(tx)
				.update(media)
				.set({ sortOrder: index })
				.where(and(eq(media.id, id), eq(media.ownerScope, 'product'), eq(media.ownerId, productId)))
				.run();
		}
	}

	remove(productId: number, mediaId: number, tx: Tx): void {
		this.db(tx)
			.delete(media)
			.where(
				and(eq(media.id, mediaId), eq(media.ownerScope, 'product'), eq(media.ownerId, productId))
			)
			.run();
	}
}
