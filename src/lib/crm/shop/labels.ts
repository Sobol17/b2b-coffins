import type { ShopPositionDto } from '$lib/types/crm-shop';

/** "Модель «Лада», 180, ЛДСП": one name for a position on every block of the shop floor. */
export function positionTitle(position: ShopPositionDto): string {
	return `${position.productTitle}, ${position.sizeCode}, ${position.materialTitle}`;
}

/** A colourless position is a position of its own (tech.md v1.41), so it is named, not left blank. */
export function colourTitle(position: ShopPositionDto): string {
	return position.colorTitle ?? 'Без цвета';
}
