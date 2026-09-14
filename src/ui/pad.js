// 入力パッド（画面下部に固定）
//
// 打順は決まっているので、次に何を入力すべきかはログから分かる（state.expect）。
// 通常は「次の入力」に向かって牌をタップするだけで進み、モード切替は要らない。
// 順番どおりでない入力が必要なときだけ、手動で入力先を指定する。

import { ALL_TILES, suitOf, numberOf, indexOf, tileToString, tileName, parseTile } from '../core/tiles.js';
import { SEAT_NAMES, SEATS } from '../core/log.js';
import { tileSvg } from './tile-svg.js';

const ROWS = [
  { suit: 'm', label: '萬' },
  { suit: 's', label: '索' },
  { suit: 'p', label: '筒' },
  { suit: 'z', label: '字' },
];

/** 手動で入力先を指定するときの選択肢（1回入力すると自動送りに戻る） */
export const OVERRIDES = [
  { id: 'draw', label: '自分ツモ' },
  { id: 'discard1', label: '下家 捨' },
  { id: 'discard2', label: '対面 捨' },
  { id: 'discard3', label: '上家 捨' },
  { id: 'meld', label: '暗槓・加槓' },
  { id: 'dora', label: '槓ドラ' },
];

export function renderPad(ctx) {
  return ctx.setup ? renderSetupPad(ctx) : renderPlayPad(ctx);
}

function renderSetupPad({ setupStep, red, remaining, handCount }) {
  // ①局の設定では牌を使わないのでパッドごと隠す
  if (setupStep === 1) return '';

  const isDora = setupStep === 2;
  return `
    <div class="pad-next">
      <span class="next-label">${isDora ? 'ステップ2' : 'ステップ3'}</span>
      <strong class="next-target">${isDora ? 'ドラ表示牌を選ぶ' : '配牌を入力'}</strong>
      <button class="toggle${red ? ' is-on' : ''}" data-toggle="red">赤</button>
      ${isDora || handCount === 0 ? '' : '<button class="toggle" data-action="undo-haipai">1枚戻す</button>'}
    </div>
    ${renderGrid(red, remaining)}
  `;
}

function renderPlayPad({ state, override, red, riichi, meldDraft, quickCall, notice, remaining }) {
  const next = describeNext(state.expect, override);
  const auto = autoOverrideId(state.expect);
  const overrides = OVERRIDES
    .filter((m) => m.id !== auto) // 自動送りと同じ対象は手動で選ぶ意味がない
    .map((m) => `<button class="chip sm${m.id === override ? ' is-active' : ''}" data-override="${m.id}">${m.label}</button>`)
    .join('');

  const middle = override === 'meld'
    ? renderMeldBar(meldDraft)
    : renderQuickCall(state, quickCall);

  return `
    <div class="pad-next${override ? ' is-manual' : ''}">
      <span class="next-label">${override ? '手動' : '次の入力'}</span>
      <strong class="next-target">${next}</strong>
      ${notice ? `<span class="notice">${notice}</span>` : ''}
      ${isDiscardInput(state.expect, override) ? `<button class="toggle${riichi ? ' is-on' : ''}" data-toggle="riichi">リーチ</button>` : ''}
      <button class="toggle${red ? ' is-on' : ''}" data-toggle="red">赤</button>
      <button class="toggle" data-action="undo">取消</button>
    </div>
    ${middle}
    <details class="pad-manual"${override ? ' open' : ''}>
      <summary>順番どおりでないとき</summary>
      <div class="pad-overrides">${overrides}</div>
    </details>
    ${renderGrid(red, remaining)}
  `;
}

/** いま自動送りが指している入力先を、手動指定のidに直す */
function autoOverrideId(expect) {
  if (expect.kind === 'draw') return 'draw';
  return expect.seat === SEATS.SELF ? null : `discard${expect.seat}`;
}

/** 入力しようとしているのが捨て牌かどうか（リーチ宣言が意味を持つのはこのときだけ） */
function isDiscardInput(expect, override) {
  if (override === 'dora' || override === 'meld' || override === 'draw') return false;
  if (override) return true; // discard1..3
  return expect.kind === 'discard';
}

