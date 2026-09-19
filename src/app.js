// 画面と入力の配線
//
// 対局中は「次の入力」（state.expect）に向かって牌をタップするだけで進む。
// 順番どおりでない入力は手動で入力先を指定する（1回で自動送りに戻る）。

import { parseTile, tileToString, compareTiles, doraFromIndicator, ALL_TILES } from './core/tiles.js';
import { initialLog, replay, save, load, clear, nextRoundLog, restartRoundLog, resetAllLog, lastDiscard, SEATS } from './core/log.js';
import { analyze } from './core/suggest.js';
import { yakuCandidates } from './core/yaku.js';
import { selfCallOptions, pickFromHand } from './core/call.js';
import { renderHeader, renderAssist, renderCallAssist, renderOpponents, renderHand } from './ui/board.js';
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
const ui = {
  setupStep: 1,
  override: null,
  red: false,
  riichi: false,
  meldDraft: { kind: 'ankan' },
  quickCall: null,
  notice: null,
  menuConfirm: null,
  skippedCallSeq: null,
};

const isStarted = () => log.some((e) => e.type === 'start');

function commit(next) {
  log = next;
  save(log);
  // 入力が変われば状況も変わるので、鳴きの見送りは引き継がない
  ui.skippedCallSeq = null;
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
    const call = currentCall(state);
    const canDiscard = !ui.override && state.expect.kind === 'discard' && state.expect.seat === SEATS.SELF;
    el.header.innerHTML = renderHeader(state);
    el.assist.innerHTML = renderCallAssist(call) + renderAssist(state, analysis, yakuCandidates(state), { canDiscard });
    el.opponents.innerHTML = renderOpponents(state);
    el.hand.innerHTML = renderHand(state, analysis);
  } else {
    renderSetup(state);
  }

  const padHtml = renderPad({
    ...ui,
    state,
    setup: !started,
    handCount: log[0].hand.length,
    remaining: ALL_TILES.map((i) => 4 - state.visible[i]),
  });
  el.pad.hidden = padHtml === '';
  el.pad.innerHTML = padHtml;
  ui.notice = null;
}

// --- 局開始時の設定（4.1） ---
//
// 局の切れ目にしか使わないので、1画面に詰め込まず3ステップに分ける。
// 「次の局へ」で来たときは①が埋まっているので、確認して進むだけで済む。

const STEPS = [
  { id: 1, label: '局' },
  { id: 2, label: 'ドラ' },
  { id: 3, label: '配牌' },
];

const WINDS = [
  { value: '1z', label: '東' },
  { value: '2z', label: '南' },
  { value: '3z', label: '西' },
  { value: '4z', label: '北' },
];

/** 中断した続きから始められるよう、入力済みの内容からステップを決める */
function initialSetupStep() {
  const init = log[0];
  if (init.hand.length > 0 || init.doraIndicator) return 3;
  return 1;
}

const choice = (group, options, current, attr = 'data-set') => `
  <div class="choice-row" data-group="${group}">
    ${options.map((o) => `<button class="choice${String(o.value) === String(current) ? ' is-active' : ''}"
      ${attr}="${group}" data-value="${o.value}">${o.label}</button>`).join('')}
  </div>`;

function renderSetup(state) {
  const init = log[0];
  const need = state.dealer === SEATS.SELF ? 14 : 13;
  const step = ui.setupStep;

  const tabs = STEPS.map((st) => `
    <button class="step${st.id === step ? ' is-active' : ''}${st.id < step ? ' is-done' : ''}" data-step="${st.id}">
      <span class="step-no">${st.id}</span>${st.label}
    </button>`).join('');

  el.setup.innerHTML = `
    <div class="setup-head">
      <span class="setup-title">局の設定</span>
      <button class="ghost" data-action="menu">メニュー</button>
    </div>
    <div class="steps">${tabs}</div>
    ${[renderStepRound, renderStepDora, renderStepHaipai][step - 1](init, state, need)}`;
}

