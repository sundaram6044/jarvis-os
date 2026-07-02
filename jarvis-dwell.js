// ══════════════════════════════════════════════════════════
//  JARVIS-DWELL.JS
//  Dwell-to-select — point at a target and hold ~0.65s to
//  activate it. This is the RELIABLE gesture method since it
//  doesn't need pinch to land precisely on a small target.
//  Pinch still works as a faster alternative for power users.
// ══════════════════════════════════════════════════════════

var DWELL = {
  target: null,        // unique key of what we're currently hovering
  start: 0,
  cooldownUntil: 0,
  MS: 650               // hold time to trigger — tune here if too fast/slow
};

// Figure out what the cursor is currently over, and what kind of target it is
function getGestureTarget(x, y){
  if(J.menuVisible){
    var m = hitTestMenu(x, y);
    if(m) return { key:'menu:'+(m.textContent||''), el:m, kind:'menu' };
    return null; // menu open — ignore anything behind it
  }
  var w = hitTestWindows(x, y);
  if(w){
    var btn = hitTestButton(w, x, y);
    if(btn === 'close') return { key:'close:'+w.id, win:w, kind:'close' };
    if(btn === 'min')   return { key:'min:'+w.id,   win:w, kind:'min' };
    return { key:'focus:'+w.id, win:w, kind:'focus' }; // hovering body/title = just focus
  }
  return null;
}

// Runs at 33Hz — independent of camera FPS so it stays smooth
function updateDwell(){
  var now = Date.now();
  if(now < DWELL.cooldownUntil){ setDwellProgress(0); return; }

  var t = getGestureTarget(J.gazeX, J.gazeY);
  if(!t){ DWELL.target = null; setDwellProgress(0); return; }

  // Focusing a window happens instantly on hover — no need to wait
  if(t.kind === 'focus'){
    if(t.win && J.focusedWin !== t.win) focusWindow(t.win);
    DWELL.target = null; setDwellProgress(0);
    return;
  }

  // New target — restart the timer
  if(DWELL.target !== t.key){
    DWELL.target = t.key; DWELL.start = now; setDwellProgress(0);
    return;
  }

  // Same target held — fill the progress ring
  var elapsed = now - DWELL.start;
  var pct = Math.min(1, elapsed / DWELL.MS);
  setDwellProgress(pct);

  if(pct >= 1){
    fireDwellAction(t);
    DWELL.target = null;
    DWELL.cooldownUntil = now + 550; // brief pause before it can trigger again
    setDwellProgress(0);
  }
}

function fireDwellAction(t){
  spawnRipple(J.gazeX, J.gazeY);
  spawnParticleBurst(J.gazeX, J.gazeY, '#4A9EFF');
  if(t.kind === 'menu'){
    t.el.click();
    hideMenu();
    showGestureFlash('👁','DWELL → OPEN');
  } else if(t.kind === 'close'){
    throwWindow(t.win);
    showGestureFlash('👁','DWELL → CLOSE');
  } else if(t.kind === 'min'){
    minimizeWindow(t.win.id);
    showGestureFlash('👁','DWELL → MINIMIZE');
  }
}

function setDwellProgress(pct){
  var el = document.getElementById('dwell-fill');
  if(!el) return;
  var circumference = 100.5; // matches r=16 circle in the SVG
  el.style.strokeDashoffset = (circumference * (1-pct)).toString();
  el.style.opacity = pct > 0 ? '1' : '0';
}

setInterval(updateDwell, 30);
