// ══════════════════════════════════════════════════════════
//  JARVIS-WINDOWS.JS
//  Window spawning, dragging, and content builders
// ══════════════════════════════════════════════════════════

var WIN_DEFS = {
  jarvis:  {title:'🤖 JARVIS AI', w:280, h:320, build:buildJarvis},
  clock:   {title:'🕐 Clock',     w:200, h:140, build:buildClock},
  sensors: {title:'📡 Sensors',   w:240, h:220, build:buildSensors},
  notes:   {title:'📝 Notes',     w:260, h:300, build:buildNotes},
  system:  {title:'🗺 System',    w:260, h:320, build:buildSystem},
  calc:    {title:'🧮 Calculator',w:240, h:340, build:buildCalc},
  weather: {title:'🌤 Weather',   w:240, h:280, build:buildWeather},
  music:   {title:'🎵 Music',     w:240, h:340, build:buildMusic},
};

function spawnWindow(type){
  var def = WIN_DEFS[type]; if(!def) return;
  var id = 'w' + (++J.winCount);
  var W = window.innerWidth, H = window.innerHeight;
  var positions = [
    {x:W*.05,y:H*.12},{x:W*.55,y:H*.12},
    {x:W*.05,y:H*.55},{x:W*.55,y:H*.55},
    {x:W*.3, y:H*.2}
  ];
  var pos = positions[(J.winCount-1)%positions.length];

  var el = document.createElement('div');
  el.className = 'fw'; el.id = id;
  el.style.left = pos.x+'px'; el.style.top = pos.y+'px';
  el.style.width = def.w+'px'; el.style.height = def.h+'px';
  el.style.animation = 'winIn .3s cubic-bezier(.2,.8,.2,1)';
  el.innerHTML =
    '<div class="fw-glass">' +
      '<div class="fw-bar" id="'+id+'-bar">' +
        '<span class="fw-title">'+def.title+'</span>' +
        '<div class="fw-controls">' +
          '<button class="fw-btn fw-min" data-id="'+id+'" data-action="min"></button>' +
          '<button class="fw-btn fw-close" data-id="'+id+'" data-action="close"></button>' +
        '</div>' +
      '</div>' +
      '<div class="fw-body">'+def.build(id)+'</div>' +
    '</div>' +
    '<div class="fw-resize-handle" id="'+id+'-resize"></div>';

  if(!document.getElementById('winInKF')){
    var s = document.createElement('style'); s.id = 'winInKF';
    s.textContent = '@keyframes winIn{from{opacity:0;transform:scale(.85) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}';
    document.head.appendChild(s);
  }

  document.body.appendChild(el);
  J.windows.push({id:id, el:el, type:type});
  focusWindow({id:id, el:el});
  makeDraggable(el, id+'-bar');
  makeResizable(el, id+'-resize');

  el.querySelectorAll('.fw-btn').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var action = btn.dataset.action;
      if(action==='close') throwWindow(J.windows.find(function(w){return w.id===id;}));
      if(action==='min') minimizeWindow(id);
    });
  });
  el.addEventListener('mousedown', function(){ focusWindow({id:id, el:el}); });
  el.addEventListener('touchstart', function(){ focusWindow({id:id, el:el}); }, {passive:true});

  if(def.build === buildClock) startClockWindow(id);
  if(def.build === buildWeather) startWeatherWindow(id);
  hideMenu();
  spawnParticleBurst(pos.x+def.w/2, pos.y+def.h/2, '#ffffff');
}

function focusWindow(win){
  J.windows.forEach(function(w){ w.el.classList.remove('focused'); });
  win.el.classList.add('focused');
  J.focusedWin = win;
  win.el.style.zIndex = 30 + (J.winCount++);
}

function closeWindow(id){
  var idx = J.windows.findIndex(function(w){ return w.id===id; });
  if(idx === -1) return;
  J.windows[idx].el.remove();
  J.windows.splice(idx, 1);
  if(J.focusedWin && J.focusedWin.id === id) J.focusedWin = null;
}

function minimizeWindow(id){
  var w = J.windows.find(function(w){ return w.id===id; }); if(!w) return;
  var body = w.el.querySelector('.fw-body');
  if(body) body.style.display = body.style.display==='none' ? 'block' : 'none';
}

