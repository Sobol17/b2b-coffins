export const DEMO_MARK = 'ДЕМО-';
export const DEMO_COUNTERPARTY = 'Ритуал-Сервис';

export const DEMO_PEOPLE = {
	admin: 'admin@ritual-service.example',
	employee: 'employee@ritual-service.example',
	manager: 'manager@workshop.example',
	driver: 'driver@workshop.example'
} as const;

export type DemoStage =
	'new' | 'cancelled' | 'rejected' | 'in_work' | 'ready' | 'awaiting_payment' | 'paid';

export interface DemoScenario {
	readonly mark: string;
	readonly author: 'admin' | 'employee';
	readonly lines: readonly { sku: string; color: string; qty: number }[];
	/** Title of a delivery address of the counterparty. Pickup left the system in v1.33. */
	readonly delivery: string;
	/** Days from the seed moment to the delivery deadline. */
	readonly deliveryInDays: number;
	readonly deceasedName: string;
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
		deliveryInDays: 3,
		deceasedName: 'Соколов Николай Петрович',
		comment: 'Разгрузка после 10:00',
		stage: 'new'
	},
	{
		mark: `${DEMO_MARK}2`,
		author: 'employee',
		lines: [{ sku: 'MDL-203-190-PIN', color: 'Венге', qty: 1 }],
		delivery: 'Филиал Химки',
		deliveryInDays: 4,
		deceasedName: 'Зайцева Вера Ивановна',
		comment: null,
		stage: 'in_work'
	},
	{
		mark: `${DEMO_MARK}3`,
		author: 'admin',
		lines: [{ sku: 'MDL-301-200-OAK', color: 'Красное дерево', qty: 2 }],
		delivery: 'Основной склад',
		deliveryInDays: 2,
		deceasedName: 'Морозов Игорь Степанович',
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
		deliveryInDays: 5,
		deceasedName: 'Кравцова Нина Андреевна',
		comment: 'Позвонить за час до приезда',
		stage: 'awaiting_payment'
	},
	{
		mark: `${DEMO_MARK}5`,
		author: 'admin',
		lines: [{ sku: 'MDL-204-190-ASH', color: 'Чёрный', qty: 2 }],
		delivery: 'Основной склад',
		deliveryInDays: 6,
		deceasedName: 'Белов Юрий Тимофеевич',
		comment: null,
		stage: 'paid'
	},
	{
		mark: `${DEMO_MARK}6`,
		author: 'employee',
		lines: [{ sku: 'MDL-103-180-BIR', color: 'Орех', qty: 1 }],
		delivery: 'Филиал Химки',
		deliveryInDays: 3,
		deceasedName: 'Гусева Раиса Павловна',
		comment: 'Отменяем: клиент выбрал другую модель',
		stage: 'cancelled'
	},
	{
		mark: `${DEMO_MARK}7`,
		author: 'admin',
		lines: [{ sku: 'MDL-303-200-ASH', color: 'Чёрный', qty: 10 }],
		delivery: 'Основной склад',
		deliveryInDays: 7,
		deceasedName: 'Лапин Сергей Олегович',
		comment: null,
		stage: 'rejected'
	}
];
