import { config } from '../config';
import type { Tx } from '../db/client';
import { readStoredFile } from '../files/storage';
import { bomFileKindOf, readBomTable } from './bom-file';
import { BomMediaRepository } from './bom-media.repository';
import { BomNormRepository } from './bom-norm.repository';
import { parseBomTable, type ParsedBom } from '$lib/domain/stock/bom-import';

const UNREADABLE: ParsedBom = { fileError: 'unreadable', rows: [], errorCount: 0 };

/**
 * A stored norm file checked against the catalog and the warehouse as they are now. The preview
 * and the import job both read through here, so the job never accepts what the screen refused.
 */
export class BomFileReader {
	constructor(
		private readonly mediaRows: BomMediaRepository = new BomMediaRepository(),
		private readonly norms: BomNormRepository = new BomNormRepository(),
		private readonly root: string = config.FILES_DIR
	) {}

	/** The table of the file, or undefined for an id that is not an uploaded norm file. */
	async table(mediaId: number): Promise<string[][] | null | undefined> {
		const row = this.mediaRows.find(mediaId);
		if (!row) return undefined;
		const kind = bomFileKindOf(row.mime);
		const bytes = await readStoredFile(row.path, this.root);
		if (!kind || !bytes) return null;
		return readBomTable(bytes, kind);
	}

	/** Synchronous on purpose: the import job checks inside its transaction. */
	check(table: string[][] | null, tx?: Tx): ParsedBom {
		return table === null ? UNREADABLE : parseBomTable(table, this.norms.lookup(tx));
	}
}
