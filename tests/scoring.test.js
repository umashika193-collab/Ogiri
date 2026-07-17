'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const scoring=require('../scoring-core.js');
const judgeConfig=JSON.parse(fs.readFileSync(path.join(__dirname,'..','research','judge-criteria.json'),'utf8'));

function visual(labels,lexemes){return{...scoring.neutralVisual(),labels,lexemes}}

test('同じ入力は同じ点になる',()=>{
  const input={answer:'光だけ月額制です。',prompt:'実はこれ、最新の何？',responseMs:4200,visual:visual(['bright'],['光','白'])};
  assert.deepEqual(scoring.scoreAnswer(input),scoring.scoreAnswer(input));
});

test('審査員交代が採点結果へ反映される',()=>{
  const names=scoring.coaches.map(coach=>coach.name);
  assert.equal(names.length,10);
  assert.ok(names.includes('真空ジェシカ・川北◯澄'));
  assert.ok(!names.includes('大竹◯樹'));
  const result=scoring.scoreAnswer({answer:'校長だけ月面勤務です。',prompt:'この学校だけにある変なルールは？',responseMs:8000,visual:scoring.neutralVisual()});
  const kawakita=result.scores.find(item=>item.name==='真空ジェシカ・川北◯澄');
  assert.equal(kawakita.key,'異物感');
  assert.ok(Number.isInteger(kawakita.score));
});

test('写真との接続が採点へ反映される',()=>{
  const base={answer:'光だけ月額制です。',prompt:'実はこれ、最新の何？',responseMs:4200};
  const linked=scoring.scoreAnswer({...base,visual:visual(['bright'],['光','白'])});
  const unlinked=scoring.scoreAnswer({...base,visual:visual(['cool'],['海','青'])});
  assert.ok(linked.dimensions.visualGrounding>unlinked.dimensions.visualGrounding);
  assert.ok(linked.total>=unlinked.total);
});

test('お題の型が採点へ反映される',()=>{
  const base={answer:'実は月曜が休みだからです。',responseMs:7000,visual:scoring.neutralVisual()};
  const reason=scoring.scoreAnswer({...base,prompt:'神様がこれを作った本当の理由は？'});
  const product=scoring.scoreAnswer({...base,prompt:'これを通販番組っぽく紹介してください'});
  assert.notEqual(reason.dimensions.promptFit,product.dimensions.promptFit);
});

test('ヒント評価が次のヒント選択へ反映される',()=>{
  const dimensions=Object.fromEntries(scoring.dimensions.map(key=>[key,.8]));dimensions.promptFit=.1;dimensions.visualGrounding=.1;
  const tip=scoring.trainingTip({dimensions},{promptFit:{near:8,far:0}});
  assert.equal(tip.key,'promptFit');
});

test('12軸の実行設定を検証して適用できる',()=>{
  const normalized=scoring.normalizeConfig(judgeConfig);
  assert.equal(normalized.profiles.length,10);
  assert.deepEqual(Object.keys(normalized.commonWeights),scoring.dimensions);
  const meta=scoring.applyConfig(judgeConfig,'test');
  assert.equal(meta.configVersion,judgeConfig.configVersion);
  const result=scoring.scoreAnswer({answer:'最後に校長だけ月へ転勤した。',prompt:'このあと何が起きた？',responseMs:8000,visual:scoring.neutralVisual()});
  assert.equal(result.scoringVersion,judgeConfig.scoringVersion);
  assert.deepEqual(Object.keys(result.dimensions),scoring.dimensions);
});

test('改ざん・破損した審査員設定を拒否する',()=>{
  const invalid=structuredClone(judgeConfig);invalid.profiles[0].weights.novelty=999;
  assert.throws(()=>scoring.normalizeConfig(invalid),/invalid profile values/);
  const duplicate=structuredClone(judgeConfig);duplicate.profiles[1].id=duplicate.profiles[0].id;
  assert.throws(()=>scoring.normalizeConfig(duplicate),/invalid profile id/);
});

test('低確信度では人物別配点を共通基準へ縮約する',()=>{
  const input={answer:'宇宙AI社長、しかも百年後に無料！',prompt:'このあと何が起きた？',responseMs:15000,visual:scoring.neutralVisual()};
  const oneAxis=target=>Object.fromEntries(scoring.dimensions.map(key=>[key,key===target?100:0]));
  const scoreWith=(confidence,target)=>{const config=structuredClone(judgeConfig);config.profiles[0].confidence=confidence;config.profiles[0].weights=oneAxis(target);scoring.applyConfig(config,'test');return scoring.scoreAnswer(input).scores[0].score};
  assert.equal(scoreWith(0,'brevity'),scoreWith(0,'twist'));
  assert.notEqual(scoreWith(1,'brevity'),scoreWith(1,'twist'));
  scoring.applyConfig(judgeConfig,'test');
});

test('画像の明暗を端末内で分類できる',()=>{
  const data=new Uint8ClampedArray(4*16);for(let i=0;i<data.length;i+=4){data[i]=245;data[i+1]=245;data[i+2]=245;data[i+3]=255}
  const result=scoring.analyzeImageData({data,width:4,height:4});
  assert.ok(result.labels.includes('bright'));
});

test('ローカル分析は面白さではなく測定可能な7信号を返す',()=>{
  const result=scoring.scoreAnswer({answer:'地下アイドル、地上に出たら解散。',prompt:'この写真だけが知っている秘密とは？',responseMs:8000,visual:scoring.neutralVisual('sweet potato')});
  assert.equal(result.localSignals.length,7);assert.ok(Number.isInteger(result.localScore));assert.ok(result.localScore>=0&&result.localScore<=100);
  assert.deepEqual(result.localSignals.map(item=>item.key),['promptFit','clarity','brevity','specificity','rhythm','visualGrounding','instant']);
});

test('回答は絵文字を壊さず120文字へ揃える',()=>{
  const result=scoring.scoreAnswer({answer:'🍠'.repeat(130),prompt:'この写真で一言。',responseMs:8000,visual:scoring.neutralVisual()});assert.equal(result.len,120);
});

test('ローカル改善ヒントは測定可能な信号だけから選ぶ',()=>{
  const dimensions=Object.fromEntries(scoring.dimensions.map(key=>[key,.9]));dimensions.instant=.1;dimensions.novelty=0;
  const tip=scoring.localTrainingTip({dimensions});assert.equal(tip.key,'instant');
});

test('API不要の三役審査は測定可能な信号だけを担当する',()=>{
  const dimensions=Object.fromEntries(scoring.dimensions.map(key=>[key,0]));
  Object.assign(dimensions,{promptFit:1,clarity:.8,brevity:.7,specificity:.6,rhythm:.5,visualGrounding:.4,instant:.3,novelty:1,surprise:1,twist:1});
  const jury=scoring.localJury({dimensions});
  assert.deepEqual(jury.map(item=>item.name),['お題番長','一言カッター','写真探偵']);
  assert.ok(jury.every(item=>Number.isInteger(item.score)&&item.score>=0&&item.score<=100&&item.comment));
  const sameMeasurableSignals={...dimensions,novelty:0,surprise:0,twist:0};
  assert.deepEqual(scoring.localJury({dimensions:sameMeasurableSignals}),jury);
});
