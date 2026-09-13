// 安全度判定（4.5）
//
// 判定に使うのは現物・スジ・壁だけ。リーチや鳴きからの推測はスコアに混ぜず、
// 警戒フラグとして別に返す（4.5.2）。

import { TILE_KINDS, isHonor, numberOf, suitOf, indexOf, parseTile, DRAGONS } from './tiles.js';
import { SEATS } from './log.js';

export const LEVEL = {
  GENBUTSU: 1,   // 現物
  NEAR_SAFE: 2,  // 準安全
  SOMEWHAT: 3,   // やや安全
  RISKY: 4,      // やや危険
  DANGER: 5,     // 危険
};

export const LEVEL_LABELS = {
  1: '現物',
  2: '準安全',
  3: 'やや安全',
  4: 'やや危険',
  5: '危険',
};

/**
 * その家に対する現物の集合。
 * その家の捨て牌に加え、その家のリーチ後に誰かが切って通った牌も含む（通り筋）。
 */
export function genbutsuSet(state, seat) {
  const set = new Set(state.discards[seat].map((d) => d.index));
  const riichiAt = state.riichiSeq[seat];
  if (riichiAt !== null) {
    for (const d of state.discardSeq) {
      if (d.seq > riichiAt) set.add(d.index);
    }
  }
  return set;
}

/** スジの相手（1↔4、2↔5、3↔6、7↔4、8↔5、9↔6）。字牌は空。 */
function sujiPartners(index) {
  if (isHonor(index)) return [];
  const suit = suitOf(index);
  const n = numberOf(index);
  const partners = [];
  if (n - 3 >= 1) partners.push(indexOf(suit, n - 3));
  if (n + 3 <= 9) partners.push(indexOf(suit, n + 3));
  return partners;
}

/**
 * 壁の判定。
 * 対象牌を両面・嵌張で待てる形を列挙し、見えている枚数から成立可能かを見る。
 * 全て成立不可能ならノーチャンス、あと1枚で全て潰れるならワンチャンス。
 */
function wallStatus(state, index) {
  if (isHonor(index)) return 'none';
  const suit = suitOf(index);
  const n = numberOf(index);
  const remaining = (num) => 4 - state.visible[indexOf(suit, num)];

  const shapes = [];
  if (n - 2 >= 1) shapes.push([n - 2, n - 1]); // 両面（下から）
  if (n + 2 <= 9) shapes.push([n + 1, n + 2]); // 両面（上から）
  if (n - 1 >= 1 && n + 1 <= 9) shapes.push([n - 1, n + 1]); // 嵌張

  const alive = shapes.filter(([a, b]) => remaining(a) >= 1 && remaining(b) >= 1);
  if (alive.length === 0) return 'no-chance';
  const allNearlyDead = alive.every(([a, b]) => remaining(a) === 1 || remaining(b) === 1);
  return allNearlyDead ? 'one-chance' : 'none';
}

/** その家にとっての役牌か（三元牌・場風・自風） */
function isYakuhaiFor(state, seat, index) {
  if (!isHonor(index)) return false;
  return DRAGONS.includes(index) || index === state.bakaze || index === state.seatWinds[seat];
}

/**
 * 1牌について、その家に対する安全度を返す。
 * { level, reason }
 */
