// ══════════════════════════════════════════════════════════
//  JARVIS-AI.JS
//  AI brain, voice recognition/synthesis, particle effects
// ══════════════════════════════════════════════════════════

// ── KNOWLEDGE BASE ────────────────────────────────────────
var KB = {
  'who are you':'I am JARVIS. Just A Rather Very Intelligent System. Running on your spatial computer. I see what you see through the camera.',
  'what do you see':'I process the camera feed from your device. Hand tracking is active — I can see both hands moving in space.',
  'hardware':'Phase 9 hardware: Raspberry Pi 5 runs this OS. Front and back cameras for hand tracking and passthrough. Gyroscope for head tracking. Total: under ₹12,000.',
  'hand':'Your hands control everything. Point finger = aim cursor. Pinch = click. Open hand = scroll. Fist = drag. Two-hand pinch = zoom/rotate. Clap fists = throw window away.',
  'eye':'Eye tracking is Phase 8. Your eyes will aim the cursor instead of your finger. Combined with hand pinch = the most natural input system.',
  'phase':'Phase 8: eye tracking hardware. Phase 9: Raspberry Pi, custom displays, full headset assembly.',
  'raspberry':'Raspberry Pi 5 will run this exact OS via Chromium. No code changes needed. Plug in cameras and it works.',
  'apple':'Apple Vision Pro costs $3,500. We are building the same spatial computing concept for under ₹12,000.',
  'zoom':'Pinch with both hands at the same time, then move them apart or together. The focused window will resize in real time.',
  'rotate':'While two-hand pinching, twist your wrists. The focused window tilts to match your rotation, capped at 30 degrees.',
  'throw':'Make a fist with both hands and bring them together quickly like a clap. The focused window flies up and closes.',
  'calculator':'The calculator window does basic arithmetic. Pinch the buttons to enter numbers and operations.',
  'weather':'The weather window shows simulated conditions. Real weather data requires Phase 9 internet connectivity.',
  'music':'The music player is a UI demo. Real audio playback will be added once we connect actual audio files.',
};

function jarvisThink(q){
  q = q.toLowerCase();
  if(['hi','hello','hey','namaste'].some(function(g){ return q.startsWith(g); })){
    var h = new Date().getHours();
    return 'Good '+(h<12?'morning':h<17?'afternoon':'evening')+'. I am JARVIS. Your spatial OS is running. '+(J.handsActive?'Hand tracking is active.':'Loading hand tracking.');
  }
  if(['bye','goodbye'].some(function(g){ return q.includes(g); })) return 'Goodbye. Windows stay open and tracking continues.';

  var m = q.match(/(\d+\.?\d*)\s*([+\-x*\/])\s*(\d+\.?\d*)/);
  if(m){
    var a=parseFloat(m[1]), op=m[2], b=parseFloat(m[3]);
    var r = {'+':a+b,'-':a-b,'*':a*b,'x':a*b,'/':(b?+(a/b).toFixed(4):'∞')}[op];
    return a+' '+op+' '+b+' = '+r;
  }
  if(q.includes('time')||q.includes('date')){
    var n = new Date();
    return n.toLocaleTimeString('en-IN')+' · '+n.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'});
  }
  for(var k in KB){ if(q.includes(k)) return KB[k]; }
  if(q.includes('window')||q.includes('open')) return 'Swipe up or say "open clock/calculator/weather/music" to spawn windows.';
  if(q.includes('help')||q.includes('control')) return KB['hand'];
  if(q.includes('sensor')||q.includes('gyro')) return 'Gyroscope readings show in the Sensors window. Real-time orientation tracking active.';
  return 'Processing. Ask about: hand controls, two-hand zoom, eye tracking, hardware phases, or say "open [window name]".';
}

function aiSend(id){
  var inp = document.getElementById(id+'-in'); if(!inp) return;
  var txt = inp.value.trim(); if(!txt || J.isThinking) return;
  inp.value = '';
  addMsg(id,'u',txt); J.chatHistory.push({role:'user',content:txt}); J.isThinking = true;
  var th = addMsg(id,'j','…',true);
  setTimeout(function(){
    var low = txt.toLowerCase();
    var winNames = {clock:'clock',sensor:'sensors',note:'notes',system:'system',jarvis:'jarvis',calc:'calc',weather:'weather',music:'music'};
    var opened = false;
    for(var k in winNames){ if(low.includes(k)){ spawnWindow(winNames[k]); opened=true; break; } }
    var reply = opened ? 'Opening '+txt.split(' ').pop()+' window now.' : jarvisThink(txt);
    th.remove(); addMsg(id,'j',reply);
    J.chatHistory.push({role:'assistant',content:reply});
    speakText(reply); J.isThinking = false;
  }, 300+Math.random()*300);
}

