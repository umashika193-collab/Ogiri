'use strict';
let deferredInstallPrompt=null;
const pwaPanel=document.querySelector('#pwaPanel');
const pwaTitle=document.querySelector('#pwaTitle');
const pwaMessage=document.querySelector('#pwaMessage');
const openBrowserBtn=document.querySelector('#openBrowserBtn');
const copyUrlBtn=document.querySelector('#copyUrlBtn');
const installPwaBtn=document.querySelector('#installPwaBtn');
const installHelpBtn=document.querySelector('#installHelpBtn');
const installHelp=document.querySelector('#installHelp');

function isStandalonePwa(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function isIosBrowser(){return /iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream}
function isEmbeddedBrowser(){
  const ua=navigator.userAgent||'',referrer=document.referrer||'';
  return /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|TikTok|Snapchat|; wv\)|\bwv\b|WebView|Electron/i.test(ua)||/l\.facebook\.com|instagram\.com|line\.me|t\.co/i.test(referrer);
}
function setPwaControls({open=false,copy=false,install=false,help=false}={}){
  openBrowserBtn.hidden=!open;copyUrlBtn.hidden=!copy;installPwaBtn.hidden=!install;installHelpBtn.hidden=!help;
}
function showInstallHelp(){
  installHelp.hidden=false;
  installHelp.textContent=isIosBrowser()?'Safariの共有ボタンから「ホーム画面に追加」を選んでください。':'ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。';
}
function renderPwaPanel(){
  if(!pwaPanel)return;
  installHelp.hidden=true;
  if(isStandalonePwa()){pwaPanel.hidden=true;return}
  pwaPanel.hidden=false;
  const appUrl=new URL('.',location.href).href;openBrowserBtn.href=appUrl;
  if(isEmbeddedBrowser()){
    pwaTitle.textContent='標準ブラウザで開いてください';
    pwaMessage.textContent='カメラ・音声・インストールを安定して使うため、Safari／Chrome／Edgeで開き直してください。';
    setPwaControls({open:true,copy:true});return;
  }
  pwaTitle.textContent='アプリとして使えます';
  const needsBrowserFallback=!deferredInstallPrompt&&!isIosBrowser();
  pwaMessage.textContent=deferredInstallPrompt?'この端末へインストールすると、ホーム画面からすぐ遊べます。':'インストールが始まらない場合は、標準ブラウザで開くか追加手順を確認してください。';
  installPwaBtn.textContent=deferredInstallPrompt?'アプリをインストール':isIosBrowser()?'ホーム画面に追加':'インストール方法';
  setPwaControls({open:needsBrowserFallback,copy:needsBrowserFallback,install:true,help:Boolean(deferredInstallPrompt)});
}

copyUrlBtn?.addEventListener('click',async()=>{
  const appUrl=new URL('.',location.href).href;
  try{await navigator.clipboard.writeText(appUrl);copyUrlBtn.textContent='コピーしました'}catch{installHelp.hidden=false;installHelp.textContent=`このURLをコピーしてください：${appUrl}`}
});
installHelpBtn?.addEventListener('click',()=>{if(installHelp.hidden)showInstallHelp();else installHelp.hidden=true});
installPwaBtn?.addEventListener('click',async()=>{
  if(!deferredInstallPrompt){showInstallHelp();return}
  const promptEvent=deferredInstallPrompt;deferredInstallPrompt=null;
  await promptEvent.prompt();
  await promptEvent.userChoice.catch(()=>null);
  renderPwaPanel();
});
addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;renderPwaPanel()});
addEventListener('appinstalled',()=>{deferredInstallPrompt=null;pwaPanel.hidden=true});
renderPwaPanel();
