<script lang="ts">
	import Button, { type ButtonProps } from '$lib/ui/base/button/button.svelte';

	// Shop floor and driver screens only: the size is pinned so a slice cannot shrink the target.
	let { children, ...restProps }: ButtonProps = $props();
</script>

<Button {...restProps} size="touch">{@render children?.()}</Button>
