import { AuditService } from '../../audit/audit.service';
import { withTransaction } from '../../core/tx';
import { BomFileReader } from '../../crm-bom/bom-file.reader';
import { BomNormRepository } from '../../crm-bom/bom-norm.repository';
import { BomVersionRepository } from '../../crm-bom/bom-version.repository';
import { InvalidPayloadError, defineHandler } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';
import { isImportable } from '$lib/domain/stock/bom-import';

export interface ImportBomDeps {
	readonly reader: Pick<BomFileReader, 'table' | 'check'>;
	readonly versions: BomVersionRepository;
	readonly norms: BomNormRepository;
}

/**
 * `import.bom` of tech.md 7.2 (v1.46): the file becomes the active version of the norms in one
 * transaction. It is checked again here, against the catalog as it is now, because the preview
 * may be minutes old. A version made from the same file absorbs a rerun.
 */
export function createImportBomHandler(deps: ImportBomDeps) {
	return defineHandler({
		topic: 'import.bom',
		schema: JOB_PAYLOAD_SCHEMAS['import.bom'],
		async handle({ mediaId, actorId }, ctx) {
			const table = await deps.reader.table(mediaId);
			// Retrying cannot produce a file that was never uploaded or fix a row of it.
			if (table === undefined) throw new InvalidPayloadError(`norm file ${mediaId} is missing`);
			const outcome = withTransaction((tx) => {
				if (deps.versions.findBySourceFile(mediaId, tx)) return 'skipped';
				const parsed = deps.reader.check(table, tx);
				if (!isImportable(parsed)) return 'refused';
				const created = deps.versions.insertActive(
					{ importedById: actorId, sourceFileId: mediaId },
					tx
				);
				deps.norms.insertMany(
					created.id,
					parsed.rows.flatMap((row) =>
						row.variantId === null || row.componentId === null || row.qtyPerUnitMilli === null
							? []
							: [
									{
										variantId: row.variantId,
										componentId: row.componentId,
										qtyPerUnitMilli: row.qtyPerUnitMilli
									}
								]
					),
					tx
				);
				AuditService.record(
					{
						actorId,
						action: 'bom.import',
						entity: 'bom_versions',
						entityId: created.id,
						after: { version: created.version, mediaId, normCount: parsed.rows.length }
					},
					tx
				);
				return 'imported';
			});
			if (outcome === 'refused') throw new InvalidPayloadError(`norm file ${mediaId} has errors`);
			ctx.logger.info({ mediaId, outcome }, 'norm file handled');
		}
	});
}

export const importBomHandler = createImportBomHandler({
	reader: new BomFileReader(),
	versions: new BomVersionRepository(),
	norms: new BomNormRepository()
});
