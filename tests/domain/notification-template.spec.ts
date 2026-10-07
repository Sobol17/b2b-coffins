import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	EVENT_TEMPLATE_VARIABLES,
	TEMPLATE_SAMPLES,
	renderTemplate,
	unknownVariables
} from '../../src/lib/domain/notification/template';
import { EVENT_KEYS } from '../../src/lib/types/events';

const eventKey = fc.constantFrom(...EVENT_KEYS);
const plain = fc.string().filter((s) => !s.includes('{{'));

/** An event with a value for each of its variables. */
const scene = eventKey.chain((key) =>
	fc.record({
		key: fc.constant(key),
		values: fc.dictionary(fc.constantFrom(...EVENT_TEMPLATE_VARIABLES[key]), fc.string(), {
			minKeys: EVENT_TEMPLATE_VARIABLES[key].length
		}),
		names: fc.array(fc.constantFrom(...EVENT_TEMPLATE_VARIABLES[key]), { maxLength: 6 })
	})
);

describe('notification templates per event (C15)', () => {
	it('fills every placeholder of the event with its value', () => {
		fc.assert(
			fc.property(scene, fc.array(plain, { minLength: 7, maxLength: 7 }), (s, leads) => {
				const text = s.names.map((name, i) => `${leads[i]}{{ ${name} }}`).join('') + leads[6];
				const expected =
					s.names.map((name, i) => `${leads[i]}${s.values[name]}`).join('') + leads[6];
				expect(renderTemplate(s.key, text, s.values)).toBe(expected);
			})
		);
	});

	it('never expands a placeholder that arrives inside a value', () => {
		const values = { ...TEMPLATE_SAMPLES['request.ready'], externalNumber: '{{number}}' };
		expect(renderTemplate('request.ready', 'Ваш номер: {{externalNumber}}', values)).toBe(
			'Ваш номер: {{number}}'
		);
	});

	it('leaves text without placeholders untouched', () => {
		fc.assert(
			fc.property(eventKey, plain, (key, text) => {
				expect(renderTemplate(key, text, TEMPLATE_SAMPLES[key])).toBe(text);
			})
		);
	});

	it('refuses a variable of another event and a money variable', () => {
		expect(unknownVariables('payroll.week_closed', 'Заявка {{number}} за {{period}}')).toEqual([
			'number'
		]);
		expect(unknownVariables('request.ready', '{{ totalMinor }}')).toEqual(['totalMinor']);
		expect(() =>
			renderTemplate('request.ready', '{{item}}', TEMPLATE_SAMPLES['request.ready'])
		).toThrow(/item/);
	});

	it('has a sample value for every variable of every event', () => {
		for (const key of EVENT_KEYS) {
			expect(Object.keys(TEMPLATE_SAMPLES[key]).sort()).toEqual(
				[...EVENT_TEMPLATE_VARIABLES[key]].sort()
			);
		}
	});
});
