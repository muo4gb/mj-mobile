// 自分が鳴けるかどうかのアシスト
//
// 他家が捨てた牌に対して自分が鳴けるとき、鳴いた場合に何がどう変わるかを出す。
// 鳴くかどうかの判断そのものはユーザーがする。

import { isHonor, numberOf, suitOf, indexOf, tileToString, DRAGONS } from './tiles.js';
import { shanten } from './shanten.js';
import { yakuCandidates } from './yaku.js';
import { SEATS, lastDiscard } from './log.js';

/** チーで手から出す2枚の組み合わせ（チーは上家の捨て牌にしかできない） */
export function chiShapes(index) {
  if (isHonor(index)) return [];
  const suit = suitOf(index);
  const n = numberOf(index);
  return [[n - 2, n - 1], [n - 1, n + 1], [n + 1, n + 2]]
    .filter(([a, b]) => a >= 1 && a <= 9 && b >= 1 && b <= 9)
    .map(([a, b]) => [indexOf(suit, a), indexOf(suit, b)]);
}

const isYakuhaiForSelf = (state, index) =>
  isHonor(index) && (DRAGONS.includes(index) || index === state.bakaze || index === state.seatWinds[SEATS.SELF]);

/** 手牌から指定の牌を n 枚取り出す。赤は残したいので通常牌を優先する。 */
export function pickFromHand(state, index, n) {
  const plain = tileToString(index);
  const red = tileToString(index, true);
  const out = [];
  let plains = state.hand.filter((t) => t === plain).length;
  while (out.length < n && plains > 0) {
    out.push(plain);
    plains -= 1;
  }
  while (out.length < n) out.push(red);
  return out;
}

/** 鳴いた後の状態を作る（向聴数と役候補の計算用） */
function simulate(state, used, meld) {
  const handCounts = state.handCounts.slice();
  for (const i of used) handCounts[i] -= 1;
  const melds = state.melds.map((m, seat) => (seat === SEATS.SELF ? [...m, meld] : m));
  return { ...state, handCounts, melds, meldCount: state.meldCount + 1 };
}

/**
 * 直前の捨て牌に対して自分ができる鳴きを返す。
 * 向聴数が進むもの、または役牌ポンだけを候補にする。
 */
export function selfCallOptions(state) {
  const last = lastDiscard(state);
  if (!state.callable || !last || last.seat === SEATS.SELF) return null;

  const counts = state.handCounts;
  const before = shanten(counts, state.meldCount);
  const idx = last.index;
  const discarded = tileToString(idx, last.red);
  const options = [];

  const build = (kind, used, label) => {
    const tiles = [...used.map((i) => pickFromHand(state, i, 1)[0]), discarded];
    const next = simulate(state, used, { kind, tiles, from: last.seat });
    const sh = shanten(next.handCounts, next.meldCount);
    return {
      kind,
      label,
      tiles,
      shanten: sh,
      gain: before - sh,
      yaku: yakuCandidates(next, { limit: 2 }),
      yakuhai: isYakuhaiForSelf(state, idx),
    };
  };

  if (counts[idx] >= 2) options.push(build('pon', [idx, idx], 'ポン'));
  if (counts[idx] >= 3) options.push(build('minkan', [idx, idx, idx], 'カン'));
  if (last.seat === SEATS.KAMICHA) {
    for (const [a, b] of chiShapes(idx)) {
      if (counts[a] > 0 && counts[b] > 0) {
        options.push(build('chi', [a, b], `チー ${numberOf(a)}${numberOf(b)}`));
      }
    }
  }

  // その牌で和了形になるか（役なし・フリテンまでは見ない）
  const withTile = counts.slice();
  withTile[idx] += 1;
  const ron = shanten(withTile, state.meldCount) === -1;

  // 向聴が進まない鳴きは基本的に出さない。ただし役牌のポン・カンは役が付くので残す
  const useful = options.filter((o) => o.gain >= 1 || (o.yakuhai && o.kind !== 'chi'));
  if (!ron && useful.length === 0) return null;

  useful.sort((a, b) => b.gain - a.gain || Number(b.yakuhai) - Number(a.yakuhai));
  return { index: idx, red: last.red, from: last.seat, seq: last.seq, before, ron, options: useful };
}
