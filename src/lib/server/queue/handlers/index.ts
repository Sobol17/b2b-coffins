import type { RegisteredHandler } from '../job-handler';
import { sessionCleanupHandler } from './session-cleanup';

/** Topics without an entry here stay pending: the worker never claims a job it cannot run. */
export const HANDLERS: readonly RegisteredHandler[] = [sessionCleanupHandler];
