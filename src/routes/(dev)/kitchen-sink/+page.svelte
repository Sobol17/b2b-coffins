<script lang="ts">
	import Actions from './sections/Actions.svelte';
	import Board from './sections/Board.svelte';
	import Data from './sections/Data.svelte';
	import Feedback from './sections/Feedback.svelte';
	import Forms from './sections/Forms.svelte';
	import Overlays from './sections/Overlays.svelte';
</script>

<svelte:head><title>Kitchen sink</title></svelte:head>

<main class="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
	<h1 data-testid="kitchen-sink" class="text-xl font-semibold">Примитивы интерфейса</h1>
	<p class="text-sm text-fg-muted">
		Витрина набора из tech.md 9. Каждый примитив рендерится здесь, тач-цели проверяются e2e.
	</p>

	<Actions />
	<Forms />
	<Data />
	<Feedback />
	<Overlays />
	<Board />
</main>
