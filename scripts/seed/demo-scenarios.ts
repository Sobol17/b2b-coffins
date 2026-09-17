export const DEMO_MARK = 'ДЕМО-';
export const DEMO_COUNTERPARTY = 'Ритуал-Сервис';

export const DEMO_PEOPLE = {
	admin: 'admin@ritual-service.example',
	employee: 'employee@ritual-service.example',
	manager: 'manager@workshop.example',
	carpenter: 'carpenter@workshop.example',
	driver: 'driver@workshop.example'
} as const;

export type DemoStage =
	'new' | 'cancelled' | 'rejected' | 'in_work' | 'ready' | 'awaiting_payment' | 'paid';

export interface DemoScenario {
	readonly mark: string;
	readonly author: 'admin' | 'employee';
	readonly lines: readonly { sku: string; color: string; qty: number }[];
	/** Title of a delivery address of the counterparty, or pickup. */
	readonly delivery: string | 'pickup';
	readonly comment: string | null;
	readonly stage: DemoStage;
}

/** One request per stage of tech.md 6.2, so every badge and every mail text shows up once. */
export const DEMO_SCENARIOS: readonly DemoScenario[] = [
	{
		mark: `${DEMO_MARK}1`,
		author: 'admin',
		lines: [
			{ sku: 'MDL-201-180-PIN', color: 'Орех', qty: 3 },
			{ sku: 'MDL-101-190-CHB', color: 'Белый', qty: 2 }
		],
		delivery: 'Основной склад',
		comment: 'Разгрузка после 10:00',
		stage: 'new'
	},
	{
		mark: `${DEMO_MARK}2`,
		author: 'employee',
		lines: [{ sku: 'MDL-203-190-PIN', color: 'Венге', qty: 1 }],
		delivery: 'Филиал Химки',
		comment: null,
		stage: 'in_work'
	},
	{
		mark: `${DEMO_MARK}3`,
		author: 'admin',
		lines: [{ sku: 'MDL-301-200-OAK', color: 'Красное дерево', qty: 2 }],
		delivery: 'Основной склад',
		comment: null,
		stage: 'ready'
	},
	{
		mark: `${DEMO_MARK}4`,
		author: 'employee',
		lines: [
			{ sku: 'MDL-102-180-PIN', color: 'Белый', qty: 4 },
			{ sku: 'MDL-202-190-BIR', color: 'Орех', qty: 2 }
		],
		delivery: 'Филиал Химки',
		comment: 'Позвонить за час до приезда',
		stage: 'awaiting_payment'
	},
	{
		mark: `${DEMO_MARK}5`,
		author: 'admin',
		lines: [{ sku: 'MDL-204-190-ASH', color: 'Чёрный', qty: 2 }],
		delivery: 'pickup',
		comment: null,
		stage: 'paid'
	},
	{
		mark: `${DEMO_MARK}6`,
		author: 'employee',
		lines: [{ sku: 'MDL-103-180-BIR', color: 'Орех', qty: 1 }],
		delivery: 'pickup',
		comment: 'Отменяем: клиент выбрал другую модель',
		stage: 'cancelled'
	},
	{
		mark: `${DEMO_MARK}7`,
		author: 'admin',
		lines: [{ sku: 'MDL-303-200-ASH', color: 'Чёрный', qty: 10 }],
		delivery: 'Основной склад',
		comment: null,
		stage: 'rejected'
	}
];
