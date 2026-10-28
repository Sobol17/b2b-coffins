import { randomBytes } from 'node:crypto';
import { PolicyService } from '../auth/policy';
import { consumeRateLimit } from '../auth/rate-limit';
import { config } from '../config';
import { ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { removeStoredFile, writeStoredFile } from '../files/storage';
import { SettingsRepository } from '../settings/settings.repository';
import { CharityDocumentRepository } from './charity-document.repository';
import { CharitySettings } from './charity-settings';
import {
	CHARITY_DOCUMENT_MAX_BYTES,
	charityDocumentPath,
	checkCharityDocument,
	type CharityDocumentRefusal
} from '$lib/domain/charity/document';
import { SIGNATURE_HEAD_BYTES } from '$lib/domain/files/signature';
import type { ActorContext } from '$lib/types/actor';
import type { CharityDocumentDto } from '$lib/types/charity';

const KEY = 'charity.transfer_media_id';
const REFUSALS: Readonly<Record<CharityDocumentRefusal, string>> = {
	type: 'Загрузите файл PDF',
	size: `Файл должен быть не пустым и не больше ${CHARITY_DOCUMENT_MAX_BYTES / (1024 * 1024)} МБ`
};

/** Where a stored document is read from: the one guarded file route (tech.md 11). */
export const charityDocumentUrl = (mediaId: number) => `/api/files/${mediaId}`;

/**
 * The confirmation of the transfer to the fund (tech.md v1.66): one PDF the owner uploads in the
 * fund block of the settings and every portal role reads from the home page. A new file replaces
 * the old one, the old address stops answering.
 */
export class CharityDocumentService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly documents: CharityDocumentRepository = new CharityDocumentRepository(),
		private readonly settings: SettingsRepository = new SettingsRepository(),
		private readonly root: string = config.FILES_DIR
	) {
		super(ctx);
		this.assert(
			ctx.scope === 'crm' && PolicyService.can(ctx, 'settings.manage'),
			'settings.manage'
		);
	}

	current(): CharityDocumentDto | null {
		const row = this.currentRow();
		return row
			? {
					url: charityDocumentUrl(row.id),
					sizeBytes: row.sizeBytes,
					uploadedAt: row.createdAt.toISOString()
				}
			: null;
	}

	/** @throws ValidationError for a file that is not a PDF or is too large. */
	async replace(bytes: Buffer): Promise<void> {
		const refusal = checkCharityDocument(bytes.length, bytes.subarray(0, SIGNATURE_HEAD_BYTES));
		if (refusal !== null) throw new ValidationError(REFUSALS[refusal], { field: 'file' });
		consumeRateLimit('file.upload', String(this.ctx.userId));
		// The bytes land first: a row that points at no file would answer 404 to every reader.
		const path = charityDocumentPath(randomBytes(8).toString('hex'));
		await writeStoredFile(path, bytes, this.root);
		const old = this.audited({ action: 'charity.document_replace', entity: 'media' }, (tx) => {
			const previous = this.currentRow(tx);
			const id = this.documents.insert(
				{ path, sizeBytes: bytes.length, uploadedBy: this.ctx.userId },
				tx
			);
			this.settings.save(KEY, id, this.ctx.userId, tx);
			if (previous) this.documents.remove(previous.id, tx);
			return {
				result: previous,
				entityId: id,
				before: { mediaId: previous?.id ?? null },
				after: { mediaId: id, sizeBytes: bytes.length }
			};
		});
		if (old) await removeStoredFile(old.path, this.root);
	}

	/** Takes the document off the portal; nothing happens when there is none. */
	async remove(): Promise<void> {
		const old = this.audited({ action: 'charity.document_remove', entity: 'media' }, (tx) => {
			const previous = this.currentRow(tx);
			this.settings.remove(KEY, tx);
			if (previous) this.documents.remove(previous.id, tx);
			return {
				result: previous,
				entityId: previous?.id ?? null,
				before: { mediaId: previous?.id ?? null }
			};
		});
		if (old) await removeStoredFile(old.path, this.root);
	}

	private currentRow(tx?: Tx) {
		const id = new CharitySettings(this.settings).documentId(tx);
		return id === null ? undefined : this.documents.find(id, tx);
	}
}
