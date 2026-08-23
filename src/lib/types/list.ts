/** One shape for every registry in the app. */
export interface ListQuery<F = Record<string, unknown>> {
	page: number;
	perPage: number;
	sort?: string;
	dir?: 'asc' | 'desc';
	search?: string;
	filters?: F;
}

export interface Page<T> {
	rows: T[];
	total: number;
	page: number;
	perPage: number;
}
