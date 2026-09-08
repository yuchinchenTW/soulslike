// Dual-sword attacks share a timeline with the renderer. Times in `clip` are
// source-animation seconds; gameplay time may stretch a deliberate windup.
// Greatsword reach follows the extended blade; damage and timings stay the same.
const hit = (at, hand, damage, range, arc, travel) => ({ at, hand, damage, range: range + 1.55, arc, travel });
export const BOSS_MOVES = Object.freeze({
  procession: { clip: 'dual', duration: 3.65, recovery: 1.15,
    keys: [[0,0],[.82,.78],[1.27,1.11],[1.99,1.76],[2.23,1.89],[3.02,2.64],[3.65,3.63]],
    hits: [hit(.82,'left',22,2.85,1.35,.35),hit(1.27,'right',27,2.95,1.4,.48),hit(1.99,'right',23,2.95,1.45,.25),hit(2.23,'left',23,2.85,1.45,.2),hit(3.02,'both',32,3.05,1.65,.6)] },
  reaping: { clip: 'dual', duration: 2.55, recovery: 1.4,
    keys: [[0,1.36],[.78,1.76],[1.08,1.89],[1.8,2.64],[2.55,3.63]],
    hits: [hit(.78,'right',24,2.95,1.35,.3),hit(1.08,'left',24,2.85,1.35,.2),hit(1.8,'both',33,3.05,1.65,.6)] },
  lunge: { clip: 'heavy', duration: 1.65, recovery: 1.25,
    keys: [[0,0],[.8,.45],[1.12,.65],[1.65,1.5]],
    hits: [hit(1.12,'right',34,3.1,.95,3.1)] }
});
export function bossClipTime(state) {
  const m=BOSS_MOVES[state.move];if(!m)return 0;
  const t=Math.min(state.timer,m.duration), keys=m.keys;
  let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
  const [a,x]=keys[i],[b,y]=keys[i+1];return x+(y-x)*Math.max(0,Math.min(1,(t-a)/(b-a)));
}
export function activeBossHands(state) {
  if(state.action!=='bossAttack'||state.hp<=0)return [];
  const h=BOSS_MOVES[state.move]?.hits.find(h=>state.timer>=h.at-.09&&state.timer<=h.at+.09);
  return !h?[]:h.hand==='both'?['right','left']:[h.hand];
}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const facing=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z);
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function begin(e,move) { e.action='bossAttack';e.move=move;e.timer=0;e.hitIndex=0;e.actionSerial=(e.actionSerial||0)+1; }
function summon(game,boss) {
  const old=game.enemies.find(e=>e.phantom);
  const echo={...boss,id:'echo',boss:false,phantom:true,hp:100,maxHp:100,radius:.7,action:'idle',timer:0,moving:0,flash:0,deathTime:0,actionSerial:(old?.actionSerial||0)+1};
  echo.x=boss.x+Math.cos(boss.angle)*1.5;echo.z=boss.z-Math.sin(boss.angle)*1.5;
  game.move(echo,0,0);
  if(old)Object.assign(old,echo);else game.enemies.push(echo);
  boss.summonCooldown=16;game.emit('summon',{x:echo.x,z:echo.z});
}
export function updatePontiff(game,e,dt) {
  const p=game.player;const previous=e.timer;e.timer+=dt;e.cooldown-=dt;
  if(e.phantom){
    if(game.won||game.enemies.find(b=>b.boss)?.hp<=0){e.hp=0;e.action='dead';return;}
    if(e.action!=='bossAttack'&&e.action!=='recover')return;
  } else {
    e.summonCooldown=Math.max(0,(e.summonCooldown||0)-dt);
    if(e.phase===1&&e.hp<=e.maxHp*.5){
      e.phase=2;e.action='summon';e.timer=0;e.move=null;e.pending=null;
      game.bossActive=true;game.emit('toast',{text:'雙誓共鳴——分身先行，本體隨後'});game.emit('rage');return;
    }
    if(e.action==='summon'){
      if(e.timer>=1.2&&previous<1.2){
        game.emit('burst',{x:e.x,z:e.z});if(dist(e,p)<3.6)game.hurt(24,e);
      }
      if(e.timer>=2.1){summon(game,e);e.action='recover';e.timer=0;e.recovery=1;}
      return;
    }
    if(e.action==='echoWait'){
      if(e.timer>=.55){begin(e,e.pending);e.pending=null;}
      return;
    }
  }
  if(e.action==='bossAttack'){
    const m=BOSS_MOVES[e.move];
    // Track only before each swing commits; rolling past the blade is useful.
    const next=m.hits[e.hitIndex];
    const last=m.hits[e.hitIndex-1];
    if(next&&e.timer<next.at-.23&&(!last||e.timer>last.at+.16))e.angle+=delta(facing(e,p),e.angle)*Math.min(1,dt*3.2);
    for(const h of m.hits){
      const step=h.travel*(smooth((e.timer-h.at+.25)/.32)-smooth((previous-h.at+.25)/.32));
      game.move(e,Math.sin(e.angle)*step,Math.cos(e.angle)*step);
    }
    while(e.hitIndex<m.hits.length&&e.timer>=m.hits[e.hitIndex].at){
      const h=m.hits[e.hitIndex++];
      game.emit('enemySwing',{boss:true});game.emit('enemySlash',{x:e.x,z:e.z,hand:h.hand,boss:true});
      if(dist(e,p)<h.range&&Math.abs(delta(facing(e,p),e.angle))<h.arc)game.hurt(e.phantom?Math.round(h.damage*.55):h.damage,e);
    }
    if(e.timer>=m.duration){e.action='recover';e.timer=0;e.recovery=m.recovery;}
    return;
  }
  if(e.action==='recover'){if(e.timer>=e.recovery){e.action='idle';e.timer=0;e.cooldown=.2;}return;}
  if(e.phantom)return;
  const d=dist(e,p);if(d>=12&&e.hp===e.maxHp&&!game.bossActive)return;
  if(!game.bossActive){game.bossActive=true;game.emit('bossAwake');}
  e.angle+=delta(facing(e,p),e.angle)*Math.min(1,dt*3.5);
  const echo=game.enemies.find(a=>a.phantom&&a.hp>0);
  if(e.phase===2&&!echo&&e.summonCooldown<=0&&e.cooldown<=0){e.action='summon';e.timer=0;return;}
  if(d>7.5||e.cooldown>0){
    if(d>2.9){e.moving=e.phase===2?2.5:2.1;game.move(e,Math.sin(e.angle)*e.moving*dt,Math.cos(e.angle)*e.moving*dt);}return;
  }
  if(echo&&echo.action!=='idle')return;
  const move=d>4.2?'lunge':e.attackCount++%2===0?'procession':'reaping';
  if(echo){
    // Reposition only while the echo is at rest, then replay the same move .55s later.
    echo.x=e.x+Math.cos(e.angle)*1.2;echo.z=e.z-Math.sin(e.angle)*1.2;game.move(echo,0,0);
    echo.angle=facing(echo,p);begin(echo,move);e.action='echoWait';e.pending=move;e.timer=0;
  } else begin(e,move);
}
