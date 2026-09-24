<script lang="ts">
	import { enhance } from '$app/forms';
	import { PRIORITY_OPTIONS } from './labels';
	import { Button, Card, Select, withToast } from '$lib/ui';
	import { isSteerable } from '$lib/domain/request/amendment';
	import type { CrmRequestCardDto } from '$lib/types/crm-request';

	let { card }: { card: CrmRequestCardDto } = $props();

	const open = $derived(isSteerable(card.status));
	let priority = $derived<string>(card.priority);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Приоритет</Card.Title>
		{#if open && card.status !== 'new'}
			<Card.Description>Заявка в работе: изменение попадёт в историю.</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if open}
			<form
				method="POST"
				action="?/priority"
				class="flex flex-col gap-3"
				use:enhance={withToast({ success: 'Приоритет изменён' })}
			>
				<Select
					label="Приоритет"
					options={PRIORITY_OPTIONS}
					placeholder="Выберите приоритет"
					bind:value={priority}
				/>
				<input type="hidden" name="priority" value={priority} />
				<Button
					type="submit"
					variant="secondary"
					class="self-start"
					disabled={priority === card.priority}
				>
					Сохранить
				</Button>
			</form>
		{:else}
			<p class="text-fg-muted">Приоритет меняют до доставки заявки.</p>
		{/if}
	</Card.Content>
</Card.Root>
