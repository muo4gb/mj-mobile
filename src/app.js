// 画面と入力の配線

import { parseTile, ALL_TILES } from './core/tiles.js';
import { initialLog, replay, save, load, clear, nextRoundLog, SEATS } from './core/log.js';
import { analyze } from './core/suggest.js';
import { yakuCandidates } from './core/yaku.js';
import { renderHeader, renderAssist, renderOpponents, renderHand } from './ui/board.js';
import { renderPad } from './ui/pad.js';
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
const ui = { mode: 'haipai', red: false, riichi: false, meldDraft: { seat: 1, kind: 'pon', tiles: [] } };

const isStarted = () => log.some((e) => e.type === 'start');

function commit(next) {
  log = next;
  save(log);
  render();
}

function push(event) {
  commit([...log, event]);
}

function undo() {
  if (log.length <= 1) return;
  commit(log.slice(0, -1));
}

function render() {
  const state = replay(log);
  const started = isStarted();
  el.setup.hidden = started;
  el.board.hidden = !started;

  if (started) {
    el.setup.innerHTML = '';
    if (ui.mode === 'haipai') ui.mode = 'draw';
    const analysis = analyze(state);
    const yaku = yakuCandidates(state);
    el.header.innerHTML = renderHeader(state);
    el.assist.innerHTML = renderAssist(state, analysis, yaku);
    el.opponents.innerHTML = renderOpponents(state);
    el.hand.innerHTML = renderHand(state, analysis);
  } else {
    renderSetup(state);
  }

  const remaining = ALL_TILES.map((i) => 4 - state.visible[i]);
  el.pad.innerHTML = renderPad({ ...ui, setup: !started, remaining });
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

function editInit(patch) {
  const [init, ...rest] = log;
  commit([{ ...init, ...patch }, ...rest]);
}

// --- 入力 ---

function onPadTile(tileStr) {
  const init = log[0];
  switch (ui.mode) {
    case 'haipai':
      editInit({ hand: [...init.hand, tileStr] });
      break;
    case 'dora':
      if (!isStarted()) editInit({ doraIndicator: tileStr });
      else push({ type: 'dora', tile: tileStr }); // 槓ドラ
      break;
    case 'draw':
      push({ type: 'draw', tile: tileStr });
      break;
    case 'discard1':
    case 'discard2':
    case 'discard3': {
      const seat = Number(ui.mode.slice(-1));
      push({ type: 'discard', seat, tile: tileStr, riichi: ui.riichi });
      ui.riichi = false;
      break;
    }
    case 'meld':
      addMeldTile(tileStr);
      break;
    default:
      break;
  }
}

function addMeldTile(tileStr) {
  const draft = ui.meldDraft;
  const { kind, seat } = draft;
  if (kind === 'chi') {
    draft.tiles.push(tileStr);
    if (draft.tiles.length < 3) {
      render();
      return;
    }
  } else {
    const n = kind === 'pon' ? 3 : 4;
    draft.tiles = new Array(n).fill(tileStr);
  }
  push({ type: 'call', seat, kind, tiles: draft.tiles, from: null });
  draft.tiles = [];
}

function onDiscardFromHand(tileStr) {
  push({ type: 'discard', seat: SEATS.SELF, tile: tileStr, riichi: ui.riichi });
  ui.riichi = false;
}

function nextRound(renchan) {
  const state = replay(log);
  clear();
  ui.mode = 'haipai';
  commit(nextRoundLog(state, { renchan }));
}

// --- イベント ---

document.addEventListener('click', (ev) => {
  const target = ev.target.closest('[data-tile], [data-discard], [data-remove], [data-mode], [data-toggle], [data-action], [data-meld-seat], [data-meld-kind]');
  if (!target) return;

  if (target.dataset.tile) return onPadTile(target.dataset.tile), render();
  if (target.dataset.discard) return onDiscardFromHand(target.dataset.discard);
  if (target.dataset.remove) {
    const hand = [...log[0].hand];
    const at = hand.indexOf(target.dataset.remove);
    if (at >= 0) hand.splice(at, 1);
    return editInit({ hand });
  }
  if (target.dataset.mode) {
    ui.mode = target.dataset.mode;
    ui.meldDraft.tiles = [];
    return render();
  }
  if (target.dataset.meldSeat) {
    ui.meldDraft.seat = Number(target.dataset.meldSeat);
    ui.meldDraft.tiles = [];
    return render();
  }
  if (target.dataset.meldKind) {
    ui.meldDraft.kind = target.dataset.meldKind;
    ui.meldDraft.tiles = [];
    return render();
  }
  if (target.dataset.toggle) {
    ui[target.dataset.toggle] = !ui[target.dataset.toggle];
    return render();
  }

  switch (target.dataset.action) {
    case 'undo': return undo();
    case 'start': ui.mode = 'draw'; return push({ type: 'start' });
    case 'next-round': return document.getElementById('round-dialog').showModal();
    case 'renchan': document.getElementById('round-dialog').close(); return nextRound(true);
    case 'tsugi': document.getElementById('round-dialog').close(); return nextRound(false);
    case 'cancel-round': return document.getElementById('round-dialog').close();
    default: return undefined;
  }
});

document.addEventListener('change', (ev) => {
  const target = ev.target;
  if (target.dataset.init) {
    const value = target.type === 'number' ? Number(target.value) : target.value;
    editInit({ [target.dataset.init]: value });
  }
  if (target.dataset.rule) {
    const rules = { ...log[0].rules };
    rules[target.dataset.rule] = target.dataset.rule === 'kuitan' ? target.value === '1' : Number(target.value);
    editInit({ rules });
  }
});

render();
