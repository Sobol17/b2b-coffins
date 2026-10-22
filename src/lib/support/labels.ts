import type { StatusTone } from '$lib/ui';
import type { SupportSide, SupportThreadListItemDto } from '$lib/types/support';

export type SupportContour = SupportSide;

export interface SupportState {
	readonly label: string;
	readonly tone: StatusTone;
}

/** Whose turn it is, worded for the reader: each side sees its own turn as the one to act on. */
export function supportState(
	thread: Pick<SupportThreadListItemDto, 'status' | 'awaiting'>,
	contour: SupportContour
): SupportState {
	if (thread.status === 'closed') return { label: 'Закрыто', tone: 'neutral' };
	if (contour === 'crm') {
		return thread.awaiting === 'crm'
			? { label: 'Ждёт ответа', tone: 'warning' }
			: { label: 'Ответили', tone: 'success' };
	}
	return thread.awaiting === 'crm'
		? { label: 'Ждёт ответа мастерской', tone: 'info' }
		: { label: 'Есть ответ', tone: 'success' };
}
