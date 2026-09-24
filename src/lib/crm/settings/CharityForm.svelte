<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Input, withToast } from '$lib/ui';
	import { fieldError, type SettingsFormResult } from './types';

	let {
		rateBp,
		fund,
		result
	}: {
		rateBp: number | null;
		fund: { readonly title: string; readonly url?: string } | null;
		result: SettingsFormResult | null | undefined;
	} = $props();

	// Basis points on the server, a percent with a comma in the field: 150 reads as «1,5».
	const ratePercent = $derived(rateBp === null ? '' : String(rateBp / 100).replace('.', ','));
	const error = (field: string) => fieldError(result, 'charity', field);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Благотворительный фонд</Card.Title>
		<Card.Description>
			Новая ставка действует на доставки с момента сохранения. Уже зафиксированные отчисления не
			пересчитываются.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/charity"
			data-testid="charity-form"
			class="flex max-w-xl flex-col gap-4"
			use:enhance={withToast({ reset: false, success: 'Данные фонда сохранены' })}
		>
			<Input
				name="rateBp"
				label="Ставка отчисления, %"
				placeholder="Введите процент"
				value={ratePercent}
				required
				error={error('rateBp')}
			/>
			<Input
				name="fundTitle"
				label="Название фонда"
				placeholder="Введите название"
				value={fund?.title ?? ''}
				required
				error={error('fundTitle')}
			/>
			<Input
				name="fundUrl"
				type="url"
				label="Сайт фонда"
				placeholder="Введите адрес сайта"
				value={fund?.url ?? ''}
				error={error('fundUrl')}
			/>
			<Button type="submit" class="self-start">Сохранить данные фонда</Button>
		</form>
	</Card.Content>
</Card.Root>
