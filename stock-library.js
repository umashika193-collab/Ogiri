(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StockLibrary=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const OFFLINE_PHOTOS=[
    ['meeting-chair','./assets/offline-realworld-1.webp',0,0,'広すぎる会議室と一脚の椅子','adult office chair empty meeting room'],
    ['dog-vending','./assets/offline-realworld-1.webp',1,0,'自動販売機を見つめる犬','dog vending machine quiet alley'],
    ['cart-beach','./assets/offline-realworld-1.webp',2,0,'海辺の買い物カート','shopping cart beach ocean'],
    ['shoe-dinner','./assets/offline-realworld-1.webp',0,1,'皿に盛られたスニーカー','sneaker dinner plate restaurant'],
    ['box-door','./assets/offline-realworld-1.webp',1,1,'小さな入口と巨大な荷物','adult worker huge box small doorway'],
    ['vegetable-bike','./assets/offline-realworld-1.webp',2,1,'野菜を積みすぎた自転車','bicycle vegetables street'],
    ['indoor-umbrella','./assets/offline-realworld-1.webp',0,2,'室内で開いた傘','umbrella indoors ceiling leak'],
    ['cone-dinner','./assets/offline-realworld-1.webp',1,2,'食卓に招かれた三角コーン','traffic cone formal dining table'],
    ['pigeon-crown','./assets/offline-realworld-1.webp',2,2,'王冠を見つけた鳩','pigeon toy crown park bench'],
    ['bowing-vacuum','./assets/offline-realworld-2.webp',0,0,'掃除機にお辞儀する会社員','adult office worker robot vacuum'],
    ['cat-laundry','./assets/offline-realworld-2.webp',1,0,'洗濯を見守る猫','cat laundromat washing machine'],
    ['field-chair','./assets/offline-realworld-2.webp',2,0,'田んぼの事務椅子','office chair rice field'],
    ['tiny-hurdle','./assets/offline-realworld-2.webp',0,1,'小さすぎるハードル','adult runner tiny hurdle track'],
    ['plant-van','./assets/offline-realworld-2.webp',1,1,'植物で満員の配送車','delivery van enormous plant'],
    ['tree-tie','./assets/offline-realworld-2.webp',2,1,'木に忘れられたネクタイ','black necktie tree park'],
    ['museum-rice-cooker','./assets/offline-realworld-2.webp',0,2,'展示された炊飯器','rice cooker museum pedestal'],
    ['leek-bus-stop','./assets/offline-realworld-2.webp',1,2,'巨大ネギでバスを待つ会社員','adult businessperson giant leek bus stop'],
    ['goat-shop','./assets/offline-realworld-2.webp',2,2,'店内をのぞくヤギ','goat shop window'],
    ['tiny-pan-chef','./assets/offline-realworld-3.webp',0,0,'小さすぎるフライパン','adult chef tiny frying pan professional kitchen'],
    ['cow-bus-stop','./assets/offline-realworld-3.webp',1,0,'バスを待つ牛','cow rural bus shelter'],
    ['printer-paper','./assets/offline-realworld-3.webp',2,0,'紙を出しすぎた複合機','office printer long blank paper trail'],
    ['suitcase-checkout','./assets/offline-realworld-3.webp',0,1,'レジを通るスーツケース','suitcase supermarket checkout conveyor'],
    ['potato-red-carpet','./assets/offline-realworld-3.webp',1,1,'主役になったじゃがいも','potato red carpet velvet ropes'],
    ['giant-watering-can','./assets/offline-realworld-3.webp',2,1,'大きすぎるじょうろ','adult gardener enormous watering can'],
    ['umbrella-trunk','./assets/offline-realworld-3.webp',0,2,'傘で満員のトランク','taxi trunk many umbrellas'],
    ['teddy-commuter','./assets/offline-realworld-3.webp',1,2,'巨大な熊と通勤する会社員','adult commuter giant teddy bear train platform'],
    ['seagull-briefcase','./assets/offline-realworld-3.webp',2,2,'カバンを連れたカモメ','seagull business briefcase harbor'],
    ['long-baguette','./assets/offline-realworld-4.webp',0,0,'長すぎるフランスパン','adult baker absurdly long baguette tiny table'],
    ['alpaca-drive-thru','./assets/offline-realworld-4.webp',1,0,'受け取り窓口のアルパカ','alpaca drive through service window'],
    ['kettle-barber','./assets/offline-realworld-4.webp',2,0,'散髪を待つやかん','vintage kettle barber chair barbershop'],
    ['piano-greenhouse','./assets/offline-realworld-4.webp',0,1,'温室のグランドピアノ','grand piano greenhouse plants'],
    ['tiny-net-bucket','./assets/offline-realworld-4.webp',1,1,'網が小さすぎる漁師','adult fisherman tiny net enormous bucket pier'],
    ['plates-swing','./assets/offline-realworld-4.webp',2,1,'ブランコに積まれた皿','stack dinner plates playground swing'],
    ['sheep-carwash','./assets/offline-realworld-4.webp',0,2,'洗車される羊','sheep automatic car wash bay'],
    ['toaster-jewelry','./assets/offline-realworld-4.webp',1,2,'宝石扱いのトースター','toaster luxury jewelry display case'],
    ['duck-mechanic','./assets/offline-realworld-4.webp',2,2,'巨大アヒルを点検する整備士','adult mechanic enormous yellow rubber duck garage'],
    ['crab-alarm','./assets/offline-realworld-5.webp',0,0,'目覚まし時計を連れたカニ','crab old alarm clock beach'],
    ['bonsai-revolving','./assets/offline-realworld-5.webp',1,0,'回転ドアを通る巨大盆栽','adult office worker enormous bonsai revolving door'],
    ['sofa-platform','./assets/offline-realworld-5.webp',2,0,'ホームで電車を待つソファ','red sofa rural train platform'],
    ['llama-watermelons','./assets/offline-realworld-5.webp',0,1,'スイカを買い込むラマ','llama shopping cart watermelons supermarket'],
    ['cabbage-umbrella','./assets/offline-realworld-5.webp',1,1,'傘を差してもらったキャベツ','tiny umbrella single cabbage rainy garden'],
    ['waiter-wheelbarrow','./assets/offline-realworld-5.webp',2,1,'手押し車を給仕する店員','adult formal waiter serving wheelbarrow restaurant'],
    ['canoe-parking','./assets/offline-realworld-5.webp',0,2,'駐車場に停められたカヌー','canoe underground parking space cars'],
    ['owl-telephone','./assets/offline-realworld-5.webp',1,2,'電話番をするフクロウ','owl old desk telephone quiet office'],
    ['piano-bicycle','./assets/offline-realworld-5.webp',2,2,'ピアノを運ぶ自転車','adult cyclist towing upright piano bicycle trailer']
  ].map(([id,sheet,col,row,label,hint])=>({id,sheet,col,row,label,hint}));
  const BLOCKED_MINOR=/child|children|kid|kids|minor|infant|baby|boy|girl|子供|子ども|幼児|赤ちゃん/i;
  const COMMONS_QUERIES=[
    'unusual street scene photograph','farm animal photograph','old bicycle photograph','fishing boat photograph',
    'adult at work photograph','unusual tree photograph','laundromat photograph','train station interior photograph',
    'kitchen utensils photograph','market stall photograph','vintage machine photograph','rural bus stop photograph',
    'shop window photograph','dramatic weather landscape photograph','empty room photograph','odd household object photograph'
  ];
  const SOURCE_MIX=['local','local','local','commons'];
  const COMMONS_BLOCKED=/\b(?:logos?|logotypes?|posters?|maps?|diagrams?|charts?|graphs?|infographics?|flags?|coat of arms|advertisements?|advertising|signage|road signs?|books?|newspapers?|documents?|manuscripts?|scans?|screenshots?|icons?|symbols?|typography|labels?|brochures?|album covers?|paintings?|artworks?|illustrations?|drawings?|engravings?|watercolors?|watercolours?)\b|ロゴ|ポスター|地図|図表|グラフ|紋章|旗|広告|標識|書籍|新聞|文書|絵画|イラスト|版画/i;
  const COMMONS_LICENSE=/^(?:CC0|CC BY(?:-SA)?(?:\s|$)|Public domain|Public Domain Mark)/i;
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
  function shuffle(values,random=Math.random){
    const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(clamp(Number(random())||0,0,.999999)*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out;
  }
  function createShuffleDeck(values,random=Math.random,key=value=>typeof value==='object'?value.id:value){
    let bag=[],lastKey='';
    return{next(){
      if(!bag.length){bag=shuffle(values,random);if(bag.length>1&&String(key(bag[0]))===lastKey)[bag[0],bag[1]]=[bag[1],bag[0]]}
      const value=bag.shift();lastKey=String(key(value));return value;
    },get remaining(){return bag.length},get last(){return lastKey}};
  }
  function visualDistance(a={},b={}){
    const keys=['luminance','contrast','saturation','warmth','busyness','symmetry'];return keys.reduce((sum,key)=>sum+Math.abs((Number(a[key])||0)-(Number(b[key])||0)),0)/keys.length;
  }
  function isVisuallyDistinct(profile,recentProfiles=[],threshold=.12){return recentProfiles.every(previous=>visualDistance(profile,previous)>=threshold)}
  function stripMarkup(value=''){
    return String(value).replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;|&#34;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
  }
  function commonsItem(page={}){
    const info=page.imageinfo?.[0]||{},ext=info.extmetadata||{},title=stripMarkup(page.title||''),description=stripMarkup(ext.ImageDescription?.value||''),categories=stripMarkup(ext.Categories?.value||'');
    return{id:`commons:${page.pageid||title}`,title,thumbnail:String(info.thumburl||''),foreign_landing_url:String(info.descriptionurl||''),license:stripMarkup(ext.LicenseShortName?.value||''),creator:stripMarkup(ext.Artist?.value||'作者不明').slice(0,48)||'作者不明',hint:`${title} ${description} ${categories}`.slice(0,800),mime:String(info.mime||'').toLowerCase(),mediatype:String(info.mediatype||'').toUpperCase()};
  }
  function isSafeCommonsPage(page={},recentIds=[]){
    const item=commonsItem(page),text=`${item.title} ${item.hint}`.replace(/[_-]+/g,' ');
    return Boolean(item.id&&item.mime==='image/jpeg'&&(!item.mediatype||item.mediatype==='BITMAP')&&item.thumbnail.startsWith('https://upload.wikimedia.org/')&&item.foreign_landing_url.startsWith('https://commons.wikimedia.org/')&&COMMONS_LICENSE.test(item.license)&&!recentIds.includes(item.id)&&!BLOCKED_MINOR.test(text)&&!COMMONS_BLOCKED.test(text));
  }
  function pickCommonsCandidates(pages=[],recentIds=[],random=Math.random,limit=8){
    const safe=pages.filter(page=>isSafeCommonsPage(page,[])).map(commonsItem),fresh=safe.filter(item=>!recentIds.includes(item.id));
    return shuffle(fresh.length?fresh:safe,random).slice(0,limit);
  }
  function commonsQuery(random=Math.random){return COMMONS_QUERIES[Math.floor(clamp(Number(random())||0,0,.999999)*COMMONS_QUERIES.length)]||COMMONS_QUERIES[0]}
  function japaneseCommonsCredit(item={}){
    const creator=stripMarkup(item.creator||'作者不明').replace(/[\u0000-\u001f<>]/g,'').slice(0,48)||'作者不明',license=stripMarkup(item.license||'ライセンス不明').replace(/[\u0000-\u001f<>]/g,'').slice(0,32)||'ライセンス不明';
    return`Wikimedia Commons — ${creator} / ${license}`;
  }
  return{offlinePhotos:OFFLINE_PHOTOS.map(item=>({...item})),commonsQueries:[...COMMONS_QUERIES],sourceMix:[...SOURCE_MIX],createShuffleDeck,visualDistance,isVisuallyDistinct,stripMarkup,commonsItem,isSafeCommonsPage,pickCommonsCandidates,commonsQuery,japaneseCommonsCredit};
});
