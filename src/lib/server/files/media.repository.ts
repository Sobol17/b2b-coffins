import { eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { media } from '../db/schema';

export interface MediaRow {
	readonly id: number;
	readonly path: string;
	readonly mime: string;
	readonly ownerScope: 'product' | 'request' | 'contract' | 'document' | 'import';
	readonly ownerId: number | null;
}

export class MediaRepository extends BaseRepository<typeof media> {
	constructor() {
		super(media);
	}

	findById(id: number): MediaRow | undefined {
		const [row] = this.db()
			.select({
				id: media.id,
				path: media.path,
				mime: media.mime,
				ownerScope: media.ownerScope,
				ownerId: media.ownerId
			})
			.from(media)
			.where(eq(media.id, id))
			.all();
		return row;
	}
}
