// node test/shanten.test.mjs で実行（ビルド不要）
import { shanten, ukeire } from '../src/core/shanten.js';
import { countsOf, parseTile } from '../src/core/tiles.js';

let failed = 0;
const eq = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (期待 ${expected})`}`);
};

const t = (s) => s.match(/.{2}/g);

// 和了形
eq('和了 4面子1雀頭', shanten(countsOf(t('1m2m3m4m5m6m7m8m9m1p2p3p1s1s'))), -1);
eq('和了 七対子', shanten(countsOf(t('1m1m2m2m3m3m4m4m5m5m6m6m7m7m'))), -1);
eq('和了 国士十三面', shanten(countsOf(t('1m9m1p9p1s9s1z2z3z4z5z6z7z7z'))), -1);

// テンパイ
eq('テンパイ 単騎', shanten(countsOf(t('1m2m3m4m5m6m7m8m9m1p2p3p1s'))), 0);
eq('テンパイ 両面', shanten(countsOf(t('1m2m3m4m5m6m7m8m9m1p2p1s1s'))), 0);
eq('テンパイ 七対子', shanten(countsOf(t('1m1m2m2m3m3m4m4m5m5m6m6m7m'))), 0);
eq('テンパイ 国士13面待ち', shanten(countsOf(t('1m9m1p9p1s9s1z2z3z4z5z6z7z'))), 0);
// 5ブロックあるが雀頭がない形（14枚）は打牌して単騎テンパイに取れる
eq('5ブロック雀頭なし', shanten(countsOf(t('1m2m3m4m5m6m7m8m9m1p2p3p4p5p'))), 0);

// 1向聴以上
eq('1向聴', shanten(countsOf(t('1m2m3m4m5m6m7m8m9m1p2p1s2s'))), 1);
eq('配牌バラバラ', shanten(countsOf(t('1m4m7m2p5p8p3s6s9s1z2z3z4z'))), 6);
eq('国士1向聴', shanten(countsOf(t('1m9m1p9p1s9s1z2z3z4z5z6z3m'))), 1);

// 鳴きあり（meldCount）
eq('ポン1つ+2面子+雀頭+搭子=テンパイ', shanten(countsOf(t('1m2m3m4m5m6m1p2p1s1s')), 1), 0);
eq('鳴きありは七対子にならない', shanten(countsOf(t('1m1m2m2m3m3m4m4m5m5m')), 1) >= 0, true);

// 受け入れ
// 123m456m789m + 1p2p + 1s1s は 3p の単騎待ちではなく両面待ち（1s1s が雀頭）
// 1s を引いても 4面子+搭子で雀頭が無くなるため受け入れにならない
const u = ukeire(countsOf(t('1m2m3m4m5m6m7m8m9m1p2p1s1s')));
eq('受け入れ牌種は3pのみ', u.tiles.length, 1);
eq('受け入れは3p', u.tiles[0].index, parseTile('3p').index);
eq('受け入れ枚数', u.total, 4);

// 見えている牌を除いて残り枚数を数える
const visible = countsOf(t('3p3p'));
eq('3pが2枚見えていれば残り2枚', ukeire(countsOf(t('1m2m3m4m5m6m7m8m9m1p2p1s1s')), 0, visible).total, 2);
console.log('  受け入れ:', u.tiles.map((x) => `${x.index}:${x.remaining}枚`).join(' '));

console.log(failed === 0 ? '\n全て成功' : `\n${failed}件 失敗`);
process.exit(failed === 0 ? 0 : 1);
