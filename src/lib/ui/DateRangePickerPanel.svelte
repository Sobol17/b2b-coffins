<script lang="ts">
	import { CalendarDate, parseDate } from '@internationalized/date';
	import { RangeCalendar } from '$lib/ui/base/range-calendar/index.js';
	import type { DateRangeValue } from './DateRangePicker.svelte';

	/* Loaded on first open by DateRangePicker, for the reason spelled out in DatePickerPanel. */
	let { value, onPick }: { value: DateRangeValue; onPick: (next: DateRangeValue) => void } =
		$props();

	function toCalendarDate(iso: string): CalendarDate | undefined {
		if (iso === '') return undefined;
		try {
			const parsed = parseDate(iso);
			return new CalendarDate(parsed.year, parsed.month, parsed.day);
		} catch {
			return undefined;
		}
	}

	const selected = $derived({
		start: toCalendarDate(value.start),
		end: toCalendarDate(value.end)
	});
</script>

<RangeCalendar
	locale="ru-RU"
	value={selected as never}
	onValueChange={(next) =>
		onPick({
			start: next.start === undefined ? '' : next.start.toString(),
			end: next.end === undefined ? '' : next.end.toString()
		})}
/>