function addMsg(id, who, txt, thinking){
  var msgs = document.getElementById(id+'-msgs'); if(!msgs) return null;
  var d = document.createElement('div');
  d.className = 'ai-bubble ai-'+(who==='u'?'u':'j')+(thinking?' ai-thinking':'');
  d.style.display='flex'; d.style.flexDirection='column'; d.style.alignSelf=who==='u'?'flex-end':'flex-start';
  d.textContent = txt; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
}

// ── VOICE ─────────────────────────────────────────────────
function startVoice(){
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ showGestureFlash('⚠️','Voice needs Chrome'); return; }
  if(J.isListening){ try{ J.rec && J.rec.stop(); }catch(e){} return; }
  J.rec = new SR(); J.rec.lang = 'en-IN'; J.rec.continuous = false; J.rec.interimResults = false;
  J.rec.onstart = function(){
    J.isListening = true;
    var vb = document.getElementById('voice-bar'); vb.classList.add('show');
    document.getElementById('voice-text').textContent = 'Listening…';
  };
  J.rec.onresult = function(e){
    var t = e.results[0][0].transcript.trim();
    document.getElementById('voice-text').textContent = '"'+t+'"';
    var jw = J.windows.find(function(w){ return w.type==='jarvis'; });
    if(jw){
      var inp = document.getElementById(jw.id+'-in');
      if(inp){ inp.value = t; aiSend(jw.id); }
    } else {
      var low = t.toLowerCase();
      if(low.includes('open')){
        var names = {clock:'clock',sensor:'sensors',note:'notes',system:'system',jarvis:'jarvis',calc:'calc',weather:'weather',music:'music'};
        for(var k in names){ if(low.includes(k)){ spawnWindow(names[k]); break; } }
      }
      if(low.includes('close all')) J.windows.slice().forEach(function(w){ closeWindow(w.id); });
      if(low.includes('menu')) showMenu();
    }
  };
  J.rec.onend = function(){ J.isListening = false; setTimeout(function(){ document.getElementById('voice-bar').classList.remove('show'); }, 1500); };
  J.rec.onerror = function(e){ J.isListening = false; document.getElementById('voice-bar').classList.remove('show'); showGestureFlash('⚠️','Mic: '+e.error); };
  try{ J.rec.start(); }catch(e){ showGestureFlash('⚠️','Voice failed'); }
  hideMenu();
}

function speakText(txt){
  if(!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(txt.slice(0,160));
  u.rate=0.95; u.pitch=0.8; u.lang='en-IN';
  var go = function(){
    var v = speechSynthesis.getVoices().find(function(v){ return v.lang.startsWith('en'); }) || speechSynthesis.getVoices()[0];
    if(v) u.voice = v; speechSynthesis.speak(u);
  };
  speechSynthesis.getVoices().length ? go() : (speechSynthesis.onvoiceschanged=go, setTimeout(go,500));
}

// ── GESTURE FLASH ─────────────────────────────────────────
var gfTimer;
function showGestureFlash(icon, text, dur){
  document.getElementById('gf-icon').textContent = icon||'';
  document.getElementById('gf-text').textContent = text||'';
  var el = document.getElementById('gesture-flash');
  el.classList.add('show'); clearTimeout(gfTimer);
  gfTimer = setTimeout(function(){ el.classList.remove('show'); }, (dur||1400));
}

// ── RIPPLE ────────────────────────────────────────────────
function spawnRipple(x, y){
  var r = document.createElement('div'); r.className = 'pinch-ripple';
  r.style.left = x+'px'; r.style.top = y+'px';
  document.body.appendChild(r); setTimeout(function(){ r.remove(); }, 600);
}

// ── PARTICLE SYSTEM (visual polish) ──────────────────────
var particles = [];
function spawnParticleBurst(x, y, color){
  var count = 16;
  for(var i=0; i<count; i++){
    var angle = (i/count) * Math.PI * 2;
    var speed = 1.5 + Math.random()*2.5;
    particles.push({
      x:x, y:y,
      vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      life: 1, decay: 0.02+Math.random()*0.015,
      size: 2+Math.random()*3, color: color||'#4A9EFF'
    });
  }
}

function startParticleLoop(){
  var canvas = document.getElementById('particle-canvas');
  var ctx = canvas.getContext('2d');
  (function loop(){
    requestAnimationFrame(loop);
    if(particles.length === 0) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles = particles.filter(function(p){
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.04; // gravity
      p.vx *= 0.98; p.vy *= 0.98; // drag
      p.life -= p.decay;
      if(p.life <= 0) return false;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size*p.life, 0, Math.PI*2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fill();
      ctx.globalAlpha = 1;
      return true;
    });
  })();
}
document.addEventListener('DOMContentLoaded', startParticleLoop);
if(document.readyState !== 'loading') startParticleLoop();
