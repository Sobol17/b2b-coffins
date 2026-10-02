import { and, eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { jobQueue, media } from '../db/schema';
import type { JobStatus } from '../queue/job.repository';

export interface BomMediaRow {
	readonly id: number;
	readonly path: string;
	readonly mime: string;
}

/** Uploaded norm files: `media` rows of the scope `import`, never served by `/api/files`. */
export class BomMediaRepository extends BaseRepository<typeof media> {
	constructor() {
		super(media);
	}

	insert(
		file: { path: string; mime: string; sizeBytes: number; uploadedBy: number },
		tx: Tx
	): number {
		const [row] = this.db(tx)
			.insert(media)
			.values({ ...file, ownerScope: 'import' })
			.returning({ id: media.id })
			.all();
		if (!row) throw new Error('failed to insert a norm file');
		return row.id;
	}

	find(id: number, tx?: Tx): BomMediaRow | undefined {
		const [row] = this.db(tx)
			.select({ id: media.id, path: media.path, mime: media.mime })
			.from(media)
			.where(and(eq(media.id, id), eq(media.ownerScope, 'import')))
			.all();
		return row;
	}

	/** Where the import job of the file stands, or undefined when it was never queued. */
	jobStatus(idempotencyKey: string): JobStatus | undefined {
		const [row] = this.db()
			.select({ status: jobQueue.status })
			.from(jobQueue)
			.where(and(eq(jobQueue.topic, 'import.bom'), eq(jobQueue.idempotencyKey, idempotencyKey)))
			.all();
		return row?.status;
	}
}
