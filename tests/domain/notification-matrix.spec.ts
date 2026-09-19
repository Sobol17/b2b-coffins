import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	channelChoices,
	isAddressed,
	prefKey,
	prefsFromSelection,
	receives,
	rolesTowardsRequest,
	type PersonalPref,
	type RoleRule
} from '../../src/lib/domain/notification/matrix';
import { EVENT_KEYS } from '../../src/lib/types/events';
import { NOTIFICATION_CHANNELS } from '../../src/lib/types/notifications';
import { ROLE_CODES } from '../../src/lib/types/roles';

const eventKey = fc.constantFrom(...EVENT_KEYS);
const channel = fc.constantFrom(...NOTIFICATION_CHANNELS);
const rule: fc.Arbitrary<RoleRule> = fc.record({
	eventKey,
	roleCode: fc.constantFrom(...ROLE_CODES),
	channel,
	enabled: fc.boolean()
});
const pref: fc.Arbitrary<PersonalPref> = fc.record({ eventKey, channel, enabled: fc.boolean() });
const rules = fc.array(rule, { maxLength: 40 });
const roles = fc.subarray([...ROLE_CODES], { minLength: 1 });
const prefs = fc.uniqueArray(pref, {
	maxLength: 20,
	selector: (p) => prefKey(p.eventKey, p.channel)
});
const channels = fc.subarray([...NOTIFICATION_CHANNELS], { minLength: 1 });

describe('notification matrix (P9)', () => {
	it('offers only pairs a rule names for one of the user roles and a live channel', () => {
		fc.assert(
			fc.property(rules, roles, prefs, channels, (rs, rl, ps, ch) => {
				for (const choice of channelChoices(rs, rl, ps, ch)) {
					expect(ch).toContain(choice.channel);
					expect(
						rs.some(
							(r) =>
								r.eventKey === choice.eventKey &&
								r.channel === choice.channel &&
								rl.includes(r.roleCode)
						)
					).toBe(true);
				}
			})
		);
	});

	it('offers each pair once', () => {
		fc.assert(
			fc.property(rules, roles, prefs, channels, (rs, rl, ps, ch) => {
				const keys = channelChoices(rs, rl, ps, ch).map((c) => prefKey(c.eventKey, c.channel));
				expect(new Set(keys).size).toBe(keys.length);
			})
		);
	});

	it('lets a personal choice win over the rule and otherwise keeps the rule', () => {
		fc.assert(
			fc.property(rules, roles, prefs, channels, (rs, rl, ps, ch) => {
				for (const choice of channelChoices(rs, rl, ps, ch)) {
					const own = ps.find(
						(p) => p.eventKey === choice.eventKey && p.channel === choice.channel
					);
					if (own) {
						expect(choice).toMatchObject({ enabled: own.enabled, isDefault: false });
					} else {
						const ruleOn = rs.some(
							(r) =>
								r.eventKey === choice.eventKey &&
								r.channel === choice.channel &&
								rl.includes(r.roleCode) &&
								r.enabled
						);
						expect(choice).toMatchObject({ enabled: ruleOn, isDefault: true });
					}
				}
			})
		);
	});

	it('ignores a personal choice for a pair nobody offered', () => {
		fc.assert(
			fc.property(rules, roles, prefs, channels, (rs, rl, ps, ch) => {
				const withoutPrefs = channelChoices(rs, rl, [], ch);
				const withPrefs = channelChoices(rs, rl, ps, ch);
				expect(withPrefs.map((c) => prefKey(c.eventKey, c.channel))).toEqual(
					withoutPrefs.map((c) => prefKey(c.eventKey, c.channel))
				);
			})
		);
	});

	it('stores exactly the selection over the offer and reads it back', () => {
		fc.assert(
			fc.property(
				rules,
				roles,
				channels,
				fc.array(fc.boolean(), { maxLength: 40 }),
				(rs, rl, ch, flags) => {
					const offered = channelChoices(rs, rl, [], ch);
					const picked = new Set(
						offered.filter((_, n) => flags[n] ?? false).map((c) => prefKey(c.eventKey, c.channel))
					);
					const saved = prefsFromSelection(offered, picked);
					const after = channelChoices(rs, rl, saved, ch);

					expect(saved).toHaveLength(offered.length);
					for (const choice of after) {
						expect(receives(after, choice.eventKey, choice.channel)).toBe(
							picked.has(prefKey(choice.eventKey, choice.channel))
						);
					}
				}
			)
		);
	});

	it('lists the pairs in the order a request lives through its events', () => {
		fc.assert(
			fc.property(rules, roles, prefs, channels, (rs, rl, ps, ch) => {
				const order = channelChoices(rs, rl, ps, ch).map((c) => EVENT_KEYS.indexOf(c.eventKey));
				expect(order).toEqual([...order].sort((a, b) => a - b));
			})
		);
	});

	it('hears about a request as administrator always and as employee only as its author', () => {
		fc.assert(
			fc.property(roles, fc.boolean(), (rl, isAuthor) => {
				const towards = rolesTowardsRequest(rl, isAuthor);
				expect(towards.includes('cp_admin')).toBe(rl.includes('cp_admin'));
				expect(towards.includes('cp_employee')).toBe(rl.includes('cp_employee') && isAuthor);
				expect(towards.every((role) => role === 'cp_admin' || role === 'cp_employee')).toBe(true);
			})
		);
	});

	it('sends nothing for a role without rules', () => {
		const matrix: RoleRule[] = [
			{ eventKey: 'request.ready', roleCode: 'cp_admin', channel: 'email', enabled: true }
		];
		const choices = channelChoices(matrix, ['driver'], [], ['email']);

		expect(choices).toEqual([]);
		expect(receives(choices, 'request.ready', 'email')).toBe(false);
	});

	it('keeps push closed until the channel goes live', () => {
		const matrix: RoleRule[] = [
			{ eventKey: 'request.ready', roleCode: 'cp_admin', channel: 'push', enabled: true }
		];

		expect(channelChoices(matrix, ['cp_admin'], [], ['email'])).toEqual([]);
	});

	it('keeps push closed until the channel goes live', () => {
		const matrix: RoleRule[] = [
			{ eventKey: 'request.ready', roleCode: 'cp_admin', channel: 'push', enabled: true }
		];

		expect(channelChoices(matrix, ['cp_admin'], [], ['email'])).toEqual([]);
	});
});

