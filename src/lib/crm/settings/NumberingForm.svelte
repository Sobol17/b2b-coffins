<script lang="ts">
	import { enhance } from '$app/forms';
	import { PERIOD_OPTIONS } from '$lib/crm/labels';
	import { Button, Card, Input, Select, withToast } from '$lib/ui';
	import type { NumberingDto } from '$lib/types/crm';
	import { fieldError, type SettingsFormResult } from './types';

	let {
		numbering,
		result
	}: { numbering: NumberingDto; result: SettingsFormResult | null | undefined } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Нумерация заявок</Card.Title>
		<Card.Description>
			Номер собирается из префикса, периода и счётчика. После смены счётчик продолжится с
			наибольшего уже выданного номера в новом виде.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/numbering"
			data-testid="numbering-form"
			class="flex max-w-xl flex-col gap-4"
			use:enhance={withToast({ reset: false, success: 'Нумерация сохранена' })}
		>
			<Input
				name="prefix"
				label="Префикс"
				placeholder="Введите префикс"
				value={numbering.prefix}
				maxlength={10}
				error={fieldError(result, 'numbering', 'prefix')}
			/>
			<Select
				name="period"
				label="Период счётчика"
				placeholder="Выберите период"
				options={PERIOD_OPTIONS}
				value={numbering.period}
				error={fieldError(result, 'numbering', 'period')}
			/>
			<p class="text-sm text-fg-muted">
				Следующая заявка получит номер
				<strong data-testid="numbering-preview" class="text-fg">{numbering.nextPreview}</strong>
			</p>
			<Button type="submit" class="self-start">Сохранить нумерацию</Button>
		</form>
	</Card.Content>
</Card.Root>
