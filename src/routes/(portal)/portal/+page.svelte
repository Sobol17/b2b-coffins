<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Card } from '$lib/ui';
</script>

<svelte:head><title>Портал контрагента</title></svelte:head>

<div class="flex flex-col gap-6">
	<h1 data-testid="portal-home" class="px-2 pt-4 text-4xl sm:text-5xl">Портал контрагента</h1>

	<div class="grid gap-6 md:grid-cols-2">
		<Card.Root>
			<Card.Content class="flex flex-col gap-3">
				<h2 class="text-2xl">Мой аккаунт</h2>
				<p class="text-fg-muted">Контактные данные и пароль для входа в портал.</p>
				<Button variant="secondary" href={resolve('/portal/profile')} class="self-start">
					Открыть профиль
				</Button>
			</Card.Content>
		</Card.Root>
	</div>
</div>
