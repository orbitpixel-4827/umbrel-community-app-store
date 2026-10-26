export const STANDARD = 'ABCDEFGHIJLMNOPRSTUV'.split('');
export const SPANISH = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
export function shuffle(items, random = Math.random) {
  const a = [...items]; for (let i=a.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a;
}
export function createGame(players, options, categories, random=Math.random) {
  if(players.length<2||players.length>10||players.some(p=>!p.name.trim())) throw Error('Escribe los nombres de 2 a 10 participantes.');
  if(new Set(players.map(p=>p.name.trim().toLocaleLowerCase('es'))).size!==players.length) throw Error('Usa nombres diferentes para reconocer cada turno.');
  if(!categories.length) throw Error('Selecciona al menos un grupo de categorías.');
  const g={players:players.map(p=>({...p,name:p.name.trim(),points:0,cards:0,active:true})),options,deck:shuffle(categories,random),drawn:[],round:0,current:Math.floor(random()*players.length),used:[],turn:[],status:'ready',remaining:10000,deadline:0,overtime:0,required:1,history:[],winner:null};
  nextRound(g); return g;
}
function category(g) {if(!g.deck.length) g.deck=shuffle(g.drawn.splice(0)); g.category=g.deck.pop();g.drawn.push(g.category);}
export function nextRound(g) {
  if(g.status==='finished') return;
  g.round++;g.players.forEach(p=>p.active=true);g.used=[];g.turn=[];g.overtime=0;g.required=1;g.winner=null;category(g);g.status='ready';g.remaining=10000;g.deadline=0;
}
export function start(g,now=Date.now()) { if(g.status==='ready'||g.status==='paused') {g.status='playing';g.deadline=now+g.remaining;} }
export function pause(g,now=Date.now()) {if(g.status==='playing'){if(now>=g.deadline){expire(g,now);return;}g.remaining=g.deadline-now;g.status='paused';}}
export function press(g,letter,now=Date.now()) {
  if(g.status!=='playing')return false;
  if(now>=g.deadline){expire(g,now);return false;}
  const letters=g.options.fullAlphabet?SPANISH:STANDARD;
  if(!letters.includes(letter)||g.used.includes(letter))return false;
  if(g.options.mode==='classic'&&g.turn.length>=g.required)return false;
  g.used.push(letter);g.turn.push(letter);g.players[g.current].points++;return true;
}
export function undo(g) {if(!['playing','paused'].includes(g.status)||!g.turn.length)return false;const l=g.turn.pop();g.used.splice(g.used.indexOf(l),1);g.players[g.current].points--;return true;}
function advance(g){do{g.current=(g.current+1)%g.players.length;}while(!g.players[g.current].active);g.turn=[];g.remaining=10000;}
export function pass(g,now=Date.now()) {
  if(g.status!=='playing')return false;
  if(now>=g.deadline){expire(g,now);return false;}
  const full=g.used.length===(g.options.fullAlphabet?SPANISH:STANDARD).length;
  if(g.turn.length<(g.options.mode==='classic'?g.required:1)&&!full)return false;
  advance(g);
  if(full){g.used=[];g.overtime++;g.required=Math.min(g.overtime+1,5);category(g);g.status='ready';g.deadline=0;return true;}
  g.deadline=now+10000;return true;
}
export function expire(g,now=Date.now(),force=false){
  if(g.status!=='playing'||(!force&&now<g.deadline))return false;
  const p=g.players[g.current];p.active=false;g.history.push(`${p.name} quedó fuera de la ronda ${g.round}.`);
  const alive=g.players.filter(p=>p.active);
  if(alive.length===1){const w=alive[0];w.cards+=1+g.overtime;g.winner=g.players.indexOf(w);g.current=g.winner;g.status=w.cards>=g.options.target?'finished':'roundEnd';g.history.push(`${w.name} ganó ${1+g.overtime} tarjeta(s).`);g.turn=[];}
  else {advance(g);g.status='ready';}
  g.deadline=0;g.remaining=10000;return true;
}
export function remaining(g,now=Date.now()){return g.status==='playing'?Math.max(0,g.deadline-now):g.remaining;}
