import type { RegisteredHandler } from '../job-handler';
import { charityRecountHandler } from './charity-recount';
import { notificationDispatchHandler } from './notification-dispatch';
import { notificationFanoutHandler } from './notification-fanout';
import { sessionCleanupHandler } from './session-cleanup';
import { stockThresholdCheckHandler } from './stock-threshold-check';

/** Topics without an entry here stay pending: the worker never claims a job it cannot run. */
export const HANDLERS: readonly RegisteredHandler[] = [
	sessionCleanupHandler,
	charityRecountHandler,
	notificationFanoutHandler,
	notificationDispatchHandler,
	stockThresholdCheckHandler
];
