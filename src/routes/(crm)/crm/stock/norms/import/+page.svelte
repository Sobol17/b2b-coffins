<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PreviewTable from '$lib/crm/bom/PreviewTable.svelte';
	import { FILE_ERROR_TITLE } from '$lib/crm/bom/labels';
	import { Breadcrumbs, Button, Card, FileUpload, TONE_CLASS, withToast } from '$lib/ui';
	import { BOM_FILE_COLUMNS, BOM_PREVIEW_ROWS } from '$lib/types/crm-bom';
	import { pluralRu } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const preview = $derived(data.preview);
	let pending = $state(false);

	function openPreview(mediaId: number): void {
		// The route is resolved; the file is a query string, not a route pattern.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/crm/stock/norms/import')}?file=${mediaId}`);
	}
</script>

<svelte:head><title>Импорт норм</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs
		items={[
			{ label: 'Склад', href: resolve('/crm/stock') },
			{ label: 'Нормы', href: resolve('/crm/stock/norms') },
			{ label: 'Импорт' }
		]}
	/>
	<div>
		<h1 class="mb-2 text-3xl">Импорт норм</h1>
		<p class="max-w-2xl text-fg-muted">
			Файл XLSX или CSV. Первая строка с названиями колонок: {BOM_FILE_COLUMNS.map(
				(column) => `«${column}»`
			).join(', ')}. Файл без ошибок становится новой активной версией.
		</p>
	</div>

	<Card.Root>
		<Card.Content>
			<FileUpload
				label="Файл норм"
				accept=".xlsx,.csv"
				maxSizeMb={5}
				fields={{ bomImport: '1' }}
				onUploaded={openPreview}
			/>
		</Card.Content>
	</Card.Root>

	{#if preview}
		<Card.Root>
			<Card.Header>
				<Card.Title>Предпросмотр</Card.Title>
				<Card.Description>
					{#if preview.fileError}
						Файл не разобран.
					{:else}
						<span data-testid="bom-preview-summary">
							{preview.rowCount}
							{pluralRu(preview.rowCount, ['строка', 'строки', 'строк'])}, с ошибками {preview.errorCount}.
						</span>
						{#if preview.rowCount > BOM_PREVIEW_ROWS}
							Показаны первые {BOM_PREVIEW_ROWS}, строки с ошибками идут первыми.
						{/if}
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				{#if preview.fileError}
					<p
						class={['rounded-inset px-4 py-3 text-sm', TONE_CLASS.danger]}
						data-testid="bom-file-error"
					>
						{FILE_ERROR_TITLE[preview.fileError]}
					</p>
				{:else}
					{#if preview.canImport}
						<form
							method="POST"
							action="?/confirm"
							use:enhance={withToast({ pending: (value) => (pending = value) })}
						>
							<input type="hidden" name="mediaId" value={preview.mediaId} />
							<Button type="submit" loading={pending}>Импортировать</Button>
						</form>
					{:else}
						<p class={['rounded-inset px-4 py-3 text-sm', TONE_CLASS.danger]}>
							Исправьте строки с ошибками в файле и загрузите его заново. Файл с ошибкой не
							импортируется.
						</p>
					{/if}
					<PreviewTable rows={preview.rows} />
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
