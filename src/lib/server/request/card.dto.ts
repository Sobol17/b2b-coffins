import type { AttachmentRow, CardRow, CommentRow, HistoryRow } from './request-card.repository';
import type { DraftLineRow, LineOptionRow, LinePriceRow } from './draft-item.repository';
import { attachmentName } from '$lib/domain/request/attachments';
import { discountPercentOf } from '$lib/domain/request/pricing';
import type {
	RequestAttachmentDto,
	RequestCardDto,
	RequestCommentDto,
	RequestHistoryStepDto,
	RequestItemDto,
	RequestStatus
} from '$lib/types/request';
import { definedProps } from '$lib/utils/props';

export interface CardParts {
	readonly lines: readonly DraftLineRow[];
	readonly options: readonly LineOptionRow[];
	/** Undefined for a role without prices: the money columns were never read. */
	readonly prices: ReadonlyMap<number, LinePriceRow> | undefined;
	/** Agency prices per model (P7). Undefined outside the portal; never summed into the card. */
	readonly agencyPrices: ReadonlyMap<number, number> | undefined;
	readonly history: readonly HistoryRow[];
	readonly comments: readonly CommentRow[];
	readonly attachments: readonly AttachmentRow[];
	readonly targets: readonly RequestStatus[];
	readonly viewerId: number;
}

export type CoreParts = Omit<CardParts, 'comments' | 'viewerId'>;

/** Role projection of the request card (tech.md 8.1). */
export class CardDtoMapper {
	static toCard(row: CardRow, parts: CardParts): RequestCardDto {
		return {
			...CardDtoMapper.toCore(row, parts),
			comments: parts.comments.map((comment) => CardDtoMapper.toComment(comment, parts.viewerId))
		};
	}

	/** The card without the portal thread: the workshop card of C4 is built on it. */
	static toCore(row: CardRow, parts: CoreParts): Omit<RequestCardDto, 'comments'> {
		return {
			id: row.id,
			number: row.number,
			status: row.status,
			priority: row.priority,
			createdAt: row.createdAt.toISOString(),
			submittedAt: row.submittedAt?.toISOString() ?? null,
			externalNumber: row.externalNumber,
			comment: row.comment,
			authorName: row.authorName,
			deliveryAddress: row.deliveryAddress,
			deliveryAt: row.deliveryAt?.toISOString() ?? null,
			deceasedName: row.deceasedName,
			items: parts.lines.map((line) => CardDtoMapper.toItem(line, parts)),
			unitCount: parts.lines.reduce((sum, line) => sum + line.qty, 0),
			history: parts.history.map(CardDtoMapper.toStep),
			attachments: parts.attachments.map(CardDtoMapper.toAttachment),
			targets: [...parts.targets],
			...definedProps({
				itemsTotalMinor: row.itemsTotalMinor,
				discountMinor: row.discountMinor,
				totalMinor: row.totalMinor,
				paidMinor: row.paidMinor,
				// Null until the delivery freezes it: the card then has no donation line at all.
				charityAmountMinor: row.charityAmountMinor ?? undefined,
				discountPercent:
					row.itemsTotalMinor === undefined || row.discountMinor === undefined
						? undefined
						: discountPercentOf(row.itemsTotalMinor, row.discountMinor)
			})
		};
	}

	static toComment(row: CommentRow, viewerId: number): RequestCommentDto {
		return {
			id: row.id,
			authorName: row.authorName ?? '',
			isMine: row.authorId === viewerId,
			body: row.body,
			createdAt: row.createdAt.toISOString()
		};
	}

	static toAttachment(row: AttachmentRow): RequestAttachmentDto {
		return {
			id: row.id,
			name: attachmentName(row.path),
			mime: row.mime,
			sizeBytes: row.sizeBytes,
			createdAt: row.createdAt.toISOString()
		};
	}

	private static toStep(row: HistoryRow): RequestHistoryStepDto {
		return {
			id: row.id,
			fromStatus: row.fromStatus,
			toStatus: row.toStatus,
			actorName: row.actorName,
			reasonTitle: row.reasonTitle,
			comment: row.comment,
			createdAt: row.createdAt.toISOString()
		};
	}

	private static toItem(line: DraftLineRow, parts: CoreParts): RequestItemDto {
		const price = parts.prices?.get(line.id);
		return {
			id: line.id,
			productId: line.productId,
			productTitle: line.productTitle,
			sku: line.sku,
			sizeCode: line.sizeCode,
			materialTitle: line.materialTitle,
			qty: line.qty,
			engraving: line.engraving,
			comment: line.comment,
			options: parts.options
				.filter((option) => option.itemId === line.id)
				.map((option) => ({ id: option.optionId, kind: option.kind, title: option.title })),
			...definedProps({
				unitPriceMinor: price === undefined ? undefined : price.unitPriceMinor + price.optionsMinor,
				lineTotalMinor: price?.lineTotalMinor,
				agencyUnitPriceMinor: parts.agencyPrices?.get(line.productId)
			})
		};
	}
}
