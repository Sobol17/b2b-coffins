import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { definedProps } from '../../src/lib/utils/props';

describe('an optional prop forwarded to a generated component', () => {
	it('drops the key when the value is undefined', () => {
		expect(definedProps({ name: undefined })).toEqual({});
	});

	it('keeps the key when the value is present', () => {
		expect(definedProps({ name: 'delivery_date' })).toEqual({ name: 'delivery_date' });
	});

	it('keeps a falsy value that is not undefined', () => {
		expect(definedProps({ count: 0, label: '', checked: false, parent: null })).toEqual({
			count: 0,
			label: '',
			checked: false,
			parent: null
		});
	});

	it('does not mutate the object it was given', () => {
		const source = { name: undefined, id: 'field' };
		definedProps(source);
		expect(Object.keys(source)).toEqual(['name', 'id']);
	});

	it('keeps every defined value untouched, whatever the props are', () => {
		fc.assert(
			fc.property(
				fc.dictionary(fc.string(), fc.option(fc.jsonValue(), { nil: undefined })),
				(props) => {
					const result = definedProps(props);
					const expected = Object.keys(props).filter((key) => props[key] !== undefined);

					expect(Object.keys(result).sort()).toEqual(expected.sort());
					for (const key of expected) {
						expect(result[key]).toEqual(props[key]);
					}
				}
			)
		);
	});
});
