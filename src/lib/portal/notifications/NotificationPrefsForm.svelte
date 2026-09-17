<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Checkbox, EmptyState, withToast, type ToastSpec } from '$lib/ui';
	import { prefKey } from '$lib/domain/notification/matrix';
	import type { NotificationPrefDto } from '$lib/types/notifications';
	import { CHANNEL_LABEL, EVENT_LABEL } from './labels';

	/*
	 * One switch per event the role is offered. Unchecked boxes send nothing, so the server reads the
	 * whole selection from the checked values and stores a row for every offered pair.
	 */
	let { prefs, email }: { prefs: readonly NotificationPrefDto[]; email: string } = $props();

	let saving = $state(false);

	function savedToast(data: Record<string, unknown> | undefined): ToastSpec {
		const stored = Array.isArray(data?.['prefs']) ? data['prefs'] : [];
		const on = stored.filter((pref) => typeof pref === 'object' && pref?.enabled === true).length;
		return on === 0
			? {
					kind: 'warning',
					title: 'Письма отключены',
					description: 'Статус заявок можно отслеживать в разделе «Мои заявки»'
				}
			: { title: 'Настройки сохранены', description: `Писем включено: ${on} из ${stored.length}` };
	}
</script>

{#if prefs.length === 0}
	<EmptyState
		title="Для вашей роли писем нет"
		description="Статус заявок видно в разделе «Мои заявки»."
	/>
{:else}
	<form
		method="POST"
		action="?/save"
		class="flex flex-col gap-4"
		use:enhance={withToast({
			reset: false,
			pending: (value) => (saving = value),
			success: savedToast
		})}
	>
		<p class="text-fg-muted">
			Письма приходят на <span class="text-fg">{email}</span>. Адрес меняет менеджер мастерской.
		</p>
		<fieldset class="flex flex-col divide-y divide-border">
			<legend class="sr-only">Письма о событиях заявки</legend>
			{#each prefs as pref (prefKey(pref.eventKey, pref.channel))}
				<div
					data-testid="notification-pref"
					class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4"
				>
					<div class="flex-1">
						<Checkbox
							name="enabled"
							value={prefKey(pref.eventKey, pref.channel)}
							checked={pref.enabled}
							label={`${EVENT_LABEL[pref.eventKey].title}: ${CHANNEL_LABEL[pref.channel].toLowerCase()}`}
						/>
					</div>
					<span class="pl-6 text-sm text-fg-faint sm:pl-0">{EVENT_LABEL[pref.eventKey].hint}</span>
				</div>
			{/each}
		</fieldset>
		<Button type="submit" loading={saving} class="self-start" data-testid="save-notifications">
			Сохранить настройки
		</Button>
	</form>
{/if}
