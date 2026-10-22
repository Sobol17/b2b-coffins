/** `tel:` wants digits and the leading plus only. */
export function telHrefOf(phone: string | null): `tel:${string}` | null {
	return phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
}
