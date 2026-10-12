// Puzzly-Server: liefert die Seite aus und speichert Profile, Ergebnisse und Rangliste. Keine Abhängigkeiten.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,TZ=process.env.TZ_NAME||'Europe/Berlin';
const DB=path.join(process.env.DATA_DIR||__dirname,'data.json'),PUB=path.join(__dirname,'public');
let db={players:{},results:[]};try{db=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){}
let tm;const save=()=>{clearTimeout(tm);tm=setTimeout(()=>fs.writeFile(DB,JSON.stringify(db),()=>{}),300)};
const today=()=>new Date().toLocaleDateString('sv',{timeZone:TZ});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
const clean=(s,n)=>String(s||'').replace(/[<>]/g,'').trim().slice(0,n);
const body=req=>new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e4)req.destroy()});req.on('end',()=>{try{r(JSON.parse(b))}catch(e){r({})}})});
const auth=b=>{const p=db.players[b.id];return p&&b.token&&p.token===b.token?p:null};
http.createServer(async(req,res)=>{
const u=new URL(req.url,'http://x');
if(u.pathname==='/api/daily')return send(res,200,{date:today()});
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
}).listen(PORT,()=>console.log('Puzzly läuft auf http://localhost:'+PORT));
