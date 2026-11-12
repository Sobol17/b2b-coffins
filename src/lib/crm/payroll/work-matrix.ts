import type { WorkTypeDto } from '$lib/types/crm-payroll';
import { WORK_ROLES, type WorkRole } from '$lib/types/roles';

export interface WorkMatrixPosition {
	id: number;
	label: string;
	available: boolean;
	rates: Record<WorkRole, WorkTypeDto | null>;
}

export function buildWorkMatrix(
	works: readonly WorkTypeDto[],
	variants: readonly { id: number; label: string }[],
	query = ''
): { positions: WorkMatrixPosition[]; manual: WorkTypeDto[] } {
	const positions = new Map<number, WorkMatrixPosition>();
	const makePosition = (id: number, label: string, available: boolean): WorkMatrixPosition => ({
		id,
		label,
		available,
		rates: { carpenter: null, grinder: null, painter: null, upholsterer: null }
	});
	for (const variant of variants) {
		positions.set(variant.id, makePosition(variant.id, variant.label, true));
	}
	const manual: WorkTypeDto[] = [];
	for (const work of works) {
		if (work.variantId == null) {
			manual.push(work);
			continue;
		}
		let position = positions.get(work.variantId);
		if (!position) {
			position = makePosition(work.variantId, work.variantLabel ?? 'Недоступная позиция', false);
			positions.set(work.variantId, position);
		}
		if (work.roleCode !== null) position.rates[work.roleCode] = work;
	}
	const normalize = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е');
	const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
	const matches = (value: string) => tokens.every((token) => normalize(value).includes(token));
	return {
		positions: [...positions.values()].filter((position) =>
			matches(
				[position.label, ...WORK_ROLES.map((role) => position.rates[role]?.title ?? '')].join(' ')
			)
		),
		manual: manual.filter((work) => matches(work.title))
	};
}

/** Position grouping precedes paging: a row always retains every station's rate. */
export function pageWorkMatrix(
	works: readonly WorkTypeDto[],
	variants: readonly { id: number; label: string }[],
	query: { page: number; perPage: number; search?: string }
) {
	const matrix = buildWorkMatrix(works, variants, query.search);
	const perPage = [7, 20, 50].includes(query.perPage) ? query.perPage : 7;
	const page = Math.min(
		Math.max(1, Number.isFinite(query.page) ? Math.trunc(query.page) : 1),
		Math.max(1, Math.ceil(matrix.positions.length / perPage))
	);
	return {
		...matrix,
		positions: matrix.positions.slice((page - 1) * perPage, page * perPage),
		total: matrix.positions.length,
		page,
		perPage
	};
}
