// 推奨打牌と最安全牌（4.5.3 / 4.6.1）

import { TILE_KINDS, isHonor, numberOf, suitOf, indexOf, parseTile, tileToString } from './tiles.js';
import { shanten, ukeire } from './shanten.js';
import { worstSafety } from './safety.js';

/** 手牌に赤5が含まれているか（同じ index でも赤は残したい） */
function redCountOf(state, index) {
  return state.hand.filter((t) => {
    const p = parseTile(t);
    return p.index === index && p.red;
  }).length;
}

/** 孤立牌か（前後2枚以内に仲間がいない数牌、または1枚しかない字牌） */
function isIsolated(counts, index) {
  if (counts[index] >= 2) return false;
  if (isHonor(index)) return true;
  const suit = suitOf(index);
  const n = numberOf(index);
  for (let d = -2; d <= 2; d += 1) {
    if (d === 0) continue;
    const m = n + d;
    if (m < 1 || m > 9) continue;
    if (counts[indexOf(suit, m)] > 0) return false;
  }
  return true;
}

/**
 * 手牌の各牌について、切ったときの向聴数・受け入れ・安全度をまとめる。
 */
export function evaluateDiscards(state) {
  const counts = state.handCounts.slice();
  const meldCount = state.meldCount;
  const results = [];

  for (let i = 0; i < TILE_KINDS; i += 1) {
    if (counts[i] === 0) continue;
    counts[i] -= 1;
    const after = shanten(counts, meldCount);
    const uk = ukeire(counts, meldCount, state.visible);
    counts[i] += 1;

    const safety = worstSafety(state, i);
    const reds = redCountOf(state, i);
    results.push({
      index: i,
      tile: tileToString(i, reds > 0 && counts[i] === reds),
      shantenAfter: after,
      ukeire: uk.total,
      ukeireTiles: uk.tiles,
      safety,
      doraValue: (state.dora.includes(i) ? counts[i] : 0) + reds,
      isolated: isIsolated(counts, i),
    });
  }
  return results;
}

/**
 * 推奨打牌（4.6.1）: 向聴数 → 受け入れ枚数 → 安全度 → 打点
 */
function pickRecommended(results) {
  return [...results].sort((a, b) =>
    a.shantenAfter - b.shantenAfter
    || b.ukeire - a.ukeire
    || a.safety.level - b.safety.level
    || a.doraValue - b.doraValue
  )[0];
}

/**
 * 最安全牌（4.5.3）: 最悪値 → 危険と判定した家の数 → 現物の家の数 → ドラでない → 孤立牌
 */
function pickSafest(results) {
  return [...results].sort((a, b) =>
    a.safety.level - b.safety.level
    || a.safety.dangerSeats - b.safety.dangerSeats
    || b.safety.genbutsuCount - a.safety.genbutsuCount
    || a.doraValue - b.doraValue
    || Number(b.isolated) - Number(a.isolated)
  )[0];
}

export function analyze(state) {
  const results = evaluateDiscards(state);
  const current = shanten(state.handCounts, state.meldCount);
  if (results.length === 0) {
    return { shanten: current, results, recommended: null, safest: null, sameChoice: false };
  }
  const recommended = pickRecommended(results);
  const safest = pickSafest(results);
  return {
    shanten: current,
    results,
    recommended,
    safest,
    sameChoice: recommended.index === safest.index,
  };
}
