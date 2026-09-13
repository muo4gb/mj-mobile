// 牌のSVG（自作。MJの画像素材は使わない）
// 文字＋枠のみでシンプルに。小さく並べても読めることを優先する。

import { suitOf, numberOf, HONOR_NAMES } from '../core/tiles.js';

const KANSUJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_MARK = { m: '萬', p: '筒', s: '索' };

/**
 * @param {number} index 牌のindex
 * @param {{red?: boolean, dim?: boolean}} opts
 * @returns {string} SVG文字列
 */
export function tileSvg(index, { red = false, dim = false } = {}) {
  const suit = suitOf(index);
  const num = numberOf(index);
  const color = red ? 'var(--tile-red)' : 'var(--tile-ink)';

  let body;
  if (suit === 'z') {
    body = `<text x="20" y="36" class="t-honor" fill="${color}">${HONOR_NAMES[num - 1]}</text>`;
  } else {
    const head = suit === 'm' ? KANSUJI[num - 1] : String(num);
    body = `<text x="20" y="27" class="t-num" fill="${color}">${head}</text>`
      + `<text x="20" y="45" class="t-suit" fill="${color}">${SUIT_MARK[suit]}</text>`;
  }

  return `<svg viewBox="0 0 40 56" class="tile-svg${dim ? ' is-dim' : ''}" aria-hidden="true">`
    + '<rect x="1" y="1" width="38" height="54" rx="5" class="t-face"/>'
    + body
    + '</svg>';
}
