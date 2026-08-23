<script lang="ts">
	import { CalendarDate, parseDate } from '@internationalized/date';
	import { Calendar } from '$lib/ui/base/calendar/index.js';

	/*
	 * Loaded on first open by DatePicker. The calendar drags in @internationalized/date and the
	 * bits-ui calendar, and a form that never opens the popover must not ship them.
	 */
	let { value, onPick }: { value: string; onPick: (iso: string) => void } = $props();

	function toCalendarDate(iso: string): CalendarDate | undefined {
		if (iso === '') return undefined;
		try {
			const parsed = parseDate(iso);
			return new CalendarDate(parsed.year, parsed.month, parsed.day);
		} catch {
			return undefined;
		}
	}

	// Cast at the call site: the calendar value is a discriminated union that does not survive
	// destructuring, the same reason the generated component casts its own value.
	const selected = $derived(toCalendarDate(value));
</script>

<Calendar
	type="single"
	locale="ru-RU"
	value={selected as never}
	onValueChange={(next) => onPick(next === undefined ? '' : next.toString())}
/>
