import type { BomNormRow } from './bom-norm.repository';
import type { BomVersionRow } from './bom-version.repository';
import type { ParsedBom, ParsedBomRow } from '$lib/domain/stock/bom-import';
import { isImportable } from '$lib/domain/stock/bom-import';
import {
	BOM_PREVIEW_ROWS,
	type BomNormDto,
	type BomPreviewDto,
	type BomPreviewRowDto,
	type BomVersionDto
} from '$lib/types/crm-bom';

/** Rows of the norms to the DTOs of tech.md §8. No money ever passes through here. */
export class BomDtoMapper {
	static toVersion(row: BomVersionRow): BomVersionDto {
		return {
			id: row.id,
			version: row.version,
			isActive: row.isActive,
			createdAt: row.createdAt.toISOString(),
			importedByName: row.importedByName,
			sourceFileId: row.sourceFileId,
			normCount: row.normCount
		};
	}

	static toNorm(row: BomNormRow): BomNormDto {
		return {
			id: row.id,
			variantId: row.variantId,
			variantSku: row.variantSku,
			productTitle: row.productTitle,
			componentId: row.componentId,
			componentCode: row.componentCode,
			componentTitle: row.componentTitle,
			unitTitle: row.unitTitle,
			qtyPerUnitMilli: row.qtyPerUnitMilli
		};
	}

	/** Rows with errors come first: the report must not hide behind the cut. */
	static toPreview(mediaId: number, parsed: ParsedBom): BomPreviewDto {
		const broken = parsed.rows.filter((row) => row.errors.length > 0);
		const clean = parsed.rows.filter((row) => row.errors.length === 0);
		return {
			mediaId,
			rowCount: parsed.rows.length,
			errorCount: parsed.errorCount,
			fileError: parsed.fileError,
			rows: [...broken, ...clean].slice(0, BOM_PREVIEW_ROWS).map((row) => this.toPreviewRow(row)),
			canImport: isImportable(parsed)
		};
	}

	private static toPreviewRow(row: ParsedBomRow): BomPreviewRowDto {
		return {
			line: row.line,
			variantSku: row.variantSku,
			componentCode: row.componentCode,
			qtyText: row.qtyText,
			qtyPerUnitMilli: row.qtyPerUnitMilli,
			errors: row.errors
		};
	}
}
