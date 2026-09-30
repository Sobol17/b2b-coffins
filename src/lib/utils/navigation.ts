const YANDEX_MAPS = 'https://yandex.ru/maps/';

export interface NavigationTarget {
	readonly address: string | null;
	readonly lat: number | null;
	readonly lon: number | null;
}

/**
 * A route in Yandex Maps from where the driver stands (tech.md v1.43). Coordinates win over the
 * text: an address typed by hand may be ambiguous, a pin is not. Null when there is nothing to find.
 */
export function navigationUrl(target: NavigationTarget): string | null {
	if (target.lat !== null && target.lon !== null && isCoordinate(target.lat, target.lon)) {
		return `${YANDEX_MAPS}?rtext=~${target.lat},${target.lon}&rtt=auto`;
	}
	const address = target.address?.trim() ?? '';
	if (address === '') return null;
	return `${YANDEX_MAPS}?text=${encodeURIComponent(address)}`;
}

function isCoordinate(lat: number, lon: number): boolean {
	return (
		Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
	);
}
