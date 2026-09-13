// 牌の表現
//
// index: 0-8 萬子1-9 / 9-17 筒子1-9 / 18-26 索子1-9 / 27-33 東南西北白發中
// 文字表記: "1m".."9m" / "1p".."9p" / "1s".."9s" / "1z".."7z"
//           "0m" "0p" "0s" は赤五（index は 5 と同じ、red フラグが立つ）

export const TILE_KINDS = 34;
export const SUITS = ['m', 'p', 's', 'z'];

export const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
const KANSUJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 風牌の index（場風・自風の指定に使う） */
export const WIND = { E: 27, S: 28, W: 29, N: 30 };
/** 三元牌の index */
export const DRAGONS = [31, 32, 33];

export function indexOf(suit, num) {
  if (suit === 'z') return 27 + num - 1;
  return SUITS.indexOf(suit) * 9 + num - 1;
}

export function suitOf(index) {
  return index < 27 ? SUITS[Math.floor(index / 9)] : 'z';
}

/** 数牌なら1-9、字牌なら1-7（東南西北白發中の並び） */
export function numberOf(index) {
  return index < 27 ? (index % 9) + 1 : index - 26;
}

export const isHonor = (index) => index >= 27;
export const isTerminal = (index) => !isHonor(index) && (numberOf(index) === 1 || numberOf(index) === 9);
export const isSimple = (index) => !isHonor(index) && !isTerminal(index);
/** 幺九牌（老頭牌＋字牌） */
export const isYaochu = (index) => isHonor(index) || isTerminal(index);

/** "5m" / "0m"(赤5) / "1z" → { index, red } */
export function parseTile(str) {
  const m = /^([0-9])([mpsz])$/.exec(str);
  if (!m) throw new Error(`不正な牌表記: ${str}`);
  const num = Number(m[1]);
  const suit = m[2];
  if (suit === 'z') {
    if (num < 1 || num > 7) throw new Error(`不正な字牌: ${str}`);
    return { index: indexOf('z', num), red: false };
  }
  if (num === 0) return { index: indexOf(suit, 5), red: true };
  return { index: indexOf(suit, num), red: false };
}

export function tileToString(index, red = false) {
  const suit = suitOf(index);
  if (red && suit !== 'z' && numberOf(index) === 5) return `0${suit}`;
  return `${numberOf(index)}${suit}`;
}

/** 表示名（"五萬" "3筒" "東"） */
export function tileName(index) {
  const suit = suitOf(index);
  if (suit === 'z') return HONOR_NAMES[numberOf(index) - 1];
  if (suit === 'm') return `${KANSUJI[numberOf(index) - 1]}萬`;
  return `${numberOf(index)}${suit === 'p' ? '筒' : '索'}`;
}

export const emptyCounts = () => new Array(TILE_KINDS).fill(0);

/** 牌表記の配列 → counts[34] */
export function countsOf(tiles) {
  const counts = emptyCounts();
  for (const t of tiles) counts[parseTile(t).index] += 1;
  return counts;
}

export const totalOf = (counts) => counts.reduce((a, b) => a + b, 0);

/** ドラ表示牌 → ドラ本体（九→一、北→東、中→白 の送り） */
export function doraFromIndicator(index) {
  const num = numberOf(index);
  if (!isHonor(index)) return indexOf(suitOf(index), num === 9 ? 1 : num + 1);
  if (index <= WIND.N) return num === 4 ? WIND.E : index + 1; // 東南西北
  return index === 33 ? 31 : index + 1; // 白發中
}

/** 全34種を昇順で */
export const ALL_TILES = Array.from({ length: TILE_KINDS }, (_, i) => i);
