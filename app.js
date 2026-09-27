const STORAGE_KEY = 'adams-farkle-state-v1';
const PREF_KEY = 'adams-farkle-prefs-v1';
const TUTORIAL_KEY = 'adams-farkle-tutorial-v1';
const STATS_KEY = 'adams-farkle-stats-v1';

let setupPlayers = [{ name: 'Player 1', type: 'human', style: 'balanced' }];
let state = null;
let aiBusy = false;
let tutorialPage = 0;
let pendingRoll = false;
let sessionToken = 0;
let lastFocus = null;
let overlayDismissible = true;
let waitingWorker = null;
let audioContext = null;
let preferences = readJson(PREF_KEY, { dark:false, sound:true, haptics:true });
let stats = readJson(STATS_KEY, { games:0, wins:0, farkles:0, hotDice:0, bestTurn:0, highScore:0 });
const tips = ['Ones and fives score by themselves.', 'Three of a kind scores; ordinary pairs do not.', 'With only one or two dice left, banking is often wise.', 'Hot dice let you roll all six again—but the whole turn stays at risk.', 'Behind late in the game? Bigger risks may be worth taking.'];
const pipMap = {1:['p7'],2:['p1','p6'],3:['p1','p7','p6'],4:['p1','p2','p5','p6'],5:['p1','p2','p7','p5','p6'],6:['p1','p2','p3','p4','p5','p6']};

