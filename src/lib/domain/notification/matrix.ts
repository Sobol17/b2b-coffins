import { EVENT_KEYS, type EventKey } from '$lib/types/events';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from '$lib/types/notifications';
import type { RoleCode } from '$lib/types/roles';

export interface RoleRule {
	readonly eventKey: EventKey;
	readonly roleCode: RoleCode;
	readonly channel: NotificationChannel;
	readonly enabled: boolean;
}

export interface PersonalPref {
	readonly eventKey: EventKey;
	readonly channel: NotificationChannel;
	readonly enabled: boolean;
}

export interface ChannelChoice {
	readonly eventKey: EventKey;
	readonly channel: NotificationChannel;
	readonly enabled: boolean;
	readonly isDefault: boolean;
}

const pairKey = (eventKey: EventKey, channel: NotificationChannel): string =>
	`${eventKey}|${channel}`;

/**
 * The pairs a user may switch and their effective state (tech.md 7.3). A pair exists only when a
 * rule names one of the user's roles; the rule gives the default, a personal choice overrides it.
 * Rules of other roles never widen what the user receives.
 */
export function channelChoices(
	rules: readonly RoleRule[],
	roles: readonly RoleCode[],
	prefs: readonly PersonalPref[],
	channels: readonly NotificationChannel[]
): ChannelChoice[] {
	const defaults = new Map<string, ChannelChoice>();
	for (const rule of rules) {
		if (!roles.includes(rule.roleCode) || !channels.includes(rule.channel)) continue;
		const key = pairKey(rule.eventKey, rule.channel);
		const enabled = rule.enabled || (defaults.get(key)?.enabled ?? false);
		defaults.set(key, { eventKey: rule.eventKey, channel: rule.channel, enabled, isDefault: true });
	}

	const personal = new Map(prefs.map((pref) => [pairKey(pref.eventKey, pref.channel), pref]));
	return [...defaults.entries()]
		.map(([key, choice]) => {
			const pref = personal.get(key);
			return pref ? { ...choice, enabled: pref.enabled, isDefault: false } : choice;
		})
		.sort(byFlowOrder);
}

// The settings page lists events in the order a request lives through them.
function byFlowOrder(a: ChannelChoice, b: ChannelChoice): number {
	return (
		EVENT_KEYS.indexOf(a.eventKey) - EVENT_KEYS.indexOf(b.eventKey) ||
		NOTIFICATION_CHANNELS.indexOf(a.channel) - NOTIFICATION_CHANNELS.indexOf(b.channel)
	);
}

/** Whether one event reaches the user over one channel. */
export function receives(
	choices: readonly ChannelChoice[],
	eventKey: EventKey,
	channel: NotificationChannel
): boolean {
	return choices.some(
		(choice) => choice.eventKey === eventKey && choice.channel === channel && choice.enabled
	);
}

/**
 * Personal rows to store after a save: one per offered pair, so a later change of the role rule
 * does not silently flip a choice the user made. Pairs outside the offer are refused by the caller.
 */
export function prefsFromSelection(
	offered: readonly ChannelChoice[],
	selected: ReadonlySet<string>
): PersonalPref[] {
	return offered.map((choice) => ({
		eventKey: choice.eventKey,
		channel: choice.channel,
		enabled: selected.has(prefKey(choice.eventKey, choice.channel))
	}));
}

/**
 * Roles a portal person holds towards one request. The administrator hears about the whole
 * counterparty, an employee only about the requests they wrote: the same fence as the registry (P6).
 */
export function rolesTowardsRequest(roles: readonly RoleCode[], isAuthor: boolean): RoleCode[] {
	return roles.filter((role) => role === 'cp_admin' || (role === 'cp_employee' && isAuthor));
}

/** Form value of one switch: `request.ready:email`. */
export function prefKey(eventKey: EventKey, channel: NotificationChannel): string {
	return `${eventKey}:${channel}`;
}
