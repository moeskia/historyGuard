import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  recordCleanupSuccess,
  recordCleanupSuccesses
} from '../lib/state.js';

function createState() {
  const state = createInitialState(new Date('2026-11-25T12:00:00'));
  state.rules = ['r1', 'r2', 'r3'].map((id, i) => ({
    id,
    pattern: `*://site${i}.test/*`,
    enabled: true,
    cleanedCount: i + 2,
    todayCleaned: i + 1,
    lastCleanedAt: new Date('2026-11-25T11:00:00').toISOString(),
    createdAt: 1
  }));
  state.stats.totalCleaned = 12;
  state.stats.todayCleaned = 6;
  state.stats.lastCleanedAt = new Date('2026-11-25T11:00:00').toISOString();
  return state;
}

for (const [name, entries] of [
  ['同日多规则及未知规则', [
    ['r1', '2026-11-25T12:01:00'],
    ['r2', '2026-11-25T12:02:00'],
    ['r1', '2026-11-25T12:03:00'],
    ['removed', '2026-11-25T12:04:00']
  ]],
  ['跨午夜及未命中规则的今日计数归零', [
    ['r1', '2026-11-25T23:59:59'],
    ['r2', '2026-11-26T00:00:00'],
    ['r1', '2026-11-26T00:00:01']
  ]],
  ['连续跨日及系统时间回拨', [
    ['r1', '2026-11-25T23:59:59'],
    ['r2', '2026-11-26T00:00:00'],
    ['r1', '2026-11-27T00:00:01'],
    ['r2', '2026-11-25T10:00:00']
  ]]
]) {
  test(`批次统计与逐次计数等价：${name}`, () => {
    const state = createState();
    const snapshot = structuredClone(state);
    Object.freeze(state.stats);
    state.rules.forEach(Object.freeze);
    Object.freeze(state.rules);
    Object.freeze(state);
    const successes = entries.map(([ruleId, at]) => ({ ruleId, at: new Date(at) }));
    const expected = successes.reduce(
      (next, { ruleId, at }) => recordCleanupSuccess(next, ruleId, at),
      state
    );
    const actual = recordCleanupSuccesses(state, successes);
    assert.deepEqual(actual, expected);
    assert.deepEqual(state, snapshot);
    assert.deepEqual(Object.keys(actual.rules[0]).sort(), Object.keys(state.rules[0]).sort());
  });
}

test('空批次不修改状态，同日未命中规则复用原对象', () => {
  const state = createState();
  assert.equal(recordCleanupSuccesses(state, []), state);
  const next = recordCleanupSuccesses(state, [
    { ruleId: 'r1', at: new Date('2026-11-25T12:01:00') }
  ]);
  assert.equal(next.rules[1], state.rules[1]);
  assert.equal(next.rules[2], state.rules[2]);
  assert.notEqual(next.rules[0], state.rules[0]);
});
