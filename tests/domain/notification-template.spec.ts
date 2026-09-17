import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	TEMPLATE_VARIABLES,
	renderTemplate,
	unknownVariables,
	type TemplateValues
} from '../../src/lib/domain/notification/template';

const values: fc.Arbitrary<TemplateValues> = fc.record({
	number: fc.string(),
	status: fc.string(),
	url: fc.string(),
	counterparty: fc.string(),
	externalNumber: fc.string()
});
const plain = fc.string().filter((s) => !s.includes('{{'));
const variable = fc.constantFrom(...TEMPLATE_VARIABLES);

describe('notification templates (P9)', () => {
	it('fills every known placeholder with its value', () => {
		fc.assert(
			fc.property(
				fc.array(fc.tuple(plain, variable), { maxLength: 6 }),
				plain,
				values,
				(parts, tail, vals) => {
					const text = parts.map(([lead, name]) => `${lead}{{ ${name} }}`).join('') + tail;
					const expected = parts.map(([lead, name]) => `${lead}${vals[name]}`).join('') + tail;
					expect(renderTemplate(text, vals)).toBe(expected);
				}
			)
		);
	});

	it('never expands a placeholder that arrives inside a value', () => {
		fc.assert(
			fc.property(values, (vals) => {
				const sneaky = { ...vals, externalNumber: '{{number}}' };
				expect(renderTemplate('Ваш номер: {{externalNumber}}', sneaky)).toBe(
					'Ваш номер: {{number}}'
				);
			})
		);
	});

	it('leaves text without placeholders untouched', () => {
		fc.assert(
			fc.property(plain, values, (text, vals) => {
				expect(renderTemplate(text, vals)).toBe(text);
			})
		);
	});

	it('names unknown placeholders and refuses to render them', () => {
		const text = 'Сумма {{ totalMinor }} по заявке {{number}}';

		expect(unknownVariables(text)).toEqual(['totalMinor']);
		expect(() =>
			renderTemplate(text, {
				number: '1',
				status: '',
				url: '',
				counterparty: '',
				externalNumber: ''
			})
		).toThrow(/totalMinor/);
	});
});
