<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Textarea, withToast } from '$lib/ui';
	import type {
		CrmCounterpartyCardDto,
		CrmCounterpartyChoicesDto
	} from '$lib/types/crm-counterparty';
	import RequisitesFields from './RequisitesFields.svelte';
	import TermsFields from './TermsFields.svelte';

	let { card, choices }: { card: CrmCounterpartyCardDto; choices: CrmCounterpartyChoicesDto } =
		$props();
</script>

<div class="grid gap-6 lg:grid-cols-2">
	<Card.Root>
		<Card.Header><Card.Title>Реквизиты</Card.Title></Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/requisites"
				class="grid grid-cols-1 gap-4 md:grid-cols-2"
				use:enhance={withToast({ reset: false, success: 'Реквизиты сохранены' })}
			>
				<RequisitesFields values={card} />
				<Button type="submit" class="self-start md:col-span-2">Сохранить реквизиты</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<div class="flex flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>Условия</Card.Title>
				<Card.Description
					>Скидка и прайс-лист действуют на заявки, отправленные после сохранения.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/terms"
					class="grid grid-cols-1 gap-4 md:grid-cols-2"
					use:enhance={withToast({ reset: false, success: 'Условия сохранены' })}
				>
					<TermsFields {choices} values={card} withStaffLimit />
					<Button type="submit" class="self-start md:col-span-2">Сохранить условия</Button>
				</form>
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
					use:enhance={withToast({ reset: false, success: 'Заметки сохранены' })}
				>
					<Textarea
						name="notes"
						placeholder="Введите заметку"
						value={card.notes ?? ''}
						maxlength={5000}
					/>
					<Button type="submit" variant="secondary" class="self-start">Сохранить заметки</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
