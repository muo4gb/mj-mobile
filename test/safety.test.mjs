// node test/safety.test.mjs
import { replay, initialLog, SEATS } from '../src/core/log.js';
import { safetyOf, worstSafety, warningsFor, LEVEL, genbutsuSet } from '../src/core/safety.js';
import { parseTile, tileName } from '../src/core/tiles.js';

let failed = 0;
const eq = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (期待 ${expected})`}`);
};
const idx = (s) => parseTile(s).index;

const build = (events, init = {}) => replay([...initialLog({ hand: [], doraIndicator: '1z', ...init }), ...events]);

// --- 現物 ---
{
  const st = build([{ type: 'discard', seat: SEATS.SHIMOCHA, tile: '1m' }]);
  eq('捨てた牌は現物', safetyOf(st, SEATS.SHIMOCHA, idx('1m')).level, LEVEL.GENBUTSU);
  eq('他家の捨て牌は現物にならない', safetyOf(st, SEATS.TOIMEN, idx('1m')).level === LEVEL.GENBUTSU, false);
}

// --- リーチ後の通り筋 ---
{
  const st = build([
    { type: 'discard', seat: SEATS.SHIMOCHA, tile: '1z', riichi: true },
    { type: 'discard', seat: SEATS.TOIMEN, tile: '9p' },
  ]);
  eq('リーチ後に他家が切った牌は通り筋', safetyOf(st, SEATS.SHIMOCHA, idx('9p')).level, LEVEL.GENBUTSU);
  eq('リーチしていない家には通り筋が効かない', safetyOf(st, SEATS.KAMICHA, idx('9p')).level === LEVEL.GENBUTSU, false);
}

// --- スジ ---
{
  const st = build([{ type: 'discard', seat: SEATS.SHIMOCHA, tile: '4m' }]);
  eq('4mが現物なら1mはスジ', safetyOf(st, SEATS.SHIMOCHA, idx('1m')).reason, 'スジ');
  eq('4mが現物なら7mはスジ', safetyOf(st, SEATS.SHIMOCHA, idx('7m')).reason, 'スジ');
}
{
  const st = build([
    { type: 'discard', seat: SEATS.SHIMOCHA, tile: '2m' },
    { type: 'discard', seat: SEATS.SHIMOCHA, tile: '8m' },
  ]);
  eq('2mと8mが現物なら5mは両スジ', safetyOf(st, SEATS.SHIMOCHA, idx('5m')).reason, '両スジ');
  eq('両スジは準安全', safetyOf(st, SEATS.SHIMOCHA, idx('5m')).level, LEVEL.NEAR_SAFE);
}
{
  const st = build([{ type: 'discard', seat: SEATS.SHIMOCHA, tile: '2m' }]);
  eq('片側だけなら5mは片スジ', safetyOf(st, SEATS.SHIMOCHA, idx('5m')).reason, '片スジ');
}

// --- 壁 ---
{
  // 8mが4枚見え → 9mは789の両面が作れずノーチャンス
  const st = build([], { hand: ['8m', '8m', '8m', '8m'] });
  eq('8mが4枚見えなら9mはノーチャンス', safetyOf(st, SEATS.SHIMOCHA, idx('9m')).reason, 'ノーチャンス');
}
{
  const st = build([], { hand: ['8m', '8m', '8m'] });
  eq('8mが3枚見えなら9mはワンチャンス', safetyOf(st, SEATS.SHIMOCHA, idx('9m')).reason, 'ワンチャンス');
}

// --- 字牌 ---
{
  const st = build([], { hand: ['5z', '5z', '5z'] });
  eq('白が3枚見えなら準安全', safetyOf(st, SEATS.SHIMOCHA, idx('5z')).level, LEVEL.NEAR_SAFE);
}
{
  const st = build([], { bakaze: '1z', jikaze: '1z' });
  eq('三元牌の生牌は危険', safetyOf(st, SEATS.SHIMOCHA, idx('7z')).level, LEVEL.DANGER);
  // 自分が東家なら下家は南家。北は誰の役牌でもない客風
  eq('客風の生牌はやや危険', safetyOf(st, SEATS.SHIMOCHA, idx('4z')).level, LEVEL.RISKY);
  eq('場風(東)は危険', safetyOf(st, SEATS.SHIMOCHA, idx('1z')).level, LEVEL.DANGER);
  eq('下家の自風(南)は危険', safetyOf(st, SEATS.SHIMOCHA, idx('2z')).level, LEVEL.DANGER);
  eq('上家の自風は北', st.seatWinds[SEATS.KAMICHA], idx('4z'));
}

// --- 無筋 ---
{
  const st = build([]);
  eq('無筋の5mは危険', safetyOf(st, SEATS.SHIMOCHA, idx('5m')).level, LEVEL.DANGER);
  eq('無筋の1mはやや危険', safetyOf(st, SEATS.SHIMOCHA, idx('1m')).level, LEVEL.RISKY);
}

// --- 最悪値評価 ---
{
  const st = build([
    { type: 'discard', seat: SEATS.SHIMOCHA, tile: '5m' },
    { type: 'discard', seat: SEATS.TOIMEN, tile: '5m' },
  ]);
  const w = worstSafety(st, idx('5m'));
  eq('2家に現物でも残り1家が無筋なら危険', w.level, LEVEL.DANGER);
  eq('現物の家数', w.genbutsuCount, 2);
}

// --- 警戒フラグ ---
{
  const st = build([
    { type: 'call', seat: SEATS.TOIMEN, kind: 'pon', tiles: ['7z', '7z', '7z'], from: SEATS.SELF },
    { type: 'call', seat: SEATS.TOIMEN, kind: 'pon', tiles: ['2p', '2p', '2p'], from: SEATS.SELF },
    { type: 'call', seat: SEATS.TOIMEN, kind: 'chi', tiles: ['4p', '5p', '6p'], from: SEATS.KAMICHA },
  ]);
  const flags = warningsFor(st, SEATS.TOIMEN).map((f) => f.kind);
  eq('役牌ポンを検出', flags.includes('yakuhai'), true);
  eq('同色2つでホンイツ警戒', flags.includes('honitsu'), true);
  eq('安全度には影響しない（1mは無筋のまま）', safetyOf(st, SEATS.TOIMEN, idx('1m')).reason, '無筋の端牌');
}

console.log(failed === 0 ? '\n全て成功' : `\n${failed}件 失敗`);
process.exit(failed === 0 ? 0 : 1);
