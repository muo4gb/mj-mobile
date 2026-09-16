// 入力パッド（画面下部に固定）
//
// 打順は決まっているので、次に何を入力すべきかはログから分かる（state.expect）。
// 通常は「次の入力」に向かって牌をタップするだけで進み、モード切替は要らない。
// 順番どおりでない入力が必要なときだけ、手動で入力先を指定する。

import { ALL_TILES, SUIT_DISPLAY, suitOf, numberOf, indexOf, tileToString, tileName } from '../core/tiles.js';
import { SEAT_NAMES, SEATS, lastDiscard } from '../core/log.js';
import { chiShapes } from '../core/call.js';
import { tileSvg } from './tile-svg.js';

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
  const target = resolveTarget(state.expect, override);
  const auto = autoOverrideId(state.expect);
  const overrides = OVERRIDES
    .filter((m) => m.id !== auto) // 自動送りと同じ対象は手動で選ぶ意味がない
    .map((m) => `<button class="chip sm${m.id === override ? ' is-active' : ''}" data-override="${m.id}">${m.label}</button>`)
    .join('');

  const middle = override === 'meld'
    ? renderMeldBar(meldDraft)
    : renderQuickCall(state, quickCall);

  return `
    <div class="pad-next${override ? ' is-manual' : ''}${target.seat === null ? ' is-seatless' : ` seat-${target.seat}`}">
      ${renderSeatStrip(target)}
      <div class="pad-tools">
        ${notice ? `<span class="notice">${notice}</span>` : ''}
        ${isDiscardInput(state.expect, override) ? `<button class="toggle${riichi ? ' is-on' : ''}" data-toggle="riichi">リーチ</button>` : ''}
        <button class="toggle${red ? ' is-on' : ''}" data-toggle="red">赤</button>
        <button class="toggle" data-action="undo">取消</button>
      </div>
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

/** いま入力しようとしているもの。席が絡まない入力（槓ドラなど）は seat を null にする。 */
function resolveTarget(expect, override) {
  if (override === 'meld') return { seat: SEATS.SELF, what: '暗槓・加槓', manual: true };
  if (override === 'dora') return { seat: null, what: '槓ドラ表示牌', manual: true };
  if (override === 'draw') return { seat: SEATS.SELF, what: 'ツモ', manual: true };
  if (override) return { seat: Number(override.slice(-1)), what: '捨て牌', manual: true };
  if (expect.kind === 'draw') return { seat: SEATS.SELF, what: 'ツモ' };
  return { seat: expect.seat, what: expect.seat === SEATS.SELF ? '打牌' : '捨て牌' };
}

/** 打順の4コマ。今どこかを席の色で示す。巡目のどのあたりかも一目で分かる。 */
const TURN_ORDER = [SEATS.SELF, SEATS.SHIMOCHA, SEATS.TOIMEN, SEATS.KAMICHA];

function renderSeatStrip(target) {
  if (target.seat === null) {
    return `<div class="seat-strip"><span class="seat-cell is-active is-seatless">
      <b>${target.what}</b><small>${target.manual ? '手動' : ''}</small></span></div>`;
  }
  const cells = TURN_ORDER.map((seat) => {
    const active = seat === target.seat;
    return `<span class="seat-cell seat-${seat}${active ? ' is-active' : ''}">
      <b>${SEAT_NAMES[seat]}</b><small>${active ? target.what : ''}</small></span>`;
  }).join('<i class="seat-arrow">›</i>');
  return `<div class="seat-strip">${cells}</div>`;
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
    const seats = [SEATS.SHIMOCHA, SEATS.TOIMEN, SEATS.KAMICHA]
      .filter((s) => s !== last.seat)
      .map((s) => `<button class="chip sm" data-call-seat="${s}">${SEAT_NAMES[s]}</button>`)
      .join('');
    return `<div class="quick-call"><span class="qc-label">${label} を他家が鳴き</span>${seats}</div>`;
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
  const rows = SUIT_DISPLAY.map((row) => {
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
