<script lang="ts">
	import '../app.css';
	import { Toaster } from '$lib/ui';

	let { children } = $props();
</script>

{@render children()}

<Toaster />
