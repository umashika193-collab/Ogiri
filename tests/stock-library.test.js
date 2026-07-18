'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const stock=require('../stock-library.js');

const commonsPage=(id,title='File:Fishing vessel.jpg',extra={})=>({pageid:id,title,imageinfo:[{mime:extra.mime||'image/jpeg',mediatype:extra.mediatype||'BITMAP',thumburl:`https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${id}.jpg/900px-${id}.jpg`,descriptionurl:`https://commons.wikimedia.org/wiki/File:${id}.jpg`,extmetadata:{LicenseShortName:{value:extra.license||'CC BY-SA 4.0'},Artist:{value:extra.creator||'<a href="/wiki/User:Example">撮影者</a>'},ImageDescription:{value:extra.description||'Fishing boat in a harbor, photograph'},Categories:{value:extra.categories||'Photographs of fishing boats'}}}]});

test('オンライン素材は4回ごとに同梱3・Commons1を順不同で巡回する',()=>{
  assert.equal(stock.sourceMix.length,4);assert.equal(stock.sourceMix.filter(value=>value==='local').length,3);assert.equal(stock.sourceMix.filter(value=>value==='commons').length,1);
  const deck=stock.createShuffleDeck(stock.sourceMix.map((kind,index)=>({id:`${kind}-${index}`,kind})),()=>.37),round=Array.from({length:4},()=>deck.next().kind);
  assert.equal(round.filter(value=>value==='local').length,3);assert.equal(round.filter(value=>value==='commons').length,1);
  const source=fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');assert.match(source,/const stockSourceDeck=/);assert.match(source,/source\.kind==='local'/);assert.doesNotMatch(source,/api\.openverse\.org/);
});

test('Commons候補は自由利用できる実写JPEGに限り、ロゴ・ポスター・地図・図表・絵画を除外する',()=>{
  const safe=commonsPage(1),png=commonsPage(2,'File:Street photograph.png',{mime:'image/png'}),logo=commonsPage(3,'File:Company logo.jpg'),poster=commonsPage(4,'File:Festival.jpg',{categories:'Advertising posters'}),map=commonsPage(5,'File:Old town.jpg',{description:'A map of the old town'}),chart=commonsPage(6,'File:Weather.jpg',{categories:'Weather charts'}),painting=commonsPage(7,'File:Harbor.jpg',{categories:'Paintings of harbors'}),recent=commonsPage(8),restricted=commonsPage(9,'File:Boat.jpg',{license:'All rights reserved'}),minor=commonsPage(10,'File:Children at harbor.jpg');
  const picked=stock.pickCommonsCandidates([safe,png,logo,poster,map,chart,painting,recent,restricted,minor],['commons:8'],()=>.4);
  assert.deepEqual(picked.map(value=>value.id),['commons:1']);assert.equal(stock.isSafeCommonsPage(safe),true);
});

test('Commonsクレジットは作者とライセンスを表示し、HTMLや長い原題を出さない',()=>{
  const page=commonsPage(1,'File:A Very Long English Photograph Title Nobody Needs To Read.jpg'),image=stock.commonsItem(page),credit=stock.japaneseCommonsCredit(image);
  assert.equal(credit,'Wikimedia Commons — 撮影者 / CC BY-SA 4.0');assert.ok(!credit.includes('<a'));assert.ok(!credit.includes(image.title));
});

test('CSPはCommons APIとJPEG配信元だけを外部通信先として許可する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');assert.match(source,/connect-src 'self' https:\/\/commons\.wikimedia\.org https:\/\/upload\.wikimedia\.org/);assert.doesNotMatch(source,/api\.openverse\.org/);
});

test('見た目が近い画像と離れた画像を区別する',()=>{
  const base={luminance:.5,contrast:.5,saturation:.4,warmth:0,busyness:.4,symmetry:.5};
  assert.equal(stock.isVisuallyDistinct({...base,luminance:.52},[base]),false);
  assert.equal(stock.isVisuallyDistinct({luminance:.9,contrast:.1,saturation:.9,warmth:.6,busyness:.9,symmetry:.1},[base]),true);
});

test('実写風オフライン素材45場面を重複なしで巡回できる',()=>{
  assert.equal(stock.offlinePhotos.length,45);assert.equal(new Set(stock.offlinePhotos.map(photo=>photo.id)).size,45);
  const deck=stock.createShuffleDeck(stock.offlinePhotos,()=>.37),round=Array.from({length:45},()=>deck.next());assert.equal(new Set(round.map(photo=>photo.id)).size,45);
  assert.ok(round.every(photo=>/[^\x00-\x7f]/.test(photo.label)&&photo.col>=0&&photo.col<3&&photo.row>=0&&photo.row<3));
  for(const sheet of new Set(round.map(photo=>photo.sheet))){const file=path.join(__dirname,'..',sheet.replace(/^\.\//,'')),stat=fs.statSync(file);assert.ok(stat.size>100000&&stat.size<300000)}
});

test('幾何学模様へフォールバックせず写真の再試行を案内する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
  assert.doesNotMatch(source,/makeGeometricFallback|端末生成|浮遊する箱|palettes=\[/);
  assert.match(source,/写真をもう一度読み込んでください/);
});

test('読めない画像シートを除外して残りの同梱素材を探す',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
  assert.match(source,/offlineUnavailableSheets\.add\(photo\.sheet\)/);
  assert.match(source,/attempt<StockLibrary\.offlinePhotos\.length/);
  assert.match(source,/offlineSheetCount/);
});

test('index.htmlの直接起動ではキャンバスの制限を避けて同梱素材を表示する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
  assert.match(source,/location\.protocol==='file:'\)\{setStatus\('PC内の同梱写真を読み込み中…'\);await makeOfflineImage\(\);return\}/);
  assert.match(source,/location\.protocol==='file:'\?BokeScoring\.neutralVisual\(photo\.hint\):analyzeSource/);
});

test('撮影とフリー素材のお題を「この写真で一言」に統一する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
  assert.match(source,/const PHOTO_PROMPT='この写真で一言。'/);
  assert.match(source,/currentPromptText=PHOTO_PROMPT/);
  assert.doesNotMatch(source,/promptDeck|const prompts=|世界遺産になった理由|流れているBGM/);
});
