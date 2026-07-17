'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const scoring=require('../scoring-core.js');

function visual(labels,lexemes){return{...scoring.neutralVisual(),labels,lexemes}}

test('同じ入力は同じ点になる',()=>{
  const input={answer:'光だけ月額制です。',prompt:'実はこれ、最新の何？',responseMs:4200,visual:visual(['bright'],['光','白'])};
  assert.deepEqual(scoring.scoreAnswer(input),scoring.scoreAnswer(input));
});

test('写真との接続が採点へ反映される',()=>{
  const base={answer:'光だけ月額制です。',prompt:'実はこれ、最新の何？',responseMs:4200};
  const linked=scoring.scoreAnswer({...base,visual:visual(['bright'],['光','白'])});
  const unlinked=scoring.scoreAnswer({...base,visual:visual(['cool'],['海','青'])});
  assert.ok(linked.dimensions.visual>unlinked.dimensions.visual);
  assert.ok(linked.total>unlinked.total);
});

test('お題の型が採点へ反映される',()=>{
  const base={answer:'実は月曜が休みだからです。',responseMs:7000,visual:scoring.neutralVisual()};
  const reason=scoring.scoreAnswer({...base,prompt:'神様がこれを作った本当の理由は？'});
  const product=scoring.scoreAnswer({...base,prompt:'これを通販番組っぽく紹介してください'});
  assert.notEqual(reason.dimensions.prompt,product.dimensions.prompt);
});

test('ヒント評価が次のヒント選択へ反映される',()=>{
  const dimensions={visual:.1,prompt:.1,surprise:.8,twist:.8,instant:.8,brevity:.8,clarity:.8,rhythm:.8,specificity:.8,edge:.8};
  const tip=scoring.trainingTip({dimensions},{prompt:{near:8,far:0}});
  assert.equal(tip.key,'prompt');
});

test('画像の明暗を端末内で分類できる',()=>{
  const data=new Uint8ClampedArray(4*16);for(let i=0;i<data.length;i+=4){data[i]=245;data[i+1]=245;data[i+2]=245;data[i+3]=255}
  const result=scoring.analyzeImageData({data,width:4,height:4});
  assert.ok(result.labels.includes('bright'));
});
