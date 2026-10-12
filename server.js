// Puzzly-Server: liefert die Seite aus und speichert Profile, Ergebnisse und Rangliste. Keine Abhängigkeiten.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,TZ=process.env.TZ_NAME||'Europe/Berlin';
const DB=path.join(process.env.DATA_DIR||__dirname,'data.json'),PUB=path.join(__dirname,'public');
let db={players:{},results:[]};try{db=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){}
let tm;const save=()=>{clearTimeout(tm);tm=setTimeout(()=>fs.writeFile(DB,JSON.stringify(db),()=>{}),300)};
const DAILY=path.join(PUB,'daily');
function dailyImg(d){let f=[];try{f=fs.readdirSync(DAILY).filter(x=>/\.(jpe?g|png|webp)$/i.test(x)).sort()}catch(e){}
 return f.length?'/daily/'+encodeURIComponent(f[Math.floor(Date.parse(d+'T00:00:00Z')/864e5)%f.length]):null}
const today=()=>new Date().toLocaleDateString('sv',{timeZone:TZ});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
const clean=(s,n)=>String(s||'').replace(/[<>]/g,'').trim().slice(0,n);
const body=req=>new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e4)req.destroy()});req.on('end',()=>{try{r(JSON.parse(b))}catch(e){r({})}})});
const auth=b=>{const p=db.players[b.id];return p&&b.token&&p.token===b.token?p:null};
const srv=http.createServer(async(req,res)=>{
const u=new URL(req.url,'http://x');
if(u.pathname==='/api/daily')return send(res,200,{date:today(),img:dailyImg(today()),imgs:dailyList()});
if(u.pathname==='/api/profile'&&req.method==='POST'){const b=await body(req);let p=auth(b);
 if(!p){const id=crypto.randomBytes(6).toString('hex');p=db.players[id]={id,token:crypto.randomBytes(16).toString('hex'),name:'Gast',av:'🦊',pts:0}}
 p.name=clean(b.name,14)||p.name;p.av=clean(b.av,4)||p.av;save();return send(res,200,{id:p.id,token:p.token})}
if(u.pathname==='/api/result'&&req.method==='POST'){const b=await body(req),p=auth(b);if(!p)return send(res,401,{ok:0});
 const n=+b.n,t=Math.floor(+b.t),d=b.d==='frei'?'frei':String(b.d);
 if(!(n>=20&&n<=4500)||!(t>=n*.4)||t>864000||(d!=='frei'&&d!==today()))return send(res,400,{ok:0});
 if(d!=='frei'&&db.results.some(r=>r.pid===p.id&&r.d===d))return send(res,200,{ok:1,p:0,total:p.pts});
 const pp=Math.round(n*10*Math.min(3,Math.max(.25,n*6/Math.max(1,t))));
 db.results.push({pid:p.id,d,n,t,p:pp,at:Date.now()});p.pts+=pp;save();return send(res,200,{ok:1,p:pp,total:p.pts})}
if(u.pathname==='/api/leaderboard'){const d=u.searchParams.get('d')||today(),P=db.players;
 const daily=db.results.filter(r=>r.d===d&&P[r.pid]).sort((a,b)=>a.t-b.t).slice(0,20).map(r=>({name:P[r.pid].name,av:P[r.pid].av,t:r.t}));
 const total=Object.values(P).filter(p=>p.pts>0).sort((a,b)=>b.pts-a.pts).slice(0,20).map(p=>({name:p.name,av:p.av,pts:p.pts}));
 return send(res,200,{date:d,daily,total})}
const f=path.join(PUB,path.normalize(u.pathname==='/'?'/index.html':u.pathname));
if(!f.startsWith(PUB))return send(res,404,{});
fs.readFile(f,(e,data)=>{if(e)return send(res,404,{error:'not found'});res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(data)})
});
srv.listen(PORT,()=>console.log('Puzzly läuft auf http://localhost:'+PORT));
// --- Räume (WebSocket ohne Zusatzprogramme) ---
const dailyList=()=>{try{return fs.readdirSync(DAILY).filter(x=>/\.(jpe?g|png|webp)$/i.test(x)).sort()}catch(e){return[]}};
const rooms=new Map(),GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function wsend(c,o){const p=Buffer.from(JSON.stringify(o)),n=p.length;let h;
 if(n<126)h=Buffer.from([0x81,n]);else if(n<65536){h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(n,2)}else{h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeBigUInt64BE(BigInt(n),2)}
 try{c.sock.write(Buffer.concat([h,p]))}catch(e){}}
function frame(c){const b=c.buf;if(b.length<2)return null;const op=b[0]&15;let len=b[1]&127,o=2;
 if(len===126){if(b.length<4)return null;len=b.readUInt16BE(2);o=4}else if(len===127){if(b.length<10)return null;len=Number(b.readBigUInt64BE(2));o=10}
 if(len>2e6){c.sock.destroy();return null}
 const m=b[1]&128;if(m)o+=4;if(b.length<o+len)return null;
 const p=Buffer.from(b.subarray(o,o+len));if(m){const k=b.subarray(o-4,o);for(let i=0;i<len;i++)p[i]^=k[i%4]}
 c.buf=b.subarray(o+len);return{op,p}}
