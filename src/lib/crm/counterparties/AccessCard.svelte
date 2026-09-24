<script lang="ts">
	import { Card } from '$lib/ui';
	import type { CreatedStaffDto } from '$lib/types/counterparty';
	import type { Snippet } from 'svelte';

	let { access, title, children }: { access: CreatedStaffDto; title: string; children?: Snippet } =
		$props();
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-2" data-testid="created-access">
		<h2 class="text-2xl">{title}: {access.member.fullName}</h2>
		<p class="text-fg-muted">
			{access.mailSent
				? `Письмо с паролем ушло на ${access.member.email}.`
				: 'Письмо не отправилось, передайте пароль сами.'}
			Пароль показан один раз и после обновления страницы исчезнет.
		</p>
		<p>
			Временный пароль:
			<code
				data-testid="temporary-password"
				class="rounded-sm bg-surface-muted px-2 py-1 font-mono"
			>
				{access.temporaryPassword}
			</code>
		</p>
		{@render children?.()}
	</Card.Content>
</Card.Root>