const $ = id => document.getElementById(id);
const fmt = number => Number(number).toLocaleString();
function readJson(key, fallback) { try { return {...fallback, ...JSON.parse(localStorage.getItem(key))}; } catch { return {...fallback}; } }
function savePreferences() { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); }
function saveStats() { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function playerTemplate(index) {
  const player = setupPlayers[index];
  const choice = player.type === 'ai' ? `ai-${player.style || 'balanced'}` : 'human';
  return `<div class="player-row"><input aria-label="Player ${index + 1} name" value="${escapeHtml(player.name)}" data-name="${index}"><select aria-label="Player ${index + 1} type and difficulty" data-type="${index}"><option value="human" ${choice==='human'?'selected':''}>Local</option><option value="ai-cautious" ${choice==='ai-cautious'?'selected':''}>AI · Cautious</option><option value="ai-balanced" ${choice==='ai-balanced'?'selected':''}>AI · Balanced</option><option value="ai-bold" ${choice==='ai-bold'?'selected':''}>AI · Bold</option></select></div>`;
}
function renderSetup() {
  $('playerCount').value = String(setupPlayers.length);
  $('playerList').innerHTML = setupPlayers.map((_, i) => playerTemplate(i)).join('');
  document.querySelectorAll('[data-name]').forEach(el => el.oninput = () => setupPlayers[+el.dataset.name].name = el.value);
  document.querySelectorAll('[data-type]').forEach(el => el.onchange = () => { const p=setupPlayers[+el.dataset.type]; const [type,style='balanced']=el.value.split('-'); p.type=type;p.style=style;p.name=type==='ai'?`AI ${+el.dataset.type||1}`:`Player ${+el.dataset.type+1}`;renderSetup(); });
  $('soundToggle').checked = preferences.sound;
  $('hapticsToggle').checked = preferences.haptics;
  const saved = loadSaved();
  $('resumeCard').classList.toggle('hidden', !saved);
  if (saved) $('resumeText').textContent = `${saved.players[saved.current].name} · ${fmt(saved.players[saved.current].score)} points`;
}
function applyPreset(mode) {
  document.querySelectorAll('.preset').forEach(el => el.classList.toggle('selected', el.dataset.preset === mode));
  if (mode === 'solo') setupPlayers = [{name:'Player 1',type:'human',style:'balanced'}];
  if (mode === 'ai') setupPlayers = [{name:'Player 1',type:'human',style:'balanced'},{name:'AI 1',type:'ai',style:'balanced'}];
  if (mode === 'local') setupPlayers = [{name:'Player 1',type:'human',style:'balanced'},{name:'Player 2',type:'human',style:'balanced'}];
  renderSetup();
}
function setPlayerCount(count) {
  count = +count;
  while (setupPlayers.length < count) { const i=setupPlayers.length; setupPlayers.push({name:`Player ${i+1}`,type:'human',style:'balanced'}); }
  setupPlayers = setupPlayers.slice(0,count); renderSetup();
}
function requestNewGame() { if (loadSaved()) confirmSheet('Replace saved game?', 'Starting a new game will discard the game currently in progress.', 'Start new game', newGame); else newGame(); }
function newGame() {
  sessionToken++;
  state = {version:1, players:setupPlayers.map((p,i)=>({name:p.name.trim()||`Player ${i+1}`,type:p.type,style:p.style||'balanced',score:0,onBoard:+$('entryScore').value===0})), current:0,target:+$('targetScore').value,entry:+$('entryScore').value,turnPoints:0,dice:[],selected:[],available:6,hasRolled:false,finalStarter:null,turnNumber:1,gameOver:false};
  showScreen('gameScreen'); save(); renderGame();
  if (!localStorage.getItem(TUTORIAL_KEY)) openTutorial(0, true); else scheduleAi();
}
function showScreen(id) { document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id)); }
function validSavedState(s) {
  if (!s || s.version !== 1 || s.gameOver || !Array.isArray(s.players) || s.players.length < 1 || s.players.length > 4) return false;
  if (!Number.isInteger(s.current) || s.current < 0 || s.current >= s.players.length || ![5000,10000].includes(s.target) || ![0,500].includes(s.entry)) return false;
  if (!Number.isFinite(s.turnPoints) || s.turnPoints < 0 || !Number.isInteger(s.available) || s.available < 1 || s.available > 6) return false;
  if (!Array.isArray(s.dice) || s.dice.length > 6 || s.dice.some(v=>!Number.isInteger(v)||v<1||v>6) || !Array.isArray(s.selected) || s.selected.some(i=>!Number.isInteger(i)||i<0||i>=s.dice.length)) return false;
  return s.players.every(p=>p&&typeof p.name==='string'&&p.name.length<=80&&['human','ai'].includes(p.type)&&Number.isFinite(p.score)&&p.score>=0&&typeof p.onBoard==='boolean');
}
function loadSaved() { try { const s=JSON.parse(localStorage.getItem(STORAGE_KEY)); if(validSavedState(s))return s; if(s)localStorage.removeItem(STORAGE_KEY); } catch { localStorage.removeItem(STORAGE_KEY); } return null; }
function resumeGame() { state=loadSaved(); if(!state)return; sessionToken++; showScreen('gameScreen'); renderGame(); scheduleAi(); }
function save() { if(state) localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }

