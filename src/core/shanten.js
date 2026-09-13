// 向聴数と受け入れ（有効牌）の計算
//
// 向聴数の定義: 和了まであと何枚の入れ替えが必要か。和了形 = -1、テンパイ = 0。

import { TILE_KINDS, numberOf, isYaochu, emptyCounts } from './tiles.js';

/**
 * 面子手の向聴数。
 *
 * 面子を m、搭子（対子を含む）を t、鳴いた面子を meldCount として
 *   向聴数 = 8 - 2 * (m + meldCount) - t
 * ブロックは5つまで。5ブロックあって対子が1つもない場合は雀頭を作る必要があるため +1。
 */
export function standardShanten(counts, meldCount, { allowRuns = true } = {}) {
  const c = counts.slice();
  let best = 8;

  const record = (m, t, hasPair) => {
    const sets = m + meldCount;
    let sh = 8 - 2 * sets - t;
    if (sets + t === 5 && !hasPair) sh += 1;
    if (sh < best) best = sh;
  };

  const rec = (start, m, t, hasPair) => {
    let i = start;
    while (i < TILE_KINDS && c[i] === 0) i += 1;
    if (i >= TILE_KINDS) {
      record(m, t, hasPair);
      return;
    }
    const canAddBlock = m + meldCount + t < 5;
    const isSuit = i < 27;
    const num = numberOf(i);

    if (canAddBlock && c[i] >= 3) {
      c[i] -= 3;
      rec(i, m + 1, t, hasPair);
      c[i] += 3;
    }
    if (allowRuns && canAddBlock && isSuit && num <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i] -= 1; c[i + 1] -= 1; c[i + 2] -= 1;
      rec(i, m + 1, t, hasPair);
      c[i] += 1; c[i + 1] += 1; c[i + 2] += 1;
    }
    if (canAddBlock && c[i] >= 2) {
      c[i] -= 2;
      rec(i, m, t + 1, true);
      c[i] += 2;
    }
    if (allowRuns && canAddBlock && isSuit && num <= 8 && c[i + 1] > 0) {
      c[i] -= 1; c[i + 1] -= 1;
      rec(i, m, t + 1, hasPair);
      c[i] += 1; c[i + 1] += 1;
    }
    if (allowRuns && canAddBlock && isSuit && num <= 7 && c[i + 2] > 0) {
      c[i] -= 1; c[i + 2] -= 1;
      rec(i, m, t + 1, hasPair);
      c[i] += 1; c[i + 2] += 1;
    }
    // この牌を使わない（浮き牌として切る）
    c[i] -= 1;
    rec(i, m, t, hasPair);
    c[i] += 1;
  };

  rec(0, 0, 0, false);
  return best;
}

/** 七対子。対子の数と種類数から。鳴きがあると成立しない。 */
function chiitoiShanten(counts) {
  let pairs = 0;
  let kinds = 0;
  for (const n of counts) {
    if (n > 0) kinds += 1;
    if (n >= 2) pairs += 1;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

/** 国士無双。幺九牌の種類数と、そのうち対子があるか。 */
function kokushiShanten(counts) {
  let kinds = 0;
  let hasPair = false;
  for (let i = 0; i < TILE_KINDS; i += 1) {
    if (!isYaochu(i) || counts[i] === 0) continue;
    kinds += 1;
    if (counts[i] >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

/**
 * 向聴数。meldCount は鳴いた面子の数（暗槓を含む）。
 * 鳴きがある場合は七対子・国士は成立しない。
 */
export function shanten(counts, meldCount = 0) {
  const std = standardShanten(counts, meldCount);
  if (meldCount > 0) return std;
  return Math.min(std, chiitoiShanten(counts), kokushiShanten(counts));
}

/** 内訳（役アシストの説明用） */
export { chiitoiShanten, kokushiShanten };

export function shantenBreakdown(counts, meldCount = 0) {
  return {
    standard: standardShanten(counts, meldCount),
    chiitoi: meldCount > 0 ? Infinity : chiitoiShanten(counts),
    kokushi: meldCount > 0 ? Infinity : kokushiShanten(counts),
  };
}

/**
 * 受け入れ（有効牌）。向聴数が進む牌と、その残り枚数を返す。
 * visible は場に見えている枚数（自分の手牌を含む）。
 */
export function ukeire(counts, meldCount = 0, visible = emptyCounts()) {
  const base = shanten(counts, meldCount);
  const tiles = [];
  let total = 0;
  for (let i = 0; i < TILE_KINDS; i += 1) {
    if (counts[i] >= 4) continue;
    const remaining = 4 - Math.max(visible[i], counts[i]);
    if (remaining <= 0) continue;
    counts[i] += 1;
    const next = shanten(counts, meldCount);
    counts[i] -= 1;
    if (next < base) {
      tiles.push({ index: i, remaining });
      total += remaining;
    }
  }
  return { shanten: base, tiles, total };
}
