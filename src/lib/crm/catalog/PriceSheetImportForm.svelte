<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, FileInput, withToast, type ToastSpec } from '$lib/ui';
	let importing = $state(false);
	function importedToast(data: Record<string, unknown> | undefined): ToastSpec {
		const count = typeof data?.['imported'] === 'number' ? data['imported'] : 0;
		return { title: 'Прайс загружен', description: `Цен в листе: ${count}.` };
	}
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-4">
		<h2 class="text-2xl">Загрузить прайс из файла</h2>
		<form
			method="POST"
			action="?/import"
			enctype="multipart/form-data"
			class="flex flex-col gap-4"
			use:enhance={withToast({ pending: (value) => (importing = value), success: importedToast })}
		>
			<FileInput
				name="file"
				accept=".xlsx"
				label="Файл XLSX"
				hint="Первая строка: «Артикул» и «Цена». Файл заменит все цены листа."
				required
			/>
			<Button type="submit" class="self-start" loading={importing}>Загрузить</Button>
		</form>
	</Card.Content>
</Card.Root>
