import { describe, expect, it } from 'vitest';
import { parseCharityMessage } from '../../src/lib/portal/charity/live-charity';
import { encodeMessage } from '../../src/lib/server/events/sse';

describe('live charity counter', () => {
	it('reads the message the server encodes for the charity topic', () => {
		const wire = encodeMessage({
			topic: 'charity',
			totalMinor: 12_345,
			yearMinor: 2_345,
			requestCount: 3
		});
		const data = wire.replace(/^data: /, '').trim();

		expect(parseCharityMessage(data)).toEqual({
			topic: 'charity',
			totalMinor: 12_345,
			yearMinor: 2_345,
			requestCount: 3
		});
	});

	it('drops anything that is not a charity counter', () => {
		for (const data of [
			'not json',
			'null',
			'{"topic":"requests","byStatus":{}}',
			'{"topic":"charity","totalMinor":"1","yearMinor":0,"requestCount":0}',
			'{"topic":"charity","totalMinor":-1,"yearMinor":0,"requestCount":0}',
			'{"topic":"charity","totalMinor":1.5,"yearMinor":0,"requestCount":0}',
			'{"topic":"charity","totalMinor":1,"yearMinor":0}'
		]) {
			expect(parseCharityMessage(data)).toBeNull();
		}
	});

	it('keeps extra fields of the wire out of the counter', () => {
		const data = '{"topic":"charity","totalMinor":1,"yearMinor":1,"requestCount":1,"name":"x"}';
		expect(parseCharityMessage(data)).toEqual({
			topic: 'charity',
			totalMinor: 1,
			yearMinor: 1,
			requestCount: 1
		});
	});
});
