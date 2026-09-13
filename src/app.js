// 画面と入力の配線
//
// 対局中は「次の入力」（state.expect）に向かって牌をタップするだけで進む。
// 順番どおりでない入力は手動で入力先を指定する（1回で自動送りに戻る）。

import { parseTile, tileToString, ALL_TILES } from './core/tiles.js';
import { initialLog, replay, save, load, clear, nextRoundLog, SEATS } from './core/log.js';
import { analyze } from './core/suggest.js';
import { yakuCandidates } from './core/yaku.js';
import { renderHeader, renderAssist, renderOpponents, renderHand } from './ui/board.js';
import { renderPad, lastDiscard } from './ui/pad.js';
import { tileSvg } from './ui/tile-svg.js';

const el = {
  header: document.getElementById('header'),
  assist: document.getElementById('assist'),
  opponents: document.getElementById('opponents'),
  hand: document.getElementById('hand'),
  pad: document.getElementById('pad'),
  setup: document.getElementById('setup'),
  board: document.getElementById('board'),
};

let log = load() ?? initialLog();
const ui = {
  setupMode: 'haipai',
  override: null,
  red: false,
  riichi: false,
  meldDraft: { kind: 'ankan' },
  quickCall: null,
  notice: null,
};

const isStarted = () => log.some((e) => e.type === 'start');

function commit(next) {
  log = next;
  save(log);
  render();
}

const push = (event) => commit([...log, event]);

function undo() {
  if (log.length <= 1) return;
  ui.quickCall = null;
  commit(log.slice(0, -1));
}

function render() {
  const state = replay(log);
  const started = isStarted();
  el.setup.hidden = started;
  el.board.hidden = !started;

  if (started) {
    el.setup.innerHTML = '';
    const analysis = analyze(state);
    el.header.innerHTML = renderHeader(state);
    el.assist.innerHTML = renderAssist(state, analysis, yakuCandidates(state));
    el.opponents.innerHTML = renderOpponents(state);
    el.hand.innerHTML = renderHand(state, analysis);
  } else {
    renderSetup(state);
  }

  el.pad.innerHTML = renderPad({
    ...ui,
    state,
    setup: !started,
    remaining: ALL_TILES.map((i) => 4 - state.visible[i]),
  });
  ui.notice = null;
}

// --- 局開始時の設定（4.1） ---

function renderSetup(state) {
  const init = log[0];
  const handTiles = init.hand
    .map((t) => {
      const { index, red } = parseTile(t);
      return `<button class="hand-tile" data-remove="${t}">${tileSvg(index, { red })}</button>`;
    })
    .join('');
  const need = state.dealer === SEATS.SELF ? 14 : 13;
  const windOptions = (selected) => ['東', '南', '西', '北']
    .map((w, i) => `<option value="${i + 1}z"${selected === `${i + 1}z` ? ' selected' : ''}>${w}</option>`)
    .join('');

  el.setup.innerHTML = `
    <h1>局の設定</h1>
    <div class="setup-row">
      <label>場風 <select data-init="bakaze">${windOptions(init.bakaze)}</select></label>
      <label>自風 <select data-init="jikaze">${windOptions(init.jikaze)}</select></label>
      <label>局 <input type="number" min="1" max="4" value="${init.kyoku}" data-init="kyoku"></label>
      <label>本場 <input type="number" min="0" value="${init.honba}" data-init="honba"></label>
    </div>
    <div class="setup-row">
      <label>赤ドラ
        <select data-rule="aka">
          ${[0, 3, 4].map((n) => `<option value="${n}"${init.rules.aka === n ? ' selected' : ''}>${n}枚</option>`).join('')}
        </select>
      </label>
      <label>喰いタン
        <select data-rule="kuitan">
          <option value="1"${init.rules.kuitan ? ' selected' : ''}>あり</option>
          <option value="0"${!init.rules.kuitan ? ' selected' : ''}>なし</option>
        </select>
      </label>
    </div>
    <div class="setup-row">
      <span class="tag">ドラ表示牌 ${init.doraIndicator ? tileSvg(parseTile(init.doraIndicator).index, { red: parseTile(init.doraIndicator).red }) : '未入力'}</span>
      <span class="tag">配牌 ${init.hand.length} / ${need}</span>
    </div>
    <div class="hand">${handTiles || '<span class="empty">下のパッドから配牌を入力（牌をタップで削除）</span>'}</div>
    <button class="primary" data-action="start"${init.hand.length === need && init.doraIndicator ? '' : ' disabled'}>開始</button>
  `;
}

const editInit = (patch) => {
  const [init, ...rest] = log;
  commit([{ ...init, ...patch }, ...rest]);
};

// --- 入力 ---

