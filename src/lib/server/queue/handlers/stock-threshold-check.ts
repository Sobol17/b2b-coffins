import { withTransaction } from '../../core/tx';
import { bus } from '../../events/bus';
import { StockThreshold } from '../../stock/stock-threshold';
import { defineHandler } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';

export interface ThresholdCheckDeps {
	readonly threshold: StockThreshold;
}

/**
 * `stock.threshold.check` of tech.md 7.2: looks at the balance again, because the shelf may have
 * been refilled since the move that queued the job, and publishes `stock.below_threshold`. The
 * fanout key absorbs a rerun, so two runs leave one event.
 */
export function createStockThresholdCheckHandler(deps: ThresholdCheckDeps) {
	return defineHandler({
		topic: 'stock.threshold.check',
		schema: JOB_PAYLOAD_SCHEMAS['stock.threshold.check'],
		async handle({ stockItemId }, ctx) {
			const below = withTransaction((tx) => {
				if (!deps.threshold.isBelow(stockItemId, tx)) return false;
				bus.emit('stock.below_threshold', stockItemId, tx);
				return true;
			});
			ctx.logger.info({ stockItemId, below }, 'stock threshold checked');
		}
	});
}

export const stockThresholdCheckHandler = createStockThresholdCheckHandler({
	threshold: new StockThreshold()
});
