// 入力パッド（画面下部に固定）

import { ALL_TILES, suitOf, tileToString, tileName } from '../core/tiles.js';
import { tileSvg } from './tile-svg.js';

const ROWS = [
  { suit: 'm', label: '萬' },
  { suit: 'p', label: '筒' },
  { suit: 's', label: '索' },
  { suit: 'z', label: '字' },
];

export const MODES = [
  { id: 'haipai', label: '配牌', setupOnly: true },
  { id: 'draw', label: '自分ツモ' },
  { id: 'discard1', label: '下家 捨' },
  { id: 'discard2', label: '対面 捨' },
  { id: 'discard3', label: '上家 捨' },
  { id: 'meld', label: '鳴き' },
  { id: 'dora', label: 'ドラ表示牌' },
];

export function renderPad({ mode, red, riichi, meldDraft, setup, remaining }) {
  const modes = MODES.filter((m) => (setup ? true : !m.setupOnly));
  const modeButtons = modes
    .map((m) => `<button class="mode${m.id === mode ? ' is-active' : ''}" data-mode="${m.id}">${m.label}</button>`)
    .join('');

  const meldBar = mode === 'meld' ? renderMeldBar(meldDraft) : '';

  const rows = ROWS.map((row) => {
    const tiles = ALL_TILES.filter((i) => suitOf(i) === row.suit);
    const cells = tiles
      .map((i) => {
        const left = remaining[i];
        const isRedable = row.suit !== 'z' && (i % 9) + 1 === 5;
        const useRed = red && isRedable;
        return `<button class="pad-tile${left <= 0 ? ' is-out' : ''}" data-tile="${tileToString(i, useRed)}"
          title="${tileName(i)}（残り${left}）">${tileSvg(i, { red: useRed })}<span class="left">${left}</span></button>`;
      })
      .join('');
    return `<div class="pad-row"><span class="pad-label">${row.label}</span>${cells}</div>`;
  }).join('');

  return `
    <div class="pad-modes">${modeButtons}</div>
    ${meldBar}
    <div class="pad-toggles">
      <button class="toggle${red ? ' is-on' : ''}" data-toggle="red">赤</button>
      <button class="toggle${riichi ? ' is-on' : ''}" data-toggle="riichi">リーチ宣言牌</button>
      <button class="toggle" data-action="undo">取消</button>
    </div>
    <div class="pad-grid">${rows}</div>
  `;
}

function renderMeldBar(draft) {
  const seats = [
    { id: 1, label: '下家' },
    { id: 2, label: '対面' },
    { id: 3, label: '上家' },
    { id: 0, label: '自分' },
  ];
  const kinds = [
    { id: 'pon', label: 'ポン' },
    { id: 'chi', label: 'チー' },
    { id: 'minkan', label: '明槓' },
    { id: 'ankan', label: '暗槓' },
    { id: 'kakan', label: '加槓' },
  ];
  const seatButtons = seats
    .map((s) => `<button class="chip${draft.seat === s.id ? ' is-active' : ''}" data-meld-seat="${s.id}">${s.label}</button>`)
    .join('');
  const kindButtons = kinds
    .map((k) => `<button class="chip${draft.kind === k.id ? ' is-active' : ''}" data-meld-kind="${k.id}">${k.label}</button>`)
    .join('');
  const hint = draft.kind === 'chi'
    ? `牌を3枚タップ（${draft.tiles.length}/3）`
    : '牌を1枚タップ';
  return `<div class="meld-bar"><div>${seatButtons}</div><div>${kindButtons}</div><p class="hint">${hint}</p></div>`;
}
