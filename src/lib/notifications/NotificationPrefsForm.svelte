<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Checkbox, EmptyState, withToast, type ToastSpec } from '$lib/ui';
	import { prefKey } from '$lib/domain/notification/matrix';
	import type { NotificationPrefDto } from '$lib/types/notifications';
	import { CHANNEL_LABEL, EVENT_LABEL } from './labels';

	/*
	 * One switch per pair «event, channel» the role is offered. Unchecked boxes send nothing, so the
	 * server reads the whole selection from the checked values and stores a row for every pair.
	 */
	let { prefs }: { prefs: readonly NotificationPrefDto[] } = $props();

	let saving = $state(false);

	function savedToast(data: Record<string, unknown> | undefined): ToastSpec {
		const stored = Array.isArray(data?.['prefs']) ? data['prefs'] : [];
		const on = stored.filter((pref) => typeof pref === 'object' && pref?.enabled === true).length;
		return on === 0
			? {
					kind: 'warning',
					title: 'Уведомления отключены',
					description: 'События остаются в ленте уведомлений'
				}
			: {
					title: 'Настройки сохранены',
					description: `Включено: ${on} из ${stored.length}`
				};
	}
</script>

{#if prefs.length === 0}
	<EmptyState
		title="Для вашей роли уведомлений нет"
		description="События видно в ленте уведомлений."
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
			Пуш-уведомления и бот в МАКС заработают позже: выбор сохранится и включится вместе с ними.
			Лента событий работает уже сейчас.
		</p>
		<fieldset class="flex flex-col divide-y divide-border">
			<legend class="sr-only">Уведомления о событиях</legend>
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
