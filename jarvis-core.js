// ══════════════════════════════════════════════════════════
//  JARVIS-CORE.JS
//  Global state, boot sequence, camera, smoothing/prediction
// ══════════════════════════════════════════════════════════

var J = {
  // Window system
  windows: [], focusedWin: null, winCount: 0,
  // Hands
  camStream: null, handsModel: null, handsActive: false,
  hands: { L: null, R: null },
  // Gaze (smoothed cursor)
  gazeX: window.innerWidth/2, gazeY: window.innerHeight/2,
  tgx: window.innerWidth/2, tgy: window.innerHeight/2,
  dispX: window.innerWidth/2, dispY: window.innerHeight/2, // visible cursor pos (can differ from gazeX/Y when magnet-snapped)
  // Velocity tracking for prediction
  velX: 0, velY: 0, prevTgx: window.innerWidth/2, prevTgy: window.innerHeight/2,
  // Modes
  vrMode: false, menuVisible: false,
  pinchActive: false, pinchCooldown: false, lastPinchTime: 0,
  // FPS
  fpsCount: 0, lastFPS: Date.now(),
  // Chat / notes
  chatHistory: [], notes: [],
  // Voice
  rec: null, isListening: false,
  // Debug
  debugMode: false
};

// Smoothing constants — tuned for natural feel without lag
var SMOOTH = {
  gaze: 0.22,        // base smoothing factor
  gazeMin: 0.12,      // when moving slow (precise)
  gazeMax: 0.38,      // when moving fast (responsive)
  predictFrames: 1.8  // how many frames ahead to predict
};

// ── BOOT ──────────────────────────────────────────────────
window.onload = function(){
  setTimeout(function(){
    var b = document.getElementById('boot');
    b.style.opacity = '0';
    setTimeout(function(){
      b.style.display = 'none';
      startJARVIS();
    }, 800);
  }, 1800);
};

function startJARVIS(){
  startClock();
  resizeCanvases();
  startCamera();
  startGyro();
  startGazeLoop();
  setTimeout(function(){
    spawnWindow('jarvis');
    setTimeout(function(){ spawnWindow('clock'); }, 400);
  }, 1200);
  showGestureFlash('👆','SWIPE UP FOR MENU');
  setTimeout(function(){ showGestureFlash('🤏','PINCH TO SELECT'); }, 3000);
}

// ── CLOCK ─────────────────────────────────────────────────
function startClock(){
  setInterval(function(){
    var n = new Date();
    var t = ('0'+n.getHours()).slice(-2)+':'+('0'+n.getMinutes()).slice(-2);
    document.getElementById('hud-time').textContent = t;
  }, 1000);
}

// ── GYRO ──────────────────────────────────────────────────
function startGyro(){
  var listen = function(){
    window.addEventListener('deviceorientation', function(e){
      J.windows.forEach(function(w){
        if(w.type === 'sensors'){
          var a = document.getElementById(w.id+'-a'); if(a) a.textContent = Math.round(e.alpha||0)+'°';
          var b = document.getElementById(w.id+'-b'); if(b) b.textContent = Math.round(e.beta||0)+'°';
          var g = document.getElementById(w.id+'-g'); if(g) g.textContent = Math.round(e.gamma||0)+'°';
        }
      });
    });
  };
  if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
    DeviceOrientationEvent.requestPermission().then(function(r){ if(r==='granted') listen(); });
  } else listen();
}

// ── CAMERA ────────────────────────────────────────────────
function startCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    document.getElementById('no-cam-bg').style.display='block';
    enableTouchFallback(); return;
  }
  navigator.mediaDevices.getUserMedia({
    video:{facingMode:'user', width:{ideal:640}, height:{ideal:480}}, audio:false
  }).then(function(s){
    J.camStream = s;
    var v = document.getElementById('cam-back');
    var vr = document.getElementById('cam-back-r');
    v.style.transform = 'scaleX(-1)'; vr.style.transform = 'scaleX(-1)';
    v.srcObject = s; vr.srcObject = s; v.play(); vr.play();
    document.getElementById('hud-mode').textContent = 'LOADING HANDS...';
    loadHandTrackingOnStream(s);
  }).catch(function(){
    navigator.mediaDevices.getUserMedia({
      video:{facingMode:'environment', width:{ideal:1280}, height:{ideal:720}}, audio:false
    }).then(function(s){
      J.camStream = s;
      document.getElementById('cam-back').srcObject = s;
      document.getElementById('cam-back').play();
      document.getElementById('hud-mode').textContent = 'TOUCH MODE';
      enableTouchFallback();
    }).catch(function(){
      document.getElementById('no-cam-bg').style.display='block';
      document.getElementById('hud-mode').textContent = 'NO CAMERA';
      enableTouchFallback();
    });
  });
}

