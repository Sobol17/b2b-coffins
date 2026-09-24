<script lang="ts">
	import { enhance } from '$app/forms';
	import { ASSIGNEE_ROLE_OPTIONS, ASSIGNEE_ROLE_TITLE, PRIORITY_OPTIONS } from './labels';
	import { Button, Card, Select, withToast } from '$lib/ui';
	import { isSteerable } from '$lib/domain/request/amendment';
	import type { CrmRequestCardDto, CrmRequestChoicesDto } from '$lib/types/crm-request';

	let { card, crew }: { card: CrmRequestCardDto; crew: CrmRequestChoicesDto['crew'] } = $props();

	const open = $derived(isSteerable(card.status));
	let role = $state('carpenter');
	// A person picked for one role means nothing for another: switching the role clears the pick.
	let userId = $derived.by(() => (role === '' ? '' : ''));
	let priority = $derived<string>(card.priority);
	const people = $derived(
		crew
			.filter((person) => person.roles.some((candidate) => candidate === role))
			.map((person) => ({ value: String(person.id), label: person.fullName }))
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Исполнители и приоритет</Card.Title>
		{#if open && card.status !== 'new'}
			<Card.Description>Заявка в работе: каждое изменение попадёт в историю.</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<ul class="flex flex-col gap-2" data-testid="request-crew">
			{#each card.assignees as member (`${member.userId}:${member.role}`)}
				<li class="flex flex-wrap items-center gap-3 rounded-inset bg-surface-muted px-4 py-2">
					<span class="flex-1">
						{member.fullName}
						<span class="text-sm text-fg-muted">· {ASSIGNEE_ROLE_TITLE[member.role]}</span>
					</span>
					{#if open}
						<form
							method="POST"
							action="?/unassign"
							use:enhance={withToast({ success: 'Исполнитель снят' })}
						>
							<input type="hidden" name="userId" value={member.userId} />
							<input type="hidden" name="role" value={member.role} />
							<Button type="submit" variant="ghost" size="sm">Снять</Button>
						</form>
					{/if}
				</li>
			{:else}
				<li class="text-fg-muted">Исполнители не назначены</li>
			{/each}
		</ul>

		{#if open}
			<form
				method="POST"
				action="?/assign"
				class="flex flex-col gap-3"
				use:enhance={withToast({ success: 'Исполнитель назначен', onSuccess: () => (userId = '') })}
			>
				<Select
					label="Роль"
					options={ASSIGNEE_ROLE_OPTIONS}
					placeholder="Выберите роль"
					bind:value={role}
				/>
				<Select
					label="Сотрудник"
					options={people}
					placeholder="Выберите сотрудника"
					bind:value={userId}
				/>
				<input type="hidden" name="role" value={role} />
				<input type="hidden" name="userId" value={userId} />
				<Button type="submit" variant="secondary" class="self-start" disabled={userId === ''}>
					Назначить
				</Button>
			</form>
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
		{/if}
	</Card.Content>
</Card.Root>