function dieHtml(value,index,options={}) {
  const red = value===1 || value===5;
  return `<button class="die ${options.selected?'selected':''} ${options.locked?'locked':''}" data-die="${index}" aria-label="Die ${index+1}: ${value}${options.selected?', selected':''}" aria-pressed="${options.selected?'true':'false'}" ${options.locked?'disabled':''}>${pipMap[value].map(p=>`<i class="pip ${p} ${red?'red':''}"></i>`).join('')}</button>`;
}
function renderGame() {
  if (!state) return;
  const player=state.players[state.current]; const isAi=player.type==='ai';
  $('currentPlayer').textContent=player.name; $('turnLabel').textContent=isAi?'AI TURN':'YOUR TURN'; $('targetLabel').textContent=fmt(state.target);
  $('scoreStrip').innerHTML=state.players.map((p,i)=>`<div class="score-pill ${i===state.current?'current':''}"><span>${escapeHtml(p.name)}</span><strong>${fmt(p.score)}</strong></div>`).join('');
  const selectedScore=scoreSelection(state.dice.filter((_,i)=>state.selected.includes(i)));
  $('turnTotal').textContent=fmt(state.turnPoints + (selectedScore.valid?selectedScore.score:0));
  $('selectionScore').textContent=selectedScore.valid?`+${fmt(selectedScore.score)}`:state.selected.length?'Invalid selection':'0';
  $('diceTray').innerHTML=state.hasRolled?state.dice.map((v,i)=>dieHtml(v,i,{selected:state.selected.includes(i),locked:isAi||pendingRoll})).join(''):Array.from({length:6},(_,i)=>dieHtml(1,i,{locked:true})).join('');
  document.querySelectorAll('[data-die]').forEach(el=>el.onclick=()=>toggleDie(+el.dataset.die));
  const canScore=state.hasRolled && selectedScore.valid && selectedScore.score>0 && !isAi && !pendingRoll;
  const bankTotal=state.turnPoints+(canScore?selectedScore.score:0);
  $('bankBtn').disabled=!canScore || (!player.onBoard && bankTotal<state.entry);
  $('bankValue').textContent=fmt(bankTotal);
  $('rollBtn').disabled=isAi||pendingRoll||(state.hasRolled&&!canScore);
  $('rollBtn').textContent=!state.hasRolled?'Roll dice':state.selected.length===state.dice.length?'Hot dice — roll 6':`Roll ${state.dice.length-state.selected.length} dice`;
  $('suggestBtn').disabled=isAi||!state.hasRolled||pendingRoll;
  if (!state.hasRolled) $('statusText').textContent=player.onBoard?'Roll all six dice to begin.':`Score ${fmt(state.entry)} in one turn to get on the board.`;
  else if (state.selected.length && !selectedScore.valid) $('statusText').textContent='Every selected die must be part of a scoring combination.';
  else if (canScore && !player.onBoard && bankTotal < state.entry) $('statusText').textContent=`Keep rolling—your first bank must reach ${fmt(state.entry)}.`;
  else $('statusText').textContent=canScore?'Bank safely or roll the remaining dice.':'Tap scoring dice to set them aside.';
  $('gameTip').textContent=tips[(state.turnNumber-1)%tips.length];
}
function toggleDie(index) { if(!state||state.players[state.current].type==='ai'||pendingRoll)return; const pos=state.selected.indexOf(index); pos>=0?state.selected.splice(pos,1):state.selected.push(index); renderGame(); }

