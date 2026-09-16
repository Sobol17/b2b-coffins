<script lang="ts">
	import Button from '$lib/ui/base/button/button.svelte';
	import Field from './Field.svelte';
	import { toast } from './toast.svelte';

	/*
	 * Validation runs here so an oversized file never leaves the browser; the server validates the
	 * same file again, because a client check is a convenience and not a guard (tech.md 12).
	 * The upload posts to the files collection route, which the slice owning file storage adds.
	 */
	const UPLOAD_URL = '/api/files';

	let {
		accept,
		maxSizeMb = 10,
		multiple = false,
		fields = {},
		onUploaded,
		label,
		hint,
		id,
		disabled = false
	}: {
		accept?: string | undefined;
		maxSizeMb?: number;
		multiple?: boolean;
		/** Extra form fields posted with the file, such as the owner the slice attaches it to. */
		fields?: Record<string, string>;
		onUploaded: (mediaId: number) => void;
		label?: string | undefined;
		hint?: string | undefined;
		id?: string | undefined;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);

	let input = $state<HTMLInputElement | null>(null);
	let busy = $state(false);
	let error = $state<string | undefined>(undefined);

	function tooLarge(file: File): boolean {
		return file.size > maxSizeMb * 1024 * 1024;
	}

	function rejected(file: File): boolean {
		if (accept === undefined || accept.trim() === '') return false;
		return !accept
			.split(',')
			.map((rule) => rule.trim())
			.some((rule) =>
				rule.startsWith('.')
					? file.name.toLowerCase().endsWith(rule.toLowerCase())
					: rule.endsWith('/*')
						? file.type.startsWith(rule.slice(0, -1))
						: file.type === rule
			);
	}

	async function upload(file: File): Promise<void> {
		const body = new FormData();
		body.append('file', file);
		for (const [key, value] of Object.entries(fields)) body.append(key, value);
		const response = await fetch(UPLOAD_URL, { method: 'POST', body });
		if (!response.ok) throw new Error(`Сервер ответил ${response.status}`);
		const payload: unknown = await response.json();
		const mediaId =
			typeof payload === 'object' && payload !== null && 'id' in payload
				? (payload as { id: unknown }).id
				: undefined;
		if (typeof mediaId !== 'number') throw new Error('Сервер не вернул идентификатор файла');
		onUploaded(mediaId);
	}

	async function onChange(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
		error = undefined;
		const files = Array.from(event.currentTarget.files ?? []);
		if (files.length === 0) return;

		const oversized = files.find(tooLarge);
		if (oversized) {
			error = `Файл «${oversized.name}» больше ${maxSizeMb} МБ`;
			event.currentTarget.value = '';
			return;
		}

		const wrongType = files.find(rejected);
		if (wrongType) {
			error = `Файл «${wrongType.name}» неподходящего типа`;
			event.currentTarget.value = '';
			return;
		}

		busy = true;
		try {
			for (const file of files) await upload(file);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Не удалось загрузить файл';
			toast.error(error);
		} finally {
			busy = false;
			event.currentTarget.value = '';
		}
	}
</script>

<Field id={fieldId} {label} {hint} {error}>
	{#snippet control()}
		<div class="flex items-center gap-3">
			<input
				bind:this={input}
				id={fieldId}
				type="file"
				class="sr-only"
				{accept}
				{multiple}
				{disabled}
				onchange={onChange}
			/>
			<Button
				variant="secondary"
				loading={busy}
				disabled={disabled || busy}
				onclick={() => input?.click()}
			>
				Выбрать файл
			</Button>
			<span class="text-xs text-fg-muted">до {maxSizeMb} МБ</span>
		</div>
	{/snippet}
</Field>