export function safetyOf(state, seat, index) {
  const remaining = 4 - state.visible[index];
  const genbutsu = genbutsuSet(state, seat);

  if (genbutsu.has(index)) return { level: LEVEL.GENBUTSU, reason: '現物' };
  if (remaining <= 0) return { level: LEVEL.GENBUTSU, reason: '4枚見え' };

  if (isHonor(index)) {
    if (remaining <= 1) return { level: LEVEL.NEAR_SAFE, reason: `残り${remaining}枚` };
    if (isYakuhaiFor(state, seat, index)) return { level: LEVEL.DANGER, reason: '無筋の役牌' };
    return { level: LEVEL.RISKY, reason: `客風 残り${remaining}枚` };
  }

  const partners = sujiPartners(index);
  const passed = partners.filter((p) => genbutsu.has(p));
  const n = numberOf(index);
  const isMiddle = n >= 4 && n <= 6;

  if (isMiddle && partners.length === 2 && passed.length === 2) {
    return { level: LEVEL.NEAR_SAFE, reason: '両スジ' };
  }

  const wall = wallStatus(state, index);
  if (passed.length > 0) {
    return { level: LEVEL.SOMEWHAT, reason: isMiddle ? '片スジ' : 'スジ' };
  }
  if (wall === 'no-chance') return { level: LEVEL.SOMEWHAT, reason: 'ノーチャンス' };
  if (wall === 'one-chance') return { level: LEVEL.RISKY, reason: 'ワンチャンス' };

  // 無筋の一・九は両面の片側でしか当たらないため、中張牌より一段安全に置く
  if (n === 1 || n === 9) return { level: LEVEL.RISKY, reason: '無筋の端牌' };

  return { level: LEVEL.DANGER, reason: '無筋' };
}

/** 34種すべての安全度を、その家について返す */
export function safetyTable(state, seat) {
  return Array.from({ length: TILE_KINDS }, (_, i) => safetyOf(state, seat, i));
}

/**
 * 3家の中で最も危険な評価を、その牌のスコアとする（4.5.3 最悪値評価）。
 * { level, worstSeats, genbutsuCount, perSeat }
 */
export function worstSafety(state, index) {
  const perSeat = [];
  let level = LEVEL.GENBUTSU;
  for (const seat of [SEATS.SHIMOCHA, SEATS.TOIMEN, SEATS.KAMICHA]) {
    const s = safetyOf(state, seat, index);
    perSeat.push({ seat, ...s });
    if (s.level > level) level = s.level;
  }
  return {
    level,
    perSeat,
    dangerSeats: perSeat.filter((s) => s.level === LEVEL.DANGER).length,
    genbutsuCount: perSeat.filter((s) => s.level === LEVEL.GENBUTSU).length,
  };
}

/** 警戒フラグ（4.5.2）。安全度には反映しない。 */
export function warningsFor(state, seat) {
  const flags = [];
  const melds = state.melds[seat];

  if (state.riichiSeq[seat] !== null) {
    const turn = state.discards[seat].findIndex((d) => d.riichi) + 1;
    flags.push({ kind: 'riichi', label: `リーチ（${turn}巡目）` });
  }

  // 役牌ポン
  for (const meld of melds) {
    const idx = meldIndex(meld);
    if (idx !== null && isYakuhaiFor(state, seat, idx)) {
      flags.push({ kind: 'yakuhai', label: '役牌あり' });
      break;
    }
  }

  // 同色の鳴きが2つ以上 → ホンイツ警戒
  const suitCount = { m: 0, p: 0, s: 0 };
  for (const meld of melds) {
    const idx = meldIndex(meld);
    if (idx === null || isHonor(idx)) continue;
    suitCount[suitOf(idx)] += 1;
  }
  for (const [suit, count] of Object.entries(suitCount)) {
    if (count >= 2) {
      const name = { m: '萬子', p: '筒子', s: '索子' }[suit];
      flags.push({ kind: 'honitsu', label: `ホンイツ警戒（${name}）` });
    }
  }

  // ドラ・赤を含む鳴き → 打点警戒
  const hasDora = melds.some((meld) =>
    meld.tiles.some((t) => {
      const { index, red } = parseTile(t);
      return red || state.dora.includes(index);
    }),
  );
  if (hasDora) flags.push({ kind: 'dora', label: '打点警戒（ドラ鳴き）' });

  // 二〜八のみの鳴き
  if (melds.length > 0) {
    const allSimple = melds.every((meld) =>
      meld.tiles.every((t) => {
        const { index } = parseTile(t);
        return !isHonor(index) && numberOf(index) >= 2 && numberOf(index) <= 8;
      }),
    );
    if (allSimple) flags.push({ kind: 'tanyao', label: 'タンヤオ系警戒' });
  }

  return flags;
}

function meldIndex(meld) {
  if (!meld.tiles || meld.tiles.length === 0) return null;
  return parseTile(meld.tiles[0]).index;
}