function scoreSelection(values) {
  if (!values.length) return {valid:false,score:0};
  const counts=Array(7).fill(0); values.forEach(v=>counts[v]++); const n=values.length;
  if(n===6){ const sorted=values.slice().sort().join(''); if(sorted==='123456')return{valid:true,score:1500,label:'Straight'}; const groups=counts.filter(c=>c>0); if(groups.length===3&&groups.every(c=>c===2))return{valid:true,score:1500,label:'Three pairs'}; if(groups.length===2&&groups.every(c=>c===3))return{valid:true,score:2500,label:'Two triplets'}; }
  let score=0,used=0;
  for(let face=1;face<=6;face++){ const c=counts[face]; if(c>=3){ score += c===3?(face===1?1000:face*100):c===4?1000:c===5?2000:3000; used+=c; } }
  for(const face of [1,5]){ const remaining=counts[face]-(counts[face]>=3?counts[face]:0); score+=remaining*(face===1?100:50); used+=remaining; }
  return {valid:used===n && score>0,score:used===n?score:0,label:''};
}
function bestSelection(dice) {
  let best={indices:[],score:0};
  for(let mask=1;mask<(1<<dice.length);mask++){ const idx=[],vals=[]; for(let i=0;i<dice.length;i++)if(mask&(1<<i)){idx.push(i);vals.push(dice[i]);} const result=scoreSelection(vals); if(result.valid&&(result.score>best.score||(result.score===best.score&&idx.length>best.indices.length)))best={indices:idx,score:result.score}; }
  return best;
}
function rollAction() {
  if (pendingRoll || state.players[state.current].type==='ai') return;
  if (state.hasRolled) { const result=scoreSelection(state.dice.filter((_,i)=>state.selected.includes(i))); if(!result.valid)return; state.turnPoints+=result.score; state.available=state.dice.length-state.selected.length||6; if(state.available===6){stats.hotDice++;saveStats();feedback('hot');} }
  performRoll();
}
function performRoll() {
  if(!state)return; const token=sessionToken; pendingRoll=true; feedback('roll'); renderGame(); document.querySelectorAll('.die').forEach(d=>d.classList.add('rolling'));
  setTimeout(()=>{ if(token!==sessionToken||!state)return; state.dice=Array.from({length:state.available},()=>1+Math.floor(Math.random()*6)); state.selected=[]; state.hasRolled=true; pendingRoll=false; const best=bestSelection(state.dice); save(); if(!best.indices.length) showFarkle(); else {renderGame(); if(state.players[state.current].type==='ai')setTimeout(()=>{if(token===sessionToken)aiDecision();},520);} },360);
}
function bankTurn() {
  const result=scoreSelection(state.dice.filter((_,i)=>state.selected.includes(i))); if(!result.valid)return; const total=state.turnPoints+result.score; const player=state.players[state.current]; if(!player.onBoard&&total<state.entry){toast(`You need ${fmt(state.entry)} to get on the board.`);return;} player.onBoard=true; player.score+=total; state.turnPoints=0; state.hasRolled=false; state.dice=[]; state.selected=[]; state.available=6;
  stats.bestTurn=Math.max(stats.bestTurn,total);saveStats();feedback('bank');
  if(player.score>=state.target&&state.finalStarter===null){state.finalStarter=state.current;if(state.players.length>1){save();finalRoundSheet(player.name,()=>endTurn());return;}}
  toast(`${player.name} banked ${fmt(total)}`); endTurn();
}
function showFarkle() {
  renderGame();stats.farkles++;saveStats();feedback('farkle');const token=sessionToken; const name=state.players[state.current].name; $('sheetBody').innerHTML=`<p class="eyebrow">No scoring dice</p><h2>Farkle!</h2><p>${escapeHtml(name)} loses <strong>${fmt(state.turnPoints)}</strong> unbanked points. Previously banked points are safe.</p><div class="sheet-actions"><button class="primary-button" id="nextTurnBtn">Next turn</button></div>`; showOverlay(false); $('nextTurnBtn').onclick=()=>{hideOverlay();state.turnPoints=0;state.hasRolled=false;state.dice=[];state.selected=[];state.available=6;endTurn();};
  if(state.players[state.current].type==='ai')setTimeout(()=>{if(token===sessionToken)$('nextTurnBtn')?.click();},900);
}
function endTurn() {
  const next=(state.current+1)%state.players.length;
  if(state.finalStarter!==null&&next===state.finalStarter){ finishGame(); return; }
  state.current=next; state.turnNumber++; save(); renderGame(); scheduleAi();
}
function finishGame(){sessionToken++;state.gameOver=true;save();localStorage.removeItem(STORAGE_KEY);const sorted=state.players.slice().sort((a,b)=>b.score-a.score);const top=sorted[0].score;const winners=sorted.filter(p=>p.score===top);stats.games++;stats.highScore=Math.max(stats.highScore,top);if(winners.some(p=>p.type==='human'))stats.wins++;saveStats();$('winnerTitle').textContent=state.players.length===1?`${fmt(top)} points!`:winners.length>1?`It’s a tie!`:`${sorted[0].name} wins!`;$('finalScores').innerHTML=sorted.map(p=>{const rank=1+sorted.filter(other=>other.score>p.score).length;return `<div class="final-row ${p.score===top?'winner':''}"><span>${rank}. ${escapeHtml(p.name)}</span><strong>${fmt(p.score)}</strong></div>`;}).join('');showScreen('resultsScreen');}

