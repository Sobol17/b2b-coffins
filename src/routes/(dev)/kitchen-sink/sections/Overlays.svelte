<script lang="ts">
	import { Button, ConfirmDialog, Drawer, Modal, toast } from '$lib/ui';
	import Showcase from '../Showcase.svelte';

	let modalOpen = $state(false);
	let drawerOpen = $state(false);
	let confirmOpen = $state(false);
</script>

<Showcase name="Modal">
	<Button onclick={() => (modalOpen = true)} data-testid="open-modal">Открыть модалку</Button>
	<Modal bind:open={modalOpen} title="Позиция заявки" description="Состав и параметры">
		{#snippet body()}
			<p class="text-sm">Модель, размер, отделка и фурнитура.</p>
		{/snippet}
	</Modal>
</Showcase>

<Showcase name="Drawer">
	<Button onclick={() => (drawerOpen = true)} data-testid="open-drawer">Открыть панель</Button>
	<Drawer bind:open={drawerOpen} title="Фильтры">
		{#snippet body()}
			<p class="text-sm">Панель для мобильного экрана.</p>
		{/snippet}
	</Drawer>
</Showcase>

<Showcase name="ConfirmDialog">
	<Button variant="danger" onclick={() => (confirmOpen = true)} data-testid="open-confirm">
		Отменить заявку
	</Button>
	<ConfirmDialog
		bind:open={confirmOpen}
		title="Отменить заявку?"
		description="Действие нельзя отменить."
		danger
		onConfirm={() => toast.success('Заявка отменена')}
	/>
</Showcase>