function hitTestWindows(x, y){
  for(var i=J.windows.length-1; i>=0; i--){
    var w = J.windows[i];
    var r = w.el.getBoundingClientRect();
    if(x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return w;
  }
  return null;
}

function hitTestButton(win, x, y){
  var btns = win.el.querySelectorAll('.fw-btn');
  for(var i=0; i<btns.length; i++){
    var r = btns[i].getBoundingClientRect();
    if(x>=r.left-8 && x<=r.right+8 && y>=r.top-8 && y<=r.bottom+8) return btns[i].dataset.action;
  }
  return null;
}

// ── DRAG ──────────────────────────────────────────────────
function makeDraggable(el, barId){
  var bar = document.getElementById(barId); if(!bar) return;
  var sx, sy, sl, st;
  function start(cx, cy){
    var win = J.windows.find(function(w){ return w.el===el; });
    if(win) focusWindow(win);
    sx=cx; sy=cy; sl=parseInt(el.style.left)||0; st=parseInt(el.style.top)||0;
  }
  function move(cx, cy){ el.style.left=(sl+cx-sx)+'px'; el.style.top=(st+cy-sy)+'px'; }
  bar.addEventListener('touchstart', function(e){ if(e.touches.length===1) start(e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
  bar.addEventListener('touchmove', function(e){ e.stopPropagation(); move(e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
  bar.addEventListener('mousedown', function(e){
    start(e.clientX, e.clientY);
    var mm = function(e){ move(e.clientX, e.clientY); };
    var mu = function(){ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); };
    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
  });
}

// ── RESIZE (touch drag handle) ───────────────────────────
function makeResizable(el, handleId){
  var handle = document.getElementById(handleId); if(!handle) return;
  var sx, sy, sw, sh;
  function start(cx, cy){
    sx=cx; sy=cy; sw=el.offsetWidth; sh=el.offsetHeight;
  }
  function move(cx, cy){
    var nw = Math.max(180, sw + cx-sx);
    var nh = Math.max(120, sh + cy-sy);
    el.style.width = nw+'px'; el.style.height = nh+'px';
  }
  handle.addEventListener('touchstart', function(e){ e.stopPropagation(); if(e.touches.length===1) start(e.touches[0].clientX,e.touches[0].clientY); }, {passive:true});
  handle.addEventListener('touchmove', function(e){ e.stopPropagation(); move(e.touches[0].clientX,e.touches[0].clientY); }, {passive:true});
  handle.addEventListener('mousedown', function(e){
    e.stopPropagation(); start(e.clientX,e.clientY);
    var mm=function(e){move(e.clientX,e.clientY);};
    var mu=function(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
  });
}

// ── MENU ──────────────────────────────────────────────────
function showMenu(){ J.menuVisible = true; document.getElementById('menubar').classList.add('show'); }
function hideMenu(){ J.menuVisible = false; document.getElementById('menubar').classList.remove('show'); }

document.addEventListener('touchstart', function(e){
  if(e.target.closest('.fw') || e.target.closest('#menubar')) return;
  window._swipeStartY = e.touches[0].clientY; window._swipeStartT = Date.now();
}, {passive:true});
document.addEventListener('touchend', function(e){
  if(e.target.closest('.fw') || e.target.closest('#menubar')) return;
  var dy = window._swipeStartY - e.changedTouches[0].clientY;
  var dt = Date.now() - window._swipeStartT;
  if(dt<400 && dy>80){ if(!J.menuVisible) showMenu(); }
  else if(dt<400 && dy<-80){ if(J.menuVisible) hideMenu(); }
}, {passive:true});
document.addEventListener('wheel', function(e){
  if(e.target.closest('.fw')) return;
  if(e.deltaY<0) showMenu(); else hideMenu();
});

// ── WINDOW CONTENT BUILDERS ───────────────────────────────
function buildJarvis(id){
  return '<div class="ai-msgs" id="'+id+'-msgs"></div>'+
    '<div class="ai-input-row">'+
      '<input class="ai-input" id="'+id+'-in" placeholder="Ask JARVIS…" onkeydown="if(event.key===\'Enter\')aiSend(\''+id+'\')"/>'+
      '<button class="ai-send" onclick="aiSend(\''+id+'\')">↑</button>'+
    '</div>';
}
function buildClock(id){
  return '<div class="clock-time" id="'+id+'-t">00:00:00</div><div class="clock-date" id="'+id+'-d"></div>';
}
function buildSensors(id){
  return '<div class="sens-grid">'+
    '<div class="sens-box"><div class="sens-val" id="'+id+'-a">—</div><div class="sens-lbl">YAW α</div></div>'+
    '<div class="sens-box"><div class="sens-val" id="'+id+'-b">—</div><div class="sens-lbl">PITCH β</div></div>'+
    '<div class="sens-box"><div class="sens-val" id="'+id+'-g">—</div><div class="sens-lbl">ROLL γ</div></div>'+
    '<div class="sens-box"><div class="sens-val" id="'+id+'-fps">—</div><div class="sens-lbl">FPS</div></div>'+
    '</div>';
}
function buildNotes(id){
  return '<textarea class="notes-ta" id="'+id+'-ta" placeholder="Think out loud…"></textarea>'+
    '<button class="notes-save" onclick="saveNote(\''+id+'\')">Save Note</button>'+
    '<div id="'+id+'-saved"></div>';
}
function buildSystem(id){
  var items = [
    ['AR Camera','#32D74B','Active'], ['Hand Tracking','#32D74B','Active'],
    ['Two-Hand Gestures','#32D74B','Active'], ['Voice Engine','#32D74B','Ready'],
    ['Gyroscope','#32D74B','Active'], ['Eye Tracking','#4A9EFF','Phase 8'],
    ['Raspberry Pi','#FFD60A','Phase 9'], ['Custom Display','#FFD60A','Phase 9'],
  ];
  return items.map(function(item){
    return '<div class="sys-item"><div class="sys-l"><div class="sys-dot" style="background:'+item[1]+'"></div>'+item[0]+'</div><div class="sys-r" style="color:'+item[1]+'">'+item[2]+'</div></div>';
  }).join('');
}
function buildCalc(id){
  return '<div class="calc-display" id="'+id+'-disp">0</div>'+
    '<div class="calc-grid">'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'C\')">C</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'±\')">±</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'%\')">%</button>'+
      '<button class="calc-btn calc-op" onclick="calcInput(\''+id+'\',\'/\')">÷</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'7\')">7</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'8\')">8</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'9\')">9</button>'+
      '<button class="calc-btn calc-op" onclick="calcInput(\''+id+'\',\'*\')">×</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'4\')">4</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'5\')">5</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'6\')">6</button>'+
      '<button class="calc-btn calc-op" onclick="calcInput(\''+id+'\',\'-\')">−</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'1\')">1</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'2\')">2</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'3\')">3</button>'+
      '<button class="calc-btn calc-op" onclick="calcInput(\''+id+'\',\'+\')">+</button>'+
      '<button class="calc-btn" style="grid-column:span 2" onclick="calcInput(\''+id+'\',\'0\')">0</button>'+
      '<button class="calc-btn" onclick="calcInput(\''+id+'\',\'.\')">.</button>'+
      '<button class="calc-btn calc-eq" onclick="calcInput(\''+id+'\',\'=\')">=</button>'+
    '</div>';
}
function buildWeather(id){
  return '<div class="weather-main">'+
    '<div class="weather-icon" id="'+id+'-icon">🌤</div>'+
    '<div class="weather-temp" id="'+id+'-temp">--°</div>'+
    '<div class="weather-desc" id="'+id+'-desc">Loading...</div>'+
    '</div>'+
    '<div class="weather-grid">'+
      '<div class="weather-stat"><div class="weather-stat-val" id="'+id+'-hum">--%</div><div class="weather-stat-lbl">HUMIDITY</div></div>'+
      '<div class="weather-stat"><div class="weather-stat-val" id="'+id+'-wind">--</div><div class="weather-stat-lbl">WIND</div></div>'+
      '<div class="weather-stat"><div class="weather-stat-val" id="'+id+'-uv">--</div><div class="weather-stat-lbl">UV</div></div>'+
    '</div>';
}
function buildMusic(id){
  return '<div class="music-art">🎵</div>'+
    '<div class="music-title">JARVIS Ambient</div>'+
    '<div class="music-artist">Spatial Computing Mix</div>'+
    '<div class="music-controls">'+
      '<button class="music-btn" onclick="musicAction(\'prev\')">⏮</button>'+
      '<button class="music-btn music-btn-play" id="'+id+'-play" onclick="musicAction(\'play\',\''+id+'\')">▶</button>'+
      '<button class="music-btn" onclick="musicAction(\'next\')">⏭</button>'+
    '</div>'+
    '<div class="music-progress"><div class="music-progress-fill"></div></div>';
}

// Clock window ticker
function startClockWindow(id){
  (function tick(){
    var el = document.getElementById(id+'-t'); if(!el) return;
    var n = new Date();
    el.textContent = ('0'+n.getHours()).slice(-2)+':'+('0'+n.getMinutes()).slice(-2)+':'+('0'+n.getSeconds()).slice(-2);
    var del = document.getElementById(id+'-d');
    if(del) del.textContent = n.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'});
    setTimeout(tick, 1000);
  })();
}

// Weather window (simulated - no API key needed)
function startWeatherWindow(id){
  var conditions = [
    {icon:'☀️',temp:32,desc:'Sunny',hum:38,wind:'8 km/h',uv:'High'},
    {icon:'⛅',temp:27,desc:'Partly Cloudy',hum:55,wind:'12 km/h',uv:'Moderate'},
    {icon:'🌧',temp:24,desc:'Light Rain',hum:78,wind:'15 km/h',uv:'Low'},
    {icon:'🌙',temp:22,desc:'Clear Night',hum:60,wind:'5 km/h',uv:'None'},
  ];
  var hour = new Date().getHours();
  var c = hour>20||hour<6 ? conditions[3] : conditions[Math.floor(Math.random()*3)];
  setTimeout(function(){
    var icon=document.getElementById(id+'-icon'); if(icon)icon.textContent=c.icon;
    var temp=document.getElementById(id+'-temp'); if(temp)temp.textContent=c.temp+'°';
    var desc=document.getElementById(id+'-desc'); if(desc)desc.textContent=c.desc+' (Simulated)';
    var hum=document.getElementById(id+'-hum'); if(hum)hum.textContent=c.hum+'%';
    var wind=document.getElementById(id+'-wind'); if(wind)wind.textContent=c.wind;
    var uv=document.getElementById(id+'-uv'); if(uv)uv.textContent=c.uv;
  }, 400);
}

// Calculator logic
var calcState = {};
function calcInput(id, val){
  if(!calcState[id]) calcState[id] = {display:'0', current:'', op:null, prev:null};
  var s = calcState[id];
  var disp = document.getElementById(id+'-disp');

  if(val === 'C'){ s.display='0'; s.current=''; s.op=null; s.prev=null; }
  else if(val === '±'){ s.current = (parseFloat(s.current||s.display)*-1).toString(); s.display=s.current; }
  else if(val === '%'){ s.current = (parseFloat(s.current||s.display)/100).toString(); s.display=s.current; }
  else if('+-*/'.includes(val)){
    s.prev = parseFloat(s.current||s.display); s.op = val; s.current=''; s.display=s.prev.toString();
  }
  else if(val === '='){
    if(s.op && s.prev!==null){
      var cur = parseFloat(s.current||'0');
      var result = {'+':s.prev+cur,'-':s.prev-cur,'*':s.prev*cur,'/':cur?s.prev/cur:0}[s.op];
      s.display = (+result.toFixed(6)).toString();
      s.current = s.display; s.op=null; s.prev=null;
    }
  }
  else if(val === '.'){
    if(!s.current.includes('.')) s.current = (s.current||'0')+'.';
    s.display = s.current;
  }
  else { // digit
    s.current = (s.current==='0'?'':s.current) + val;
    s.display = s.current;
  }
  if(disp) disp.textContent = s.display.length>10 ? parseFloat(s.display).toExponential(4) : s.display;
}

// Music (simulated player)
var musicState = {playing:false};
function musicAction(action, id){
  if(action === 'play'){
    musicState.playing = !musicState.playing;
    var btn = document.getElementById(id+'-play');
    if(btn) btn.textContent = musicState.playing?'⏸':'▶';
    showGestureFlash(musicState.playing?'▶️':'⏸️', musicState.playing?'PLAYING':'PAUSED');
  } else if(action === 'next'){ showGestureFlash('⏭','NEXT TRACK'); }
  else if(action === 'prev'){ showGestureFlash('⏮','PREV TRACK'); }
}

// Notes
function saveNote(id){
  var ta = document.getElementById(id+'-ta'); if(!ta) return;
  var txt = ta.value.trim(); if(!txt) return;
  J.notes.unshift({txt:txt, time:new Date()}); ta.value='';
  var saved = document.getElementById(id+'-saved');
  if(saved) saved.innerHTML = J.notes.slice(0,5).map(function(n){ return '<div class="saved-note">'+n.txt+'</div>'; }).join('');
    }
