// 画面上部（ヘッダー・アシスト・他家・手牌）の描画

import { tileName, parseTile, compareTiles, HONOR_NAMES } from '../core/tiles.js';
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

/** 自分が鳴ける／和了れるときの案内 */
export function renderCallAssist(call) {
  if (!call) return '';
  const tile = `<span class="mini">${tileSvg(call.index, { red: call.red })}</span>`;
  const seat = `<span class="seat-tag seat-${call.from}">${SEAT_NAMES[call.from]}</span>`;

  const ron = call.ron
    ? '<button class="call-opt is-ron" data-self-call="ron">ロン<small>和了形です</small></button>'
    : '';

  const opts = call.options.map((o, i) => {
    const sh = o.shanten < 0 ? '和了' : o.shanten === 0 ? 'テンパイ' : `${o.shanten}向聴`;
    const yaku = o.yaku.length ? o.yaku.map((y) => y.name).join('・') : '役候補なし';
    return `<button class="call-opt${o.yakuhai ? ' is-yakuhai' : ''}" data-self-call="${i}">
      ${o.label}<small>${sh} / ${yaku}</small></button>`;
  }).join('');

  return `
    <div class="call-assist${call.ron ? ' is-ron' : ''}">
      <div class="ca-head">${seat}の${tile}は${call.ron ? '和了れます' : '鳴けます'}</div>
      <div class="ca-options">${ron}${opts}
        <button class="call-opt is-skip" data-action="skip-call">見送る</button>
      </div>
      ${call.ron ? '<p class="ca-note">役なし・フリテンまでは見ていません</p>' : ''}
    </div>`;
}

export function renderAssist(state, analysis, yaku, { canDiscard = false } = {}) {
  if (!analysis.recommended) {
    return '<p class="empty">手牌を入力してください</p>';
  }
  const { recommended, safest, sameChoice, shanten } = analysis;

  const card = (title, r, extra) => {
    const tag = canDiscard ? 'button' : 'div';
    const action = canDiscard ? ` data-discard="${r.handTile}"` : '';
    return `
    <${tag} class="suggest-card${canDiscard ? ' is-tappable' : ''}"${action}>
      <span class="card-title">${title}</span>
      <span class="card-tile">${tileSvg(r.index, { red: r.handTile.startsWith('0') })}</span>
      <span class="card-name">${tileName(r.index)}</span>
      <span class="lv lv${r.safety.level}">${LEVEL_LABELS[r.safety.level]}</span>
      <span class="card-extra">${extra(r)}</span>
      ${canDiscard ? '<span class="card-tap">タップで打牌</span>' : ''}
    </${tag}>`;
  };

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
      <details class="opp seat-${seat}${riichi ? ' is-riichi' : ''}">
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
  const sorted = [...state.hand].sort(compareTiles); // 入力パッドと同じ並び

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