function renderStepRound(init, state) {
  const bakaze = WINDS.find((w) => w.value === init.bakaze).label;
  const jikaze = WINDS.find((w) => w.value === init.jikaze).label;
  const isDealer = state.dealer === SEATS.SELF;

  return `
    <p class="setup-lead">この局の設定を確認してください</p>
    <div class="big-summary">
      <strong>${bakaze}${init.kyoku}局 ${init.honba}本場</strong>
      <span>自風 ${jikaze}${isDealer ? '（親）' : '（子）'}</span>
    </div>
    <div class="field"><span class="field-label">自風</span>${choice('jikaze', WINDS, init.jikaze)}</div>
    <div class="field"><span class="field-label">場風</span>${choice('bakaze', WINDS, init.bakaze)}</div>
    <div class="field"><span class="field-label">局</span>${choice('kyoku', [1, 2, 3, 4].map((n) => ({ value: n, label: `${n}局` })), init.kyoku)}</div>
    <div class="field">
      <span class="field-label">本場</span>
      <div class="stepper" data-group="honba">
        <button class="choice" data-set="honba" data-value="${Math.max(0, init.honba - 1)}">−</button>
        <span class="stepper-value">${init.honba}</span>
        <button class="choice" data-set="honba" data-value="${init.honba + 1}">＋</button>
      </div>
    </div>
    <hr class="setup-hr">
    <div class="field"><span class="field-label">赤ドラ</span>${choice('aka', [0, 3, 4].map((n) => ({ value: n, label: `${n}枚` })), init.rules.aka, 'data-set-rule')}</div>
    <div class="field"><span class="field-label">喰いタン</span>${choice('kuitan', [{ value: 1, label: 'あり' }, { value: 0, label: 'なし' }], init.rules.kuitan ? 1 : 0, 'data-set-rule')}</div>
    <div class="setup-nav">
      <span></span>
      <button class="primary" data-step="2">次へ：ドラ表示牌</button>
    </div>`;
}

function renderStepDora(init) {
  const chosen = init.doraIndicator ? parseTile(init.doraIndicator) : null;
  const preview = chosen
    ? `<span class="dora-cell"><span class="dora-cap">表示牌</span>${tileSvg(chosen.index, { red: chosen.red })}</span>
       <span class="dora-arrow">→</span>
       <span class="dora-cell"><span class="dora-cap">ドラ</span>${tileSvg(doraFromIndicator(chosen.index))}</span>`
    : '<span class="empty">下のパッドから選んでください</span>';

  return `
    <p class="setup-lead">ドラ表示牌を選んでください</p>
    <div class="dora-preview">${preview}</div>
    <div class="setup-nav">
      <button class="ghost" data-step="1">戻る</button>
      <button class="primary" data-step="3"${init.doraIndicator ? '' : ' disabled'}>次へ：配牌</button>
    </div>`;
}

function renderStepHaipai(init, state, need) {
  const left = need - init.hand.length;
  // ステップタブで飛んできた場合、ドラが未選択のことがある
  const ready = left === 0 && Boolean(init.doraIndicator);
  // 手牌と見比べやすいよう並べて出す（ログ上の順番は入力順のままでよい）
  const tiles = [...init.hand]
    .sort(compareTiles)
    .map((t) => {
      const { index, red } = parseTile(t);
      return `<button class="hand-tile" data-remove="${t}">${tileSvg(index, { red })}</button>`;
    })
    .join('');
  const emptySlots = Array.from({ length: Math.max(0, left) },
    () => '<span class="hand-tile is-empty" aria-hidden="true"></span>').join('');

  return `
    <p class="setup-lead">配牌を入力してください${state.dealer === SEATS.SELF ? '（親なので14枚）' : ''}</p>
    <div class="haipai-progress">
      <strong>${init.hand.length}</strong><span class="of">/ ${need}</span>
      <span class="left-label">${left > 0 ? `あと${left}枚` : '入力できました'}</span>
    </div>
    <div class="hand">${tiles}${emptySlots}</div>
    ${tiles ? '' : '<p class="empty">下のパッドからタップして入力。入れた牌をタップすると消せます</p>'}
    ${init.doraIndicator ? '' : '<p class="setup-warn">ドラ表示牌が未選択です</p>'}
    <div class="setup-nav">
      <button class="ghost" data-step="2">戻る</button>
      <button class="primary" data-action="start"${ready ? '' : ' disabled'}>開始</button>
    </div>`;
}

const editInit = (patch) => {
  const [init, ...rest] = log;
  commit([{ ...init, ...patch }, ...rest]);
};

// --- 入力 ---

