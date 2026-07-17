const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','pwa-ui.js'),'utf8');

function render({userAgent='',referrer=''}){
  const makeElement=()=>({hidden:true,textContent:'',href:'',target:'_blank',addEventListener(){}});
  const elements=Object.fromEntries([
    '#pwaPanel','#pwaTitle','#pwaMessage','#openBrowserBtn','#copyUrlBtn',
    '#installPwaBtn','#installHelpBtn','#installHelp'
  ].map(selector=>[selector,makeElement()]));
  const sandbox={
    document:{referrer,querySelector:selector=>elements[selector]||null},
    navigator:{userAgent,standalone:false},
    window:{MSStream:false},
    location:{href:'https://example.com/ogiri/index.html'},
    matchMedia:()=>({matches:false}),
    addEventListener(){},URL
  };
  vm.runInNewContext(source,sandbox);
  return elements;
}

test('LINE内ブラウザでは外部ブラウザ指定を付けて同じ画面で開く',()=>{
  const elements=render({userAgent:'Mozilla/5.0 (iPhone) Line/15.20.0'});
  assert.equal(elements['#openBrowserBtn'].href,'https://example.com/ogiri/?openExternalBrowser=1');
  assert.equal(elements['#openBrowserBtn'].target,'_self');
  assert.equal(elements['#openBrowserBtn'].hidden,false);
  assert.match(elements['#pwaMessage'].textContent,/デフォルトのブラウザで開く/);
});

test('標準ブラウザではLINE専用パラメータを付けない',()=>{
  const elements=render({userAgent:'Mozilla/5.0 Chrome/140.0'});
  assert.equal(elements['#openBrowserBtn'].href,'https://example.com/ogiri/');
  assert.equal(elements['#openBrowserBtn'].target,'_blank');
  assert.equal(elements['#installPwaBtn'].hidden,false);
});
