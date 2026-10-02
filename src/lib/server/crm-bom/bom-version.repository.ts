import { desc, eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { bomNorms, bomVersions, users } from '../db/schema';

export interface BomVersionRow {
	readonly id: number;
	readonly version: number;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly importedByName: string | null;
	readonly sourceFileId: number | null;
	readonly normCount: number;
}

export interface NewBomVersion {
	readonly importedById: number;
	readonly sourceFileId: number | null;
}

// The table name is spelled out: inside the subquery a bare "id" would bind to the inner table.
const NORM_COUNT = sql<number>`(select count(*) from bom_norms n where n.bom_version_id = bom_versions.id)`;

const COLUMNS = {
	id: bomVersions.id,
	version: bomVersions.version,
	isActive: bomVersions.isActive,
	createdAt: bomVersions.createdAt,
	importedByName: users.fullName,
	sourceFileId: bomVersions.sourceFileId,
	normCount: NORM_COUNT
};

/** Versions of the norms (C9, tech.md v1.46): one active at most, the rest are history. */
export class BomVersionRepository extends BaseRepository<typeof bomVersions> {
	constructor() {
		super(bomVersions);
	}

	/** Newest first. */
	list(tx?: Tx): BomVersionRow[] {
		return this.select(tx).orderBy(desc(bomVersions.version), desc(bomVersions.id)).all();
	}

	find(id: number, tx?: Tx): BomVersionRow | undefined {
		const [row] = this.select(tx).where(eq(bomVersions.id, id)).all();
		return row;
	}

	active(tx?: Tx): BomVersionRow | undefined {
		const [row] = this.select(tx).where(eq(bomVersions.isActive, true)).all();
		return row;
	}

	/** The version an import of this file made: what makes the job idempotent. */
	findBySourceFile(mediaId: number, tx?: Tx): BomVersionRow | undefined {
		const [row] = this.select(tx).where(eq(bomVersions.sourceFileId, mediaId)).all();
		return row;
	}

	/** A new version takes the next number and the place of the active one. */
	insertActive(input: NewBomVersion, tx: Tx): { id: number; version: number } {
		const [max] = this.db(tx)
			.select({ version: sql<number>`coalesce(max(${bomVersions.version}), 0)` })
			.from(bomVersions)
			.all();
		this.db(tx).update(bomVersions).set({ isActive: false }).run();
		const [row] = this.db(tx)
			.insert(bomVersions)
			.values({ ...input, version: (max?.version ?? 0) + 1, isActive: true })
			.returning({ id: bomVersions.id, version: bomVersions.version })
			.all();
		if (!row) throw new Error('failed to insert a norm version');
		return row;
	}

	activate(id: number, tx: Tx): void {
		this.db(tx).update(bomVersions).set({ isActive: false }).run();
		this.db(tx).update(bomVersions).set({ isActive: true }).where(eq(bomVersions.id, id)).run();
	}

	copyNorms(fromId: number, toId: number, tx: Tx): void {
		const rows = this.db(tx)
			.select({
				variantId: bomNorms.variantId,
				componentId: bomNorms.componentId,
				qtyPerUnitMilli: bomNorms.qtyPerUnitMilli
			})
			.from(bomNorms)
			.where(eq(bomNorms.bomVersionId, fromId))
			.all();
		if (rows.length === 0) return;
		this.db(tx)
			.insert(bomNorms)
			.values(rows.map((row) => ({ ...row, bomVersionId: toId })))
			.run();
	}

	private select(tx?: Tx) {
		return this.db(tx)
			.select(COLUMNS)
			.from(bomVersions)
			.leftJoin(users, eq(users.id, bomVersions.importedById))
			.$dynamic();
	}
}
