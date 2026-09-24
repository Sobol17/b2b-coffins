<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Card, EmptyState, ErrorState, Skeleton, Spinner, Tabs, toast } from '$lib/ui';
	import Showcase from '../Showcase.svelte';
</script>

<Showcase name="Toast">
	<Button
		onclick={() => toast.success('Заявка сохранена', { description: 'Черновик обновлён' })}
		data-testid="toast-success"
	>
		Успех
	</Button>
	<Button
		variant="secondary"
		onclick={() =>
			toast.info('Заявка З-2026-00042 отправлена', {
				description: 'Администратор примет её в работу',
				action: { label: 'Открыть каталог', href: resolve('/portal/catalog') }
			})}
		data-testid="toast-info"
	>
		Информация
	</Button>
	<Button
		variant="secondary"
		onclick={() =>
			toast.warning('Письмо не отправилось', { description: 'Передайте пароль сотруднику сами' })}
		data-testid="toast-warning"
	>
		Предупреждение
	</Button>
	<Button
		variant="danger"
		onclick={() =>
			toast.error('Не удалось сохранить', { description: 'Повторите попытку через минуту' })}
		data-testid="toast-error"
	>
		Ошибка
	</Button>
</Showcase>

<Showcase name="Card">
	<Card.Root class="w-72">
		<Card.Header>
			<Card.Title>Заявка З-1042</Card.Title>
			<Card.Description>Ритуальная служба «Пример»</Card.Description>
		</Card.Header>
		<Card.Content>Четыре позиции, доставка на 12 августа.</Card.Content>
	</Card.Root>
</Showcase>

<Showcase name="Tabs">
	<Tabs.Root value="items" class="w-72">
		<Tabs.List>
			<Tabs.Trigger value="items">Состав</Tabs.Trigger>
			<Tabs.Trigger value="history">История</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="items">Позиции заявки</Tabs.Content>
		<Tabs.Content value="history">Переходы статусов</Tabs.Content>
	</Tabs.Root>
</Showcase>

<Showcase name="EmptyState">
	<EmptyState title="Заявок нет" description="Оформите первую заявку из каталога" />
</Showcase>

<Showcase name="ErrorState">
	<ErrorState description="Повторите попытку через минуту" />
</Showcase>

<Showcase name="Skeleton">
	<Skeleton class="h-4 w-48" />
	<Skeleton class="h-4 w-32" />
</Showcase>

<Showcase name="Spinner">
	<Spinner />
</Showcase>
