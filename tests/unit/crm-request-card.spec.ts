import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/lib/server/core/errors';
import { CrmRequestCardService } from '../../src/lib/server/crm-request/crm-request-card.service';
import { CrmRequestCreateService } from '../../src/lib/server/crm-request/crm-request-create.service';
import { CrmRequestCrewService } from '../../src/lib/server/crm-request/crm-request-crew.service';
import { DraftService } from '../../src/lib/server/request/draft.service';
import { crmRequestCreateSchema } from '../../src/lib/validation/crm-request';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import { move } from './helpers/transitions';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const managerId = insertUser({ email: 'mgr@ws.example', role: 'manager', counterpartyId: null });
const carpenterId = insertUser({
	email: 'carp@ws.example',
	role: 'carpenter',
	counterpartyId: null,
	fullName: 'Пётр Столяров'
});
const manager = crmActor('manager', managerId);
const cards = () => new CrmRequestCardService(manager);
const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');

function newRequest(kind: 'counterparty' | 'stock' = 'counterparty'): number {
	const delivery =
		kind === 'stock'
			? {}
			: {
					counterpartyId: String(world.cpId),
					deliveryAddressId: String(world.homeAddressId),
					deliveryDate: '2026-12-01',
					deliveryTime: '10:00',
					deceasedName: 'Иванов Иван Иванович'
				};
	return new CrmRequestCreateService(manager).create(
		crmRequestCreateSchema.parse({
			kind,
			...delivery,
			lines: [{ variantId: String(VOLGA_180), qty: '2' }]
		})
	).id;
}

beforeEach(() => resetRequests(db));

describe('the workshop card of a request (C4)', () => {
	it('shows the counterparty, the flags, the money and the moves the manager may ask for', () => {
		const id = newRequest();
		const card = cards().card(id);
		expect(card).toMatchObject({
			status: 'new',
			counterpartyId: world.cpId,
			counterpartyName: 'Ритуал-Сервис',
			isStockRequest: false,
			flags: ['no_assignee'],
			itemsEdit: 'free',
			assignees: [],
			totalMinor: 1_577_000,
			deceasedName: 'Иванов Иван Иванович'
		});
		expect(card.targets).toEqual(expect.arrayContaining(['in_work', 'cancelled', 'rejected']));
		expect(card).not.toHaveProperty('comments');
		expect(card.items[0]).not.toHaveProperty('agencyUnitPriceMinor');
	});

	it('lists the crew and the notes of the launched request', () => {
		const id = newRequest();
		new CrmRequestCrewService(manager).assign(id, { userId: carpenterId, role: 'carpenter' });
		move(manager, id, 'in_work');
		new CrmRequestCrewService(manager).setPriority(id, 'urgent');
		const card = cards().card(id);
		expect(card.assignees).toEqual([
			{ userId: carpenterId, fullName: 'Пётр Столяров', role: 'carpenter' }
		]);
		expect(card).toMatchObject({ flags: [], itemsEdit: 'controlled', priority: 'urgent' });
		expect(card.history.map((step) => [step.fromStatus, step.toStatus, step.comment])).toEqual([
			['draft', 'new', null],
			['new', 'in_work', null],
			['in_work', 'in_work', 'Приоритет: Срочно']
		]);
	});

	it('says which guard stops the acceptance', () => {
		const id = newRequest('stock');
		expect(() => move(manager, id, 'in_work')).toThrow(ConflictError);
		expect(() => move(manager, id, 'in_work')).toThrow('Назначьте исполнителя заявки');
	});

	it('does not open a draft of the cart or an unknown request', () => {
		const draft = new DraftService(portalActor('cp_admin', world.adminId, world.cpId)).addItem({
			variantId: VOLGA_180,
			qty: 1,
			optionIds: []
		});
		expect(() => cards().card(draft.id)).toThrow(NotFoundError);
		expect(() => cards().card(999_999)).toThrow(NotFoundError);
	});

	it('gives the creation form live addresses of the picked counterparty only', () => {
		expect(
			cards()
				.addresses(world.cpId)
				.map((row) => row.id)
		).toEqual([world.homeAddressId]);
		expect(cards().addresses(999_999)).toEqual([]);
		const choices = cards().choices();
		expect(choices.counterparties.map((row) => row.name)).toContain('Память');
		expect(choices.crew).toEqual([
			{ id: carpenterId, fullName: 'Пётр Столяров', roles: ['carpenter'] }
		]);
		expect(choices.variants.find((row) => row.id === VOLGA_180)?.options.length).toBeGreaterThan(0);
	});

	it('refuses the crew and the portal', () => {
		expect(() => new CrmRequestCardService(crmActor('carpenter', carpenterId))).toThrow(
			ForbiddenError
		);
		expect(
			() => new CrmRequestCardService(portalActor('cp_admin', world.adminId, world.cpId))
		).toThrow(ForbiddenError);
	});
});
