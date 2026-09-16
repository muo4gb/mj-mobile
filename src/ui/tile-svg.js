// 牌のSVG（自作。MJの画像素材は使わない）
//
// 萬子は漢数字＋萬、筒子は丸の数、索子は竹の本数、字牌は文字。
// 実際の牌と同じ読み方ができるようにする。
// 色は牌種ごとに変えて、ひと目で種類が分かるようにする（萬=黒 索=緑 筒=青）。

import { suitOf, numberOf, HONOR_NAMES } from '../core/tiles.js';

const KANSUJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 絵柄を置く範囲 */
const FACE = { x: 7, y: 9, w: 26, h: 38 };
const px = (u) => FACE.x + u * FACE.w;
const py = (v) => FACE.y + v * FACE.h;

/** 筒子の丸の配置（単位座標）と半径 */
const PIN = {
  1: { r: 8.5, at: [[0.5, 0.5]] },
  2: { r: 5.6, at: [[0.5, 0.17], [0.5, 0.83]] },
  3: { r: 5.0, at: [[0.14, 0.14], [0.5, 0.5], [0.86, 0.86]] },
  4: { r: 5.2, at: [[0.24, 0.2], [0.76, 0.2], [0.24, 0.8], [0.76, 0.8]] },
  5: { r: 4.6, at: [[0.2, 0.16], [0.8, 0.16], [0.5, 0.5], [0.2, 0.84], [0.8, 0.84]] },
  6: { r: 4.4, at: [[0.24, 0.12], [0.76, 0.12], [0.24, 0.5], [0.76, 0.5], [0.24, 0.88], [0.76, 0.88]] },
  7: { r: 3.9, at: [[0.16, 0.08], [0.5, 0.21], [0.84, 0.34], [0.24, 0.63], [0.76, 0.63], [0.24, 0.9], [0.76, 0.9]] },
  8: { r: 3.9, at: [[0.24, 0.1], [0.76, 0.1], [0.24, 0.37], [0.76, 0.37], [0.24, 0.63], [0.76, 0.63], [0.24, 0.9], [0.76, 0.9]] },
  9: { r: 3.9, at: [[0.15, 0.1], [0.5, 0.1], [0.85, 0.1], [0.15, 0.5], [0.5, 0.5], [0.85, 0.5], [0.15, 0.9], [0.5, 0.9], [0.85, 0.9]] },
};

/** 索子の竹の並び（各行の本数） */
const SOU_ROWS = {
  2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 1, 2],
  6: [3, 3], 7: [1, 3, 3], 8: [4, 4], 9: [3, 3, 3],
};

function pinFace(num, color) {
  const { r, at } = PIN[num];
  if (num === 1) {
    // 一筒は同心円にして、他の丸と見分けやすくする
    return `<circle cx="${px(0.5)}" cy="${py(0.5)}" r="${r}" fill="none" stroke="${color}" stroke-width="2.4"/>`
      + `<circle cx="${px(0.5)}" cy="${py(0.5)}" r="${r - 4.4}" fill="${color}"/>`;
  }
  return at.map(([u, v]) => `<circle cx="${px(u)}" cy="${py(v)}" r="${r}" fill="${color}"/>`).join('');
}

/** 竹1本。中央に節を入れる。 */
function bamboo(cx, cy, w, h, color) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2.4}" fill="${color}"/>`
    + `<rect x="${x - 0.7}" y="${cy - 0.6}" width="${w + 1.4}" height="1.2" fill="var(--tile-face)"/>`;
}

function souFace(num, color) {
  if (num === 1) {
    // 一索は鳥。細部は捨てて輪郭だけにする
    const cx = px(0.5);
    return `<ellipse cx="${cx}" cy="${py(0.68)}" rx="6.4" ry="9" fill="${color}"/>`
      + `<circle cx="${cx}" cy="${py(0.24)}" r="4.6" fill="${color}"/>`
      + `<path d="M${cx + 4} ${py(0.22)} l5 2.2 -5 2.2 z" fill="${color}"/>`
      + `<path d="M${cx - 1.5} ${py(0.95)} l-5.5 5 3.5 -0.4 z" fill="${color}"/>`
      + `<path d="M${cx + 1.5} ${py(0.95)} l5.5 5 -3.5 -0.4 z" fill="${color}"/>`;
  }
  const rows = SOU_ROWS[num];
  const rowH = FACE.h / rows.length;
  // 丸と見間違えないよう、縦長を保つ
  const w = Math.min(3.6, (FACE.w / Math.max(...rows)) * 0.45);
  const h = Math.max(rowH * 0.84, w * 2.6);
  return rows.map((count, ri) => {
    const cy = FACE.y + rowH * (ri + 0.5);
    return Array.from({ length: count }, (_, ci) => {
      const u = count === 1 ? 0.5 : 0.5 + (ci - (count - 1) / 2) / (count - 1) * (count === 2 ? 0.44 : 0.78);
      return bamboo(px(u), cy, w, h, color);
    }).join('');
  }).join('');
}

/**
 * @param {number} index 牌のindex
 * @param {{red?: boolean, dim?: boolean}} opts
 * @returns {string} SVG文字列
 */
export function tileSvg(index, { red = false, dim = false } = {}) {
  const suit = suitOf(index);
  const num = numberOf(index);
  const color = red ? 'var(--tile-red)' : `var(--ink-${suit})`;

  let body;
  if (suit === 'z') {
    body = `<text x="20" y="37" class="t-honor" fill="${color}">${HONOR_NAMES[num - 1]}</text>`;
  } else if (suit === 'm') {
    body = `<text x="20" y="27" class="t-num" fill="${color}">${KANSUJI[num - 1]}</text>`
      + `<text x="20" y="45" class="t-suit" fill="${color}">萬</text>`;
  } else {
    body = suit === 'p' ? pinFace(num, color) : souFace(num, color);
  }

  return `<svg viewBox="0 0 40 56" class="tile-svg${dim ? ' is-dim' : ''}" aria-hidden="true">`
    + '<rect x="1" y="1" width="38" height="54" rx="5" class="t-face"/>'
    + body
    + '</svg>';
}
