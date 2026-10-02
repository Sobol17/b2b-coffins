/**
 * Component norms, tech.md §8 (C9, v1.46). Quantities are milli-units of the component: a norm of
 * 0,35 l is 350. No money key lives here for any role.
 */

export const BOM_IMPORT_MAX_ROWS = 5000;
export const BOM_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** Rows the preview carries: the ones with errors come first. */
export const BOM_PREVIEW_ROWS = 200;
/** 100000 units of a component per piece. */
export const BOM_QTY_MAX_MILLI = 100_000_000;

export const BOM_FILE_COLUMNS = [
	'Артикул варианта',
	'Код комплектующего',
	'Норма на единицу'
] as const;

export const BOM_ROW_ERRORS = [
	'unknown_variant',
	'unknown_component',
	'not_component',
	'bad_qty',
	'duplicate'
] as const;
export type BomRowError = (typeof BOM_ROW_ERRORS)[number];

export const BOM_FILE_ERRORS = ['unreadable', 'bad_header', 'empty', 'too_many_rows'] as const;
export type BomFileError = (typeof BOM_FILE_ERRORS)[number];

export const BOM_IMPORT_STATUSES = ['queued', 'done', 'failed'] as const;
export type BomImportStatus = (typeof BOM_IMPORT_STATUSES)[number];

export interface BomVersionDto {
	readonly id: number;
	readonly version: number;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly importedByName: string | null;
	/** Null for a version made by hand. */
	readonly sourceFileId: number | null;
	readonly normCount: number;
}

export interface BomNormDto {
	readonly id: number;
	readonly variantId: number;
	readonly variantSku: string;
	readonly productTitle: string;
	readonly componentId: number;
	readonly componentCode: string;
	readonly componentTitle: string;
	readonly unitTitle: string;
	readonly qtyPerUnitMilli: number;
}

export interface BomChoicesDto {
	readonly variants: readonly {
		readonly id: number;
		readonly sku: string;
		readonly productTitle: string;
	}[];
	readonly components: readonly {
		readonly id: number;
		readonly code: string;
		readonly title: string;
		readonly unitTitle: string;
	}[];
}

/** The norms come apart from the page as `Page<BomNormDto>`. */
export interface BomPageDto {
	/** Newest first. */
	readonly versions: readonly BomVersionDto[];
	/** The version on the screen: the picked one, else the active one. */
	readonly shown: BomVersionDto | null;
	readonly canManage: boolean;
	/** The shown version is active and the actor holds `stock.manage`. */
	readonly canEdit: boolean;
}

export interface BomPreviewRowDto {
	/** Row of the file, the header is row 1. */
	readonly line: number;
	readonly variantSku: string;
	readonly componentCode: string;
	readonly qtyText: string;
	/** Null when the norm did not parse. */
	readonly qtyPerUnitMilli: number | null;
	readonly errors: readonly BomRowError[];
}

export interface BomPreviewDto {
	readonly mediaId: number;
	/** Counted over the whole file, like `errorCount`. */
	readonly rowCount: number;
	readonly errorCount: number;
	readonly fileError: BomFileError | null;
	readonly rows: readonly BomPreviewRowDto[];
	readonly canImport: boolean;
}

export interface BomImportStateDto {
	readonly mediaId: number;
	readonly status: BomImportStatus;
	readonly version: number | null;
}

export interface BomDeficitRowDto {
	readonly componentId: number;
	readonly code: string;
	readonly title: string;
	readonly unitTitle: string;
	/** Missing pieces of the production queue × norm. */
	readonly needMilli: number;
	/** Whole units on the shelf, may be negative. */
	readonly balance: number;
	/** `max(0, needMilli − balance × 1000)`. */
	readonly deficitMilli: number;
}

/** Deficit rows first. */
export interface BomDeficitDto {
	readonly version: number | null;
	readonly rows: readonly BomDeficitRowDto[];
}
