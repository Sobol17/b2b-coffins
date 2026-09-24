<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Input, withToast } from '$lib/ui';
	import type { OrgRequisitesDto } from '$lib/types/crm';
	import { PLACEHOLDER } from '$lib/utils/placeholders';
	import { fieldError, type SettingsFormResult } from './types';

	let {
		requisites,
		result
	}: { requisites: OrgRequisitesDto | null; result: SettingsFormResult | null | undefined } =
		$props();

	const error = (field: string) => fieldError(result, 'requisites', field);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Реквизиты мастерской</Card.Title>
		<Card.Description>Телефон и адрес видит гость на главной странице.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/requisites"
			data-testid="requisites-form"
			class="grid grid-cols-1 gap-4 md:grid-cols-2"
			use:enhance={withToast({ reset: false, success: 'Реквизиты сохранены' })}
		>
			<div class="md:col-span-2">
				<Input
					name="name"
					label="Название"
					placeholder="Введите название"
					value={requisites?.name ?? ''}
					required
					error={error('name')}
				/>
			</div>
			<Input
				name="inn"
				label="ИНН"
				placeholder="Введите ИНН"
				value={requisites?.inn ?? ''}
				error={error('inn')}
			/>
			<Input
				name="kpp"
				label="КПП"
				placeholder="Введите КПП"
				value={requisites?.kpp ?? ''}
				error={error('kpp')}
			/>
			<div class="md:col-span-2">
				<Input
					name="address"
					label="Адрес"
					placeholder="Введите адрес"
					value={requisites?.address ?? ''}
					error={error('address')}
				/>
			</div>
			<Input
				name="phone"
				type="tel"
				label="Телефон"
				placeholder={PLACEHOLDER.phone}
				value={requisites?.phone ?? ''}
				error={error('phone')}
			/>
			<Input
				name="email"
				type="email"
				label="Электронная почта"
				placeholder={PLACEHOLDER.email}
				value={requisites?.email ?? ''}
				error={error('email')}
			/>
			<div class="md:col-span-2">
				<Input
					name="bank"
					label="Банк"
					placeholder="Введите банк"
					value={requisites?.bank ?? ''}
					error={error('bank')}
				/>
			</div>
			<Input
				name="bik"
				label="БИК"
				placeholder="Введите БИК"
				value={requisites?.bik ?? ''}
				error={error('bik')}
			/>
			<Input
				name="account"
				label="Расчётный счёт"
				placeholder="Введите счёт"
				value={requisites?.account ?? ''}
				error={error('account')}
			/>
			<Button type="submit" class="self-start md:col-span-2 md:justify-self-start">
				Сохранить реквизиты
			</Button>
		</form>
	</Card.Content>
</Card.Root>
