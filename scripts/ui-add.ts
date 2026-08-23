import { spawnSync } from 'node:child_process';

/*
 * Wrapper around the shadcn registry generator.
 *
 * The generated components do not survive this project's tsconfig untouched: exactOptionalPropertyTypes
 * rejects every optional prop they forward, and the calendar roots need a cast on their bindable
 * union. Running the formatter and the typechecker as part of the same command turns that cleanup
 * into a step of adding a component instead of a surprise on the gate.
 */
const components = process.argv.slice(2);

if (components.length === 0) {
	console.error('usage: pnpm ui:add <component> [component...]');
	process.exit(1);
}

function run(command: string, args: string[]): number {
	const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
	return result.status ?? 1;
}

const added = run('pnpm', ['dlx', 'shadcn-svelte@latest', 'add', ...components]);
if (added !== 0) process.exit(added);

const formatted = run('pnpm', ['format']);
if (formatted !== 0) process.exit(formatted);

const checked = run('pnpm', ['check']);
if (checked !== 0) {
	console.error(
		'\nThe generated components do not typecheck yet. Fix them in place, never by loosening tsconfig:\n' +
			'  - an optional prop forwarded on: {...definedProps({ prop })} from $lib/utils/props\n' +
			'  - a bindable union on a calendar root: bind:value={value as never} with a reason comment\n' +
			'  - a prop surface too wide to spread: declare the props the component actually takes'
	);
	process.exit(checked);
}

console.log(
	'\nAdded, formatted and typechecked. Map the variants onto the tech.md 9 contract next.'
);