function suggest() { const best=bestSelection(state.dice); state.selected=best.indices; renderGame(); best.indices.forEach(i=>document.querySelector(`[data-die="${i}"]`)?.classList.add('suggested')); toast(best.indices.length?'A strong scoring choice is highlighted.':'No scoring dice—this is a Farkle.'); }
function scheduleAi(){if(!state||state.players[state.current].type!=='ai'||aiBusy)return;const token=sessionToken;aiBusy=true;renderGame();setTimeout(()=>{if(token!==sessionToken||!state)return;aiBusy=false;performRoll();},650);}
function aiDecision(){if(!state||state.players[state.current].type!=='ai')return;const token=sessionToken;const best=bestSelection(state.dice);if(!best.indices.length)return;state.selected=best.indices;renderGame();const total=state.turnPoints+best.score;const left=state.dice.length-best.indices.length;const player=state.players[state.current];const needEntry=!player.onBoard&&total<state.entry;const bases={cautious:[250,450,650],balanced:[350,600,850],bold:[500,800,1100]};const levels=bases[player.style]||bases.balanced;const threshold=left<=2?levels[0]:left===3?levels[1]:levels[2];const shouldBank=!needEntry&&(total>=threshold||player.score+total>=state.target);setTimeout(()=>{if(token!==sessionToken||!state)return;if(shouldBank)bankTurn();else rollActionForAi();},650);}
function rollActionForAi(){const result=scoreSelection(state.dice.filter((_,i)=>state.selected.includes(i)));state.turnPoints+=result.score;state.available=state.dice.length-state.selected.length||6;if(state.available===6){stats.hotDice++;saveStats();feedback('hot');}performRoll();}

