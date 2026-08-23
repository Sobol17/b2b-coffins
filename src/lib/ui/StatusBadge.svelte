<script lang="ts">
	import { Badge } from '$lib/ui/base/badge/index.js';
	import { REQUEST_STATUS_META, TONE_CLASS } from './status';
	import type { RequestStatus } from '$lib/types/request';

	let { status, class: className }: { status: RequestStatus; class?: string } = $props();

	const meta = $derived(REQUEST_STATUS_META[status]);
</script>

<Badge
	variant="outline"
	data-status={status}
	class={['border-transparent', TONE_CLASS[meta.tone], className]}
>
	{meta.label}
</Badge>
