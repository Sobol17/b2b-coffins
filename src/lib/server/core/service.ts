import { ForbiddenError } from './errors';
import type { ActorContext } from '$lib/types/actor';

export abstract class BaseService {
	protected constructor(protected readonly ctx: ActorContext) {}

	protected assert(allowed: boolean, action: string): void {
		if (!allowed) throw new ForbiddenError(action);
	}
}
