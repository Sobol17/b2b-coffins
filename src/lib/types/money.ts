/** Branded integer of minor units (kopecks). Blocks accidental mixing with plain numbers. */
export type Minor = number & { readonly __brand: 'minor' };
