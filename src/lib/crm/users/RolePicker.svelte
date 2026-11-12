<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { CRM_ROLE_OPTIONS } from '$lib/crm/labels';
	import { Checkbox, Popover } from '$lib/ui';

	let { error }: { error?: string | undefined } = $props();
	let selected = $state(CRM_ROLE_OPTIONS.map(() => false));
	const chosen = $derived(CRM_ROLE_OPTIONS.filter((_, index) => selected[index]));
	const id = $props.id();
</script>

<div class="flex flex-col gap-2">
	<span id={`${id}-label`} class="text-sm font-medium">Роли</span>
	{#each chosen as role (role.value)}
		<input type="hidden" name="roles" value={role.value} />
	{/each}
	<Popover.Root>
		<Popover.Trigger
			aria-labelledby={`${id}-label`}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-error` : undefined}
			class="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm"
		>
			<span>{chosen.length ? chosen.map((role) => role.label).join(', ') : 'Выберите роли'}</span>
			<ChevronDown class="size-4 shrink-0" aria-hidden="true" />
		</Popover.Trigger>
		<Popover.Content
			align="start"
			class="max-h-80 w-[var(--bits-popover-anchor-width)] overflow-y-auto p-3"
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
	{#if error}<p id={`${id}-error`} role="alert" class="text-sm text-danger">{error}</p>{/if}
</div>
