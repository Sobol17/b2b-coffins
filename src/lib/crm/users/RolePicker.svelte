<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { CRM_ROLE_OPTIONS } from '$lib/crm/labels';
	import type { CrmRole } from '$lib/types/crm';
	import Field from '$lib/ui/Field.svelte';
	import { Button, Checkbox, Popover } from '$lib/ui';

	let {
		error,
		initialRoles = []
	}: {
		error?: string | undefined;
		initialRoles?: readonly CrmRole[];
	} = $props();
	let selected = $state(
		untrack(() => CRM_ROLE_OPTIONS.map((role) => initialRoles.includes(role.value)))
	);
	const chosen = $derived(CRM_ROLE_OPTIONS.filter((_, index) => selected[index]));
	const id = $props.id();
</script>

<div class="w-full min-w-0">
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
							class="w-full max-w-full min-w-0 justify-between overflow-hidden font-normal"
							aria-label="Роли"
							aria-invalid={error ? 'true' : undefined}
							aria-describedby={error ? `${id}-error` : undefined}
						>
							<span class="min-w-0 flex-1 truncate text-left"
								>{chosen.length
									? chosen.map((role) => role.label).join(', ')
									: 'Выберите роли'}</span
							>
							<ChevronDown class="size-4 shrink-0" aria-hidden="true" />
						</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content
					align="start"
					class="max-h-80 w-(--bits-popover-anchor-width) max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
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
</div>
