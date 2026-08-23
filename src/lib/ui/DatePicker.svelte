<script lang="ts">
	import { CalendarDate, parseDate } from '@internationalized/date';
	import { Calendar } from '$lib/ui/base/calendar/index.js';
	import * as Popover from '$lib/ui/base/popover/index.js';
	import Button from '$lib/ui/base/button/button.svelte';
	import Field from './Field.svelte';
	import { formatDate } from '$lib/utils/format';

	// The binding stays an ISO date string: CalendarDate is an implementation detail of the popover.
	let {
		label,
		hint,
		error,
		required = false,
		value = $bindable(''),
		id,
		name,
		placeholder = 'Выберите дату',
		disabled = false
	}: {
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		value?: string;
		id?: string | undefined;
		name?: string | undefined;
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);

	let open = $state(false);

	function toCalendarDate(iso: string): CalendarDate | undefined {
		if (iso === '') return undefined;
		try {
			const parsed = parseDate(iso);
			return new CalendarDate(parsed.year, parsed.month, parsed.day);
		} catch {
			return undefined;
		}
	}

	// Cast at the call site below: the calendar value is a discriminated union that does not
	// survive destructuring, the same reason the generated component casts its own value.
	const selected = $derived(toCalendarDate(value));
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<Popover.Root bind:open>
			<Popover.Trigger id={fieldId} {disabled}>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						class="w-full justify-start font-normal"
						aria-invalid={error ? 'true' : undefined}
					>
						{value === '' ? placeholder : formatDate(`${value}T00:00:00Z`)}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-auto p-0">
				<Calendar
					type="single"
					locale="ru-RU"
					value={selected as never}
					onValueChange={(next) => {
						value = next === undefined ? '' : next.toString();
						open = false;
					}}
				/>
			</Popover.Content>
		</Popover.Root>
		<input type="hidden" {name} {value} />
	{/snippet}
</Field>
