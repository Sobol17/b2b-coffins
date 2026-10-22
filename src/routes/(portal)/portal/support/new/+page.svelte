<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { profileNavItems } from '$lib/portal/profile-nav';
	import ProfileNav from '$lib/portal/ProfileNav.svelte';
	import { Breadcrumbs, Button, Card, ErrorState, Input, Select, Textarea } from '$lib/ui';
	import { REQUEST_STATUS_META } from '$lib/ui/status';
	import { SUPPORT_SUBJECT_MAX } from '$lib/types/support';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const NO_REQUEST = { value: '', label: 'Без заявки' };
	const requestOptions = $derived([
		NO_REQUEST,
		...data.options.map((option) => ({
			value: String(option.id),
			label: `${option.number}, ${REQUEST_STATUS_META[option.status].label.toLowerCase()}`
		}))
	]);

	let subject = $state('');
	let body = $state('');
	// The card of a request passes its id: the select starts on it, the person may still change it.
	let requestId = $derived(data.requestId === null ? '' : String(data.requestId));

	const failure = $derived(form && 'formError' in form ? form.formError : undefined);
</script>

<svelte:head><title>Новое обращение</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs
			items={[
				{ label: 'Главная', href: resolve('/portal') },
				{ label: 'Чат', href: resolve('/portal/support') },
				{ label: 'Новое обращение' }
			]}
		/>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[17.5rem_1fr] lg:items-start">
		<ProfileNav
			title={data.counterparty.name}
			items={profileNavItems('support', {
				staff: data.canManageStaff,
				prices: data.canManagePrices
			})}
		/>

		<section class="flex flex-col gap-6">
			<h1 class="px-2 text-4xl">Новое обращение</h1>

			<Card.Root>
				<Card.Content>
					<form method="POST" action="?/open" use:enhance class="flex flex-col gap-4">
						<Input
							name="subject"
							label="Тема"
							placeholder="Введите тему"
							maxlength={SUPPORT_SUBJECT_MAX}
							required
							bind:value={subject}
						/>
						<Select
							name="requestId"
							label="Заявка"
							placeholder="Выберите заявку"
							options={requestOptions}
							bind:value={requestId}
						/>
						<Textarea
							name="body"
							label="Сообщение"
							placeholder="Введите сообщение"
							required
							rows={6}
							bind:value={body}
						/>
						{#if failure}
							<div data-testid="support-error"><ErrorState title={failure} /></div>
						{/if}
						<Button type="submit" class="self-start" data-testid="support-open">Отправить</Button>
					</form>
				</Card.Content>
			</Card.Root>
		</section>
	</div>
</div>
