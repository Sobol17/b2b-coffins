/**
 * Delivery facts a request carries when it leaves the draft (tech.md 6.2, invariant 8). A stock
 * request has no counterparty, so it has no address, no deadline and nobody to bury: the three
 * columns stay nullable in the schema and this guard is what makes them required where they are.
 */
export interface DeliveryFacts {
	readonly isStockRequest: boolean;
	readonly deliveryAddressId: number | null;
	readonly deliveryAt: Date | null;
	readonly deceasedName: string | null;
}

export function isDeliveryFilled(facts: DeliveryFacts): boolean {
	if (facts.isStockRequest) return true;
	return (
		facts.deliveryAddressId !== null &&
		facts.deliveryAt !== null &&
		(facts.deceasedName ?? '').trim() !== ''
	);
}