// ── VR SPLIT ──────────────────────────────────────────────
function toggleVR(){
  J.vrMode = !J.vrMode;
  var v = document.getElementById('cam-back');
  var vr = document.getElementById('cam-back-r');
  var d = document.getElementById('vr-divider');
  if(J.vrMode){ v.classList.add('vr'); vr.style.display='block'; d.style.display='block'; }
  else { v.classList.remove('vr'); vr.style.display='none'; d.style.display='none'; }
  document.getElementById('hud-mode').textContent = J.vrMode ? 'VR MODE' : 'AR VISION';
  showGestureFlash(J.vrMode?'👓':'📱', J.vrMode?'VR MODE — PUT ON HEADSET':'SINGLE SCREEN');
  hideMenu();
}

// ── TOUCH FALLBACK ────────────────────────────────────────
function enableTouchFallback(){
  document.getElementById('gaze').style.display = 'block';
  document.addEventListener('touchmove', function(e){
    if(e.target.closest('.fw') || e.target.closest('#menubar')) return;
    J.tgx = e.touches[0].clientX; J.tgy = e.touches[0].clientY;
  }, {passive:true});
  document.addEventListener('touchend', function(e){
    if(e.target.closest('.fw') || e.target.closest('#menubar')) return;
    var x = e.changedTouches[0].clientX, y = e.changedTouches[0].clientY;
    if(window.FUSION) FUSION.trigger('hand', 'pinch', x, y);
    else { spawnRipple(x, y); }
  }, {passive:true});
}

// ── ADAPTIVE GAZE SMOOTHING + PREDICTION ─────────────────
// Faster movement = more responsive; slow movement = more precise/stable
function startGazeLoop(){
  setInterval(function(){
    // Calculate raw velocity from target movement
    var rawVelX = J.tgx - J.prevTgx;
    var rawVelY = J.tgy - J.prevTgy;
    J.prevTgx = J.tgx; J.prevTgy = J.tgy;

    // Smooth velocity (low-pass filter)
    J.velX += (rawVelX - J.velX) * 0.3;
    J.velY += (rawVelY - J.velY) * 0.3;

    // Adaptive smoothing factor based on speed
    var speed = Math.hypot(J.velX, J.velY);
    var factor = Math.min(SMOOTH.gazeMax, Math.max(SMOOTH.gazeMin, SMOOTH.gaze + speed*0.02));

    // Predict ahead slightly to reduce perceived lag
    var predictX = J.tgx + J.velX * SMOOTH.predictFrames;
    var predictY = J.tgy + J.velY * SMOOTH.predictFrames;

    J.gazeX += (predictX - J.gazeX) * factor;
    J.gazeY += (predictY - J.gazeY) * factor;

    // ── MAGNETIC SNAP — pull the visible cursor toward nearby targets ──
    // This is what makes imprecise pointing feel precise: the cursor
    // itself visually jumps to the button/icon once you're close enough.
    var snapTarget = (typeof findNearestInteractive === 'function')
      ? findNearestInteractive(J.gazeX, J.gazeY) : null;

    if(snapTarget && snapTarget.kind !== 'focus'){
      // Snap toward the target's exact center — fast pull-in
      J.dispX += (snapTarget.cx - J.dispX) * 0.4;
      J.dispY += (snapTarget.cy - J.dispY) * 0.4;
      document.getElementById('gaze-ring').classList.add('snapped');
    } else {
      // No target nearby — cursor follows raw tracked position
      J.dispX += (J.gazeX - J.dispX) * 0.5;
      J.dispY += (J.gazeY - J.dispY) * 0.5;
      document.getElementById('gaze-ring').classList.remove('snapped');
    }

    var g = document.getElementById('gaze');
    g.style.left = J.dispX + 'px';
    g.style.top = J.dispY + 'px';

    // Hover detection - highlight window under cursor
    var hovered = hitTestWindows(J.gazeX, J.gazeY);
    document.querySelectorAll('.fw').forEach(function(el){ el.classList.remove('hover-target'); });
    var ring = document.getElementById('gaze-ring');
    if(hovered && !J.pinchActive){
      ring.classList.add('hover');
    } else {
      ring.classList.remove('hover');
    }
  }, 16); // 60fps
}

// ── CANVAS RESIZE ─────────────────────────────────────────
function resizeCanvases(){
  ['hand-canvas','particle-canvas'].forEach(function(id){
    var c = document.getElementById(id);
    if(c){ c.width = window.innerWidth; c.height = window.innerHeight; }
  });
}
window.addEventListener('resize', resizeCanvases);

// ── DEBUG TOGGLE (triple tap top-left corner) ────────────
var debugTapCount = 0, debugTapTimer = null;
document.addEventListener('touchstart', function(e){
  if(e.touches[0].clientX < 60 && e.touches[0].clientY < 60){
    debugTapCount++;
    clearTimeout(debugTapTimer);
    debugTapTimer = setTimeout(function(){ debugTapCount = 0; }, 600);
    if(debugTapCount >= 3){
      J.debugMode = !J.debugMode;
      document.getElementById('debug-panel').style.display = J.debugMode ? 'block' : 'none';
      debugTapCount = 0;
    }
  }
}, {passive:true});

function updateDebug(text){
  if(!J.debugMode) return;
  document.getElementById('debug-panel').innerHTML = text;
}
