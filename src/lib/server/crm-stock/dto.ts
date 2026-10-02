import type { InventoryLineRow, InventoryRow } from './inventory.repository';
import type { StockItemRow } from './stock-item.repository';
import type { PositionRow, StockMoveRow } from './stock-move.repository';
import { isBelowThreshold } from '$lib/domain/stock/balance';
import {
	MANUAL_MOVE_TYPES,
	type InventoryLineDto,
	type InventoryRowDto,
	type ManualMoveType,
	type StockMoveDto,
	type StockPositionDto,
	type StockRowDto
} from '$lib/types/crm-stock';

export function isManualMove(type: string): type is ManualMoveType {
	return (MANUAL_MOVE_TYPES as readonly string[]).includes(type);
}

/** Rows of the warehouse to the DTOs of tech.md §8. No money ever passes through here. */
export class StockDtoMapper {
	static toRow(row: StockItemRow): StockRowDto {
		return {
			id: row.id,
			kind: row.kind,
			code: row.code,
			title: row.title,
			unitId: row.unitId,
			unitTitle: row.unitTitle,
			minThreshold: row.minThreshold,
			isActive: row.isActive,
			balance: row.balance,
			isBelowThreshold: isBelowThreshold(row.balance, row.minThreshold),
			isNegative: row.isNegative === 1
		};
	}

	static toPosition(row: PositionRow): StockPositionDto {
		return { optionId: row.optionId, colorTitle: row.colorTitle, balance: row.balance };
	}

	static toMove(row: StockMoveRow, canManage: boolean): StockMoveDto {
		const isReversed = row.isReversed === 1;
		return {
			id: row.id,
			occurredAt: row.occurredAt.toISOString(),
			type: row.type,
			qty: row.qty,
			optionId: row.optionId,
			colorTitle: row.colorTitle,
			requestId: row.requestId,
			requestNumber: row.requestNumber,
			reasonTitle: row.reasonTitle,
			comment: row.comment,
			actorName: row.actorName,
			reversalOfId: row.reversalOfId,
			isReversed,
			canReverse: canManage && isManualMove(row.type) && !isReversed
		};
	}

	static toInventory(row: InventoryRow): InventoryRowDto {
		return {
			id: row.id,
			kind: row.kind,
			status: row.status,
			comment: row.comment,
			createdByName: row.createdByName,
			createdAt: row.createdAt.toISOString(),
			appliedAt: row.appliedAt?.toISOString() ?? null,
			lineCount: row.lineCount,
			diffCount: row.diffCount
		};
	}

	/** `expectedQty` is the live balance for a draft and the frozen figure once applied. */
	static toLine(row: InventoryLineRow, expectedQty: number): InventoryLineDto {
		return {
			id: row.id,
			stockItemId: row.stockItemId,
			optionId: row.optionId,
			code: row.code,
			title: row.title,
			colorTitle: row.colorTitle,
			unitTitle: row.unitTitle,
			expectedQty,
			actualQty: row.actualQty
		};
	}
}
