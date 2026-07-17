'use strict';
const $=selector=>document.querySelector(selector);
const video=$('#camera'),canvas=$('#photo'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
const MAX_IMAGE_BYTES=8*1024*1024,STORAGE_KEY='bokeTrainingV2';
const prompts=[
  'これが絶対に言わなそうな一言は？','この光景に「台無しなタイトル」をつけてください','このあと起きた、最悪の出来事とは？','実はこれ、最新の何？','この世界の3秒後、どうなる？','これが世界遺産になった理由とは？','この写真だけが知っている秘密とは？','この状況、何があった？','これを通販番組っぽく紹介してください','神様がこれを作った本当の理由は？','この森羅万象に足りないものは？','この写真で一句。字余り大歓迎。','この風景、よく見ると何が変？','この瞬間に流れているBGMのタイトルは？','地球最後の日に、なぜこれを撮った？','この影の持ち主、何者？','100年後の教科書では、何と呼ばれている？','この空模様、誰の機嫌？','この場所の絶対に守られていないルールとは？','写真の外側で起きていることを教えてください'
];
const stockQueries=['strange architecture','unusual object still life','abstract texture','dramatic clouds landscape','vintage machine object','food still life','surreal landscape','colorful building exterior','empty chair still life','peculiar vehicle object','mysterious forest landscape','odd sign object','vintage portrait','people at work','street scene people','sports portrait'];
const observed={time:'',day:'',battery:null,connection:''};
let state='intro',trainingMode='camera',stream=null,facing='environment',countdownHandle=null,timerHandle=null,recognition=null,cameraAttempt=0;
let currentPromptText='',visualProfile=BokeScoring.neutralVisual(),promptShownAt=0,responseMs=0;
let baselineTotal=null,lastResult=null,lastTip=null,sessionCount=0,pendingSource='',stockObjectUrl='';

function safeLoad(){try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return parsed&&typeof parsed==='object'?parsed:{}}catch{return{}}}
function safeSave(data){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true}catch{return false}}
function profile(){const data=safeLoad();return{best:Number.isFinite(data.best)?data.best:0,feedback:data.feedback&&typeof data.feedback==='object'?data.feedback:{}}}
function setStatus(text){$('#status').textContent=text}
function stopCamera(){cameraAttempt++;if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}video.srcObject=null}
function revokeStockUrl(){if(stockObjectUrl){URL.revokeObjectURL(stockObjectUrl);stockObjectUrl=''}}
function sound(freq=220,duration=.1){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ac=sound.ac??=new Audio(),osc=ac.createOscillator(),gain=ac.createGain();osc.frequency.value=freq;gain.gain.setValueAtTime(.04,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);osc.connect(gain).connect(ac.destination);osc.start();osc.stop(ac.currentTime+duration)}catch{}}
function setState(next){state=next;document.body.dataset.state=next}
function renderCoachRoster(){
  const coaches=BokeScoring.coaches,roster=$('.judge-roster'),panel=$('.judge-panel');
  if(roster)roster.replaceChildren(...coaches.map(coach=>{const span=document.createElement('span');span.textContent=`${coach.name}：${coach.key}`;return span}));
  if(panel)panel.replaceChildren(...coaches.map(coach=>{const span=document.createElement('span');span.textContent=coach.initial;span.title=coach.key;return span}));
}

