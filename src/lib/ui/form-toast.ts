import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { toast, type ToastKind, type ToastOptions } from './toast.svelte';

export interface ToastSpec extends ToastOptions {
	readonly kind?: ToastKind;
	readonly title: string;
}

type SuccessData = Record<string, unknown> | undefined;

export interface FormToastOptions {
	/** What the user sees once the action went through; a function reads the action's answer. */
	readonly success?: string | ToastSpec | ((data: SuccessData) => ToastSpec | string | null);
	/** Keeps the typed values after a successful submit, as a settings form wants. */
	readonly reset?: boolean;
	/** Runs before the page updates, for example to close the modal the form lives in. */
	readonly onSuccess?: (data: SuccessData) => void;
}

export const FORM_TOAST_TEXT = {
	invalid: 'Проверьте поля формы',
	invalidHint: 'Ошибки отмечены рядом с полями',
	failed: 'Не удалось выполнить действие',
	failedHint: 'Повторите попытку. Если ошибка повторится, напишите менеджеру',
	offline: 'Нет связи с сервером',
	offlineHint: 'Проверьте интернет и повторите попытку'
} as const;

function asSpec(value: ToastSpec | string): ToastSpec {
	return typeof value === 'string' ? { title: value } : value;
}

function successSpec(options: FormToastOptions, data: SuccessData): ToastSpec | null {
	const { success } = options;
	if (success === undefined) return null;
	const value = typeof success === 'function' ? success(data) : success;
	return value === null ? null : asSpec(value);
}

/**
 * Maps a form action's answer to a toast. Server messages come from `actionFailure` and
 * `invalidForm` (lib/server/core/http.ts) under `formError`; field errors stay next to the fields.
 */
export function toastForResult(result: ActionResult, options: FormToastOptions = {}): void {
	switch (result.type) {
		case 'success':
		case 'redirect': {
			const spec = successSpec(options, result.type === 'success' ? result.data : undefined);
			if (spec) toast.show(spec.kind ?? 'success', spec.title, spec);
			return;
		}
		case 'failure': {
			const formError = result.data?.['formError'];
			if (typeof formError === 'string') toast.error(formError);
			else toast.error(FORM_TOAST_TEXT.invalid, { description: FORM_TOAST_TEXT.invalidHint });
			return;
		}
		case 'error':
			// A dropped connection also lands here; saying so beats a generic failure.
			if (typeof navigator !== 'undefined' && navigator.onLine === false) {
				toast.error(FORM_TOAST_TEXT.offline, { description: FORM_TOAST_TEXT.offlineHint });
			} else {
				toast.error(FORM_TOAST_TEXT.failed, { description: FORM_TOAST_TEXT.failedHint });
			}
			return;
	}
}

/**
 * `use:enhance={withToast({ success: 'Данные сохранены' })}`: one feedback path for every form, so
 * a click never ends in silence.
 */
export function withToast(options: FormToastOptions = {}): SubmitFunction {
	return () =>
		async ({ result, update }) => {
			if (result.type === 'success') options.onSuccess?.(result.data);
			toastForResult(result, options);
			await update({ reset: options.reset ?? true });
		};
}
