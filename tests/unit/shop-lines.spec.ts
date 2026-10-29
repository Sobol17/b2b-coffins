import { beforeEach, describe, expect, it } from 'vitest';
import { CrmRequestCardService } from '../../src/lib/server/crm-request/crm-request-card.service';
import { CrmRequestListService } from '../../src/lib/server/crm-request/crm-request-list.service';
import { seedShopWorld } from './helpers/crm-shop';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { actors, inWork, purchase } = seedShopWorld(db, 'c19l');

const card = (id: number) => new CrmRequestCardService(actors.manager).card(id);
const boardCard = (id: number) =>
	new CrmRequestListService(actors.manager)
		.board({})
		.columns.flatMap((column) => column.cards)
		.find((row) => row.id === id);

beforeEach(() => resetRequests(db));

describe('the shop side of a request card (tech.md §20.4)', () => {
	it('splits a line into the shelf and the carpenter', () => {
		purchase(1);
		const id = inWork(3);

		expect(card(id).shop).toEqual([
			{
				itemId: card(id).items[0]?.id,
				fromStockQty: 1,
				stations: [{ station: 'carpenter', qty: 2, doneQty: 0 }],
				madeQty: 0,
				heldBy: []
			}
		]);
	});

	it('names the urgent request that holds the piece the line lacks', () => {
		purchase(1);
		const normal = inWork(1, { inDays: 2 });
		const urgent = inWork(2, { urgent: true });

		expect(card(normal).status).toBe('ready');
		expect(card(urgent).shop[0]).toMatchObject({ fromStockQty: 0, heldBy: [card(normal).number] });
	});

	it('shows nothing outside work', () => {
		purchase(1);
		const id = inWork(1);

		expect(card(id).shop).toEqual([]);
	});
});

describe('stations on the board (tech.md §8)', () => {
	it('tags a request with the stations holding its open jobs', () => {
		const id = inWork(2);
		purchase(5);
		const covered = boardCard(id);
		const other = inWork(1);

		expect(covered?.stations).toEqual([]);
		expect(boardCard(other)?.stations).toEqual([]);
		const waiting = inWork(9);
		expect(boardCard(waiting)?.stations).toEqual(['carpenter']);
	});
});
