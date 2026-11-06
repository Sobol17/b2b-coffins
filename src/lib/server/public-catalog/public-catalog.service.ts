import { CatalogRepository } from '../catalog/catalog.repository';
import { CategoryTree } from '../catalog/category-tree';
import { VariantRepository } from '../catalog/variant.repository';
import { normalizeListQuery } from '../core/list';
import { PublicCatalogDtoMapper } from './dto';
import type {
	PublicCatalogCategoryDto,
	PublicCatalogFilters,
	PublicCatalogProductDto
} from '$lib/types/public-catalog';
import type { ListQuery, Page } from '$lib/types/list';
import { definedProps } from '$lib/utils/props';
import { publicCatalogQuerySchema } from '$lib/validation/public-catalog';

const PUBLISHED = { publishedOnly: true } as const;

/** Public reads use the descriptive repository methods, which never select prices or stock. */
export class PublicCatalogService {
	constructor(
		private readonly products = new CatalogRepository(),
		private readonly variants = new VariantRepository()
	) {}

	list(query: ListQuery<PublicCatalogFilters>): Page<PublicCatalogProductDto> {
		const parsed = publicCatalogQuerySchema.parse(query);
		const paging = normalizeListQuery<PublicCatalogFilters>(definedProps(parsed));
		const categories = this.products.listCategories(PUBLISHED);
		const tree = new CategoryTree(categories);
		const categoryId = parsed.filters?.categoryId;
		const { rows, total } = this.products.listProducts(
			{
				search: parsed.search,
				categoryIds: categoryId === undefined ? undefined : tree.descendantsAndSelf(categoryId)
			},
			{ page: paging.page, perPage: paging.perPage, sort: parsed.sort, dir: parsed.dir },
			PUBLISHED
		);
		const ids = rows.map((row) => row.id);
		const variants = this.variants.findByProducts(ids, PUBLISHED);
		const media = this.products.mediaByProducts(ids);
		const titles = new Map(categories.map((category) => [category.id, category.title]));
		return {
			rows: rows.map((row) =>
				PublicCatalogDtoMapper.product(
					row,
					row.categoryId === null ? null : (titles.get(row.categoryId) ?? null),
					media.get(row.id)?.[0] ?? null,
					variants.filter((variant) => variant.productId === row.id)
				)
			),
			total,
			page: paging.page,
			perPage: paging.perPage
		};
	}

	categories(): PublicCatalogCategoryDto[] {
		const tree = new CategoryTree(this.products.listCategories(PUBLISHED));
		return tree.rows
			.filter((row) => tree.totalCount(row.id) > 0)
			.map((row) => ({ id: row.id, title: row.title, parentId: row.parentId }));
	}
}
