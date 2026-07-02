// ══════════════════════════════════════════════════════════
//  JARVIS-DWELL.JS
//  Dwell-to-select WITH magnetic cursor snapping.
//  You don't need pixel-perfect aim — get roughly close to a
//  target and the cursor snaps to its center automatically.
//  Then hold ~0.65s to activate. This is how real hands-free
//  interfaces work (Kinect, HoloLens) since precise pointing
//  with a camera-tracked hand is genuinely hard.
// ══════════════════════════════════════════════════════════

var DWELL = {
  target: null,
  start: 0,
  cooldownUntil: 0,
  MS: 650
};

var MAGNET_RADIUS = 75; // how far away a target can be and still "pull" the cursor

// Find the nearest clickable thing within radius — this is what
// makes aiming forgiving. Small buttons (close/min/menu icons) get
// priority since they're hardest to hit; large windows just need
// a direct hit since they're big targets already.
function findNearestInteractive(x, y){
  var best = null, bestDist = MAGNET_RADIUS;

  if(J.menuVisible){
    document.querySelectorAll('#menubar .menu-item').forEach(function(el){
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width/2, cy = r.top + r.height/2;
      var d = Math.hypot(x-cx, y-cy);
      if(d < bestDist){ bestDist = d; best = { kind:'menu', el:el, cx:cx, cy:cy, key:'menu:'+(el.textContent||'') }; }
    });
    return best; // menu open — ignore everything behind it
  }

  // Small targets (close/min dots) get magnetic pull from any window
  J.windows.forEach(function(w){
    [['close','.fw-close'], ['min','.fw-min']].forEach(function(pair){
      var btnEl = w.el.querySelector(pair[1]);
      if(!btnEl) return;
      var r = btnEl.getBoundingClientRect();
      var cx = r.left + r.width/2, cy = r.top + r.height/2;
      var d = Math.hypot(x-cx, y-cy);
      if(d < bestDist){ bestDist = d; best = { kind:pair[0], el:btnEl, win:w, cx:cx, cy:cy, key:pair[0]+':'+w.id }; }
    });
  });
  if(best) return best;

  // Nothing small nearby — check if we're directly over a window body (big target, no magnetism needed)
  var w2 = hitTestWindows(x, y);
  if(w2) return { kind:'focus', win:w2, el:w2.el, cx:x, cy:y, key:'focus:'+w2.id };

  return null;
}

function updateDwell(){
  var now = Date.now();
  if(now < DWELL.cooldownUntil){ setDwellProgress(0); return; }

  var t = findNearestInteractive(J.gazeX, J.gazeY);
  if(!t){ DWELL.target = null; setDwellProgress(0); return; }

  // Focusing happens instantly — no need to wait
  if(t.kind === 'focus'){
    if(t.win && J.focusedWin !== t.win) focusWindow(t.win);
    DWELL.target = null; setDwellProgress(0);
    return;
  }

  if(DWELL.target !== t.key){
    DWELL.target = t.key; DWELL.start = now; setDwellProgress(0);
    return;
  }

  var elapsed = now - DWELL.start;
  var pct = Math.min(1, elapsed / DWELL.MS);
  setDwellProgress(pct);

  if(pct >= 1){
    fireDwellAction(t);
    DWELL.target = null;
    DWELL.cooldownUntil = now + 550;
    setDwellProgress(0);
  }
}

function fireDwellAction(t){
  spawnRipple(t.cx, t.cy);
  spawnParticleBurst(t.cx, t.cy, '#4A9EFF');
  t.el.click(); // works whether bound via onclick attribute or addEventListener
  var labels = { menu:'DWELL → OPEN', close:'DWELL → CLOSE', min:'DWELL → MINIMIZE' };
  showGestureFlash('👁', labels[t.kind] || 'DWELL → SELECT');
  if(t.kind === 'menu') hideMenu();
}

function setDwellProgress(pct){
  var el = document.getElementById('dwell-fill');
  if(!el) return;
  var circumference = 100.5;
  el.style.strokeDashoffset = (circumference * (1-pct)).toString();
  el.style.opacity = pct > 0 ? '1' : '0';
}

setInterval(updateDwell, 30);
