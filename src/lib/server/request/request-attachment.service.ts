import { randomBytes } from 'node:crypto';
import { consumeRateLimit } from '../auth/rate-limit';
import { config } from '../config';
import { ValidationError } from '../core/errors';
import { writeStoredFile } from '../files/storage';
import { CardDtoMapper } from './card.dto';
import { RequestCardRepository } from './request-card.repository';
import { SentRequestService } from './sent-request.service';
import {
	ATTACHMENT_MAX_BYTES,
	checkAttachment,
	storedAttachmentPath
} from '$lib/domain/request/attachments';
import type { ActorContext } from '$lib/types/actor';
import type { RequestAttachmentDto } from '$lib/types/request';

export interface AttachmentUpload {
	readonly name: string;
	readonly mime: string;
	readonly bytes: Buffer;
}

const REFUSALS = {
	mime: 'Такой тип файла не принимается',
	size: `Файл должен быть не пустым и не больше ${ATTACHMENT_MAX_BYTES / (1024 * 1024)} МБ`
} as const;

/** Files a counterparty attaches to its own request: drawings, scans, photos (tech.md 14, P6). */
export class RequestAttachmentService extends SentRequestService {
	constructor(
		ctx: ActorContext,
		private readonly root: string = config.FILES_DIR,
		cards: RequestCardRepository = new RequestCardRepository()
	) {
		super(ctx, cards);
	}

	/**
	 * @throws ValidationError for a type or a size the contract refuses, ForbiddenError for a
	 * request the actor may not read, NotFoundError for a missing one.
	 */
	async attach(requestId: number, file: AttachmentUpload): Promise<RequestAttachmentDto> {
		this.requireReader();
		const refusal = checkAttachment({ mime: file.mime, sizeBytes: file.bytes.length });
		if (refusal !== null) throw new ValidationError(REFUSALS[refusal], { field: 'file' });

		const request = this.reach(requestId);
		consumeRateLimit('file.upload', String(this.ctx.userId));
		// The bytes land first: a row that points at no file would answer 404 on every download,
		// while a file without a row is invisible and costs nothing but disk.
		const path = storedAttachmentPath(request.id, file.name, randomBytes(8).toString('hex'));
		await writeStoredFile(path, file.bytes, this.root);

		return this.audited({ action: 'request.attach', entity: 'media' }, (tx) => {
			const row = this.cards.insertAttachment(
				{
					requestId: request.id,
					path,
					mime: file.mime,
					sizeBytes: file.bytes.length,
					uploadedBy: this.ctx.userId
				},
				tx
			);
			return {
				result: CardDtoMapper.toAttachment(row),
				entityId: request.id,
				after: { mediaId: row.id, sizeBytes: row.sizeBytes }
			};
		});
	}
}