const pl=r=>[...r.cl].map(c=>({id:c.id,name:c.name,av:c.av,col:c.col,n:c.n,ac:c.ac,tm:c.tm}));
const sendInit=(r,c)=>wsend(c,{t:'init',code:r.code,n:r.n,seed:r.seed,img:r.img,mode:r.mode,state:r.state,el:(Date.now()-r.t0)/1000,host:r.host===c,me:c.id,p:pl(r)});
const bc=(r,o,ex)=>{for(const c of r.cl)if(c!==ex)wsend(c,o)};
function leave(c){const r=c.room;if(!r)return;r.cl.delete(c);c.room=null;if(!r.cl.size)setTimeout(()=>{if(!r.cl.size)rooms.delete(r.code)},6e5);else bc(r,{t:'pl',p:pl(r)})}
function msg(c,m){
 if(m.t==='create'||m.t==='join'){leave(c);c.name=clean(m.name,14)||'Gast';c.av=clean(m.av,4)||'🦊';c.ac=/^#[0-9a-f]{6}$/i.test(m.ac)?m.ac:'';let r;
  if(m.t==='create'){let code;do code=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]).join('');while(rooms.has(code));
   const n=[24,48,100,250,500].includes(+m.n)?+m.n:100,L=dailyList();
   r={code,mode:'coop',n,seed:1+Math.random()*2e9|0,img:L.length?'/daily/'+encodeURIComponent(L[Math.random()*L.length|0]):null,state:null,t0:Date.now(),cl:new Set(),host:c};rooms.set(code,r)}
  else{r=rooms.get(clean(m.code,4).toUpperCase());if(!r)return wsend(c,{t:'err',m:'Raum nicht gefunden'})}
  if(r.cl.size>=8)return wsend(c,{t:'err',m:'Raum ist voll'});
  c.col=[0,1,2,3,4,5,6,7].find(i=>![...r.cl].some(x=>x.col===i))||0;c.n=0;r.cl.add(c);c.room=r;sendInit(r,c);bc(r,{t:'pl',p:pl(r)},c);return}
 const r=c.room;if(!r)return;
 if(m.t==='cur')return bc(r,{t:'cur',id:c.id,x:+m.x||0,y:+m.y||0,d:m.d?1:0},c);
 if(m.t==='new'){const n=[24,48,100,250,500].includes(+m.n)?+m.n:r.n;let img=null;
  if(typeof m.img==='string'){if(m.img.startsWith('/daily/')&&dailyList().includes(decodeURIComponent(m.img.slice(7))))img=m.img;else if(/^data:image\/jpeg;base64,/.test(m.img)&&m.img.length<1.6e6)img=m.img}
  r.n=n;r.mode=m.mode==='race'?'race':'coop';r.img=img;r.seed=1+Math.random()*2e9|0;r.state=null;r.t0=Date.now();r.host=c;for(const x of r.cl){x.n=0;x.tm=0}for(const x of r.cl)sendInit(r,x);return}
 if(m.t==='done'){if(r.mode==='race'&&!c.tm){const s=Math.floor(+m.s);if(s>=r.n*.4&&s<=(Date.now()-r.t0)/1000+5){c.tm=Math.max(1,s);bc(r,{t:'pl',p:pl(r)})}}return}
 if(m.t==='mv'&&Array.isArray(m.u))bc(r,{t:'mv',u:m.u},c);
 else if(m.t==='st'&&Array.isArray(m.u)){bc(r,{t:'st',u:m.u},c);if(r.state){let inc=0;for(const[k,x,y,g]of m.u){const o=r.state[k];if(g===0&&o&&o[2]!==0)inc++;r.state[k]=[x,y,g]}if(inc){c.n+=inc;bc(r,{t:'pl',p:pl(r)})}}}
 else if(m.t==='full'&&Array.isArray(m.u)&&!r.state){r.state=m.u;bc(r,{t:'full',u:m.u},c)}}
srv.on('upgrade',(req,sock)=>{const key=req.headers['sec-websocket-key'];if(req.url!=='/ws'||!key){sock.destroy();return}
 sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(key+GUID).digest('base64')+'\r\n\r\n');
 const c={id:crypto.randomBytes(3).toString('hex'),col:0,n:0,tm:0,ac:'',sock,room:null,name:'Gast',av:'🦊',buf:Buffer.alloc(0)};
 sock.on('data',d=>{c.buf=Buffer.concat([c.buf,d]);let f;while(f=frame(c)){
  if(f.op===8){sock.end();return}if(f.op===9){sock.write(Buffer.from([0x8A,0]));continue}
  if(f.op===1){try{msg(c,JSON.parse(f.p.toString()))}catch(e){}}}});
 sock.on('close',()=>leave(c));sock.on('error',()=>leave(c))});

