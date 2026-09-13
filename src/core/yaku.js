// 役候補（4.6）
//
// 「使える牌の種類を制限した向聴数」で表せる役だけを扱う。
// その制限のもとで手牌を組んだときの向聴数が、そのままその役への距離になる。
//
// 平和・三色同順・一気通貫・一盃口のような、牌の種類ではなく面子の構造で
// 決まる役はこの方法では表せないため、ここでは扱わない（未実装）。

import {
  TILE_KINDS, isHonor, isSimple, isTerminal, isYaochu,
  suitOf, parseTile, tileName, DRAGONS,
} from './tiles.js';
import { standardShanten, chiitoiShanten, kokushiShanten } from './shanten.js';
import { SEATS } from './log.js';

const GREEN = ['2s', '3s', '4s', '6s', '8s', '6z'].map((t) => parseTile(t).index);

/** 牌の種類制限で表せる役の定義 */
const YAKU = [
  { name: '断幺九', han: 1, filter: isSimple, kuitan: true },
  { name: '対々和', han: 2, allowRuns: false },
  { name: '混一色（萬子）', han: 2, filter: (i) => suitOf(i) === 'm' || isHonor(i) },
  { name: '混一色（筒子）', han: 2, filter: (i) => suitOf(i) === 'p' || isHonor(i) },
  { name: '混一色（索子）', han: 2, filter: (i) => suitOf(i) === 's' || isHonor(i) },
  { name: '清一色（萬子）', han: 6, filter: (i) => suitOf(i) === 'm' },
  { name: '清一色（筒子）', han: 6, filter: (i) => suitOf(i) === 'p' },
  { name: '清一色（索子）', han: 6, filter: (i) => suitOf(i) === 's' },
  { name: '混老頭', han: 2, filter: isYaochu, allowRuns: false },
  { name: '七対子', han: 2, special: 'chiitoi' },
  { name: '清老頭', han: 13, yakuman: true, filter: isTerminal, allowRuns: false },
  { name: '字一色', han: 13, yakuman: true, filter: isHonor, allowRuns: false },
  { name: '緑一色', han: 13, yakuman: true, filter: (i) => GREEN.includes(i) },
  { name: '国士無双', han: 13, yakuman: true, special: 'kokushi' },
];

/**
 * 制限つき向聴数。
 * 使えない牌は 0 枚として扱う（＝その牌はいずれ切る前提）。
 * 鳴きが制限に反している場合はその役に到達できないので Infinity。
 */
function restrictedShanten(state, { filter, allowRuns = true }) {
  const melds = state.melds[SEATS.SELF];
  for (const meld of melds) {
    if (!allowRuns && meld.kind === 'chi') return Infinity;
    for (const t of meld.tiles) {
      if (filter && !filter(parseTile(t).index)) return Infinity;
    }
  }
  const counts = new Array(TILE_KINDS).fill(0);
  for (let i = 0; i < TILE_KINDS; i += 1) {
    if (!filter || filter(i)) counts[i] = state.handCounts[i];
  }
  return standardShanten(counts, melds.length, { allowRuns });
}

/** 役牌（三元牌・場風・自風）の持ち枚数 */
function yakuhaiCandidates(state) {
  const targets = [
    ...DRAGONS.map((i) => ({ index: i, why: '三元牌' })),
    { index: state.bakaze, why: '場風' },
    { index: state.seatWinds[SEATS.SELF], why: '自風' },
  ];
  const seen = new Set();
  const out = [];
  for (const t of targets) {
    if (seen.has(t.index)) continue;
    seen.add(t.index);
    const held = state.handCounts[t.index]
      + state.melds[SEATS.SELF].filter((m) => parseTile(m.tiles[0]).index === t.index).length * 3;
    if (held >= 2) {
      out.push({
        name: `役牌 ${tileName(t.index)}`,
        han: 1,
        shanten: held >= 3 ? 0 : 1,
        note: held >= 3 ? '成立' : `あと1枚（残り${4 - state.visible[t.index]}枚）`,
        index: t.index,
      });
    }
  }
  return out;
}

/**
 * 役候補を返す。
 * 表示基準（4.6）: 2向聴以内、役満は3向聴以内。上位5件。
 */
export function yakuCandidates(state, { limit = 5 } = {}) {
  const concealed = state.melds[SEATS.SELF].length === 0;
  const out = [];

  for (const def of YAKU) {
    if (def.kuitan && !state.rules.kuitan && !concealed) continue;
    if (def.special && !concealed) continue;

    let sh;
    if (def.special === 'chiitoi') sh = chiitoiShanten(state.handCounts);
    else if (def.special === 'kokushi') sh = kokushiShanten(state.handCounts);
    else sh = restrictedShanten(state, def);

    if (!Number.isFinite(sh)) continue;
    const threshold = def.yakuman ? 3 : 2;
    if (sh > threshold) continue;
    out.push({ name: def.name, han: def.han, shanten: sh, yakuman: !!def.yakuman });
  }

  out.push(...yakuhaiCandidates(state));

  out.sort((a, b) => a.shanten - b.shanten || b.han - a.han);
  return out.slice(0, limit);
}

/** 未対応の役があることを画面に出すための注記 */
export const UNSUPPORTED_NOTE = '平和・三色・一通など面子の構造で決まる役は未対応';
