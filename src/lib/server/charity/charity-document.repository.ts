import { and, eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { media } from '../db/schema';

export interface CharityDocumentRow {
	readonly id: number;
	readonly path: string;
	readonly sizeBytes: number;
	readonly createdAt: Date;
}

const COLUMNS = {
	id: media.id,
	path: media.path,
	sizeBytes: media.sizeBytes,
	createdAt: media.createdAt
};

/** `media` rows of scope `charity`: the one transfer confirmation of the fund block (v1.66). */
export class CharityDocumentRepository extends BaseRepository<typeof media> {
	constructor() {
		super(media);
	}

	find(id: number, tx?: Tx): CharityDocumentRow | undefined {
		const [row] = this.db(tx)
			.select(COLUMNS)
			.from(media)
			.where(and(eq(media.id, id), eq(media.ownerScope, 'charity')))
			.all();
		return row;
	}

	insert(file: { path: string; sizeBytes: number; uploadedBy: number }, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(media)
			.values({ ...file, mime: 'application/pdf', ownerScope: 'charity', ownerId: null })
			.returning({ id: media.id })
			.all();
		if (!row) throw new Error('failed to write the charity document');
		return row.id;
	}

	remove(id: number, tx: Tx): void {
		this.db(tx)
			.delete(media)
			.where(and(eq(media.id, id), eq(media.ownerScope, 'charity')))
			.run();
	}
}