const lessons=[
  {title:'Roll and find points',body:'Roll six dice. A single <strong>1 is worth 100</strong> and a single <strong>5 is worth 50</strong>. Tap scoring dice to set them aside.',dice:[1,2,3,4,5,6],scoring:[0,4]},
  {title:'Sets score too',body:'Three 1s score 1,000. Three of any other number score 100 times their face: three 4s score 400.',dice:[4,4,4,2,3,6],scoring:[0,1,2]},
  {title:'Bank or risk it',body:'Bank to make your turn points safe, or roll the remaining dice to add more. If the next roll has no score, you <strong>Farkle</strong> and lose this turn’s points.',dice:[1,5,2],scoring:[0,1]},
  {title:'Hot dice',body:'If all six dice score, you get hot dice and may roll all six again. The new points—and the old ones—remain at risk until you bank.',dice:[1,2,3,4,5,6],scoring:[0,1,2,3,4,5]},
  {title:'Play the odds',body:'Bank more readily when only one or two dice remain. Take bigger risks when you have four or more dice, need to meet an optional entry score, or are trailing late.',strategy:true}
];
function openTutorial(page=0,fromStart=false){tutorialPage=page;const lesson=lessons[page];const visual=lesson.strategy?`<div class="strategy-list"><div class="strategy-item"><b>6</b><span><strong>More dice, more freedom.</strong><br>Rolling four to six dice is relatively comfortable.</span></div><div class="strategy-item"><b>2</b><span><strong>Few dice, higher danger.</strong><br>Consider banking a useful turn total.</span></div><div class="strategy-item"><b>⇧</b><span><strong>Let the score guide you.</strong><br>Protect a lead; gamble more when behind.</span></div></div>`:`<div class="lesson-dice">${lesson.dice.map((d,i)=>`<span class="lesson-die ${lesson.scoring.includes(i)?'scoring':''}">${d}</span>`).join('')}</div>`;$('sheetBody').innerHTML=`<div class="tutorial-progress">${lessons.map((_,i)=>`<i class="${i<=page?'on':''}"></i>`).join('')}</div><p class="eyebrow">Lesson ${page+1} of ${lessons.length}</p><h2>${lesson.title}</h2>${visual}<p>${lesson.body}</p><div class="sheet-actions ${page?'two':''}">${page?'<button class="secondary-button" id="lessonBack">Back</button>':''}<button class="primary-button" id="lessonNext">${page===lessons.length-1?'Let’s play':'Next'}</button></div>`;showOverlay(!fromStart);if(page)$('lessonBack').onclick=()=>openTutorial(page-1,fromStart);$('lessonNext').onclick=()=>{if(page<lessons.length-1)openTutorial(page+1,fromStart);else{localStorage.setItem(TUTORIAL_KEY,'done');hideOverlay();if(fromStart)scheduleAi();}};}
function openRules(){ $('sheetBody').innerHTML=`<p class="eyebrow">Quick reference</p><h2>Scoring</h2><table class="score-table"><tbody><tr><td>Single 1</td><td>100</td></tr><tr><td>Single 5</td><td>50</td></tr><tr><td>Three 1s</td><td>1,000</td></tr><tr><td>Three 2s–6s</td><td>Face × 100</td></tr><tr><td>Four / five / six of a kind</td><td>1,000 / 2,000 / 3,000</td></tr><tr><td>Straight, 1–6</td><td>1,500</td></tr><tr><td>Three pairs</td><td>1,500</td></tr><tr><td>Two triplets</td><td>2,500</td></tr></tbody></table><p>Select at least one scoring die after every roll. Bank to save the turn total, or roll the remaining dice. A roll with no score is a Farkle. Scoring all six gives you hot dice.</p><div class="sheet-actions two"><button class="secondary-button" id="fullTutorial">Tutorial</button><button class="primary-button" id="closeRules">Done</button></div>`;showOverlay();$('fullTutorial').onclick=()=>openTutorial();$('closeRules').onclick=hideOverlay; }
function openStats(){ $('sheetBody').innerHTML=`<p class="eyebrow">On this device</p><h2>Statistics</h2><div class="stats-grid"><div class="stat-box"><small>GAMES FINISHED</small><strong>${fmt(stats.games)}</strong></div><div class="stat-box"><small>HUMAN WINS</small><strong>${fmt(stats.wins)}</strong></div><div class="stat-box"><small>BEST TURN</small><strong>${fmt(stats.bestTurn)}</strong></div><div class="stat-box"><small>HIGH SCORE</small><strong>${fmt(stats.highScore)}</strong></div><div class="stat-box"><small>FARKLES</small><strong>${fmt(stats.farkles)}</strong></div><div class="stat-box"><small>HOT DICE</small><strong>${fmt(stats.hotDice)}</strong></div></div><div class="sheet-actions two"><button class="secondary-button danger" id="resetStats">Reset</button><button class="primary-button" id="closeStats">Done</button></div>`;showOverlay();$('closeStats').onclick=hideOverlay;$('resetStats').onclick=()=>confirmSheet('Reset statistics?','This cannot be undone.','Reset',()=>{stats={games:0,wins:0,farkles:0,hotDice:0,bestTurn:0,highScore:0};saveStats();openStats();}); }
function confirmSheet(title,message,confirmLabel,onConfirm){ $('sheetBody').innerHTML=`<p class="eyebrow">Please confirm</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><div class="sheet-actions two"><button class="secondary-button" id="cancelConfirm">Cancel</button><button class="primary-button" id="acceptConfirm">${escapeHtml(confirmLabel)}</button></div>`;showOverlay(false);$('cancelConfirm').onclick=hideOverlay;$('acceptConfirm').onclick=()=>{hideOverlay();onConfirm();}; }
function finalRoundSheet(name,onContinue){ $('sheetBody').innerHTML=`<p class="eyebrow">Target reached</p><h2>Final round</h2><p><strong>${escapeHtml(name)}</strong> reached the target. Every other player gets one last turn to take the lead.</p><div class="sheet-actions"><button class="primary-button" id="finalContinue">Continue</button></div>`;showOverlay(false);$('finalContinue').onclick=()=>{hideOverlay();onContinue();}; }
function endCurrentGame(){sessionToken++;pendingRoll=false;aiBusy=false;localStorage.removeItem(STORAGE_KEY);state=null;hideOverlay();showScreen('setupScreen');renderSetup();}
function openMenu(){$('sheetBody').innerHTML=`<p class="eyebrow">Farkle</p><h2>Game menu</h2><div class="menu-list"><button id="rulesMenu">Rules &amp; scoring</button><button id="statsMenu">Statistics</button><button id="themeMenu">Toggle light / dark</button><button id="closeMenu">Keep playing</button><button id="endMenu" class="danger">End game</button></div>`;showOverlay();$('rulesMenu').onclick=openRules;$('statsMenu').onclick=openStats;$('themeMenu').onclick=()=>{toggleTheme();openMenu();};$('closeMenu').onclick=hideOverlay;$('endMenu').onclick=()=>confirmSheet('End this game?','The current game and its unbanked turn will be discarded.','End game',endCurrentGame);}
function showOverlay(dismissible=true){lastFocus=document.activeElement;overlayDismissible=dismissible;$('overlay').classList.remove('hidden');const heading=$('sheetBody').querySelector('h2');if(heading)heading.id='sheetTitle';requestAnimationFrame(()=>($('sheetBody').querySelector('button')||document.querySelector('.sheet')).focus());}
function hideOverlay(){$('overlay').classList.add('hidden');if(lastFocus&&document.contains(lastFocus))lastFocus.focus();}
function toggleTheme(){preferences.dark=!document.body.classList.contains('dark');document.body.classList.toggle('dark',preferences.dark);savePreferences();}
function feedback(kind){if(preferences.haptics&&navigator.vibrate)navigator.vibrate(kind==='farkle'?[55,45,90]:kind==='bank'?35:kind==='hot'?[30,25,30]:12);if(!preferences.sound)return;try{audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)();const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.frequency.value=kind==='farkle'?145:kind==='bank'?620:kind==='hot'?820:260;gain.gain.setValueAtTime(.045,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.12);oscillator.start();oscillator.stop(audioContext.currentTime+.12);}catch{}}
let toastTimer;function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1800);}

