<script lang="ts">
	import { Button, Card } from '$lib/ui';
	import type { CreatedStaffDto } from '$lib/types/counterparty';

	let { access, title }: { access: CreatedStaffDto; title: string } = $props();
	let copyMessage = $state('');
	let copying = $state(false);

	async function copyPassword(): Promise<void> {
		copying = true;
		try {
			await navigator.clipboard.writeText(access.temporaryPassword);
			copyMessage = 'Пароль скопирован';
		} catch {
			copyMessage = 'Не удалось скопировать. Выделите пароль и скопируйте вручную.';
		} finally {
			copying = false;
		}
	}
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-2" data-testid="created-access">
		<h2 class="text-2xl">{title}: {access.member.fullName}</h2>
		<p class="text-fg-muted">
			Скопируйте пароль и передайте пользователю. После обновления страницы пароль исчезнет.
		</p>
		<p>Логин: {access.member.phone ?? access.member.email}</p>
		<p>
			Временный пароль:
			<code
				data-testid="temporary-password"
				class="rounded-sm bg-surface-muted px-2 py-1 font-mono break-all select-all"
			>
				{access.temporaryPassword}
			</code>
		</p>
		<Button
			type="button"
			variant="secondary"
			class="self-start"
			loading={copying}
			onclick={copyPassword}
		>
			Скопировать пароль
		</Button>
		<p role="status" class="text-sm text-fg-muted">{copyMessage}</p>
	</Card.Content>
</Card.Root>