async function observeSafeWorld(){
  const now=new Date();observed.time=now.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});observed.day=now.toLocaleDateString('ja-JP',{weekday:'long'});observed.connection=navigator.connection?.effectiveType||'';
  try{const battery=await navigator.getBattery?.();if(battery)observed.battery=Math.round(battery.level*100)}catch{}
  const items=[observed.day,observed.time,observed.battery!=null?`電池 ${observed.battery}%`:null,observed.connection?`通信 ${observed.connection}`:null].filter(Boolean);
  const host=$('#observations');host.replaceChildren(...items.map(text=>{const span=document.createElement('span');span.textContent=text;return span}));
}
async function beginMode(mode){
  if(!['camera','stock'].includes(mode))return;trainingMode=mode;document.body.dataset.mode=mode;sound(330,.08);$('#start').classList.add('gone');setState('idle');observeSafeWorld();
  $('#modeBadge').textContent=mode==='camera'?'写真で一言':'フリー素材大喜利';$('#newPhotoBtn').textContent=mode==='camera'?'次の写真で一言へ':'次のフリー素材へ';
  if(mode==='stock'){$('#shutter').hidden=true;$('#flipBtn').hidden=true;$('#stockBtn').hidden=true;$('#prompt').textContent='フリー素材を選んでいます…';setStatus('フリー素材を安全確認しながら探索中…');await loadStockImage();return}
  $('#shutter').hidden=false;$('#shutter').disabled=false;$('#flipBtn').hidden=false;$('#flipBtn').disabled=false;$('#stockBtn').hidden=true;$('#prompt').textContent='目の前の何かを撮ってください。';setStatus('撮影ボタンでカメラを起動');
}
function waitForVideoReady(){return new Promise((resolve,reject)=>{
  if(video.readyState>=2&&video.videoWidth)return resolve();
  const timeout=setTimeout(()=>{cleanup();reject(new Error('camera timeout'))},8000);
  const ready=()=>{cleanup();resolve()},failed=()=>{cleanup();reject(new Error('camera failed'))};
  const cleanup=()=>{clearTimeout(timeout);video.removeEventListener('loadeddata',ready);video.removeEventListener('error',failed)};
  video.addEventListener('loadeddata',ready,{once:true});video.addEventListener('error',failed,{once:true});
})}
async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){setStatus('この端末ではカメラを使えません。モード選択に戻るとフリー素材で遊べます');return}
  setState('camera-starting');$('#shutter').disabled=true;$('#flipBtn').disabled=true;setStatus('カメラを準備中…');
  const attempt=++cameraAttempt;try{
    if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;
    const nextStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:1280}},audio:false});
    if(attempt!==cameraAttempt||document.hidden){nextStream.getTracks().forEach(track=>track.stop());return}stream=nextStream;
    video.srcObject=stream;await video.play();await waitForVideoReady();if(attempt!==cameraAttempt||document.hidden){stopCamera();return}
    $('#cameraStage').classList.add('camera-ready');$('#cameraStage').classList.remove('captured','using-stock');
    setState('camera-ready');$('#shutter').disabled=false;$('#flipBtn').disabled=false;setStatus('シャッターを押して撮影');
  }catch(error){
    if(attempt!==cameraAttempt)return;stopCamera();setState('idle');$('#shutter').disabled=false;$('#flipBtn').disabled=false;
    setStatus(error?.name==='NotAllowedError'?'カメラが許可されていません。モード選択に戻るとフリー素材で遊べます':'カメラを起動できません。モード選択に戻るとフリー素材で遊べます');
  }
}
function onShutter(){if(state==='idle')startCamera();else if(state==='camera-ready')startCountdown()}
function startCountdown(){
  if(state!=='camera-ready'||!video.videoWidth)return;
  setState('countdown');$('#shutter').disabled=true;$('#flipBtn').disabled=true;let n=3;$('#countdown').textContent=n;sound(520,.08);
  countdownHandle=setInterval(()=>{n--;if(n){$('#countdown').textContent=n;sound(520,.08)}else{clearInterval(countdownHandle);countdownHandle=null;$('#countdown').textContent='';capture()}},650);
}
function analyzeSource(source,hint=''){
  const temp=document.createElement('canvas'),tctx=temp.getContext('2d',{willReadFrequently:true});
  const width=source.videoWidth||source.naturalWidth||source.width,height=source.videoHeight||source.naturalHeight||source.height;
  const side=Math.max(1,Math.min(width,height)),size=192;temp.width=size;temp.height=size;
  tctx.drawImage(source,(width-side)/2,(height-side)/2,side,side,0,0,size,size);
  return BokeScoring.analyzeImageData(tctx.getImageData(0,0,size,size),hint);
}
async function detectPeople(source){
  if(!('FaceDetector'in window))return'unknown';
  try{const faces=await new FaceDetector({fastMode:true,maxDetectedFaces:3}).detect(source);return faces.length?'found':'clear'}catch{return'unknown'}
}
async function capture(){
  if(state!=='countdown'&&state!=='camera-ready')return;
  setState('validating');setStatus('写真を確認中…');
  try{
    const width=video.videoWidth,height=video.videoHeight;if(!width||!height)throw new Error('video not ready');
    const side=Math.min(width,height);canvas.width=side;canvas.height=side;ctx.save();
    if(facing==='user'){ctx.translate(side,0);ctx.scale(-1,1)}ctx.drawImage(video,(width-side)/2,(height-side)/2,side,side,0,0,side,side);ctx.restore();
    visualProfile=analyzeSource(canvas);pendingSource='camera';$('#cameraStage').classList.add('captured');stopCamera();
    const result=await detectPeople(canvas);if(result==='found'){rejectPeople();return}await requestPhotoConfirmation(result);
  }catch{stopCamera();setState('idle');$('#cameraStage').classList.remove('captured','camera-ready');$('#shutter').disabled=false;$('#flipBtn').disabled=false;setStatus('撮影に失敗しました。もう一度カメラを起動してください')}
}
function rejectPeople(){
  pendingSource='';setState('idle');$('#cameraStage').classList.remove('captured','camera-ready');$('#confirmPhotoBtn').hidden=true;$('#shutter').hidden=false;$('#shutter').disabled=false;$('#flipBtn').hidden=false;$('#flipBtn').disabled=false;setStatus('人物を検出しました。人物が写らない対象で撮り直してください');navigator.vibrate?.([60,40,60]);
}
async function requestPhotoConfirmation(detectorResult){
  setState('confirming');$('#shutter').hidden=true;$('#stockBtn').hidden=true;$('#flipBtn').hidden=true;$('#confirmPhotoBtn').hidden=false;
  setStatus(detectorResult==='clear'?'人物は検出されませんでした。念のため確認してください':'人物検出に非対応です。写真に人物がいないことを確認してください');
}
function approvePhoto(){
  if(state!=='confirming')return;$('#confirmPhotoBtn').hidden=true;setState('prompt');newPrompt();
}
function validHttpsUrl(value){try{const url=new URL(value);return url.protocol==='https:'?url:null}catch{return null}}
function validOpenverseAsset(value){const url=validHttpsUrl(value);return url&&url.hostname==='api.openverse.org'?url:null}
async function fetchWithTimeout(url,options={},timeout=8000){const controller=new AbortController(),id=setTimeout(()=>controller.abort(),timeout);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(id)}}
async function loadStockImage(){
  if(['camera-starting','countdown','validating','loading-stock'].includes(state))return;
  stopCamera();setState('loading-stock');const btn=$('#stockBtn');btn.disabled=true;$('#shutter').disabled=true;setStatus('フリー画像を安全確認しながら探索中…');
  try{
    const query=stockQueries[Math.floor(Math.random()*stockQueries.length)],params=new URLSearchParams({q:query,license:'cc0,pdm',page_size:'20',mature:'false'});
    const response=await fetchWithTimeout(`https://api.openverse.org/v1/images/?${params}`,{cache:'no-store',credentials:'omit'});if(!response.ok)throw new Error('search failed');
    const data=await response.json(),blockedMinor=/child|children|kid|kids|minor|infant|baby|boy|girl|子供|子ども|幼児|赤ちゃん/i;
    const candidates=(Array.isArray(data.results)?data.results:[]).filter(item=>validOpenverseAsset(item.thumbnail)&&validHttpsUrl(item.foreign_landing_url)&&['cc0','pdm'].includes(String(item.license).toLowerCase())&&!blockedMinor.test(`${item.title||''} ${(item.tags||[]).map(tag=>tag.name||'').join(' ')}`));
    if(!candidates.length)throw new Error('no safe image');const image=candidates[Math.floor(Math.random()*Math.min(candidates.length,10))];
    const imageUrl=validOpenverseAsset(image.thumbnail);const imageResponse=await fetchWithTimeout(imageUrl.href,{cache:'no-store',credentials:'omit'},8000);if(!imageResponse.ok)throw new Error('image failed');
    const type=(imageResponse.headers.get('content-type')||'').toLowerCase(),declared=Number(imageResponse.headers.get('content-length')||0);if(!type.startsWith('image/')||type.includes('svg')||declared>MAX_IMAGE_BYTES)throw new Error('invalid image');
    const blob=await imageResponse.blob();if(blob.size>MAX_IMAGE_BYTES||!blob.type.startsWith('image/')||blob.type.includes('svg'))throw new Error('invalid blob');
    revokeStockUrl();stockObjectUrl=URL.createObjectURL(blob);const img=$('#stockImage');
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=stockObjectUrl});
    const hint=`${image.title||''} ${(image.tags||[]).map(tag=>tag.name||'').join(' ')}`;visualProfile=analyzeSource(img,hint);pendingSource='stock';
    $('#cameraStage').classList.add('camera-ready','captured','using-stock');const credit=$('#attribution');credit.textContent=`${String(image.title||'Untitled').slice(0,80)} — ${String(image.creator||'作者不明').slice(0,60)} / ${String(image.license).toUpperCase()} / Openverse`;credit.href=validHttpsUrl(image.foreign_landing_url).href;credit.classList.add('show');
    setState('prompt');newPrompt();
  }catch{makeOfflineImage()}finally{btn.disabled=false;$('#shutter').disabled=false}
}
function makeOfflineImage(){
  revokeStockUrl();canvas.width=720;canvas.height=720;const palettes=[['#173f5f','#f6d55c','#ed553b'],['#3a0ca3','#4cc9f0','#f72585'],['#283618','#dda15e','#fefae0']],palette=palettes[Math.floor(Math.random()*palettes.length)];ctx.fillStyle=palette[0];ctx.fillRect(0,0,720,720);
  for(let i=0;i<12;i++){ctx.fillStyle=palette[1+i%2];ctx.globalAlpha=.35+Math.random()*.55;ctx.beginPath();ctx.arc(Math.random()*720,Math.random()*720,25+Math.random()*150,0,Math.PI*2);ctx.fill()}
  ctx.globalAlpha=1;ctx.fillStyle=palette[2];ctx.fillRect(120+Math.random()*250,310,220,260);ctx.fillStyle=palette[0];ctx.font='900 30px sans-serif';ctx.textAlign='center';ctx.fillText(['本日だけ昨日','右はだいたい左','雲、休憩中'][Math.floor(Math.random()*3)],360,455);
  visualProfile=analyzeSource(canvas,'abstract geometric color');pendingSource='generated';$('#cameraStage').classList.add('camera-ready','captured');$('#cameraStage').classList.remove('using-stock');$('#flipBtn').hidden=true;$('#stockBtn').hidden=true;$('#shutter').hidden=true;
  const credit=$('#attribution');credit.removeAttribute('href');credit.textContent='通信できないため、端末内で画像を生成しました（保存なし）';credit.classList.add('show','offline-mark');setState('prompt');newPrompt();
}
function newPrompt(){
  if(!currentPromptText||baselineTotal===null)currentPromptText=trainingMode==='camera'?'この写真で一言。':prompts[Math.floor(Math.random()*prompts.length)];
  $('#prompt').textContent=currentPromptText;$('#shutter').hidden=true;$('#stockBtn').hidden=true;$('#answerBtn').hidden=false;$('#textAnswerBtn').hidden=false;$('#textEntry').hidden=true;$('#answerText').textContent='……';$('#answerCard').classList.remove('show');
  promptShownAt=Date.now();setState('prompt');setStatus(SpeechRecognition?'声または文字で、まずは直感から':'音声認識に非対応です。文字で回答できます');
}
function showTextEntry(message='文字で回答できます'){$('#textEntry').hidden=false;$('#textAnswerBtn').hidden=true;$('#answerInput').focus();setStatus(message)}
function startAnswer(){
  if(state!=='prompt'&&state!=='text-ready')return;if(!SpeechRecognition){showTextEntry();setState('text-ready');return}
  recognition=new SpeechRecognition();recognition.lang='ja-JP';recognition.interimResults=true;recognition.continuous=false;let answer='',ended=false,left=15;
  const finalize=()=>{if(ended)return;ended=true;finishAnswer(answer)};recognition.onresult=event=>{answer=[...event.results].map(result=>result[0].transcript).join('').slice(0,120);$('#answerText').textContent=answer||'……';$('#answerCard').classList.add('show')};
  recognition.onerror=event=>{if(event.error==='not-allowed'||event.error==='service-not-allowed'){ended=true;stopListeningUi();setState('text-ready');showTextEntry('マイクを使えません。文字入力に切り替えました')}else finalize()};recognition.onend=finalize;
  try{recognition.start();setState('listening');$('#app').classList.add('listening');$('#answerCard').classList.add('show');setStatus('どうぞ！ 残り15秒');$('#timer span').style.transition='none';$('#timer span').style.width='100%';requestAnimationFrame(()=>{$('#timer span').style.transition='width 15s linear';$('#timer span').style.width='0'});timerHandle=setInterval(()=>{left--;setStatus(`どうぞ！ 残り${left}秒`);if(left<=0){clearInterval(timerHandle);timerHandle=null;try{recognition.stop()}catch{finalize()}}},1000)}catch{ended=true;stopListeningUi();setState('text-ready');showTextEntry('音声認識を開始できません。文字入力に切り替えました')}
}
function stopListeningUi(){clearInterval(timerHandle);timerHandle=null;$('#app').classList.remove('listening');recognition=null}
function finishAnswer(answer){
  if(!['listening','prompt','text-ready'].includes(state))return;stopListeningUi();const clean=String(answer||'').trim();if(!clean){setState('text-ready');showTextEntry('音声を認識できませんでした。文字で入力してください');return}
  responseMs=Math.max(0,Date.now()-promptShownAt);$('#answerText').textContent=clean;$('#answerCard').classList.add('show');$('#answerBtn').hidden=true;$('#textAnswerBtn').hidden=true;$('#textEntry').hidden=true;setState('judging');setStatus('写真・お題・回答の関係を分析中…');judge(clean);
}
function judge(answer){
  $('#judging').classList.add('show');sound(110,.4);const result=BokeScoring.scoreAnswer({answer,prompt:currentPromptText,responseMs,visual:visualProfile});
  setTimeout(()=>{$('#judging').classList.remove('show');showResult(result)},900);
}
function showResult(result){
  lastResult=result;sessionCount++;lastTip=BokeScoring.trainingTip(result,profile().feedback);setState('result');sound(result.total>=58?880:330,.5);$('#score').textContent='0';$('#judgeComment').textContent=result.comment;
  const breakdown=$('#breakdown');breakdown.className='breakdown judge-scores';breakdown.replaceChildren(...result.scores.map(item=>{const span=document.createElement('span'),score=document.createElement('b');span.append(item.name,score,item.key);score.textContent=item.score;return span}));
  const coachTip=$('#coachTip');coachTip.replaceChildren();const tipTitle=document.createElement('b');tipTitle.textContent=`NEXT CHALLENGE：${lastTip.skill}`;coachTip.append(tipTitle,lastTip.text);
  const growth=$('#growth');if(baselineTotal!=null){const diff=result.total-baselineTotal;growth.textContent=diff>0?`前回から +${diff}点`:`前回比 ${diff}点`;growth.className=`growth ${diff>0?'up':''}`}else{growth.textContent=`本日 ${sessionCount}回答目`;growth.className='growth'}
  const d=result.dimensions;$('#trace').textContent=`回答 ${result.len}文字／回答まで ${(result.responseMs/1000).toFixed(1)}秒\n写真接続 ${Math.round(d.visualGrounding*100)}・お題適合 ${Math.round(d.promptFit*100)}・新鮮さ ${Math.round(d.novelty*100)}・意外性 ${Math.round(d.surprise*100)}・ひねり ${Math.round(d.twist*100)}・展開 ${Math.round(d.escalation*100)}\n採点 ${result.scoringVersion}／特徴 ${result.featureVersion}／設定 ${result.configVersion}（${result.configSource==='network'?'更新済み':result.configSource==='cached'?'保存済み':'内蔵'}）`;
  $('.calibrate').classList.remove('done');$('.calibrate').removeAttribute('data-message');$('#nearBtn').disabled=false;$('#farBtn').disabled=false;$('#result').classList.add('show');
  let number=0;const animation=setInterval(()=>{number++;$('#score').textContent=number;if(number>=result.total)clearInterval(animation)},25);
  const data=safeLoad(),best=Math.max(result.total,Number(data.best)||0);data.best=best;safeSave(data);$('#best').textContent=`${best}点`;navigator.vibrate?.(result.total>=58?[50,40,50,40,150]:40);
}
function retryTraining(){
  baselineTotal=lastResult?.total??null;$('#result').classList.remove('show');currentPromptText=$('#prompt').textContent;$('#answerText').textContent='……';$('#answerCard').classList.remove('show');promptShownAt=Date.now();$('#answerBtn').hidden=false;$('#textAnswerBtn').hidden=false;setState('prompt');setStatus('改善ヒントを使って、もう一度');
}
async function resetRound(){
  $('#result').classList.remove('show');baselineTotal=null;lastResult=null;lastTip=null;currentPromptText='';pendingSource='';visualProfile=BokeScoring.neutralVisual();revokeStockUrl();
  $('#cameraStage').classList.remove('captured','using-stock','camera-ready');$('#stockImage').removeAttribute('src');$('#attribution').className='attribution';$('#attribution').removeAttribute('href');$('#confirmPhotoBtn').hidden=true;$('#answerBtn').hidden=true;$('#textAnswerBtn').hidden=true;$('#textEntry').hidden=true;$('#stockBtn').disabled=false;setState('idle');
  if(trainingMode==='stock'){$('#flipBtn').hidden=true;$('#shutter').hidden=true;$('#stockBtn').hidden=true;$('#prompt').textContent='フリー素材を選んでいます…';setStatus('次のフリー素材を探索中…');await loadStockImage();return}
  $('#flipBtn').hidden=false;$('#flipBtn').disabled=false;$('#shutter').hidden=false;$('#shutter').disabled=false;$('#stockBtn').hidden=true;$('#prompt').textContent='目の前の何かを撮ってください。';setStatus('撮影ボタンでカメラを起動');
}
function returnToModeSelect(){
  clearInterval(countdownHandle);countdownHandle=null;stopListeningUi();stopCamera();revokeStockUrl();$('#result').classList.remove('show');$('#judging').classList.remove('show');$('#start').classList.remove('gone');baselineTotal=null;lastResult=null;lastTip=null;currentPromptText='';pendingSource='';visualProfile=BokeScoring.neutralVisual();delete document.body.dataset.mode;
  $('#cameraStage').classList.remove('captured','using-stock','camera-ready');$('#stockImage').removeAttribute('src');$('#attribution').className='attribution';$('#attribution').removeAttribute('href');$('#confirmPhotoBtn').hidden=true;$('#answerBtn').hidden=true;$('#textAnswerBtn').hidden=true;$('#textEntry').hidden=true;$('#flipBtn').hidden=false;$('#shutter').hidden=false;$('#stockBtn').hidden=false;$('#modeBadge').textContent='モードを選択';$('#prompt').textContent='まずはトレーニングモードを選んでください。';setState('intro');setStatus('モードを選択してください');
}
function recordCalibration(type){
  if(!lastTip||!['near','far'].includes(type))return;const data=safeLoad();data.feedback=data.feedback&&typeof data.feedback==='object'?data.feedback:{};const vote=data.feedback[lastTip.key]||{near:0,far:0};vote[type]=Math.min(99,(Number(vote[type])||0)+1);data.feedback[lastTip.key]=vote;
  const saved=safeSave(data),box=$('.calibrate');box.classList.add('done');box.dataset.message=saved?'次のヒント選びに反映しました':'端末の保存設定により反映できませんでした';$('#nearBtn').disabled=true;$('#farBtn').disabled=true;
}
function clearLocalData(){try{localStorage.removeItem(STORAGE_KEY)}catch{}$('#best').textContent='—';$('#clearDataBtn').textContent='削除しました';setTimeout(()=>{$('#clearDataBtn').textContent='端末内の記録を削除'},1600)}

