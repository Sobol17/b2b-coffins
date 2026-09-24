<script lang="ts">
	import { enhance } from '$app/forms';
	import { TIMEZONE_OPTIONS } from '$lib/crm/labels';
	import { Button, Card, NumberInput, Select, withToast } from '$lib/ui';
	import { fieldError, type SettingsFormResult } from './types';

	let {
		timezone,
		staffLimitDefault,
		result
	}: {
		timezone: string;
		staffLimitDefault: number;
		result: SettingsFormResult | null | undefined;
	} = $props();

	// A zone set before C1 may sit outside the list; it stays selectable instead of vanishing.
	const zones = $derived(
		TIMEZONE_OPTIONS.some((option) => option.value === timezone)
			? TIMEZONE_OPTIONS
			: [...TIMEZONE_OPTIONS, { value: timezone, label: timezone }]
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Часовой пояс и лимит сотрудников</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		<form
			method="POST"
			action="?/timezone"
			data-testid="timezone-form"
			class="flex max-w-xl flex-col gap-4"
			use:enhance={withToast({ reset: false, success: 'Часовой пояс сохранён' })}
		>
			<Select
				name="timezone"
				label="Часовой пояс мастерской"
				hint="По нему показываются даты и считаются периоды нумерации"
				placeholder="Выберите часовой пояс"
				options={zones}
				value={timezone}
				error={fieldError(result, 'timezone', 'timezone')}
			/>
			<Button type="submit" class="self-start">Сохранить часовой пояс</Button>
		</form>
		<form
			method="POST"
			action="?/staffLimit"
			data-testid="staff-limit-form"
			class="flex max-w-xl flex-col gap-4"
			use:enhance={withToast({ reset: false, success: 'Лимит сохранён' })}
		>
			<NumberInput
				name="staffLimitDefault"
				label="Лимит сотрудников нового контрагента"
				hint="Уже заведённым контрагентам лимит не меняется"
				placeholder="Введите лимит"
				value={staffLimitDefault}
				min={1}
				max={1000}
				error={fieldError(result, 'staffLimit', 'staffLimitDefault')}
			/>
			<Button type="submit" class="self-start">Сохранить лимит</Button>
		</form>
	</Card.Content>
</Card.Root>
