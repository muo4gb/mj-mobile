// 画面上部（ヘッダー・アシスト・他家・手牌）の描画

import { tileName, parseTile, HONOR_NAMES } from '../core/tiles.js';
import { SEAT_NAMES, SEATS } from '../core/log.js';
import { LEVEL_LABELS, warningsFor, safetyOf } from '../core/safety.js';
import { UNSUPPORTED_NOTE } from '../core/yaku.js';
import { tileSvg } from './tile-svg.js';

const OPPONENTS = [SEATS.SHIMOCHA, SEATS.TOIMEN, SEATS.KAMICHA];

export function renderHeader(state) {
  const bakaze = HONOR_NAMES[state.bakaze - 27];
  const jikaze = HONOR_NAMES[state.jikaze - 27];
  const dora = state.dora.map((i) => `<span class="mini">${tileSvg(i)}</span>`).join('');
  const indicators = state.doraIndicators
    .map((t) => `<span class="mini is-indicator">${tileSvg(parseTile(t).index, { red: parseTile(t).red })}</span>`)
    .join('');
  const isDealer = state.dealer === SEATS.SELF;
  return `
    <div class="head-line">
      <strong>${bakaze}${state.kyoku}局 ${state.honba}本場</strong>
      <span class="tag">自風 ${jikaze}${isDealer ? '（親）' : ''}</span>
      <span class="tag">${state.turn}巡目</span>
      <button class="ghost" data-action="menu">メニュー</button>
    </div>
    <div class="head-line">
      <span class="tag">表示牌 ${indicators || '—'}</span>
      <span class="tag">ドラ ${dora || '—'}</span>
      <span class="tag">赤${state.rules.aka} / 喰タン${state.rules.kuitan ? 'あり' : 'なし'}</span>
    </div>
  `;
}

export function renderAssist(state, analysis, yaku) {
  if (!analysis.recommended) {
    return '<p class="empty">手牌を入力してください</p>';
  }
  const { recommended, safest, sameChoice, shanten } = analysis;

  const card = (title, r, extra) => `
    <div class="suggest-card">
      <span class="card-title">${title}</span>
      <span class="card-tile">${tileSvg(r.index, { red: r.tile.startsWith('0') })}</span>
      <span class="card-name">${tileName(r.index)}</span>
      <span class="lv lv${r.safety.level}">${LEVEL_LABELS[r.safety.level]}</span>
      <span class="card-extra">${extra(r)}</span>
    </div>`;

  const cards = sameChoice
    ? card('推奨＝最安全', recommended, (r) => `受け入れ ${r.ukeire}枚`)
    : card('推奨打牌', recommended, (r) => `受け入れ ${r.ukeire}枚`)
      + card('最安全牌', safest, (r) => `現物 ${r.safety.genbutsuCount}家`);

  const shantenLabel = shanten < 0 ? '和了' : shanten === 0 ? 'テンパイ' : `${shanten}向聴`;
  const yakuList = yaku.length
    ? yaku.map((y) => `<li>${y.name}<span>${y.shanten <= 0 ? (y.note || '成立') : `${y.shanten}向聴`}</span></li>`).join('')
    : '<li class="empty">候補なし</li>';

  return `
    <div class="suggest">${cards}</div>
    <div class="yaku">
      <div class="yaku-head"><span class="shanten">${shantenLabel}</span><span class="note">${UNSUPPORTED_NOTE}</span></div>
      <ul>${yakuList}</ul>
    </div>
  `;
}

export function renderOpponents(state) {
  return OPPONENTS.map((seat) => {
    const flags = warningsFor(state, seat)
      .map((f) => `<span class="flag flag-${f.kind}">${f.label}</span>`)
      .join('');
    const melds = state.melds[seat]
      .map((m) => `<span class="meld">${m.tiles.map((t) => `<span class="mini">${tileSvg(parseTile(t).index, { red: parseTile(t).red })}</span>`).join('')}</span>`)
      .join('');
    const discards = state.discards[seat]
      .map((d) => `<span class="mini${d.riichi ? ' is-riichi' : ''}">${tileSvg(d.index, { red: d.red })}</span>`)
      .join('');
    const riichi = state.riichiSeq[seat] !== null;
    return `
      <details class="opp${riichi ? ' is-riichi' : ''}">
        <summary>
          <span class="opp-name">${SEAT_NAMES[seat]}</span>
          ${flags || '<span class="flag flag-none">情報なし</span>'}
          <span class="opp-count">捨${state.discards[seat].length}</span>
        </summary>
        <div class="opp-body">
          ${melds ? `<div class="row"><span class="row-label">鳴き</span>${melds}</div>` : ''}
          <div class="row"><span class="row-label">捨て牌</span>${discards || '—'}</div>
        </div>
      </details>
    `;
  }).join('');
}

export function renderHand(state, analysis) {
  const byIndex = new Map(analysis.results.map((r) => [r.index, r]));
  const sorted = [...state.hand].sort((a, b) => {
    const pa = parseTile(a);
    const pb = parseTile(b);
    return pa.index - pb.index || Number(pa.red) - Number(pb.red);
  });

  const tiles = sorted.map((t) => {
    const { index, red } = parseTile(t);
    const r = byIndex.get(index);
    const dots = OPPONENTS.map((seat) => {
      const s = safetyOf(state, seat, index);
      return `<i class="dot lv${s.level}" title="${SEAT_NAMES[seat]}: ${s.reason}"></i>`;
    }).join('');
    const level = r ? r.safety.level : 5;
    return `
      <button class="hand-tile" data-discard="${t}" title="${tileName(index)}">
        ${tileSvg(index, { red })}
        <span class="bar lv${level}"></span>
        <span class="dots">${dots}</span>
      </button>`;
  }).join('');

  const melds = state.melds[SEATS.SELF]
    .map((m) => `<span class="meld">${m.tiles.map((t) => `<span class="mini">${tileSvg(parseTile(t).index, { red: parseTile(t).red })}</span>`).join('')}</span>`)
    .join('');

  return `<div class="hand">${tiles}</div>${melds ? `<div class="hand-melds">${melds}</div>` : ''}`;
}
