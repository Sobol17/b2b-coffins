import { dayShares, type StaffShare } from '$lib/domain/payroll/calc';
import type { WorkDayDto } from '$lib/types/crm-payroll';

/** A work row of the day form as the operator fills it. */
export interface DayEntryDraft {
	readonly key: number;
	workTypeId: string;
	qty: number;
	crew: number[];
}

export function draftsOf(day: WorkDayDto): DayEntryDraft[] {
	return day.entries.map((entry, key) => ({
		key,
		workTypeId: String(entry.workTypeId),
		qty: entry.qty,
		crew: [...entry.staffIds]
	}));
}

/** A work already on the day keeps the price it was written with, a new one takes today's. */
export function rateOf(day: WorkDayDto, workTypeId: string): number | null {
	const id = Number(workTypeId);
	const frozen = day.entries.find((entry) => entry.workTypeId === id);
	return frozen?.rateMinor ?? day.workTypes.find((work) => work.id === id)?.rateMinor ?? null;
}

/**
 * The figures under the form, from the same pure function the server uses; the server counts
 * again. A cleared quantity reads as NaN and counts as zero, a crew member who is no longer
 * ticked as present is left out, as the form does not send them.
 */
export function previewOf(
	day: WorkDayDto,
	presentIds: readonly number[],
	drafts: readonly DayEntryDraft[]
): { totalMinor: number; shares: StaffShare[] } {
	const entries = drafts.map((draft) => ({
		amountMinor: (Number(draft.qty) || 0) * (rateOf(day, draft.workTypeId) ?? 0),
		staffIds: presentIds.filter((id) => draft.crew.includes(id))
	}));
	const valid = entries.filter((entry) => entry.staffIds.length > 0);
	return {
		totalMinor: entries.reduce((sum, entry) => sum + entry.amountMinor, 0),
		shares: dayShares(presentIds, valid)
	};
}

export function setCrewMember(draft: DayEntryDraft, staffId: number, ticked: boolean): void {
	draft.crew = ticked
		? [...new Set([...draft.crew, staffId])]
		: draft.crew.filter((id) => id !== staffId);
}
