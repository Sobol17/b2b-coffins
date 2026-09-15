import type { CategoryRow } from './catalog.repository';

/**
 * Category hierarchy over `categories.parent_id`. The data is edited by hand in C2, so every walk
 * keeps a visited set: a parent loop must not hang a storefront request.
 */
export class CategoryTree {
	private readonly byId: ReadonlyMap<number, CategoryRow>;
	private readonly childrenOf: ReadonlyMap<number | null, CategoryRow[]>;

	constructor(readonly rows: readonly CategoryRow[]) {
		this.byId = new Map(rows.map((row) => [row.id, row]));
		const children = new Map<number | null, CategoryRow[]>();
		for (const row of rows) {
			// A parent that no longer exists turns its child into a top-level group.
			const parent = row.parentId !== null && this.byId.has(row.parentId) ? row.parentId : null;
			children.set(parent, [...(children.get(parent) ?? []), row]);
		}
		this.childrenOf = children;
	}

	has(id: number): boolean {
		return this.byId.has(id);
	}

	roots(): CategoryRow[] {
		return this.childrenOf.get(null) ?? [];
	}

	children(id: number): CategoryRow[] {
		return this.childrenOf.get(id) ?? [];
	}

	descendantsAndSelf(id: number): number[] {
		const found: number[] = [];
		const queue = [id];
		const seen = new Set<number>();
		while (queue.length > 0) {
			const current = queue.shift();
			if (current === undefined || seen.has(current) || !this.byId.has(current)) continue;
			seen.add(current);
			found.push(current);
			queue.push(...this.children(current).map((child) => child.id));
		}
		return found;
	}

	/** Root first, the category itself last: the breadcrumb order. */
	pathTo(id: number): CategoryRow[] {
		const path: CategoryRow[] = [];
		const seen = new Set<number>();
		let current = this.byId.get(id);
		while (current && !seen.has(current.id)) {
			seen.add(current.id);
			path.unshift(current);
			current = current.parentId === null ? undefined : this.byId.get(current.parentId);
		}
		return path;
	}

	ancestorsAndSelf(id: number): number[] {
		return this.pathTo(id).map((row) => row.id);
	}

	totalCount(id: number): number {
		return this.descendantsAndSelf(id).reduce(
			(sum, categoryId) => sum + (this.byId.get(categoryId)?.productCount ?? 0),
			0
		);
	}
}
