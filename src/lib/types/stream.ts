import type { RequestStatus } from './request';

export type StreamMessage =
	| { topic: 'charity'; totalMinor: number; yearMinor: number; requestCount: number }
	| { topic: 'requests'; byStatus: Record<RequestStatus, number> };
