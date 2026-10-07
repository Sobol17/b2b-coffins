<script lang="ts">
	import { Button, InstallPrompt, TouchButton } from '$lib/ui';
	import Showcase from '../Showcase.svelte';
</script>

<Showcase name="Button">
	<Button variant="primary">Основная</Button>
	<Button variant="secondary">Вторичная</Button>
	<Button variant="ghost">Прозрачная</Button>
	<Button variant="danger">Опасная</Button>
	<Button size="sm">Мелкая</Button>
	<Button size="md">Средняя</Button>
	<Button size="lg">Крупная</Button>
	<Button loading>Загрузка</Button>
	<Button disabled>Выключена</Button>
</Showcase>

<Showcase name="TouchButton">
	<TouchButton>Готово</TouchButton>
	<TouchButton variant="secondary">Отмена</TouchButton>
</Showcase>

<Showcase name="InstallPrompt">
	<InstallPrompt />
	<span class="text-sm text-fg-faint">
		Кнопка появляется, когда браузер предлагает установку; на iOS вместо неё инструкция.
	</span>
</Showcase>
