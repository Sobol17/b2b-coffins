import { randomBytes } from 'node:crypto';
import { consumeRateLimit } from '../auth/rate-limit';
import { config } from '../config';
import { NotFoundError, ValidationError } from '../core/errors';
import { StockBaseService } from '../crm-stock/stock-base.service';
import { writeStoredFile } from '../files/storage';
import { Queue } from '../queue/queue';
import { jobKey } from '../queue/topics';
import { BOM_FILE_KINDS, sniffBomFile } from './bom-file';
import { BomFileReader } from './bom-file.reader';
import { BomMediaRepository } from './bom-media.repository';
import { BomVersionRepository } from './bom-version.repository';
import { BomDtoMapper } from './dto';
import type { ActorContext } from '$lib/types/actor';
import {
	BOM_IMPORT_MAX_BYTES,
	type BomImportStateDto,
	type BomPreviewDto
} from '$lib/types/crm-bom';

/**
 * The import of a norm file (C9, tech.md v1.46): upload, preview with the error report, and the
 * queued job that turns a clean file into the active version. Every step needs `stock.manage`.
 */
export class BomImportService extends StockBaseService {
	constructor(
		ctx: ActorContext,
		private readonly root: string = config.FILES_DIR,
		private readonly mediaRows: BomMediaRepository = new BomMediaRepository(),
		private readonly reader: BomFileReader = new BomFileReader(mediaRows, undefined, root),
		private readonly versions: BomVersionRepository = new BomVersionRepository()
	) {
		super(ctx);
		this.assertManage();
	}

	/** @throws ValidationError for a file that is neither XLSX nor CSV, empty or over the limit. */
	async upload(bytes: Buffer): Promise<number> {
		const kind = bytes.length > BOM_IMPORT_MAX_BYTES ? null : sniffBomFile(bytes);
		if (!kind) throw new ValidationError('Нужен файл XLSX или CSV не больше 5 МБ');
		consumeRateLimit('file.upload', String(this.ctx.userId));
		const { mime, extension } = BOM_FILE_KINDS[kind];
		// The name on disk is the server's: nothing of the client's file name reaches the path.
		const path = `import/bom/${randomBytes(12).toString('hex')}.${extension}`;
		await writeStoredFile(path, bytes, this.root);
		return this.audited({ action: 'bom.file.upload', entity: 'media' }, (tx) => {
			const id = this.mediaRows.insert(
				{ path, mime, sizeBytes: bytes.length, uploadedBy: this.ctx.userId },
				tx
			);
			return { result: id, entityId: id, after: { mime, sizeBytes: bytes.length } };
		});
	}

	/** @throws NotFoundError for an id that is not an uploaded norm file. */
	async preview(mediaId: number): Promise<BomPreviewDto> {
		const table = await this.reader.table(mediaId);
		if (table === undefined) throw new NotFoundError('bom_file');
		return BomDtoMapper.toPreview(mediaId, this.reader.check(table));
	}

	/**
	 * Queues the import. The job checks the file again, so a refusal here is for the person, not
	 * the guard.
	 * @throws ValidationError for a file with an error.
	 */
	async confirm(mediaId: number): Promise<void> {
		const preview = await this.preview(mediaId);
		if (!preview.canImport) {
			throw new ValidationError('В файле есть ошибки. Исправьте его и загрузите заново');
		}
		Queue.enqueue('import.bom', { mediaId, actorId: this.ctx.userId }, jobKey.importBom(mediaId));
	}

	/** Null for a file whose import was never confirmed. */
	state(mediaId: number): BomImportStateDto | null {
		const version = this.versions.findBySourceFile(mediaId);
		if (version) return { mediaId, status: 'done', version: version.version };
		const job = this.mediaRows.jobStatus(jobKey.importBom(mediaId));
		if (job === undefined) return null;
		// A job that finished without a version refused the file: the catalog changed under it.
		const failed = job === 'dead' || job === 'failed' || job === 'done';
		return { mediaId, status: failed ? 'failed' : 'queued', version: null };
	}
}
