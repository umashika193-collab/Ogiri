'use strict';
const $=selector=>document.querySelector(selector);
const video=$('#camera'),canvas=$('#photo'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
const MAX_IMAGE_BYTES=8*1024*1024,STORAGE_KEY='bokeTrainingV2';
const PHOTO_PROMPT='この写真で一言。';
const stockSourceDeck=StockLibrary.createShuffleDeck(StockLibrary.sourceMix.map((kind,index)=>({id:`${kind}-${index}`,kind})));
let offlinePhotoDeck=StockLibrary.createShuffleDeck(StockLibrary.offlinePhotos);
const offlineSheetCount=new Set(StockLibrary.offlinePhotos.map(photo=>photo.sheet)).size,offlineUnavailableSheets=new Set();
const observed={time:'',day:'',battery:null,connection:''};
let state='intro',trainingMode='camera',stream=null,facing='environment',countdownHandle=null,timerHandle=null,recognition=null,cameraAttempt=0;
let currentPromptText='',visualProfile=BokeScoring.neutralVisual(),promptShownAt=0,responseMs=0;
let baselineTotal=null,lastResult=null,lastTip=null,lastAnswer='',sessionCount=0,pendingSource='',stockObjectUrl='',recentCourseIds=[],recentStockIds=[],recentStockVisuals=[],commonsUnavailableUntil=0;

function safeLoad(){try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return parsed&&typeof parsed==='object'?parsed:{}}catch{return{}}}
function safeSave(data){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true}catch{return false}}
function profile(){const data=safeLoad();return{best:Number.isFinite(data.localBest)?data.localBest:0,feedback:data.feedback&&typeof data.feedback==='object'?data.feedback:{}}}
function setStatus(text){$('#status').textContent=text}
function setStockButton(text,icon='↻'){const btn=$('#stockBtn');btn.querySelector('b').textContent=icon;btn.querySelector('span').textContent=text}
function stopCamera(){cameraAttempt++;if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}video.srcObject=null}
function revokeStockUrl(){if(stockObjectUrl){URL.revokeObjectURL(stockObjectUrl);stockObjectUrl=''}}
function sound(freq=220,duration=.1){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ac=sound.ac??=new Audio(),osc=ac.createOscillator(),gain=ac.createGain();osc.frequency.value=freq;gain.gain.setValueAtTime(.04,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);osc.connect(gain).connect(ac.destination);osc.start();osc.stop(ac.currentTime+duration)}catch{}}
function setState(next){state=next;document.body.dataset.state=next}
function renderCoachRoster(){
  const coaches=BokeScoring.localJurors,roster=$('.judge-roster'),panel=$('.judge-panel');
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
  $('#modeBackInlineBtn').hidden=false;
  $('#modeBadge').textContent=mode==='camera'?'写真で一言':'フリー素材で一言';$('#newPhotoBtn').textContent=mode==='camera'?'次の写真で一言へ':'次のフリー素材で一言へ';
  if(mode==='stock'){setStockButton('別の素材にする');$('#shutter').hidden=true;$('#flipBtn').hidden=true;$('#stockBtn').hidden=true;$('#prompt').textContent='フリー素材を選んでいます…';setStatus('種類が続かないよう素材を探索中…');await loadStockImage();return}
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
function validCommonsAsset(value){const url=validHttpsUrl(value);return url&&url.hostname==='upload.wikimedia.org'?url:null}
function validCommonsPage(value){const url=validHttpsUrl(value);return url&&url.hostname==='commons.wikimedia.org'?url:null}
async function fetchWithTimeout(url,options={},timeout=8000){const controller=new AbortController(),id=setTimeout(()=>controller.abort(),timeout);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(id)}}
async function prepareCommonsCandidate(image){
  const imageUrl=validCommonsAsset(image.thumbnail);if(!imageUrl)throw new Error('invalid thumbnail');const imageResponse=await fetchWithTimeout(imageUrl.href,{cache:'no-store',credentials:'omit'},8000);if(!imageResponse.ok)throw new Error('image failed');
  const type=(imageResponse.headers.get('content-type')||'').toLowerCase(),declared=Number(imageResponse.headers.get('content-length')||0);if(!type.startsWith('image/jpeg')||declared>MAX_IMAGE_BYTES)throw new Error('invalid image');
  const blob=await imageResponse.blob();if(blob.size>MAX_IMAGE_BYTES||!blob.type.toLowerCase().startsWith('image/jpeg'))throw new Error('invalid blob');
  revokeStockUrl();stockObjectUrl=URL.createObjectURL(blob);const img=$('#stockImage');await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=stockObjectUrl});
  return{profile:analyzeSource(img,image.hint||image.title||''),img};
}
async function loadCommonsImage(){
  const params=new URLSearchParams({action:'query',generator:'search',gsrnamespace:'6',gsrsearch:StockLibrary.commonsQuery(),gsrlimit:'18',prop:'imageinfo',iiprop:'url|extmetadata|mime|mediatype',iiurlwidth:'900',iiextmetadatafilter:'LicenseShortName|Artist|ImageDescription|Categories',iiextmetadatalanguage:'ja',iiextmetadatafallback:'1',format:'json',origin:'*'}),response=await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params}`,{cache:'no-store',credentials:'omit'},9000);
  if(!response.ok)throw new Error('commons search failed');const data=await response.json(),pages=Object.values(data.query?.pages||{}),candidates=StockLibrary.pickCommonsCandidates(pages,recentStockIds);if(!candidates.length)throw new Error('no safe commons image');
  let image=null,prepared=null;const attempts=Math.min(4,candidates.length);
  for(let i=0;i<attempts;i++){try{const next=await prepareCommonsCandidate(candidates[i]);if(i<attempts-1&&!StockLibrary.isVisuallyDistinct(next.profile,recentStockVisuals))continue;image=candidates[i];prepared=next;break}catch{}}
  if(!image||!prepared)throw new Error('no usable commons image');const pageUrl=validCommonsPage(image.foreign_landing_url);if(!pageUrl)throw new Error('invalid commons page');visualProfile=prepared.profile;pendingSource='commons';recentStockIds=[image.id,...recentStockIds.filter(id=>id!==image.id)].slice(0,20);recentStockVisuals=[visualProfile,...recentStockVisuals].slice(0,4);
  $('#cameraStage').classList.add('camera-ready','captured','using-stock');const credit=$('#attribution');credit.textContent=StockLibrary.japaneseCommonsCredit(image);credit.href=pageUrl.href;credit.className='attribution show';setState('prompt');newPrompt();
}
async function loadStockImage(){
  if(['camera-starting','countdown','validating','loading-stock'].includes(state))return;
  stopCamera();setState('loading-stock');const btn=$('#stockBtn');btn.disabled=true;$('#shutter').disabled=true;setStatus('写真素材を選んでいます…');
  try{
    if(location.protocol==='file:'){setStatus('PC内の同梱写真を読み込み中…');await makeOfflineImage();return}
    const source=stockSourceDeck.next();if(source.kind==='local'||navigator.onLine===false||Date.now()<commonsUnavailableUntil){setStatus('同梱写真を読み込み中…');await makeOfflineImage();return}
    setStatus('Wikimedia Commonsから実写写真を探しています…');try{await loadCommonsImage()}catch{commonsUnavailableUntil=Date.now()+2*60*1000;setStatus('通信素材を使えないため、同梱写真に切り替えます…');await makeOfflineImage()}
  }finally{btn.disabled=false;$('#shutter').disabled=false}
}
async function makeOfflineImage(){
  if(offlineUnavailableSheets.size>=offlineSheetCount){offlineUnavailableSheets.clear();offlinePhotoDeck=StockLibrary.createShuffleDeck(StockLibrary.offlinePhotos)}
  for(let attempt=0;attempt<StockLibrary.offlinePhotos.length;attempt++){
    const photo=offlinePhotoDeck.next();if(!photo||offlineUnavailableSheets.has(photo.sheet))continue;
    try{
    const sheet=new Image();sheet.decoding='async';await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{cleanup();reject(new Error('offline image timeout'))},6000),cleanup=()=>{clearTimeout(timeout);sheet.onload=null;sheet.onerror=null};sheet.onload=()=>{if(!sheet.naturalWidth||!sheet.naturalHeight){cleanup();reject(new Error('offline image empty'));return}cleanup();resolve()};sheet.onerror=()=>{cleanup();reject(new Error('offline image failed'))};sheet.src=new URL(photo.sheet,document.baseURI).href});
    revokeStockUrl();canvas.width=720;canvas.height=720;const cellWidth=sheet.naturalWidth/3,cellHeight=sheet.naturalHeight/3,inset=Math.max(2,Math.round(Math.min(cellWidth,cellHeight)*.008));ctx.globalAlpha=1;ctx.drawImage(sheet,photo.col*cellWidth+inset,photo.row*cellHeight+inset,cellWidth-inset*2,cellHeight-inset*2,0,0,720,720);
    visualProfile=location.protocol==='file:'?BokeScoring.neutralVisual(photo.hint):analyzeSource(canvas,photo.hint);recentStockVisuals=[visualProfile,...recentStockVisuals].slice(0,4);pendingSource='offline-photo';$('#cameraStage').classList.add('camera-ready','captured');$('#cameraStage').classList.remove('using-stock');$('#flipBtn').hidden=true;$('#shutter').hidden=true;
    const credit=$('#attribution');credit.removeAttribute('href');credit.textContent=`同梱実写風素材：${photo.label}（AI生成）`;credit.className='attribution show offline-mark';setState('prompt');newPrompt();return;
    }catch{offlineUnavailableSheets.add(photo.sheet);offlinePhotoDeck=StockLibrary.createShuffleDeck(StockLibrary.offlinePhotos.filter(item=>!offlineUnavailableSheets.has(item.sheet)))}
  }
  revokeStockUrl();pendingSource='';visualProfile=BokeScoring.neutralVisual();$('#cameraStage').classList.remove('captured','using-stock','camera-ready');const credit=$('#attribution');credit.className='attribution';credit.removeAttribute('href');credit.textContent='';$('#answerBtn').hidden=true;$('#textAnswerBtn').hidden=true;$('#stockBtn').hidden=false;$('#prompt').textContent='素材を読み込めませんでした。';setState('idle');setStatus('「別の素材にする」で、写真をもう一度読み込んでください');
}
function newPrompt(){
  currentPromptText=PHOTO_PROMPT;
  $('#prompt').textContent=currentPromptText;$('#shutter').hidden=true;$('#stockBtn').hidden=trainingMode!=='stock';$('#answerBtn').hidden=false;$('#textAnswerBtn').hidden=false;$('#textEntry').hidden=true;$('#answerText').textContent='……';$('#answerCard').classList.remove('show');
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
  if(!['listening','prompt','text-ready'].includes(state))return;stopListeningUi();const clean=[...String(answer||'')].slice(0,120).join('').trim();if(!clean){setState('text-ready');showTextEntry('音声を認識できませんでした。文字で入力してください');return}
  lastAnswer=clean;responseMs=Math.max(0,Date.now()-promptShownAt);$('#answerText').textContent=clean;$('#answerCard').classList.add('show');$('#answerBtn').hidden=true;$('#textAnswerBtn').hidden=true;$('#textEntry').hidden=true;$('#stockBtn').hidden=true;setState('judging');setStatus('端末内で形式とテンポを分析中…');judge(clean);
}
function judge(answer){
  $('#judging').classList.add('show');sound(110,.4);const result=BokeScoring.scoreAnswer({answer,prompt:currentPromptText,responseMs,visual:visualProfile});
  setTimeout(()=>{$('#judging').classList.remove('show');showResult(result)},900);
}
function showResult(result){
  const userProfile=profile();lastResult=result;sessionCount++;lastTip=BokeScoring.courseAdvice(result,{feedback:userProfile.feedback,recentCourseIds});recentCourseIds=[lastTip.courseId,...recentCourseIds.filter(id=>id!==lastTip.courseId)].slice(0,4);setState('result');setStatus('端末内の三役審査と練習コースの提案が完了しました');sound(result.localScore>=65?880:330,.5);$('#score').textContent='0';
  const breakdown=$('#breakdown');breakdown.className='breakdown local-signals';breakdown.replaceChildren(...result.localSignals.map(item=>{const span=document.createElement('span'),score=document.createElement('b');span.append(item.label,score);score.textContent=`${Math.round(item.value*100)}`;return span}));
  const jury=BokeScoring.localJury(result),strong=[...jury].sort((a,b)=>b.score-a.score)[0];$('#judgeComment').textContent=`${strong.name}「${strong.comment}」 次の練習は、平均との差とローテーションから選びました。`;
  $('#localJuryCards').replaceChildren(...jury.map(juror=>{const card=document.createElement('article'),head=document.createElement('div'),icon=document.createElement('i'),name=document.createElement('b'),score=document.createElement('strong'),comment=document.createElement('p');icon.textContent=juror.initial;name.textContent=`${juror.name}／${juror.key}`;score.textContent=juror.score;comment.textContent=juror.comment;head.append(icon,name,score);card.append(head,comment);return card}));
  const coachTip=$('#coachTip');coachTip.replaceChildren();const tipTitle=document.createElement('b'),course=document.createElement('strong'),evidence=document.createElement('p'),advice=document.createElement('p'),basis=document.createElement('small');tipTitle.textContent='研究データからの練習コース';course.textContent=`「${lastTip.course}」`;evidence.textContent=lastTip.evidence;advice.textContent=`次は${lastTip.focusLabel}を意識：${lastTip.advice}`;basis.textContent=`${lastTip.basis} ${lastTip.focusLabel}の平均との差 ${lastTip.focusDelta>=0?'+':''}${lastTip.focusDelta}`;coachTip.append(tipTitle,course,evidence,advice,basis);
  const growth=$('#growth');if(baselineTotal!=null){const diff=result.localScore-baselineTotal;growth.textContent=diff>0?`ローカル前回比 +${diff}`:`ローカル前回比 ${diff}`;growth.className=`growth ${diff>0?'up':''}`}else{growth.textContent=`本日 ${sessionCount}回答目`;growth.className='growth'}
  const localText=result.localSignals.map(item=>`${item.label} ${Math.round(item.value*100)}`).join('・');$('#trace').textContent=`回答 ${result.len}文字／回答まで ${(result.responseMs/1000).toFixed(1)}秒\n${localText}\n練習コース ${lastTip.course}（${lastTip.focusLabel} 平均差 ${lastTip.focusDelta>=0?'+':''}${lastTip.focusDelta}）／得点への加算なし\nローカル分析 ${result.scoringVersion}／特徴 ${result.featureVersion}／設定 ${result.configVersion}（${result.configSource==='network'?'更新済み':result.configSource==='cached'?'保存済み':'内蔵'}）`;
  $('.calibrate').classList.remove('done');$('.calibrate').removeAttribute('data-message');$('#nearBtn').disabled=false;$('#farBtn').disabled=false;$('#result').classList.add('show');
  let number=0;const animation=setInterval(()=>{number++;$('#score').textContent=number;if(number>=result.localScore)clearInterval(animation)},20);
  const data=safeLoad(),best=Math.max(result.localScore,Number(data.localBest)||0);data.localBest=best;safeSave(data);$('#best').textContent=`${best}点`;navigator.vibrate?.(result.localScore>=65?[50,40,50,40,150]:40);
}
function retryTraining(){
  baselineTotal=lastResult?.localScore??null;$('#result').classList.remove('show');currentPromptText=$('#prompt').textContent;lastAnswer='';$('#answerText').textContent='……';$('#answerCard').classList.remove('show');promptShownAt=Date.now();$('#answerBtn').hidden=false;$('#textAnswerBtn').hidden=false;$('#stockBtn').hidden=trainingMode!=='stock';setState('prompt');setStatus('改善ヒントを使って、もう一度');
}
async function replaceStockImage(){
  if(trainingMode!=='stock'){await beginMode('stock');return}if(state==='loading-stock')return;$('#result').classList.remove('show');baselineTotal=null;lastResult=null;lastTip=null;lastAnswer='';currentPromptText='';$('#answerText').textContent='……';$('#answerCard').classList.remove('show');$('#answerBtn').hidden=true;$('#textAnswerBtn').hidden=true;$('#textEntry').hidden=true;$('#prompt').textContent='別の種類を選んでいます…';await loadStockImage();
}
async function resetRound(){
  $('#result').classList.remove('show');baselineTotal=null;lastResult=null;lastTip=null;lastAnswer='';currentPromptText='';pendingSource='';visualProfile=BokeScoring.neutralVisual();revokeStockUrl();
  $('#cameraStage').classList.remove('captured','using-stock','camera-ready');$('#stockImage').removeAttribute('src');$('#attribution').className='attribution';$('#attribution').removeAttribute('href');$('#confirmPhotoBtn').hidden=true;$('#answerBtn').hidden=true;$('#textAnswerBtn').hidden=true;$('#textEntry').hidden=true;$('#stockBtn').disabled=false;setState('idle');
  if(trainingMode==='stock'){$('#flipBtn').hidden=true;$('#shutter').hidden=true;$('#stockBtn').hidden=true;$('#prompt').textContent='フリー素材を選んでいます…';setStatus('次のフリー素材を探索中…');await loadStockImage();return}
  $('#flipBtn').hidden=false;$('#flipBtn').disabled=false;$('#shutter').hidden=false;$('#shutter').disabled=false;$('#stockBtn').hidden=true;$('#prompt').textContent='目の前の何かを撮ってください。';setStatus('撮影ボタンでカメラを起動');
}
function returnToModeSelect(){
  clearInterval(countdownHandle);countdownHandle=null;stopListeningUi();stopCamera();revokeStockUrl();$('#result').classList.remove('show');$('#judging').classList.remove('show');$('#start').classList.remove('gone');baselineTotal=null;lastResult=null;lastTip=null;lastAnswer='';currentPromptText='';pendingSource='';visualProfile=BokeScoring.neutralVisual();delete document.body.dataset.mode;
  $('#cameraStage').classList.remove('captured','using-stock','camera-ready');$('#stockImage').removeAttribute('src');$('#attribution').className='attribution';$('#attribution').removeAttribute('href');$('#answerText').textContent='……';$('#answerCard').classList.remove('show');$('#confirmPhotoBtn').hidden=true;$('#answerBtn').hidden=true;$('#textAnswerBtn').hidden=true;$('#textEntry').hidden=true;$('#flipBtn').hidden=false;$('#shutter').hidden=false;$('#stockBtn').hidden=false;$('#modeBackInlineBtn').hidden=true;$('#modeBadge').textContent='モードを選択';$('#prompt').textContent='まずはトレーニングモードを選んでください。';setState('intro');setStatus('モードを選択してください');scrollTo({top:0,behavior:'auto'});$('#prompt').focus?.();
}
function recordCalibration(type){
  if(!lastTip||!['near','far'].includes(type))return;const data=safeLoad();data.feedback=data.feedback&&typeof data.feedback==='object'?data.feedback:{};const vote=data.feedback[lastTip.key]||{near:0,far:0};vote[type]=Math.min(99,(Number(vote[type])||0)+1);data.feedback[lastTip.key]=vote;
  const saved=safeSave(data),box=$('.calibrate');box.classList.add('done');box.dataset.message=saved?'次のヒント選びに反映しました':'端末の保存設定により反映できませんでした';$('#nearBtn').disabled=true;$('#farBtn').disabled=true;
}
function clearLocalData(){try{localStorage.removeItem(STORAGE_KEY)}catch{}$('#best').textContent='—';$('#clearDataBtn').textContent='削除しました';setTimeout(()=>{$('#clearDataBtn').textContent='端末内の記録を削除'},1600)}

$('#cameraModeBtn').addEventListener('click',()=>beginMode('camera'));$('#stockModeBtn').addEventListener('click',()=>beginMode('stock'));$('#shutter').addEventListener('click',onShutter);$('#stockBtn').addEventListener('click',replaceStockImage);$('#confirmPhotoBtn').addEventListener('click',approvePhoto);$('#answerBtn').addEventListener('click',startAnswer);$('#textAnswerBtn').addEventListener('click',()=>{setState('text-ready');showTextEntry()});
$('#textEntry').addEventListener('submit',event=>{event.preventDefault();finishAnswer($('#answerInput').value);$('#answerInput').value=''});
$('#flipBtn').addEventListener('click',async()=>{if(state!=='camera-ready')return;facing=facing==='environment'?'user':'environment';await startCamera()});
$('#nearBtn').addEventListener('click',()=>recordCalibration('near'));$('#farBtn').addEventListener('click',()=>recordCalibration('far'));$('#retryBtn').addEventListener('click',retryTraining);$('#newPhotoBtn').addEventListener('click',resetRound);$('#changeModeBtn').addEventListener('click',returnToModeSelect);$('#modeBackInlineBtn').addEventListener('click',returnToModeSelect);$('#clearDataBtn').addEventListener('click',clearLocalData);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(countdownHandle);countdownHandle=null;$('#countdown').textContent='';stopCamera();if(['camera-ready','camera-starting','countdown','validating'].includes(state)){setState('idle');$('#cameraStage').classList.remove('camera-ready','captured');$('#shutter').hidden=false;$('#shutter').disabled=false;$('#flipBtn').hidden=false;$('#flipBtn').disabled=false;setStatus('カメラを停止しました。撮影ボタンで再開できます')}}});
addEventListener('pagehide',()=>{stopCamera();revokeStockUrl()});
const initial=profile();$('#best').textContent=initial.best?`${initial.best}点`:'—';if(!SpeechRecognition)$('#answerBtn b').textContent='文字でボケる';
renderCoachRoster();BokeScoring.loadCoachConfig('./research/judge-criteria.json').then(()=>renderCoachRoster()).catch(()=>renderCoachRoster());
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
