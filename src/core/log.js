// 操作ログと状態の再計算
//
// 入力は全てログとして積み、状態はログから毎回再計算する（5章）。
// 取り消し = 末尾の削除、編集 = 該当要素の差し替え。

import { countsOf, emptyCounts, parseTile, doraFromIndicator, indexOf } from './tiles.js';

/** 座席。自分から見た並び（打順もこの順） */
export const SEATS = { SELF: 0, SHIMOCHA: 1, TOIMEN: 2, KAMICHA: 3 };
export const SEAT_NAMES = ['自分', '下家', '対面', '上家'];

export const STORAGE_KEY = 'mj-assist:log';
export const STORAGE_VERSION = 1;

export function initialLog({
  hand = [],
  doraIndicator = null,
  bakaze = '1z',
  jikaze = '1z',
  kyoku = 1,
  honba = 0,
  rules = { aka: 3, kuitan: true },
} = {}) {
  return [{ type: 'init', hand, doraIndicator, bakaze, jikaze, kyoku, honba, rules }];
}

/** 座席の自風（1=東 2=南 3=西 4=北）。下家・対面・上家の順に風が進む。 */
export function seatWindNumber(jikazeIndex, seat) {
  const base = jikazeIndex - 26; // 27(東) → 1
  return ((base - 1 + seat) % 4) + 1;
}

export function replay(log) {
  const init = log[0];
  if (!init || init.type !== 'init') throw new Error('ログの先頭は init である必要があります');

  const jikaze = parseTile(init.jikaze).index;
  const bakaze = parseTile(init.bakaze).index;

  const state = {
    rules: init.rules,
    bakaze,
    jikaze,
    kyoku: init.kyoku ?? 1,
    honba: init.honba,
    hand: [...init.hand],
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    discardSeq: [],
    riichiSeq: [null, null, null, null],
    doraIndicators: [],
    dora: [],
    turn: 1,
  };
  if (init.doraIndicator) state.doraIndicators.push(init.doraIndicator);

  let seq = 0;
  for (const ev of log.slice(1)) {
    switch (ev.type) {
      case 'draw':
        state.hand.push(ev.tile);
        break;

      case 'discard': {
        const { index, red } = parseTile(ev.tile);
        const entry = { index, red, riichi: !!ev.riichi, seq, seat: ev.seat };
        state.discards[ev.seat].push(entry);
        state.discardSeq.push(entry);
        if (ev.riichi && state.riichiSeq[ev.seat] === null) state.riichiSeq[ev.seat] = seq;
        if (ev.seat === SEATS.SELF) {
          const at = state.hand.indexOf(ev.tile);
          if (at >= 0) state.hand.splice(at, 1);
          state.turn += 1;
        }
        seq += 1;
        break;
      }

      case 'call': {
        state.melds[ev.seat].push({ kind: ev.kind, tiles: ev.tiles, from: ev.from ?? null });
        if (ev.seat === SEATS.SELF) {
          // 手牌から晒した牌を抜く（ロン牌・ポン元の牌は手牌にないので見つかった分だけ）
          for (const t of ev.tiles) {
            const at = state.hand.indexOf(t);
            if (at >= 0) state.hand.splice(at, 1);
          }
        }
        break;
      }

      case 'dora':
        state.doraIndicators.push(ev.tile);
        break;

      case 'start':
        break;

      default:
        throw new Error(`未知のイベント: ${ev.type}`);
    }
  }

  state.dora = state.doraIndicators.map((t) => doraFromIndicator(parseTile(t).index));
  state.handCounts = countsOf(state.hand);
  state.meldCount = state.melds[SEATS.SELF].length;
  state.visible = computeVisible(state);
  state.seatWinds = [0, 1, 2, 3].map((s) => indexOf('z', seatWindNumber(jikaze, s)));
  state.dealer = state.seatWinds.indexOf(indexOf('z', 1));
  return state;
}

/** 場に見えている牌の枚数（自分の手牌・全員の捨て牌・全員の鳴き・ドラ表示牌） */
function computeVisible(state) {
  const visible = emptyCounts();
  for (const t of state.hand) visible[parseTile(t).index] += 1;
  for (const seat of state.discards) for (const d of seat) visible[d.index] += 1;
  for (const seat of state.melds) {
    for (const meld of seat) for (const t of meld.tiles) visible[parseTile(t).index] += 1;
  }
  for (const t of state.doraIndicators) visible[parseTile(t).index] += 1;
  return visible;
}

/** 残り枚数（自分から見て、まだどこにあるか分からない枚数） */
export const remainingOf = (state, index) => 4 - state.visible[index];

export function save(log) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, log }));
  } catch {
    // プライベートブラウズなどで失敗しても動作は続ける
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION) return null; // 形式が変わったら破棄（5.2）
    return parsed.log;
  } catch {
    return null;
  }
}

export function clear() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 無視
  }
}

/** 次の局のログを作る。親継続なら風はそのままで本場を増やす。 */
export function nextRoundLog(state, { renchan }) {
  const base = {
    rules: state.rules,
    bakaze: `${state.bakaze - 26}z`,
    jikaze: `${state.jikaze - 26}z`,
    kyoku: state.kyoku,
    honba: renchan ? state.honba + 1 : 0,
  };
  if (renchan) return initialLog(base);

  // 親が流れると自風は 東→北→西→南→東 と進む
  const jikazeNum = ((state.jikaze - 26 - 2 + 4) % 4) + 1;
  let kyoku = state.kyoku + 1;
  let bakazeNum = state.bakaze - 26;
  if (kyoku > 4) {
    kyoku = 1;
    bakazeNum = (bakazeNum % 4) + 1;
  }
  return initialLog({ ...base, jikaze: `${jikazeNum}z`, bakaze: `${bakazeNum}z`, kyoku });
}
