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
  const DIMENSIONS=['promptFit','clarity','brevity','novelty','surprise','twist','specificity','escalation','rhythm','visualGrounding','instant','edge'];
  const LOCAL_SIGNAL_WEIGHTS={promptFit:22,clarity:18,brevity:15,specificity:12,rhythm:8,visualGrounding:15,instant:10};
  const LOCAL_SIGNAL_LABELS={promptFit:'お題形式',clarity:'明瞭さ',brevity:'短さ',specificity:'具体性',rhythm:'言葉の着地',visualGrounding:'写真特徴',instant:'瞬発力'};
  const LOCAL_JURORS=[
    {id:'prompt_bancho',name:'お題番長',initial:'題',key:'お題への着地'},
    {id:'cut_master',name:'一言カッター',initial:'切',key:'短さとテンポ'},
    {id:'photo_detective',name:'写真探偵',initial:'写',key:'写真の手がかり'}
  ];
  const COURSE_BASELINES={
    promptFit:{mean:.65,spread:.20},clarity:{mean:.88,spread:.12},brevity:{mean:.99,spread:.15},
    specificity:{mean:.55,spread:.18},rhythm:{mean:.68,spread:.16},visualGrounding:{mean:.46,spread:.18},instant:{mean:.56,spread:.22}
  };
  const CONFIG_STORAGE_KEY='bokeJudgeConfigV1',MAX_CONFIG_BYTES=128*1024;
  const DEFAULT_COMMON_WEIGHTS={promptFit:13,clarity:12,brevity:9,novelty:10,surprise:10,twist:10,specificity:8,escalation:6,rhythm:7,visualGrounding:10,instant:2,edge:3};
  const DEFAULT_PROFILES=[
    {id:'matsumoto_style',name:'松本◯志',key:'発想',initial:'M',confidence:.65,w:{promptFit:10,clarity:10,brevity:8,novelty:14,surprise:13,twist:13,specificity:7,escalation:7,rhythm:5,visualGrounding:8,instant:2,edge:3}},
    {id:'ariyoshi_style',name:'有吉◯行',key:'毒と短さ',initial:'A',confidence:.75,w:{promptFit:10,clarity:10,brevity:10,novelty:8,surprise:8,twist:8,specificity:5,escalation:8,rhythm:7,visualGrounding:7,instant:7,edge:12}},
    {id:'soshina_style',name:'粗◯',key:'構造と速度',initial:'S',confidence:.8,w:{promptFit:10,clarity:8,brevity:7,novelty:12,surprise:10,twist:8,specificity:8,escalation:12,rhythm:8,visualGrounding:3,instant:5,edge:9}},
    {id:'akamine_style',name:'赤嶺総◯',key:'観察',initial:'A',confidence:.85,w:{promptFit:10,clarity:8,brevity:5,novelty:14,surprise:10,twist:10,specificity:16,escalation:6,rhythm:5,visualGrounding:12,instant:2,edge:2}},
    {id:'kawakita_style',name:'真空ジェシカ・川北◯澄',key:'異物感',initial:'K',confidence:.85,w:{promptFit:12,clarity:8,brevity:6,novelty:15,surprise:12,twist:13,specificity:8,escalation:10,rhythm:5,visualGrounding:5,instant:3,edge:3}},
    {id:'shitara_style',name:'設楽◯',key:'完成度',initial:'S',confidence:.7,w:{promptFit:12,clarity:12,brevity:7,novelty:12,surprise:8,twist:10,specificity:8,escalation:10,rhythm:8,visualGrounding:5,instant:5,edge:3}},
    {id:'terada_style',name:'寺田◯明',key:'選択',initial:'T',confidence:.9,w:{promptFit:14,clarity:12,brevity:10,novelty:15,surprise:10,twist:12,specificity:6,escalation:5,rhythm:7,visualGrounding:5,instant:2,edge:2}},
    {id:'junior_style',name:'千原ジュ◯ア',key:'情景',initial:'J',confidence:.7,w:{promptFit:8,clarity:8,brevity:5,novelty:13,surprise:10,twist:10,specificity:14,escalation:8,rhythm:7,visualGrounding:9,instant:5,edge:3}},
    {id:'bakarhythm_style',name:'バカリ◯ム',key:'設定',initial:'B',confidence:.9,w:{promptFit:13,clarity:10,brevity:12,novelty:15,surprise:10,twist:10,specificity:6,escalation:7,rhythm:7,visualGrounding:4,instant:4,edge:2}},
    {id:'nishida_style',name:'笑い飯・西田◯治',key:'言葉',initial:'N',confidence:.7,w:{promptFit:10,clarity:8,brevity:7,novelty:10,surprise:10,twist:9,specificity:12,escalation:8,rhythm:10,visualGrounding:6,instant:8,edge:2}}
  ];
  let activeCommonWeights={...DEFAULT_COMMON_WEIGHTS};
  let activeProfiles=DEFAULT_PROFILES.map(profile=>({...profile,w:{...profile.w}}));
  let activeMeta={schemaVersion:2,configVersion:'builtin-2026.07.17',scoringVersion:'12d-confidence-v1',featureVersion:'12d-v1',source:'builtin'};
  const TIPS={
    visualGrounding:['写真との接続','写真の色・形・明暗から一語拾い、その言葉を回答の芯にしよう。'],
    promptFit:['お題への回答力','お題が求める「タイトル・理由・一言」などの型を、回答の形ではっきり示そう。'],
    novelty:['新鮮さ','最初の連想を一度保留し、離れた分野の具体語を一つだけ接続しよう。'],
    surprise:['意外性','最初の連想を捨て、3番目に浮かんだ世界の言葉を一つ混ぜよう。'],
    twist:['ひねり','「なのに」「実は」を使わず、前半と後半の常識を逆転させよう。'],
    escalation:['展開','一文の後半で、役割・規模・時間のどれかを一段だけ進めよう。'],
    instant:['瞬発力','5秒で仮回答を言い切り、あとから短く削ろう。'],
    brevity:['短さ','説明を一文削り、いちばん変な名詞だけを残そう。'],
    clarity:['明瞭さ','誰が・何をした、の関係が一度で伝わる形にしよう。'],
    rhythm:['言葉の着地','声に出したとき最後の一語へ力が集まる語順にしよう。'],
    specificity:['具体性','数字・場所・役職・年代のどれかを一つだけ足そう。'],
    edge:['切れ味','遠慮した説明を削り、判断を言い切る一文にしよう。']
  };
  const COURSE_GUIDANCE={
    '発想':'写真で目立つ一要素を、別の業界や時代の具体語へ置き換えて一文にしよう。',
    '毒と短さ':'攻撃的な言葉を足さず、説明を削って最後の判断だけを言い切ろう。',
    '構造と速度':'前半で状況を見せ、後半で一段だけ進める二拍の形を試そう。',
    '観察':'色・形・配置のうち、まだ回答にない特徴を一語だけ拾おう。',
    '異物感':'見えている特徴に、少し離れた分野の具体語を一つだけ接続しよう。',
    '完成度':'誰が何をしたかを残し、最後の一語へ重心が集まる語順に整えよう。',
    '選択':'候補を三つ出し、写真とお題の両方へ最も短くつながる一つを選ぼう。',
    '情景':'場所・役職・時間のどれかを一つ足し、写真の外側まで想像できる形にしよう。',
    '設定':'この写真だけに存在するルールを一つ決め、その結果を短く言おう。',
    '言葉':'説明を増やさず、最後の名詞か動詞を一段具体的な言葉へ替えよう。'
  };

  function validWeights(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const keys=Object.keys(value);if(keys.length!==DIMENSIONS.length||!DIMENSIONS.every(key=>keys.includes(key)))return null;
    const normalized={};let total=0;
    for(const key of DIMENSIONS){const weight=Number(value[key]);if(!Number.isFinite(weight)||weight<0||weight>100)return null;normalized[key]=weight;total+=weight}
    return Math.abs(total-100)<.001?normalized:null;
  }
  function normalizeConfig(config){
    if(!config||typeof config!=='object'||Array.isArray(config)||Number(config.schemaVersion)!==2)throw new Error('invalid schema');
    if(!Array.isArray(config.dimensions)||config.dimensions.join('|')!==DIMENSIONS.join('|'))throw new Error('invalid dimensions');
    const configVersion=String(config.configVersion||'');if(!/^[0-9A-Za-z._-]{1,40}$/.test(configVersion))throw new Error('invalid config version');
    const scoringVersion=String(config.scoringVersion||'');if(!/^[0-9A-Za-z._-]{1,40}$/.test(scoringVersion))throw new Error('invalid scoring version');
    const featureVersion=String(config.featureVersion||'');if(!/^[0-9A-Za-z._-]{1,40}$/.test(featureVersion))throw new Error('invalid feature version');
    const commonWeights=validWeights(config.commonWeights);if(!commonWeights)throw new Error('invalid common weights');
    if(!Array.isArray(config.profiles)||config.profiles.length!==10)throw new Error('invalid profiles');
    const seenIds=new Set(),seenNames=new Set();
    const profiles=config.profiles.map(profile=>{
      if(!profile||typeof profile!=='object'||Array.isArray(profile))throw new Error('invalid profile');
      const id=String(profile.id||''),name=String(profile.displayName||''),key=String(profile.label||''),initial=String(profile.initial||'').toUpperCase(),confidence=Number(profile.confidence),w=validWeights(profile.weights);
      if(!/^[a-z][a-z0-9_]{2,39}$/.test(id)||seenIds.has(id))throw new Error('invalid profile id');
      if(!name||name.length>40||/[<>\u0000-\u001f]/.test(name)||seenNames.has(name))throw new Error('invalid profile name');
      if(!key||key.length>12||/[<>\u0000-\u001f]/.test(key)||!/^[A-Z]$/.test(initial))throw new Error('invalid profile label');
      if(!Number.isFinite(confidence)||confidence<0||confidence>1||!w)throw new Error('invalid profile values');
      seenIds.add(id);seenNames.add(name);return{id,name,key,initial,confidence,w};
    });
    return{schemaVersion:2,configVersion,scoringVersion,featureVersion,commonWeights,profiles};
  }
  function applyConfig(config,source='runtime'){
    const normalized=normalizeConfig(config);activeCommonWeights={...normalized.commonWeights};activeProfiles=normalized.profiles.map(profile=>({...profile,w:{...profile.w}}));
    activeMeta={schemaVersion:2,configVersion:normalized.configVersion,scoringVersion:normalized.scoringVersion,featureVersion:normalized.featureVersion,source};return{...activeMeta};
  }
  function cachedConfig(){try{const raw=localStorage.getItem(CONFIG_STORAGE_KEY);return raw&&raw.length<=MAX_CONFIG_BYTES?JSON.parse(raw):null}catch{return null}}
  function storeConfig(config){try{const safe={schemaVersion:2,configVersion:config.configVersion,scoringVersion:config.scoringVersion,featureVersion:config.featureVersion,dimensions:[...DIMENSIONS],commonWeights:config.commonWeights,profiles:config.profiles.map(profile=>({id:profile.id,displayName:profile.name||profile.displayName,label:profile.key||profile.label,initial:profile.initial,confidence:profile.confidence,weights:profile.w||profile.weights}))};localStorage.setItem(CONFIG_STORAGE_KEY,JSON.stringify(safe))}catch{}}
  async function loadCoachConfig(url='./research/judge-criteria.json'){
    try{
      if(typeof fetch!=='function'||typeof location==='undefined')throw new Error('fetch unavailable');
      const target=new URL(url,location.href);if(target.origin!==location.origin)throw new Error('cross-origin config blocked');
      const controller=typeof AbortController==='function'?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),4000):null;
      let response;try{response=await fetch(target.href,{cache:'no-store',credentials:'same-origin',signal:controller?.signal})}finally{if(timer)clearTimeout(timer)}
      if(!response.ok)throw new Error('config fetch failed');const declared=Number(response.headers?.get?.('content-length')||0);if(declared>MAX_CONFIG_BYTES)throw new Error('config too large');
      const text=await response.text();if(text.length>MAX_CONFIG_BYTES)throw new Error('config too large');const parsed=JSON.parse(text),meta=applyConfig(parsed,'network');storeConfig({...parsed,profiles:activeProfiles,commonWeights:activeCommonWeights});return meta;
    }catch{
      const cached=cachedConfig();if(cached){try{return applyConfig(cached,'cached')}catch{}}
      activeCommonWeights={...DEFAULT_COMMON_WEIGHTS};activeProfiles=DEFAULT_PROFILES.map(profile=>({...profile,w:{...profile.w}}));activeMeta={schemaVersion:2,configVersion:'builtin-2026.07.17',scoringVersion:'12d-confidence-v1',featureVersion:'12d-v1',source:'builtin'};return{...activeMeta};
    }
  }

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
    const raw=[...String(answer)].slice(0,120).join('').trim(),clean=raw.replace(/[、。！？!?\s]/g,''),len=[...clean].length;
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
    const characterVariety=new Set([...clean]).size/Math.max(1,len),clichePenalty=includesAny(raw,['あるある','知らんけど','普通に','なんとなく'])?.14:0;
    const novelty=clamp(.34+Math.min(2,categoryCount)*.16+Math.max(0,characterVariety-.45)*.22+(opposite?.1:0)+(specificity-.35)*.12-clichePenalty);
    const escalation=clamp(.32+(includesAny(raw,['しかも','さらに','その後','直後','最後','結果','二度目','ついに'])?.28:0)+(categoryCount>=2?.18:0)+(/[、,].+[。！!]$/.test(raw)?.12:0));
    const edge=clamp(.42+(includesAny(raw,['絶対','禁止','却下','無料','だけ','しか','終了','認定'])?.28:0)+(/[！!]$/.test(raw)?.12:0));
    const promptScore=promptFit(raw,prompt,len,clarity);
    const dimensions={promptFit:promptScore,clarity,brevity,novelty,surprise,twist,specificity,escalation,rhythm,visualGrounding:visualFit,instant,edge};
    const localSignals=Object.entries(LOCAL_SIGNAL_WEIGHTS).map(([key,weight])=>({key,label:LOCAL_SIGNAL_LABELS[key],value:dimensions[key],weight}));
    const localScore=Math.round(localSignals.reduce((sum,item)=>sum+item.value*item.weight,0));
    const scores=activeProfiles.map(coach=>{
      const profileShare=.4*coach.confidence;
      const value=DIMENSIONS.reduce((sum,key)=>sum+dimensions[key]*(activeCommonWeights[key]*(1-profileShare)+coach.w[key]*profileShare),0)/100;
      return{id:coach.id,name:coach.name,key:coach.key,confidence:coach.confidence,score:Math.round(1+value*9)};
    });
    const total=scores.reduce((sum,item)=>sum+item.score,0),high=scores.reduce((a,b)=>a.score>=b.score?a:b),low=scores.reduce((a,b)=>a.score<=b.score?a:b);
    const comment=total>=80?`写真とお題への接続が強い。${high.name}が${high.score}点。`:total>=58?`${high.name}は${high.score}点、${low.name}は${low.score}点。伸ばす軸が見えた。`:`最高点は${high.name}の${high.score}点。写真から拾う一語を増やしたい。`;
    return{total,localScore,localSignals,scores,comment,dimensions,len,responseMs,visualMatches:matchedVisual,promptKind:promptKind(prompt),configVersion:activeMeta.configVersion,scoringVersion:activeMeta.scoringVersion,featureVersion:activeMeta.featureVersion,configSource:activeMeta.source};
  }
  function emptyResult(){const dimensions=Object.fromEntries(DIMENSIONS.map(key=>[key,0])),localSignals=Object.entries(LOCAL_SIGNAL_WEIGHTS).map(([key,weight])=>({key,label:LOCAL_SIGNAL_LABELS[key],value:0,weight}));return{total:0,localScore:0,localSignals,scores:activeProfiles.map(c=>({id:c.id,name:c.name,key:c.key,confidence:c.confidence,score:0})),comment:'回答を入力してください。',dimensions,len:0,responseMs:0,visualMatches:0,promptKind:'scene',configVersion:activeMeta.configVersion,scoringVersion:activeMeta.scoringVersion,featureVersion:activeMeta.featureVersion,configSource:activeMeta.source}}
  function trainingTip(result,feedback={}){
    const ranked=Object.keys(TIPS).map(key=>{
      const vote=feedback[key]||{near:0,far:0};
      return{key,priority:(1-(result.dimensions[key]||0))+(vote.near-vote.far)*.04};
    }).sort((a,b)=>b.priority-a.priority);
    const [skill,text]=TIPS[ranked[0].key];return{key:ranked[0].key,skill,text};
  }
  function localTrainingTip(result,feedback={}){
    const ranked=Object.keys(LOCAL_SIGNAL_WEIGHTS).map(key=>{const vote=feedback[key]||{near:0,far:0};return{key,priority:(1-(result.dimensions[key]||0))+(vote.near-vote.far)*.04}}).sort((a,b)=>b.priority-a.priority);
    const [skill,text]=TIPS[ranked[0].key];return{key:ranked[0].key,skill,text};
  }
  function courseAdvice(result={},options={}){
    const dimensions=result.dimensions||{},measured=Object.keys(LOCAL_SIGNAL_WEIGHTS),feedback=options.feedback&&typeof options.feedback==='object'?options.feedback:{},recent=Array.isArray(options.recentCourseIds)?options.recentCourseIds.slice(0,4):[];
    const deviation=Object.fromEntries(measured.map(key=>[key,clamp((COURSE_BASELINES[key].mean-(Number(dimensions[key])||0))/COURSE_BASELINES[key].spread,-1.5,1.5)]));
    const courses=activeProfiles.map((profile,index)=>{
      const profileShare=.4*profile.confidence,rawWeights=Object.fromEntries(measured.map(key=>[key,activeCommonWeights[key]*(1-profileShare)+profile.w[key]*profileShare])),weightTotal=measured.reduce((sum,key)=>sum+rawWeights[key],0)||1;
      const weights=Object.fromEntries(measured.map(key=>[key,rawWeights[key]/weightTotal]));
      const need=measured.reduce((sum,key)=>sum+weights[key]*deviation[key],0),vote=feedback[profile.id]||{near:0,far:0},position=recent.indexOf(profile.id);
      const rotationPenalty=position===0?2:position===1?.85:position===2?.4:position===3?.15:0;
      return{profile,index,weights,priority:need+(Number(vote.near)||0)*.025-(Number(vote.far)||0)*.035-rotationPenalty};
    }).sort((a,b)=>b.priority-a.priority||a.index-b.index);
    const selected=courses[0],focusKey=measured.reduce((best,key)=>deviation[key]*(.5+selected.weights[key])>deviation[best]*(.5+selected.weights[best])?key:best,measured[0]);
    const strengthKey=measured.reduce((best,key)=>(Number(dimensions[key])||0)-COURSE_BASELINES[key].mean>(Number(dimensions[best])||0)-COURSE_BASELINES[best].mean?key:best,measured[0]);
    const focusDelta=Math.round(((Number(dimensions[focusKey])||0)-COURSE_BASELINES[focusKey].mean)*100),strengthDelta=Math.round(((Number(dimensions[strengthKey])||0)-COURSE_BASELINES[strengthKey].mean)*100);
    const evidence=strengthKey==='brevity'?`${result.len||0}文字に収まり、${LOCAL_SIGNAL_LABELS[strengthKey]}は基準${strengthDelta>=0?'＋':''}${strengthDelta}。`:strengthKey==='instant'?`${((Number(result.responseMs)||0)/1000).toFixed(1)}秒で回答し、${LOCAL_SIGNAL_LABELS[strengthKey]}は基準${strengthDelta>=0?'＋':''}${strengthDelta}。`:strengthKey==='visualGrounding'&&Number(result.visualMatches)>0?`写真の特徴語を${result.visualMatches}個拾えており、${LOCAL_SIGNAL_LABELS[strengthKey]}は基準${strengthDelta>=0?'＋':''}${strengthDelta}。`:`この回答では${LOCAL_SIGNAL_LABELS[strengthKey]}が比較的安定し、基準${strengthDelta>=0?'＋':''}${strengthDelta}。`;
    return{key:selected.profile.id,courseId:selected.profile.id,course:selected.profile.key,focusKey,focusLabel:LOCAL_SIGNAL_LABELS[focusKey],focusDelta,strengthKey,strengthLabel:LOCAL_SIGNAL_LABELS[strengthKey],strengthDelta,evidence,advice:COURSE_GUIDANCE[selected.profile.key]||TIPS[focusKey]?.[1]||'',basis:'検証用200回答の軸別平均と調査済み10視点の重みを照合。得点には加算していません。'};
  }
  function localJury(result={}){
    const dimensions=result.dimensions||{};
    const score=weights=>Math.round(weights.reduce((sum,[key,weight])=>sum+clamp(Number(dimensions[key])||0)*weight,0));
    const make=(juror,value,lines)=>({...juror,score:value,comment:value>=75?lines[0]:value>=55?lines[1]:lines[2]});
    return[
      make(LOCAL_JURORS[0],score([['promptFit',55],['clarity',30],['specificity',15]]),['お題の改札、堂々通過。切符まで二度見された。','お題には到着。あとは看板をもう少し大きく。','お題がホームで待っている。まず答えの型を見せよう。']),
      make(LOCAL_JURORS[1],score([['brevity',40],['rhythm',30],['instant',30]]),['よく切れた。一言が逃げる前に着地している。','刃は入った。最後の一語へ重心を寄せたい。','説明が増殖中。いちばん変な名詞だけ救出しよう。']),
      make(LOCAL_JURORS[2],score([['visualGrounding',55],['specificity',25],['clarity',20]]),['現場の証拠を発見。写真と回答が同じ部屋にいる。','写真との面会は確認。色・形を一語足すと証拠になる。','写真が参考人席で暇そう。見える特徴を一つ連れてこよう。'])
    ];
  }
  return{analyzeImageData,neutralVisual,scoreAnswer,trainingTip,localTrainingTip,courseAdvice,localJury,promptKind,loadCoachConfig,applyConfig,normalizeConfig,dimensions:[...DIMENSIONS],localJurors:LOCAL_JURORS.map(item=>({...item})),courseBaselines:Object.fromEntries(Object.entries(COURSE_BASELINES).map(([key,value])=>[key,{...value}])),get coaches(){return activeProfiles.map(({id,name,key,initial,confidence})=>({id,name,key,initial,confidence}))},get configMeta(){return{...activeMeta}}};
});
