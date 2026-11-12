<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { CRM_ROLE_OPTIONS } from '$lib/crm/labels';
	import Field from '$lib/ui/Field.svelte';
	import { Button, Checkbox, Popover } from '$lib/ui';

	let { error }: { error?: string | undefined } = $props();
	let selected = $state(CRM_ROLE_OPTIONS.map(() => false));
	const chosen = $derived(CRM_ROLE_OPTIONS.filter((_, index) => selected[index]));
	const id = $props.id();
</script>

<Field {id} label="Роли" {error} required>
	{#snippet control()}
		{#each chosen as role (role.value)}
			<input type="hidden" name="roles" value={role.value} />
		{/each}
		<Popover.Root>
			<Popover.Trigger {id}>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						class="w-full justify-between font-normal"
						aria-label="Роли"
						aria-invalid={error ? 'true' : undefined}
						aria-describedby={error ? `${id}-error` : undefined}
					>
						<span class="truncate"
							>{chosen.length ? chosen.map((role) => role.label).join(', ') : 'Выберите роли'}</span
						>
						<ChevronDown class="size-4 shrink-0" aria-hidden="true" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content
				align="start"
				class="max-h-80 w-(--bits-popover-anchor-width) overflow-y-auto p-3"
			>
				{#each CRM_ROLE_OPTIONS as role, index (role.value)}
					<div class="py-2">
						<Checkbox
							label={role.label}
							bind:checked={() => selected[index] ?? false, (value) => (selected[index] = value)}
						/>
					</div>
				{/each}
			</Popover.Content>
		</Popover.Root>
	{/snippet}
</Field>
