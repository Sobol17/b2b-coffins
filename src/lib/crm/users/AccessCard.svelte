<script lang="ts">
	import { Card } from '$lib/ui';
	import type { CreatedCrmUserDto } from '$lib/types/crm';

	let { access, isReset }: { access: CreatedCrmUserDto; isReset: boolean } = $props();
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-2" data-testid="created-access">
		<h2 class="text-2xl">
			{isReset ? 'Пароль сброшен' : 'Доступ создан'}: {access.user.fullName}
		</h2>
		<p class="text-fg-muted">
			{access.mailSent
				? `Письмо с паролем ушло на ${access.user.email}.`
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
	</Card.Content>
</Card.Root>
