<script lang="ts">
	import { enhance } from '$app/forms';
	import { Pencil } from '@lucide/svelte';
	import { Button, Card, Modal, Textarea, withToast } from '$lib/ui';
	import * as Tooltip from '$lib/ui/base/tooltip/index.js';
	import type { CrmCounterpartyCardDto } from '$lib/types/crm-counterparty';
	import RequisitesFields from './RequisitesFields.svelte';

	let { card }: { card: CrmCounterpartyCardDto } = $props();
	let editing = $state(false);
	let saving = $state(false);
	let savingNotes = $state(false);
</script>

{#snippet detail(label: string, value: string | null, wide = false)}
	<div class={['min-w-0', wide && 'col-span-2']}>
		<dt class="text-xs text-fg-faint">{label}</dt>
		<dd class="mt-1 break-words">{value || '—'}</dd>
	</div>
{/snippet}

<div class="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
	<Card.Root>
		<Card.Header>
			<Card.Title>Контакты и реквизиты</Card.Title>
			<Card.Action>
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									class="size-11 p-0"
									aria-label="Изменить реквизиты"
									onclick={() => (editing = true)}
								>
									<Pencil aria-hidden="true" />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content role="tooltip">Изменить реквизиты</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			</Card.Action>
		</Card.Header>
		<Card.Content class="grid gap-6 sm:grid-cols-2" data-testid="counterparty-overview">
			<section class="min-w-0" aria-label="Контакты">
				<h3 class="mb-3 text-sm font-medium">Контакты</h3>
				<dl class="grid gap-4">
					{@render detail('Телефон', card.phone)}
					{@render detail('Электронная почта', card.email)}
				</dl>
			</section>
			<section class="min-w-0" aria-label="Реквизиты">
				<h3 class="mb-3 text-sm font-medium">Реквизиты</h3>
				<dl class="grid grid-cols-2 gap-4">
					{@render detail('Название', card.name, true)}
					{@render detail('Юридическое название', card.legalName, true)}
					{@render detail('ИНН', card.inn)}
					{@render detail('КПП', card.kpp)}
					{@render detail('Юридический адрес', card.address, true)}
				</dl>
			</section>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Заметки</Card.Title>
			<Card.Description>Видны только мастерской.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/notes"
				class="flex flex-col gap-4"
				use:enhance={withToast({
					reset: false,
					pending: (value) => (savingNotes = value),
					success: 'Заметки сохранены'
				})}
			>
				<Textarea
					name="notes"
					label="Заметки для мастерской"
					placeholder="Введите заметку"
					value={card.notes ?? ''}
					maxlength={5000}
					rows={5}
				/>
				<Button type="submit" variant="secondary" class="self-start" loading={savingNotes}
					>Сохранить заметки</Button
				>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<Modal open={editing} title="Изменить реквизиты" onClose={() => (editing = false)}>
	{#snippet body()}
		<form
			method="POST"
			action="?/requisites"
			class="grid max-h-[65dvh] grid-cols-1 gap-4 overflow-y-auto pr-1 md:grid-cols-2"
			use:enhance={withToast({
				pending: (value) => (saving = value),
				success: 'Реквизиты сохранены',
				onSuccess: () => (editing = false)
			})}
		>
			<RequisitesFields values={card} />
			<div class="flex flex-wrap justify-end gap-2 md:col-span-2">
				<Button variant="secondary" disabled={saving} onclick={() => (editing = false)}
					>Отмена</Button
				>
				<Button type="submit" loading={saving}>Сохранить реквизиты</Button>
			</div>
		</form>
	{/snippet}
</Modal>