describe('who the in-app feed reaches (P12)', () => {
	it('addresses everyone a rule of the event names, whatever the channel says', () => {
		fc.assert(
			fc.property(rules, roles, eventKey, (rs, rl, key) => {
				expect(isAddressed(rs, rl, key)).toBe(
					rs.some((r) => r.eventKey === key && rl.includes(r.roleCode))
				);
			})
		);
	});

	it('reaches at least everyone the channels reach: the feed cannot be switched off', () => {
		fc.assert(
			fc.property(rules, roles, prefs, channels, eventKey, (rs, rl, ps, ch, key) => {
				const offered = channelChoices(rs, rl, ps, ch).some((c) => c.eventKey === key);
				if (offered) expect(isAddressed(rs, rl, key)).toBe(true);
			})
		);
	});

	it('addresses a user whose only rule is switched off or answers another channel', () => {
		const matrix: RoleRule[] = [
			{ eventKey: 'request.ready', roleCode: 'cp_admin', channel: 'email', enabled: false },
			{ eventKey: 'request.paid', roleCode: 'cp_admin', channel: 'max', enabled: true }
		];

		expect(isAddressed(matrix, ['cp_admin'], 'request.ready')).toBe(true);
		expect(isAddressed(matrix, ['cp_admin'], 'request.paid')).toBe(true);
		expect(isAddressed(matrix, ['cp_employee'], 'request.ready')).toBe(false);
		expect(isAddressed(matrix, ['cp_admin'], 'request.delivered')).toBe(false);
	});
});
