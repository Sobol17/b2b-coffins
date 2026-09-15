<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { profileNavItems } from '$lib/portal/profile-nav';
	import CounterpartyOverview from '$lib/portal/profile/CounterpartyOverview.svelte';
	import ProfileNav from '$lib/portal/ProfileNav.svelte';
	import { Breadcrumbs, Button, Card, Input, toast } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const profile = $derived(form?.profile ?? data.profile);
</script>

<svelte:head><title>Мой аккаунт</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs items={[{ label: 'Главная', href: resolve('/portal') }, { label: 'Профиль' }]} />
	</div>

	<div class="grid gap-6 lg:grid-cols-[17.5rem_1fr] lg:items-start">
		<ProfileNav title={data.card.name} items={profileNavItems('profile', data.canManageStaff)} />

		<section class="flex flex-col gap-6">
			<CounterpartyOverview
				card={data.card}
				canManageStaff={data.canManageStaff}
				timeZone={data.timezone}
			/>

			<h2 class="px-2 pt-2 text-3xl">Мой аккаунт</h2>

			<Card.Root>
				<Card.Content>
					<form
						method="POST"
						class="flex max-w-xl flex-col gap-4"
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

			<Card.Root>
				<Card.Content class="flex flex-wrap items-center gap-4">
					<div>
						<h2 class="text-2xl">Пароль</h2>
						<p class="text-fg-muted">Смена пароля завершает все сеансы на других устройствах.</p>
					</div>
					<Button variant="secondary" href={resolve('/password/change')} class="sm:ml-auto">
						Сменить пароль
					</Button>
				</Card.Content>
			</Card.Root>
		</section>
	</div>
</div>