function onPadTile(tileStr) {
  if (!isStarted()) {
    if (ui.setupStep === 2) {
      ui.setupStep = 3; // ドラを選んだら配牌へ進む
      editInit({ doraIndicator: tileStr });
    } else if (ui.setupStep === 3) {
      editInit({ hand: [...log[0].hand, tileStr] });
    }
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

/** 見送った鳴きは、その捨て牌が変わるまで出さない */
function currentCall(state) {
  const call = selfCallOptions(state);
  if (!call || call.seq === ui.skippedCallSeq) return null;
  return call;
}

/** アシストから自分の鳴きを記録する */
function applySelfCall(key) {
  const state = replay(log);
  const call = selfCallOptions(state);
  if (!call) return;
  if (key === 'ron') {
    ui.skippedCallSeq = call.seq; // 和了は記録しない。局の進行はメニューから
    return render();
  }
  const opt = call.options[Number(key)];
  if (!opt) return;
  ui.quickCall = null;
  push({ type: 'call', seat: SEATS.SELF, kind: opt.kind, tiles: opt.tiles, from: call.from });
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

/** 局を切り替える。入力中の状態も一緒に畳む。 */
function startFresh(makeLog) {
  const state = replay(log);
  clear();
  Object.assign(ui, {
    setupStep: 1, override: null, riichi: false, quickCall: null, menuConfirm: null,
  });
  menu().close();
  commit(makeLog(state));
}

// --- メニュー ---

const menu = () => document.getElementById('menu-dialog');

const CONFIRMS = {
  restart: {
    title: 'この局をやり直しますか？',
    note: '配牌・ドラ・全員の捨て牌を消して設定画面に戻ります。場風・自風・局・本場・ルールはそのままです。',
    yes: 'やり直す',
    run: () => startFresh(restartRoundLog),
  },
  reset: {
    title: '全部消して最初からにしますか？',
    note: '東1局0本場の初期状態に戻ります。ルール設定（赤ドラ・喰いタン）は残します。',
    yes: '最初から',
    run: () => startFresh(resetAllLog),
  },
};

function renderMenu() {
  const body = document.getElementById('menu-body');
  const confirm = CONFIRMS[ui.menuConfirm];
  if (confirm) {
    body.innerHTML = `
      <p class="dialog-title">${confirm.title}</p>
      <p class="dialog-note">${confirm.note}</p>
      <div class="dialog-actions">
        <button class="warn" data-action="confirm-yes">${confirm.yes}</button>
        <button class="ghost" data-action="menu-back">やめる</button>
      </div>`;
    return;
  }
  const progress = isStarted() ? `
    <div class="dialog-group">
      <span class="dialog-label">局の進行</span>
      <div class="dialog-actions">
        <button class="primary" data-action="renchan">親継続（本場+1）</button>
        <button class="primary" data-action="tsugi">次局へ</button>
      </div>
    </div>` : '';

  body.innerHTML = `
    <p class="dialog-title">メニュー</p>
    ${progress}
    <div class="dialog-group">
      <span class="dialog-label">リセット</span>
      <div class="dialog-actions">
        <button class="warn" data-action="ask-restart">この局をやり直す</button>
        <button class="warn" data-action="ask-reset">全部消して最初から</button>
      </div>
    </div>
    <div class="dialog-actions"><button class="ghost" data-action="close-menu">閉じる</button></div>`;
}

function openMenu(confirmKey = null) {
  ui.menuConfirm = confirmKey;
  renderMenu();
  if (!menu().open) menu().showModal();
}

// --- イベント ---

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-tile], [data-discard], [data-remove], [data-step], [data-set], [data-set-rule], [data-override], [data-self-call], [data-toggle], [data-action], [data-call-seat], [data-call-kind], [data-call-chi], [data-meld-kind]');
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
  if (d.step) {
    ui.setupStep = Number(d.step);
    return render();
  }
  if (d.set) {
    const value = ['kyoku', 'honba'].includes(d.set) ? Number(d.value) : d.value;
    return editInit({ [d.set]: value });
  }
  if (d.setRule) {
    const rules = { ...log[0].rules };
    rules[d.setRule] = d.setRule === 'kuitan' ? d.value === '1' : Number(d.value);
    return editInit({ rules });
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
  if (d.selfCall) return applySelfCall(d.selfCall);
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
    case 'skip-call': {
      ui.skippedCallSeq = lastDiscard(replay(log))?.seq ?? null;
      return render();
    }
    case 'undo': return undo();
    case 'undo-haipai': {
      const hand = log[0].hand.slice(0, -1);
      return editInit({ hand });
    }
    case 'start': return push({ type: 'start' });
    case 'menu': return openMenu();
    case 'close-menu': return menu().close();
    case 'menu-back': return openMenu();
    case 'ask-restart': return openMenu('restart');
    case 'ask-reset': return openMenu('reset');
    case 'confirm-yes': return CONFIRMS[ui.menuConfirm].run();
    case 'renchan': return startFresh((st) => nextRoundLog(st, { renchan: true }));
    case 'tsugi': return startFresh((st) => nextRoundLog(st, { renchan: false }));
    default: return undefined;
  }
});

ui.setupStep = initialSetupStep();
render();