$('#cameraModeBtn').addEventListener('click',()=>beginMode('camera'));$('#stockModeBtn').addEventListener('click',()=>beginMode('stock'));$('#shutter').addEventListener('click',onShutter);$('#stockBtn').addEventListener('click',loadStockImage);$('#confirmPhotoBtn').addEventListener('click',approvePhoto);$('#answerBtn').addEventListener('click',startAnswer);$('#textAnswerBtn').addEventListener('click',()=>{setState('text-ready');showTextEntry()});
$('#textEntry').addEventListener('submit',event=>{event.preventDefault();finishAnswer($('#answerInput').value);$('#answerInput').value=''});
$('#flipBtn').addEventListener('click',async()=>{if(state!=='camera-ready')return;facing=facing==='environment'?'user':'environment';await startCamera()});
$('#nearBtn').addEventListener('click',()=>recordCalibration('near'));$('#farBtn').addEventListener('click',()=>recordCalibration('far'));$('#retryBtn').addEventListener('click',retryTraining);$('#newPhotoBtn').addEventListener('click',resetRound);$('#changeModeBtn').addEventListener('click',returnToModeSelect);$('#clearDataBtn').addEventListener('click',clearLocalData);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(countdownHandle);countdownHandle=null;$('#countdown').textContent='';stopCamera();if(['camera-ready','camera-starting','countdown','validating'].includes(state)){setState('idle');$('#cameraStage').classList.remove('camera-ready','captured');$('#shutter').hidden=false;$('#shutter').disabled=false;$('#flipBtn').hidden=false;$('#flipBtn').disabled=false;setStatus('カメラを停止しました。撮影ボタンで再開できます')}}});
addEventListener('pagehide',()=>{stopCamera();revokeStockUrl()});
const initial=profile();$('#best').textContent=initial.best?`${initial.best}点`:'—';if(!SpeechRecognition)$('#answerBtn b').textContent='文字でボケる';
renderCoachRoster();BokeScoring.loadCoachConfig('./research/judge-criteria.json').then(()=>renderCoachRoster()).catch(()=>renderCoachRoster());
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
