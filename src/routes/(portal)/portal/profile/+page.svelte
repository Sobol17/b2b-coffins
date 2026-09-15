<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Input, toast } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const profile = $derived(form?.profile ?? data.profile);
</script>

<svelte:head><title>Мой аккаунт</title></svelte:head>

<section class="mx-auto flex w-full max-w-xl flex-col gap-6">
	<h1 class="text-2xl font-semibold">Мой аккаунт</h1>

	<Card.Root>
		<Card.Content>
			<form
				method="POST"
				class="flex flex-col gap-4"
				use:enhance={() =>
					async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'success') toast.success('Данные сохранены');
					}}
			>
				<Input
					label="Электронная почта"
					value={profile.email}
					readonly
					hint="Адрес для входа меняет менеджер мастерской"
				/>
				<Input
					name="fullName"
					label="Имя и фамилия"
					value={profile.fullName}
					autocomplete="name"
					required
					error={form?.errors?.fullName?.join(', ')}
				/>
				<Input
					name="phone"
					type="tel"
					label="Телефон"
					value={profile.phone ?? ''}
					autocomplete="tel"
					error={form?.errors?.phone?.join(', ')}
				/>

				{#if form?.saved}
					<p data-testid="profile-saved" class="text-sm text-success">Данные сохранены</p>
				{/if}

				<Button type="submit" class="self-start">Сохранить</Button>
			</form>
		</Card.Content>
	</Card.Root>
</section>
