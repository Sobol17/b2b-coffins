import type { PositionTitles } from '../crm-shop/dto';
import type { StopRow, StopSums } from './delivery.repository';
import { requestDebtMinor } from '$lib/domain/payment/debt';
import { isFullyLoaded, loadableQty } from '$lib/domain/request/loading';
import type { DemandLine } from '$lib/domain/stock/allocation';
import type { DeliveryLineDto, DeliveryStopDto } from '$lib/types/crm-delivery';
import { navigationUrl } from '$lib/utils/navigation';

/** What one stop needs besides its row: its lines, the fill of the shelf and, if ready, its sums. */
export interface StopContext {
	readonly lines: readonly DemandLine[];
	readonly filled: ReadonlyMap<number, number>;
	readonly titles: PositionTitles;
	readonly sums: StopSums | undefined;
}

/**
 * Projection of the delivery screen (tech.md v1.43). The sums go out for an assembled request only:
 * the driver takes cash for it at the door, a request in work is only planned.
 */
export class DeliveryDtoMapper {
	static toStop(row: StopRow, context: StopContext): DeliveryStopDto {
		const isReady = row.status === 'ready';
		const lines = context.lines.map((line) =>
			DeliveryDtoMapper.toLine(line, isReady ? (context.filled.get(line.itemId) ?? 0) : 0, context)
		);
		const base: DeliveryStopDto = {
			id: row.id,
			number: row.number,
			status: row.status,
			priority: row.priority,
			counterpartyName: row.counterpartyName ?? '',
			externalNumber: row.externalNumber,
			deceasedName: row.deceasedName,
			deliveryAt: row.deliveryAt?.toISOString() ?? null,
			address: row.address,
			// The person at the address answers first; the counterparty office is the fallback.
			contactName: row.contactName,
			contactPhone: row.contactPhone ?? row.counterpartyPhone,
			navigationUrl: navigationUrl(row),
			unitCount: lines.reduce((sum, line) => sum + line.qty, 0),
			loadedCount: lines.reduce((sum, line) => sum + line.loadedQty, 0),
			lines,
			// The same rule as guard fullyLoaded, so the button never offers what the move refuses.
			canDeliver: isReady && isFullyLoaded(false, lines)
		};
		if (!isReady || context.sums === undefined) return base;
		return {
			...base,
			totalMinor: context.sums.totalMinor,
			dueMinor: requestDebtMinor(context.sums.totalMinor, [context.sums.marksMinor])
		};
	}

	private static toLine(
		line: DemandLine,
		filledQty: number,
		context: StopContext
	): DeliveryLineDto {
		return {
			...context.titles.position(line.variantId, line.optionId),
			itemId: line.itemId,
			qty: line.qty,
			loadedQty: line.loadedQty,
			loadableQty: loadableQty(line, filledQty)
		};
	}
}
