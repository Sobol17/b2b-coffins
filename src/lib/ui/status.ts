import { TRANSITIONS } from '$lib/domain/request/state-machine';
import type { RequestStatus } from '$lib/types/request';

export type StatusTone =
	'neutral' | 'info' | 'progress' | 'ready' | 'warning' | 'success' | 'danger';

export interface StatusMeta {
	readonly label: string;
	readonly tone: StatusTone;
}

/** One dictionary behind StatusBadge and Stepper: labels come from tech.md 6.1, tones from tokens. */
export const REQUEST_STATUS_META: Readonly<Record<RequestStatus, StatusMeta>> = {
	draft: { label: 'Черновик', tone: 'neutral' },
	new: { label: 'Заявка', tone: 'info' },
	in_work: { label: 'В работе', tone: 'progress' },
	ready: { label: 'Готов к выдаче', tone: 'ready' },
	delivered: { label: 'Доставлен', tone: 'info' },
	awaiting_payment: { label: 'Ожидает оплаты', tone: 'warning' },
	paid: { label: 'Оплачено', tone: 'success' },
	cancelled: { label: 'Отменена', tone: 'neutral' },
	rejected: { label: 'Отклонена', tone: 'danger' }
};

export const TONE_CLASS: Readonly<Record<StatusTone, string>> = {
	neutral: 'bg-tone-neutral-soft text-tone-neutral',
	info: 'bg-tone-info-soft text-tone-info',
	progress: 'bg-tone-progress-soft text-tone-progress',
	ready: 'bg-tone-ready-soft text-tone-ready',
	warning: 'bg-tone-warning-soft text-tone-warning',
	success: 'bg-tone-success-soft text-tone-success',
	danger: 'bg-tone-danger-soft text-tone-danger'
};

const TERMINAL: ReadonlySet<RequestStatus> = new Set<RequestStatus>(['cancelled', 'rejected']);

/*
 * The Stepper walks the main flow of tech.md 6.2 instead of keeping its own list: a transition added
 * to the state machine has to show up in the UI without a second edit.
 */
function buildFlow(): RequestStatus[] {
	const flow: RequestStatus[] = ['draft'];
	const seen = new Set<RequestStatus>(flow);
	for (;;) {
		const current = flow.at(-1);
		if (current === undefined) break;
		const next = TRANSITIONS.find(
			(transition) =>
				transition.from === current && !seen.has(transition.to) && !TERMINAL.has(transition.to)
		);
		if (next === undefined) break;
		flow.push(next.to);
		seen.add(next.to);
	}
	return flow;
}

export const REQUEST_STATUS_FLOW: readonly RequestStatus[] = buildFlow();
