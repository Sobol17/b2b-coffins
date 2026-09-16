import { PolicyService } from '../auth/policy';
import { CatalogRepository } from '../catalog/catalog.repository';
import { config } from '../config';
import { ForbiddenError, NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import { RequestCardRepository } from '../request/request-card.repository';
import { MediaRepository, type MediaRow } from './media.repository';
import { readStoredFile } from './storage';
import type { ActorContext } from '$lib/types/actor';

export interface FileContent {
	readonly mime: string;
	readonly bytes: Buffer;
}

/** The only way a stored file leaves the server: `/api/files/[id]` after this check (tech.md 11). */
export class FileAccessService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly mediaRows: MediaRepository = new MediaRepository(),
		private readonly catalog: CatalogRepository = new CatalogRepository(),
		private readonly root: string = config.FILES_DIR,
		private readonly requests: RequestCardRepository = new RequestCardRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError when the actor may not read it, NotFoundError when it is not there. */
	async open(mediaId: number): Promise<FileContent> {
		const row = this.mediaRows.findById(mediaId);
		if (!row) throw new NotFoundError('file');
		this.assertReadable(row);
		const bytes = await readStoredFile(row.path, this.root);
		if (!bytes) throw new NotFoundError('file');
		return { mime: row.mime, bytes };
	}

	private assertReadable(row: MediaRow): void {
		if (row.ownerId === null) throw new ForbiddenError('file.read');
		// An attachment follows its request: whoever may open the card may open what hangs on it.
		if (row.ownerScope === 'request') return this.assertAttachment(row.ownerId);
		// Contracts bring their own rules with their slice.
		if (row.ownerScope !== 'product') throw new ForbiddenError('file.read');
		this.assert(PolicyService.can(this.ctx, 'catalog.read'), 'catalog.read');
		const visibility = { publishedOnly: !PolicyService.can(this.ctx, 'catalog.manage') };
		// A photo of a hidden product answers as missing, like the product itself.
		if (!this.catalog.findProduct(row.ownerId, visibility)) throw new NotFoundError('file');
	}

	/** The workshop side reads every request (C4); the crew gets its own rule in C5. */
	private assertAttachment(requestId: number): void {
		if (this.ctx.scope === 'crm') {
			this.assert(PolicyService.can(this.ctx, 'request.read.any'), 'request.read.any');
			return;
		}
		this.assert(PolicyService.can(this.ctx, 'request.read.own'), 'request.read.own');
		const ownOnly = !PolicyService.seesWholeCounterparty(this.ctx);
		if (!this.requests.findCard(this.ctx, requestId, ownOnly)) {
			throw new ForbiddenError('file.read');
		}
	}
}
