<script lang="ts">
	import {
		KanbanBoard,
		KanbanCard,
		KanbanColumn,
		PhotoGallery,
		PhotoUploader,
		type KanbanItem
	} from '$lib/ui';
	import type { RequestStatus } from '$lib/types/request';
	import Showcase from '../Showcase.svelte';

	const columns: RequestStatus[] = ['new', 'in_work', 'ready', 'delivered'];

	let items = $state<KanbanItem[]>([
		{
			id: 1,
			status: 'new',
			title: 'З-1042',
			subtitle: 'Ритуальная служба «Пример»',
			tags: ['Срочно', 'Нет исполнителя']
		},
		{ id: 2, status: 'in_work', title: 'З-1043', subtitle: 'Дуб, четыре позиции' },
		{ id: 3, status: 'ready', title: 'З-1044', subtitle: 'Готово к выдаче' }
	]);

	function move(id: number, status: RequestStatus): void {
		items = items.map((item) => (item.id === id ? { ...item, status } : item));
	}

	let mediaIds = $state<number[]>([]);
</script>

<Showcase name="KanbanBoard">
	<div class="w-full">
		<KanbanBoard {columns} {items} totals={{ new: 12 }} onDrop={move} />
	</div>
</Showcase>

<Showcase name="KanbanColumn">
	<KanbanColumn
		status="in_work"
		items={items.filter((item) => item.status === 'in_work')}
		onDrop={move}
	/>
</Showcase>

<Showcase name="KanbanCard">
	<KanbanCard
		item={{ id: 9, status: 'ready', title: 'З-1050', subtitle: 'Сосна', href: '#kanban-card' }}
	/>
</Showcase>

<Showcase name="PhotoGallery">
	<PhotoGallery mediaIds={[]} />
</Showcase>

<Showcase name="PhotoUploader">
	<PhotoUploader bind:mediaIds />
</Showcase>
