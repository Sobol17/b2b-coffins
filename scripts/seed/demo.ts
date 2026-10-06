import { and, eq, like } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db/client';
import {
	counterparties,
	deliveryAddresses,
	options,
	productOptions,
	productVariants,
	requests
} from '../../src/lib/server/db/schema';
import { DeliveryService } from '../../src/lib/server/crm-delivery/delivery.service';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { charityRecountHandler } from '../../src/lib/server/queue/handlers/charity-recount';
import { notificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { Worker } from '../../src/lib/server/queue/worker';
import { DraftService } from '../../src/lib/server/request/draft.service';
import { RequestSubmitService } from '../../src/lib/server/request/request-submit.service';
import { RequestTransitionService } from '../../src/lib/server/request/request-transition.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RequestStatus } from '../../src/lib/types/request';
import { actorContext, refusalReasonId } from '../admin/request';
import {
	DEMO_COUNTERPARTY,
	DEMO_MARK,
	DEMO_PEOPLE,
	DEMO_SCENARIOS,
	type DemoScenario
} from './demo-scenarios';

type People = Record<keyof typeof DEMO_PEOPLE, ActorContext>;

/**
 * Demo requests and the bell feed they leave (v1.23, v1.49). Everything goes through the services the application
 * uses, so numbers, history, events, audit and stock moves come out exactly as on the screen.
 * @returns how many requests were created and how many queue jobs their events took.
 */
export async function seedDemo(db: Db): Promise<{ requests: number; jobs: number }> {
	const counterpartyId = demoCounterpartyId(db);
	if (alreadySeeded(db, counterpartyId)) return { requests: 0, jobs: 0 };

	const people = loadPeople(db);
	assertNoOpenDrafts(people);
	for (const scenario of DEMO_SCENARIOS) {
		const id = submit(db, people, counterpartyId, scenario);
		advance(db, people, id, scenario);
	}
	return { requests: DEMO_SCENARIOS.length, jobs: await drainQueue() };
}

function demoCounterpartyId(db: Db): number {
	const [row] = db
		.select({ id: counterparties.id })
		.from(counterparties)
		.where(eq(counterparties.name, DEMO_COUNTERPARTY))
		.all();
	if (!row) throw new Error(`counterparty ${DEMO_COUNTERPARTY} not found, run pnpm seed first`);
	return row.id;
}

function alreadySeeded(db: Db, counterpartyId: number): boolean {
	return (
		db
			.select({ id: requests.id })
			.from(requests)
			.where(
				and(
					eq(requests.counterpartyId, counterpartyId),
					like(requests.externalNumber, `${DEMO_MARK}%`)
				)
			)
			.all().length > 0
	);
}

function loadPeople(db: Db): People {
	return {
		admin: actorContext(db, DEMO_PEOPLE.admin),
		employee: actorContext(db, DEMO_PEOPLE.employee),
		manager: actorContext(db, DEMO_PEOPLE.manager),
		driver: actorContext(db, DEMO_PEOPLE.driver)
	};
}

/** A draft is one per person: sending ours would carry away lines somebody is still collecting. */
function assertNoOpenDrafts(people: People): void {
	for (const author of [people.admin, people.employee]) {
		if ((new DraftService(author).current()?.items.length ?? 0) > 0) {
			throw new Error(`user ${author.userId} has an unsent draft: send or clear it first`);
		}
	}
}

function submit(db: Db, people: People, counterpartyId: number, scenario: DemoScenario): number {
	const author = people[scenario.author];
	const drafts = new DraftService(author);
	let draftId = 0;
	for (const line of scenario.lines) {
		const variantId = variantIdOf(db, line.sku);
		draftId = drafts.addItem({
			variantId,
			qty: line.qty,
			optionIds: [colorIdOf(db, variantId, line.color)]
		}).id;
	}
	// The portal no longer asks for an own number; the mark still tells demo requests apart.
	db.update(requests).set({ externalNumber: scenario.mark }).where(eq(requests.id, draftId)).run();
	const day = 24 * 60 * 60 * 1000;
	return new RequestSubmitService(author).submit({
		deliveryAddressId: addressIdOf(db, counterpartyId, scenario.delivery),
		deliveryAt: new Date(Date.now() + scenario.deliveryInDays * day),
		deceasedName: scenario.deceasedName,
		comment: scenario.comment
	}).id;
}

/** Walks a sent request forward the way tech.md 6.2 allows, with the rights of real accounts. */
function advance(db: Db, people: People, id: number, scenario: DemoScenario): void {
	const move = (actor: ActorContext, to: RequestStatus, reasonId: number | null = null) =>
		new RequestTransitionService(actor).move(id, { to, reasonId, comment: null });

	switch (scenario.stage) {
		case 'new':
			return;
		case 'cancelled':
			move(people[scenario.author], 'cancelled');
			return;
		case 'rejected':
			move(people.manager, 'rejected', refusalReasonId(db, 'no_capacity'));
			return;
	}

	move(people.manager, 'in_work');
	if (scenario.stage === 'in_work') return;
	// The shop works by position (tech.md v1.41): the manager marks the pieces made, then assembles.
	const shop = new ShopService(people.manager);
	for (const line of scenario.lines) {
		const variantId = variantIdOf(db, line.sku);
		shop.produce({ variantId, optionId: colorIdOf(db, variantId, line.color), qty: line.qty });
	}
	move(people.manager, 'ready');
	if (scenario.stage === 'ready') return;
	// The driver loads every line on the delivery screen (tech.md v1.43); the paid scenario is the
	// one where he takes the cash at the door.
	const delivery = new DeliveryService(people.driver);
	for (const line of delivery.overview().ready.find((stop) => stop.id === id)?.lines ?? []) {
		delivery.load({ itemId: line.itemId, qty: line.qty });
	}
	new RequestTransitionService(people.driver).deliver(id, scenario.stage === 'paid');
}

/** Reads the queue out in this process, so the bell of every demo account is filled at once. */
async function drainQueue(): Promise<number> {
	const worker = new Worker({ handlers: [notificationFanoutHandler, charityRecountHandler] });
	return worker.drain(1000);
}

function variantIdOf(db: Db, sku: string): number {
	const [row] = db
		.select({ id: productVariants.id })
		.from(productVariants)
		.where(eq(productVariants.sku, sku))
		.all();
	if (!row) throw new Error(`variant ${sku} not found, run pnpm seed first`);
	return row.id;
}

function colorIdOf(db: Db, variantId: number, title: string): number {
	const [row] = db
		.select({ id: options.id })
		.from(productOptions)
		.innerJoin(options, eq(options.id, productOptions.optionId))
		.where(and(eq(productOptions.variantId, variantId), eq(options.title, title)))
		.all();
	if (!row) throw new Error(`colour ${title} is not offered for variant ${variantId}`);
	return row.id;
}

function addressIdOf(db: Db, counterpartyId: number, title: string): number {
	const [row] = db
		.select({ id: deliveryAddresses.id })
		.from(deliveryAddresses)
		.where(
			and(eq(deliveryAddresses.counterpartyId, counterpartyId), eq(deliveryAddresses.title, title))
		)
		.all();
	if (!row) throw new Error(`delivery address ${title} not found`);
	return row.id;
}