function onPadTile(tileStr) {
  if (!isStarted()) {
    if (ui.setupMode === 'dora') editInit({ doraIndicator: tileStr });
    else editInit({ hand: [...log[0].hand, tileStr] });
    return;
  }

  const state = replay(log);
  const target = ui.override;
  ui.override = null;
  ui.quickCall = null;

  switch (target) {
    case 'dora': return push({ type: 'dora', tile: tileStr });
    case 'draw': return push({ type: 'draw', tile: tileStr });
    case 'discard1':
    case 'discard2':
      return pushDiscard(Number(target.slice(-1)), tileStr);
    case 'discard3':
      return pushDiscard(3, tileStr);
    case 'meld': return pushSelfKan(state, tileStr);
    default: return applyExpected(state, tileStr);
  }
}

/** 打順から決まる「次の入力」に当てはめる */
function applyExpected(state, tileStr) {
  const { kind, seat } = state.expect;
  if (kind === 'draw') return push({ type: 'draw', tile: tileStr });
  if (seat !== SEATS.SELF) return pushDiscard(seat, tileStr);

  // 自分の打牌。パッドからも切れるようにしておくとツモ切りが2タップで済む
  if (state.hand.includes(tileStr)) return pushDiscard(SEATS.SELF, tileStr);
  ui.notice = '手牌にありません';
  return render();
}

function pushDiscard(seat, tileStr) {
  const riichi = ui.riichi;
  ui.riichi = false;
  push({ type: 'discard', seat, tile: tileStr, riichi });
}

function pushSelfKan(state, tileStr) {
  const kind = ui.meldDraft.kind;
  const tiles = kind === 'kakan' ? [tileStr] : [tileStr, tileStr, tileStr, tileStr];
  push({ type: 'call', seat: SEATS.SELF, kind, tiles, from: null });
}

/** 直前の捨て牌への鳴き */
function applyQuickCall(kind, chi) {
  const state = replay(log);
  const last = lastDiscard(state);
  if (!last || !ui.quickCall) return;
  const seat = ui.quickCall.seat;
  ui.quickCall = null;

  const discarded = tileToString(last.index, last.red);
  let tiles;
  if (chi) {
    tiles = [...chi.map((i) => tileToString(i)), discarded]
      .sort((a, b) => parseTile(a).index - parseTile(b).index);
  } else {
    const plain = tileToString(last.index);
    tiles = kind === 'pon' ? [discarded, plain, plain] : [discarded, plain, plain, plain];
  }
  push({ type: 'call', seat, kind: chi ? 'chi' : kind, tiles, from: last.seat });
}

function nextRound(renchan) {
  const state = replay(log);
  clear();
  Object.assign(ui, { setupMode: 'haipai', override: null, riichi: false, quickCall: null });
  commit(nextRoundLog(state, { renchan }));
}

// --- イベント ---

const DIALOG = () => document.getElementById('round-dialog');

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-tile], [data-discard], [data-remove], [data-setup-mode], [data-override], [data-toggle], [data-action], [data-call-seat], [data-call-kind], [data-call-chi], [data-meld-kind]');
  if (!t) return;
  const d = t.dataset;

  if (d.tile) return onPadTile(d.tile);
  if (d.discard) {
    ui.quickCall = null;
    return pushDiscard(SEATS.SELF, d.discard);
  }
  if (d.remove) {
    const hand = [...log[0].hand];
    const at = hand.indexOf(d.remove);
    if (at >= 0) hand.splice(at, 1);
    return editInit({ hand });
  }
  if (d.setupMode) {
    ui.setupMode = d.setupMode;
    return render();
  }
  if (d.override) {
    ui.override = ui.override === d.override ? null : d.override;
    ui.quickCall = null;
    return render();
  }
  if (d.callSeat) {
    ui.quickCall = d.callSeat === 'cancel' ? null : { seat: Number(d.callSeat) };
    return render();
  }
  if (d.callKind) return applyQuickCall(d.callKind, null);
  if (d.callChi) return applyQuickCall('chi', d.callChi.split(',').map(Number));
  if (d.meldKind) {
    ui.meldDraft.kind = d.meldKind;
    return render();
  }
  if (d.toggle) {
    ui[d.toggle] = !ui[d.toggle];
    return render();
  }

  switch (d.action) {
    case 'undo': return undo();
    case 'start': return push({ type: 'start' });
    case 'next-round': return DIALOG().showModal();
    case 'renchan': DIALOG().close(); return nextRound(true);
    case 'tsugi': DIALOG().close(); return nextRound(false);
    case 'cancel-round': return DIALOG().close();
    default: return undefined;
  }
});

document.addEventListener('change', (ev) => {
  const d = ev.target.dataset;
  if (d.init) {
    editInit({ [d.init]: ev.target.type === 'number' ? Number(ev.target.value) : ev.target.value });
  }
  if (d.rule) {
    const rules = { ...log[0].rules };
    rules[d.rule] = d.rule === 'kuitan' ? ev.target.value === '1' : Number(ev.target.value);
    editInit({ rules });
  }
});

render();
