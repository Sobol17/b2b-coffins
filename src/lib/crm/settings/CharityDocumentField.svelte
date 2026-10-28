<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ConfirmDialog, FileInput, withToast } from '$lib/ui';
	import type { CharityDocumentDto } from '$lib/types/charity';
	import { formatDate } from '$lib/utils/format';

	/*
	 * The confirmation of the transfer to the fund (tech.md v1.66). One PDF: a new upload replaces
	 * it, and every portal role opens it from the home page.
	 */
	let { document, timeZone }: { document: CharityDocumentDto | null; timeZone: string } = $props();

	let uploading = $state(false);
	let removeForm = $state<HTMLFormElement>();
	let removeOpen = $state(false);
	const sizeMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
</script>

<section
	class="flex max-w-xl flex-col gap-4 border-t border-border pt-6"
	data-testid="charity-document"
>
	<div class="flex flex-col gap-1">
		<h3 class="text-lg font-medium">Подтверждение перевода в фонд</h3>
		<p class="text-sm text-fg-muted">
			Файл PDF видят контрагенты на главной странице портала. Новый файл заменяет прежний.
		</p>
	</div>
	{#if document}
		<div class="flex flex-wrap items-center gap-3 text-sm">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- a stored file, not an app route -->
			<a
				data-testid="charity-document-link"
				class="text-link underline hover:text-link-hover"
				href={document.url}
				target="_blank"
				rel="noopener">Открыть файл</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			<span class="text-fg-muted">
				{formatDate(document.uploadedAt, timeZone)} · {sizeMb(document.sizeBytes)} МБ
			</span>
			<Button variant="ghost" size="sm" class="text-danger" onclick={() => (removeOpen = true)}>
				Удалить
			</Button>
		</div>
	{/if}
	<form
		method="POST"
		action="?/charityDocument"
		enctype="multipart/form-data"
		class="flex flex-col gap-4"
		use:enhance={withToast({ pending: (value) => (uploading = value), success: 'Файл загружен' })}
	>
		<FileInput
			name="file"
			accept=".pdf,application/pdf"
			label="Файл PDF"
			hint="Не больше 10 МБ."
			required
		/>
		<Button type="submit" variant="secondary" class="self-start" loading={uploading}>
			Загрузить файл
		</Button>
	</form>
</section>

<form
	bind:this={removeForm}
	method="POST"
	action="?/charityDocumentRemove"
	class="hidden"
	use:enhance={withToast({ success: 'Файл удалён' })}
></form>
<ConfirmDialog
	bind:open={removeOpen}
	title="Удалить файл?"
	description="Контрагенты перестанут видеть подтверждение перевода на портале."
	confirmLabel="Удалить"
	danger
	onConfirm={() => {
		removeForm?.requestSubmit();
		removeOpen = false;
	}}
/>
