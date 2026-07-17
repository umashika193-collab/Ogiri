(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BokeScoring=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
  const includesAny=(text,words)=>words.some(word=>text.includes(word));
  const VISUAL_WORDS={
    bright:['光','白','昼','太陽','まぶし','明る'],dark:['闇','黒','夜','影','深夜','暗'],
    warm:['赤','火','夕焼け','夏','熱','暖'],cool:['青','水','空','海','冬','冷'],
    colorful:['虹','色','派手','祭','カラフル'],muted:['地味','灰色','無彩色','静か'],
    busy:['渋滞','混雑','ぎゅうぎゅう','忙し','カオス'],calm:['余白','静か','休み','ぽつん','無音'],
    symmetric:['左右','双子','鏡','対称','半分']
  };
  const COACHES=[
    {name:'松◯',key:'発想',w:{surprise:3,twist:3,visual:2,prompt:1,brevity:1}},
    {name:'有◯',key:'毒と短さ',w:{edge:3,brevity:3,twist:2,clarity:1,prompt:1}},
    {name:'粗◯',key:'構造と速度',w:{prompt:3,instant:2,rhythm:2,brevity:2,clarity:1}},
    {name:'三◯',key:'伝達',w:{clarity:3,rhythm:2,visual:2,prompt:2,brevity:1}},
    {name:'大◯',key:'違和感',w:{twist:3,surprise:2,visual:2,edge:2,specificity:1}},
    {name:'設◯',key:'完成度',w:{prompt:2,visual:2,clarity:2,rhythm:2,surprise:1,specificity:1}},
    {name:'日◯',key:'即効性',w:{instant:3,clarity:2,brevity:2,rhythm:2,visual:1}},
    {name:'ジュ◯',key:'情景',w:{visual:3,specificity:2,surprise:2,clarity:1,twist:1,prompt:1}},
    {name:'バカ◯',key:'設定',w:{prompt:3,specificity:2,twist:2,visual:1,clarity:1,surprise:1}},
    {name:'西◯',key:'言葉',w:{rhythm:3,brevity:2,surprise:2,twist:1,visual:1,clarity:1}}
  ];
  const TIPS={
    visual:['写真との接続','写真の色・形・明暗から一語拾い、その言葉を回答の芯にしよう。'],
    prompt:['お題への回答力','お題が求める「タイトル・理由・一言」などの型を、回答の形ではっきり示そう。'],
    surprise:['意外性','最初の連想を捨て、3番目に浮かんだ世界の言葉を一つ混ぜよう。'],
    twist:['ひねり','「なのに」「実は」を使わず、前半と後半の常識を逆転させよう。'],
    instant:['瞬発力','5秒で仮回答を言い切り、あとから短く削ろう。'],
    brevity:['短さ','説明を一文削り、いちばん変な名詞だけを残そう。'],
    clarity:['明瞭さ','誰が・何をした、の関係が一度で伝わる形にしよう。'],
    rhythm:['言葉の着地','声に出したとき最後の一語へ力が集まる語順にしよう。'],
    specificity:['具体性','数字・場所・役職・年代のどれかを一つだけ足そう。'],
    edge:['切れ味','遠慮した説明を削り、判断を言い切る一文にしよう。']
  };

  function analyzeImageData(imageData,hintText=''){
    if(!imageData||!imageData.data||!imageData.width||!imageData.height)return neutralVisual(hintText);
    const {data,width,height}=imageData,step=Math.max(1,Math.floor(Math.min(width,height)/32));
    let count=0,sumL=0,sumL2=0,sumS=0,sumR=0,sumB=0,edge=0,edgeCount=0,sym=0,symCount=0;
    const lumAt=(x,y)=>{const i=(y*width+x)*4;return data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722};
    for(let y=0;y<height;y+=step){for(let x=0;x<width;x+=step){
      const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2],l=r*.2126+g*.7152+b*.0722;
      const max=Math.max(r,g,b),min=Math.min(r,g,b);sumL+=l;sumL2+=l*l;sumS+=(max-min)/255;sumR+=r;sumB+=b;count++;
      if(x+step<width){edge+=Math.abs(l-lumAt(x+step,y));edgeCount++}
      if(x<width/2){sym+=Math.abs(l-lumAt(width-1-x,y));symCount++}
    }}
    const luminance=sumL/count/255,contrast=Math.sqrt(Math.max(0,sumL2/count-(sumL/count)**2))/128,
      saturation=sumS/count,warmth=(sumR-sumB)/count/255,busyness=clamp((edge/Math.max(1,edgeCount))/55),
      symmetry=1-clamp((sym/Math.max(1,symCount))/100);
    const labels=[];
    labels.push(luminance>.62?'bright':luminance<.36?'dark':'mid');
    labels.push(warmth>.08?'warm':warmth<-.08?'cool':'neutral');
    labels.push(saturation>.38?'colorful':'muted');
    labels.push(busyness>.42?'busy':'calm');
    if(symmetry>.73)labels.push('symmetric');
    return finishVisual({luminance,contrast:clamp(contrast),saturation,warmth,busyness,symmetry,labels},hintText);
  }
  function neutralVisual(hintText=''){return finishVisual({luminance:.5,contrast:.5,saturation:.3,warmth:0,busyness:.35,symmetry:.5,labels:['mid','neutral','muted','calm']},hintText)}
  function finishVisual(base,hintText){
    const lexemes=[...new Set(base.labels.flatMap(label=>VISUAL_WORDS[label]||[]))];
    const safeHints=String(hintText).toLowerCase().match(/[a-z]{4,18}|[ぁ-んァ-ヶ一-龠]{2,10}/g)||[];
    return {...base,lexemes:[...lexemes,...safeHints.slice(0,20)]};
  }
  function promptKind(prompt){
    if(/タイトル|BGM|呼ばれて/.test(prompt))return'title';
    if(/一言|言わなそう/.test(prompt))return'line';
    if(/理由|なぜ|秘密/.test(prompt))return'reason';
    if(/通販|紹介/.test(prompt))return'product';
    if(/ルール/.test(prompt))return'rule';
    if(/3秒後|このあと|100年後|最後の日/.test(prompt))return'future';
    if(/一句/.test(prompt))return'poem';
    return'scene';
  }
  function promptFit(answer,prompt,len,clarity){
    switch(promptKind(prompt)){
      case'title':return clamp((len<=24?.75:.45)+(/[／「」『』]/.test(answer)?.15:0));
      case'line':return clamp((len<=28?.8:.45)+(/[。！!]$/.test(answer)?.1:0));
      case'reason':return clamp(.45+(includesAny(answer,['実は','から','ため','せい','ので','結果'])?.45:0));
      case'product':return clamp(.4+(includesAny(answer,['円','無料','限定','機能','今なら','セット','搭載'])?.5:0));
      case'rule':return clamp(.4+(includesAny(answer,['禁止','厳禁','必ず','だけ','まで','してはいけ'])?.5:0));
      case'future':return clamp(.4+(includesAny(answer,['後','年','明日','未来','最後','次に','なる','なった'])?.5:0));
      case'poem':return clamp(.55+(len>=8&&len<=30?.3:0));
      default:return clamp(.45+clarity*.45);
    }
  }
  function scoreAnswer({answer='',prompt='',responseMs=15000,visual}={}){
    const raw=String(answer).slice(0,120).trim(),clean=raw.replace(/[、。！？!?\s]/g,''),len=clean.length;
    if(!len)return emptyResult();
    visual=visual||neutralVisual();
    const brevity=len>=4&&len<=22?1:len<=34?.72:len<=48?.45:.22;
    const clarity=clamp((len>=5&&len<=38?.62:.38)+(includesAny(raw,['です','ます','した','する','だった','ない','だ','や'])?.2:0)+(/[。！!？?]$/.test(raw)?.08:0));
    const rhythm=clamp(.42+(/[、,]/.test(raw)?.16:0)+(/[。！!]$/.test(raw)?.16:0)+(includesAny(raw,['だけ','なのに','まさか','つまり','ただし'])?.16:0));
    const instant=responseMs<=5000?1:responseMs<=10000?.78:responseMs<=15000?.56:responseMs<=25000?.36:.2;
    const categories=[['宇宙','地球','月','太陽','星'],['社長','会社','会議','バイト','店長'],['昭和','令和','未来','昨日','百年'],['AI','アプリ','充電','Wi-Fi','ロボット'],['母','父','実家','給食','学校'],['無料','税','円','セール','請求']];
    const categoryCount=categories.filter(words=>includesAny(raw,words)).length;
    const surprise=clamp(.38+categoryCount*.2+(includesAny(raw,['実は','まさか','だけ','代打','逆'])?.16:0));
    const matchedVisual=visual.lexemes.filter(word=>word&&raw.toLowerCase().includes(String(word).toLowerCase())).length;
    const visualFit=clamp(.38+Math.min(2,matchedVisual)*.24+(matchedVisual===0&&len>=8?.08:0));
    const opposite=(visual.labels.includes('bright')&&includesAny(raw,VISUAL_WORDS.dark))||(visual.labels.includes('dark')&&includesAny(raw,VISUAL_WORDS.bright))||(visual.labels.includes('warm')&&includesAny(raw,VISUAL_WORDS.cool))||(visual.labels.includes('cool')&&includesAny(raw,VISUAL_WORDS.warm));
    const twist=clamp(.34+(opposite?.35:0)+(includesAny(raw,['なのに','だけ','実は','逆','代わり','禁止'])?.24:0));
    const specificity=clamp(.35+(/[0-9０-９一二三四五六七八九百千万]/.test(raw)?.25:0)+(includesAny(raw,['社長','店長','先生','駅','コンビニ','月曜','昭和','令和','宇宙'])?.25:0));
    const edge=clamp(.42+(includesAny(raw,['絶対','禁止','却下','無料','だけ','しか','終了','認定'])?.28:0)+(/[！!]$/.test(raw)?.12:0));
    const promptScore=promptFit(raw,prompt,len,clarity);
    const dimensions={brevity,clarity,rhythm,instant,surprise,visual:visualFit,prompt:promptScore,specificity,twist,edge};
    const scores=COACHES.map(coach=>{
      const entries=Object.entries(coach.w),weight=entries.reduce((n,[,w])=>n+w,0),value=entries.reduce((n,[key,w])=>n+dimensions[key]*w,0)/weight;
      return{name:coach.name,key:coach.key,score:Math.round(1+value*9)};
    });
    const total=scores.reduce((sum,item)=>sum+item.score,0),high=scores.reduce((a,b)=>a.score>=b.score?a:b),low=scores.reduce((a,b)=>a.score<=b.score?a:b);
    const comment=total>=80?`写真とお題への接続が強い。${high.name}が${high.score}点。`:total>=58?`${high.name}は${high.score}点、${low.name}は${low.score}点。伸ばす軸が見えた。`:`最高点は${high.name}の${high.score}点。写真から拾う一語を増やしたい。`;
    return{total,scores,comment,dimensions,len,responseMs,visualMatches:matchedVisual,promptKind:promptKind(prompt)};
  }
  function emptyResult(){const dimensions=Object.fromEntries(Object.keys(TIPS).map(k=>[k,0]));return{total:0,scores:COACHES.map(c=>({name:c.name,key:c.key,score:0})),comment:'回答を入力してください。',dimensions,len:0,responseMs:0,visualMatches:0,promptKind:'scene'}}
  function trainingTip(result,feedback={}){
    const ranked=Object.keys(TIPS).map(key=>{
      const vote=feedback[key]||{near:0,far:0};
      return{key,priority:(1-(result.dimensions[key]||0))+(vote.near-vote.far)*.04};
    }).sort((a,b)=>b.priority-a.priority);
    const [skill,text]=TIPS[ranked[0].key];return{key:ranked[0].key,skill,text};
  }
  return{analyzeImageData,neutralVisual,scoreAnswer,trainingTip,promptKind,coaches:COACHES};
});