document.querySelectorAll('[data-preset]').forEach(el=>el.onclick=()=>applyPreset(el.dataset.preset));
$('playerCount').onchange=e=>setPlayerCount(e.target.value);$('startBtn').onclick=requestNewGame;$('resumeBtn').onclick=resumeGame;$('tutorialBtn').onclick=()=>openTutorial();$('statsBtn').onclick=openStats;$('rollBtn').onclick=rollAction;$('bankBtn').onclick=bankTurn;$('suggestBtn').onclick=suggest;$('menuBtn').onclick=openMenu;$('themeBtn').onclick=toggleTheme;$('playAgainBtn').onclick=()=>{state=null;showScreen('setupScreen');renderSetup();};
$('soundToggle').onchange=e=>{preferences.sound=e.target.checked;savePreferences();};$('hapticsToggle').onchange=e=>{preferences.haptics=e.target.checked;savePreferences();};
$('overlay').onclick=e=>{if(e.target===$('overlay')&&overlayDismissible)hideOverlay();};
document.addEventListener('keydown',event=>{if($('overlay').classList.contains('hidden'))return;if(event.key==='Escape'&&overlayDismissible){hideOverlay();return;}if(event.key==='Tab'){const controls=[...$('overlay').querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')];if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
document.body.classList.toggle('dark',preferences.dark);
renderSetup();
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').then(registration=>{const offer=worker=>{if(!worker)return;waitingWorker=worker;$('updateBanner').classList.remove('hidden');};if(registration.waiting)offer(registration.waiting);registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)offer(worker);});});});
$('updateBtn').onclick=()=>waitingWorker?.postMessage({type:'SKIP_WAITING'});$('laterBtn').onclick=()=>$('updateBanner').classList.add('hidden');
let refreshing=false;navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;location.reload();}});