function describeNext(expect, override) {
  if (override === 'meld') return '暗槓・加槓の牌';
  if (override === 'dora') return '槓ドラ表示牌';
  if (override === 'draw') return '自分のツモ';
  if (override && override.startsWith('discard')) return `${SEAT_NAMES[Number(override.slice(-1))]} の捨て牌`;
  if (expect.kind === 'draw') return '自分のツモ';
  return expect.seat === SEATS.SELF ? '自分の打牌' : `${SEAT_NAMES[expect.seat]} の捨て牌`;
}

/**
 * 直前に捨てられた牌への鳴きは1タップ目で家、2タップ目で種類。
 * 鳴きの大半は直前の捨て牌に対して起きるので、これで足りる。
 */
function renderQuickCall(state, quickCall) {
  const last = lastDiscard(state);
  if (!last || !state.callable) return '';
  const label = tileName(last.index);

  if (!quickCall) {
    const seats = [0, 1, 2, 3]
      .filter((s) => s !== last.seat)
      .map((s) => `<button class="chip sm" data-call-seat="${s}">${SEAT_NAMES[s]}</button>`)
      .join('');
    return `<div class="quick-call"><span class="qc-label">${label} を鳴き</span>${seats}</div>`;
  }

  const chips = [`<button class="chip" data-call-kind="pon">ポン</button>`];
  if (4 - state.visible[last.index] >= 2) chips.push(`<button class="chip" data-call-kind="minkan">カン</button>`);
  if (quickCall.seat === (last.seat + 1) % 4) {
    for (const shape of chiShapes(last.index)) {
      chips.push(`<button class="chip" data-call-chi="${shape.join(',')}">チー ${shape.map((i) => numberOf(i)).join('')}</button>`);
    }
  }
  chips.push('<button class="chip sm" data-call-seat="cancel">やめる</button>');
  return `<div class="quick-call"><span class="qc-label">${SEAT_NAMES[quickCall.seat]} が ${label} を</span>${chips.join('')}</div>`;
}

function lastDiscard(state) {
  const all = state.discardSeq;
  return all.length ? all[all.length - 1] : null;
}

/** 手から出す2枚の組み合わせ（チーは上家の捨て牌にしかできない） */
function chiShapes(index) {
  if (index >= 27) return [];
  const suit = suitOf(index);
  const n = numberOf(index);
  const candidates = [[n - 2, n - 1], [n - 1, n + 1], [n + 1, n + 2]];
  return candidates
    .filter(([a, b]) => a >= 1 && a <= 9 && b >= 1 && b <= 9)
    .map(([a, b]) => [indexOf(suit, a), indexOf(suit, b)]);
}

function renderMeldBar(draft) {
  const kinds = [
    { id: 'ankan', label: '暗槓' },
    { id: 'kakan', label: '加槓' },
  ];
  const kindButtons = kinds
    .map((k) => `<button class="chip${draft.kind === k.id ? ' is-active' : ''}" data-meld-kind="${k.id}">${k.label}</button>`)
    .join('');
  return `<div class="quick-call"><span class="qc-label">自分の</span>${kindButtons}<span class="hint">牌を1枚タップ</span></div>`;
}

function renderGrid(red, remaining) {
  const rows = ROWS.map((row) => {
    const cells = ALL_TILES.filter((i) => suitOf(i) === row.suit)
      .map((i) => {
        const left = remaining[i];
        const useRed = red && row.suit !== 'z' && numberOf(i) === 5;
        return `<button class="pad-tile${left <= 0 ? ' is-out' : ''}" data-tile="${tileToString(i, useRed)}"
          title="${tileName(i)}（残り${left}）">${tileSvg(i, { red: useRed })}<span class="left">${left}</span></button>`;
      })
      .join('');
    return `<div class="pad-row"><span class="pad-label">${row.label}</span>${cells}</div>`;
  }).join('');
  return `<div class="pad-grid">${rows}</div>`;
}

export { lastDiscard, chiShapes };
