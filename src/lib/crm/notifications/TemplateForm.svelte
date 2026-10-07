<script lang="ts">
	import { enhance } from '$app/forms';
	import { renderTemplate, TEMPLATE_SAMPLES } from '$lib/domain/notification/template';
	import { EVENT_LABEL } from '$lib/notifications/labels';
	import { Button, Card, Checkbox, Input, Textarea, withToast, type ToastSpec } from '$lib/ui';
	import type { NotificationTemplateDto } from '$lib/types/push';

	let { template }: { template: NotificationTemplateDto } = $props();

	// Writable deriveds: the fields follow the saved template and still take what the owner types.
	let title = $derived(template.title);
	let body = $derived(template.body);
	let isActive = $derived(template.isActive);
	let busy = $state(false);

	/** The same render the server runs, on the sample values: the owner sees the push as typed. */
	const preview = $derived.by(() => {
		const samples = TEMPLATE_SAMPLES[template.eventKey];
		try {
			return {
				title: renderTemplate(template.eventKey, title, samples),
				body: renderTemplate(template.eventKey, body, samples),
				error: null
			};
		} catch {
			return { title: '', body: '', error: 'В тексте есть переменная, которой нет у события' };
		}
	});

	function doneToast(data: Record<string, unknown> | undefined): ToastSpec {
		return data?.['action'] === 'test'
			? { title: `Отправлено на устройств: ${String(data['result'])}` }
			: { title: 'Шаблон сохранён' };
	}
</script>

<Card.Root data-testid="template-card">
	<Card.Header>
		<Card.Title>{EVENT_LABEL[template.eventKey].title}</Card.Title>
		<Card.Description>{EVENT_LABEL[template.eventKey].hint}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/save"
			class="grid gap-6 lg:grid-cols-2"
			use:enhance={withToast({
				reset: false,
				pending: (value) => (busy = value),
				success: doneToast
			})}
		>
			<div class="flex flex-col gap-4">
				<input type="hidden" name="eventKey" value={template.eventKey} />
				<Input
					name="title"
					label="Заголовок"
					placeholder="Введите заголовок"
					maxlength={80}
					bind:value={title}
				/>
				<Textarea
					name="body"
					label="Текст"
					placeholder="Введите текст"
					rows={3}
					maxlength={200}
					bind:value={body}
				/>
				<Checkbox
					name="isActive"
					value="on"
					label="Отправлять пуш об этом событии"
					bind:checked={isActive}
				/>
				<p class="text-sm text-fg-faint">
					Переменные: {template.variables.map((name) => `{{${name}}}`).join(', ')}
				</p>
				<div class="flex flex-wrap gap-2">
					<Button type="submit" loading={busy} data-testid="template-save">Сохранить</Button>
					<Button
						type="submit"
						variant="secondary"
						formaction="?/test"
						disabled={busy}
						data-testid="template-test"
					>
						Отправить себе
					</Button>
				</div>
			</div>
			<div data-testid="template-preview" class="rounded-lg border border-border p-4">
				<p class="mb-2 text-sm text-fg-faint">Так уведомление выглядит на устройстве</p>
				{#if preview.error}
					<p class="text-sm text-danger">{preview.error}</p>
				{:else}
					<p class="font-medium break-words">{preview.title}</p>
					<p class="break-words text-fg-muted">{preview.body}</p>
				{/if}
			</div>
		</form>
	</Card.Content>
</Card.Root>
