'use strict';
const fs=require('node:fs');
const path=require('node:path');

const prompts=[
  ['p01','この写真で一言。','写真'],
  ['p02','この場所の絶対に守られていないルールとは？','場所'],
  ['p03','このあと起きた、最悪の出来事とは？','直後'],
  ['p04','これが世界遺産になった理由とは？','遺産'],
  ['p05','この写真だけが知っている秘密とは？','秘密'],
  ['p06','これを通販番組っぽく紹介してください','通販'],
  ['p07','100年後の教科書では、何と呼ばれている？','未来'],
  ['p08','この瞬間に流れているBGMのタイトルは？','曲'],
  ['p09','神様がこれを作った本当の理由は？','理由'],
  ['p10','写真の外側で起きていることを教えてください','外側']
];
const visuals=[
  ['明るい会議室に、椅子が一脚だけ置かれている。',['bright','muted','calm'],['光','白','会議室','椅子']],
  ['夜のコンビニ前に、赤い傘が一本だけ立っている。',['dark','warm','calm'],['夜','黒','赤','傘','コンビニ']],
  ['青空の下、古い自動販売機が畑の中央にある。',['bright','cool','calm'],['青','空','自動販売機','畑']],
  ['左右対称の階段に、黄色い箱が置かれている。',['bright','colorful','symmetric'],['左右','対称','階段','黄','箱']],
  ['曇った駅前で、大きな時計だけが傾いている。',['muted','busy'],['灰色','駅','時計','傾き']],
  ['赤い料理が、白い皿へ一口分だけ盛られている。',['bright','warm','colorful'],['赤','白','料理','皿']],
  ['古い教室の黒板に、百年後とだけ書かれている。',['dark','muted','calm'],['黒','教室','黒板','百年後']],
  ['夕焼けの海辺に、無人のマイクが立っている。',['warm','calm'],['夕焼け','海','マイク','無人']],
  ['森の中に、青い扉だけが立っている。',['cool','muted','calm'],['森','青','扉']],
  ['混雑した商店街の端で、ロボットが休んでいる。',['busy','colorful'],['混雑','商店街','ロボット','休み']]
];
const subjects=['校長','町内会長','未来の店長','月曜だけ来る神様','新人AI','宇宙支店の母','昭和のロボット','無職の王様','二代目の雲','市役所の忍者'];
const places=['月面','コンビニ裏','会議室','実家','終電','給食室','宇宙支店','校庭','雲の上','百年後'];
const endings=['だけ有料です。','が先に謝りました。','は本日で終了です。','を三回まで認めます。','がまだ研修中です。','に月額制を導入しました。','だけ昭和のままです。','が最後に届きました。','を校長が却下しました。','が実は代打でした。'];
const makeAnswer=(promptIndex,answerIndex,tag)=>{
  const subject=subjects[(answerIndex+promptIndex)%subjects.length],place=places[(answerIndex*3+promptIndex)%places.length],ending=endings[(answerIndex*7+promptIndex)%endings.length];
  const patterns=[
    `${subject}${ending}`,
    `${place}では、${subject}${ending}`,
    `実は${subject}の休憩時間です。`,
    `${subject}、しかも二度目です。`,
    `「${tag}」改め「${subject}の経費」です。`,
    `${place}支店だけ、入口が出口です。`,
    `${subject}が最後に電源を抜きました。`,
    `今なら${subject}を二人セットで無料配送。`,
    `${subject}のせいで、百年後も仮オープンです。`,
    `写真外で${subject}が返品交渉中です。`
  ];
  return patterns[answerIndex%patterns.length];
};
const items=[];
for(let p=0;p<prompts.length;p++)for(let a=0;a<20;a++)items.push({id:`${prompts[p][0]}-a${String(a+1).padStart(2,'0')}`,promptId:prompts[p][0],visualDescription:visuals[p][0],visual:{labels:visuals[p][1],lexemes:visuals[p][2]},prompt:prompts[p][1],answer:makeAnswer(p,a,prompts[p][2])});
const output={schemaVersion:1,generatedAt:'2026-07-17',purpose:'人間による匿名評価用。回答は検証専用の人工例であり番組・記事から転載していない。',dimensions:['promptFit','clarity','brevity','novelty','surprise','twist','specificity','escalation','rhythm','visualGrounding','instant','edge'],items};
fs.writeFileSync(path.join(__dirname,'..','research','validation-set.json'),`${JSON.stringify(output,null,2)}\n`,'utf8');
console.log(`generated ${items.length} validation items`);
