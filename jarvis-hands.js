// ══════════════════════════════════════════════════════════
//  JARVIS-HANDS.JS
//  MediaPipe loading, hand tracking, gesture detection
// ══════════════════════════════════════════════════════════

var CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
var TIPS = [4,8,12,16,20];
var TIPS_OBJ = {thumb:4, index:8, middle:12, ring:16, pinky:20};

var twoHandState = { zooming:false, rotating:false, lastDist:0, lastAngle:0, _clap:false };
var wristHistory = [];
var pinchSmoothBuf = []; // for pinch distance smoothing (reduces flicker)

// ── LOAD MEDIAPIPE ───────────────────────────────────────
function loadHandTrackingOnStream(stream){
  document.getElementById('hud-mode').textContent = 'LOADING MP...';
  var vid = document.createElement('video');
  vid.srcObject = stream; vid.autoplay = true; vid.playsInline = true; vid.muted = true;
  vid.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;';
  document.body.appendChild(vid);
  vid.play().then(function(){
    loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/hands.js', function(){
      if(!window.Hands){
        document.getElementById('hud-mode').textContent = 'TOUCH MODE';
        enableTouchFallback(); return;
      }
      setupHands(vid);
    });
  });
  setTimeout(function(){
    if(!J.handsActive){
      document.getElementById('hud-mode').textContent = 'TOUCH MODE';
      enableTouchFallback();
    }
  }, 15000);
}

function loadScript(src, cb){
  var ex = document.querySelector('script[src="'+src+'"]');
  if(ex){ setTimeout(cb, 100); return; }
  var s = document.createElement('script');
  s.src = src; s.crossOrigin = 'anonymous';
  s.onload = function(){ setTimeout(cb, 200); };
  s.onerror = function(){ cb(); };
  document.head.appendChild(s);
}

function setupHands(vid){
  document.getElementById('hud-mode').textContent = 'INIT HANDS...';
  try{
    J.handsModel = new Hands({
      locateFile: function(f){ return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/'+f; }
    });
    J.handsModel.setOptions({
      maxNumHands:2, modelComplexity:1,
      minDetectionConfidence:0.7, minTrackingConfidence:0.6
    });
    var busy = false;
    J.handsModel.onResults(function(r){
      if(!J.handsActive){
        J.handsActive = true;
        document.getElementById('hud-mode').textContent = 'AR VISION';
        document.getElementById('gaze').style.display = 'block';
        showGestureFlash('✋','HAND TRACKING ACTIVE');
        // Load eye tracking on the same video stream after hands succeeds
        loadEyeTracking(vid);
        startFusionLoop();
      }
      onHandResults(r);
    });
    (async function loop(){
      requestAnimationFrame(loop);
      if(busy || !J.handsModel || vid.readyState < 2) return;
      busy = true;
      try{ await J.handsModel.send({image:vid}); }catch(e){}
      busy = false;
    })();
  }catch(e){
    document.getElementById('hud-mode').textContent = 'TOUCH MODE';
    enableTouchFallback();
  }
}

function loadHandTracking(){ if(J.camStream) loadHandTrackingOnStream(J.camStream); else enableTouchFallback(); }

// ── MAIN HAND RESULTS HANDLER ────────────────────────────
function onHandResults(results){
  var canvas = document.getElementById('hand-canvas');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  var detected = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;

  if(!detected){
    document.getElementById('hand-l-ind').classList.remove('active');
    document.getElementById('hand-r-ind').classList.remove('active');
    J.hands.L = J.hands.R = null;
    twoHandState.zooming = false;
    J.pinchActive = false;
    return;
  }

  J.hands.L = null; J.hands.R = null;
  results.multiHandLandmarks.forEach(function(lm, hi){
    var label = results.multiHandedness && results.multiHandedness[hi] ? results.multiHandedness[hi].label : 'Right';
    if(label === 'Left') J.hands.L = lm; else J.hands.R = lm;
  });

  var mxf = function(x){ return 1 - x; };

  // Draw skeletons with smooth glow
  results.multiHandLandmarks.forEach(function(lm, hi){
    var isLeft = results.multiHandedness && results.multiHandedness[hi] && results.multiHandedness[hi].label === 'Left';
    var col = isLeft ? 'rgba(100,200,255,' : 'rgba(255,255,255,';

    CONN.forEach(function(c){
      ctx.beginPath();
      ctx.moveTo(mxf(lm[c[0]].x)*W, lm[c[0]].y*H);
      ctx.lineTo(mxf(lm[c[1]].x)*W, lm[c[1]].y*H);
      ctx.strokeStyle = col + '0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    });
    lm.forEach(function(p,i){
      var isTip = TIPS.indexOf(i) !== -1;
      ctx.beginPath();
      ctx.arc(mxf(p.x)*W, p.y*H, isTip?8:3.5, 0, Math.PI*2);
      ctx.fillStyle = isTip ? col+'1)' : col+'0.5)';
      ctx.fill();
    });
    var idx = lm[TIPS_OBJ.index];
    var glow = ctx.createRadialGradient(mxf(idx.x)*W, idx.y*H, 0, mxf(idx.x)*W, idx.y*H, 18);
    glow.addColorStop(0, col+'0.4)'); glow.addColorStop(1, col+'0)');
    ctx.beginPath(); ctx.arc(mxf(idx.x)*W, idx.y*H, 18, 0, Math.PI*2);
    ctx.fillStyle = glow; ctx.fill();
  });

  // Two-hand gestures
  if(J.hands.L && J.hands.R){
    processTwoHands(J.hands.L, J.hands.R, mxf, W, H, ctx);
  } else {
    twoHandState.zooming = false;
  }

  // Single dominant hand
  var dominant = J.hands.R || J.hands.L;
  if(dominant){
    var lm = dominant;
    var g = detectGesture(lm, mxf);

    // Set TARGET gaze position (smoothing happens in jarvis-core.js loop)
    J.tgx = mxf(lm[TIPS_OBJ.index].x) * W;
    J.tgy = lm[TIPS_OBJ.index].y * H;

    var rInd = document.getElementById('hand-r-ind');
    var rGest = document.getElementById('hand-r-gest');
    rInd.classList.add('active');
    if(g) rGest.textContent = g.icon + ' ' + g.label;

    if(!twoHandState.zooming){
      handleSingleHand(g, lm, mxf, W, H);
    }

    // Pinch with smoothing buffer (reduces flicker from jittery detection)
    var th = lm[TIPS_OBJ.thumb], ix = lm[TIPS_OBJ.index];
    var pDist = Math.hypot(mxf(th.x)-mxf(ix.x), th.y-ix.y);
    pinchSmoothBuf.push(pDist);
    if(pinchSmoothBuf.length > 5) pinchSmoothBuf.shift(); // bigger buffer = steadier reading
    var avgDist = pinchSmoothBuf.reduce(function(a,b){return a+b;},0) / pinchSmoothBuf.length;
    // Hysteresis: enter pinch at tighter threshold, exit at looser threshold
    // This stops jittery tracking from rapidly flickering pinch on/off
    var wasPinching = J._rawPinching || false;
    var nowPinching = wasPinching ? (avgDist < 0.075) : (avgDist < 0.06);
    J._rawPinching = nowPinching;

    document.getElementById('gaze-ring').className = 'gaze-ring' + (nowPinching?' pinch':'');

    if(nowPinching && !J.pinchActive && !J.pinchCooldown){
      J.pinchActive = true; J.pinchCooldown = true;
      var px = mxf(ix.x)*W, py = ix.y*H;
      onPinch(px, py, g?g.label:'');
      setTimeout(function(){ J.pinchCooldown = false; }, 400);
    } else if(!nowPinching){ J.pinchActive = false; }

    if(J.debugMode){
      updateDebug('Gesture: '+(g?g.label:'-')+'<br>Pinch dist: '+avgDist.toFixed(3)+' ('+(nowPinching?'ON':'off')+')<br>Hands: '+detected+'<br>Menu: '+(J.menuVisible?'open':'closed'));
    }
  }

  if(J.hands.L){
    var lg = detectGesture(J.hands.L, mxf);
    document.getElementById('hand-l-ind').classList.add('active');
    document.getElementById('hand-l-gest').textContent = lg ? lg.icon+' '+lg.label : '';
  }

  J.fpsCount++;
  var now = Date.now();
  if(now - J.lastFPS > 600){
    document.getElementById('hud-fps').textContent = Math.round(J.fpsCount*1000/(now-J.lastFPS)) + ' FPS';
    J.fpsCount = 0; J.lastFPS = now;
  }
}

// ── TWO HAND GESTURES (zoom / rotate / clap) ─────────────
function processTwoHands(lL, lR, mxf, W, H, ctx){
  var lIdx = lL[TIPS_OBJ.index], rIdx = lR[TIPS_OBJ.index];
  var lx = mxf(lIdx.x)*W, ly = lIdx.y*H;
  var rx = mxf(rIdx.x)*W, ry = rIdx.y*H;
  var midX = (lx+rx)/2, midY = (ly+ry)/2;
  var dist = Math.hypot(rx-lx, ry-ly);
  var angle = Math.atan2(ry-ly, rx-lx);

  ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(rx,ry);
  ctx.strokeStyle = 'rgba(74,158,255,0.5)'; ctx.lineWidth = 2;
  ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(midX,midY,8,0,Math.PI*2);
  ctx.fillStyle = 'rgba(74,158,255,0.8)'; ctx.fill();

  var lPinch = Math.hypot(mxf(lL[4].x)-mxf(lL[8].x), lL[4].y-lL[8].y) < 0.06;
  var rPinch = Math.hypot(mxf(lR[4].x)-mxf(lR[8].x), lR[4].y-lR[8].y) < 0.06;

  if(lPinch && rPinch){
    if(!twoHandState.zooming){
      twoHandState.zooming = true;
      twoHandState.lastDist = dist;
      twoHandState.lastAngle = angle;
      showGestureFlash('🔍','TWO-HAND ZOOM');
      spawnParticleBurst(midX, midY, '#4A9EFF');
    } else {
      var distDelta = dist - twoHandState.lastDist;
      var angleDelta = angle - twoHandState.lastAngle;
      if(J.focusedWin && Math.abs(distDelta) > 2){
        var el = J.focusedWin.el;
        var cw = el.offsetWidth, ch = el.offsetHeight;
        var scale = dist / twoHandState.lastDist;
        var nw = Math.max(180, Math.min(window.innerWidth*0.9, cw*scale));
        var nh = Math.max(120, Math.min(window.innerHeight*0.85, ch*scale));
        el.style.width = nw+'px'; el.style.height = nh+'px';
        el.style.left = (midX-nw/2)+'px'; el.style.top = (midY-nh/2)+'px';
        document.getElementById('hud-mode').textContent = 'ZOOM '+Math.round(nw)+'px';
      }
      if(J.focusedWin && Math.abs(angleDelta) > 0.03){
        var el2 = J.focusedWin.el;
        var curRot = J.focusedWin._rotation || 0;
        curRot += angleDelta * (180/Math.PI) * 0.5;
        curRot = Math.max(-30, Math.min(30, curRot));
        J.focusedWin._rotation = curRot;
        el2.style.transform = 'rotate('+curRot+'deg)';
        document.getElementById('hud-mode').textContent = 'ROTATE '+Math.round(curRot)+'°';
      }
      twoHandState.lastDist = dist; twoHandState.lastAngle = angle;
    }
    ctx.beginPath(); ctx.arc(midX,midY,dist/2,0,Math.PI*2);
    ctx.strokeStyle = 'rgba(74,158,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  } else {
    if(twoHandState.zooming){
      twoHandState.zooming = false;
      if(J.focusedWin) document.getElementById('hud-mode').textContent = 'AR VISION';
    }
  }

  var lFist = detectGesture(lL, mxf);
  var rFist = detectGesture(lR, mxf);
  if(lFist && lFist.label==='FIST' && rFist && rFist.label==='FIST' && dist < W*0.1){
    if(!twoHandState._clap){
      twoHandState._clap = true;
      if(J.focusedWin) throwWindow(J.focusedWin);
      else showGestureFlash('👏','CLAP — No window focused');
      setTimeout(function(){ twoHandState._clap = false; }, 1000);
    }
  }
}

// ── SINGLE HAND ACTIONS ───────────────────────────────────
function handleSingleHand(g, lm, mxf, W, H){
  var wy = lm[0].y * H;

  // Swipe tracking runs ALWAYS — even if hand shape doesn't match a named
  // gesture exactly. This fixes swipe-up-for-menu being unreliable, since
  // during a fast swipe the fingers rarely form a clean gesture shape.
  wristHistory.push({y:wy, x:mxf(lm[0].x)*W, t:Date.now()});
  if(wristHistory.length > 15) wristHistory.shift();

  if(wristHistory.length >= 5){
    var old = wristHistory[0], cur = wristHistory[wristHistory.length-1];
    var dy = old.y-cur.y, dx = old.x-cur.x, dt = cur.t-old.t;
    if(dt < 550 && Math.abs(dy) > H*0.10){
      if(dy > 0 && !J.menuVisible){ showMenu(); wristHistory=[]; }
      else if(dy < 0 && J.menuVisible){ hideMenu(); wristHistory=[]; }
    }
    if(dt < 550 && Math.abs(dx) > W*0.15 && J.focusedWin){
      if(dx > 0){ throwWindowDir(J.focusedWin,'right'); wristHistory=[]; }
      else { throwWindowDir(J.focusedWin,'left'); wristHistory=[]; }
    }
  }

  if(!g) return; // gesture-specific actions below need a recognised shape
  var label = g.label;

  if(label === 'OPEN' && J.focusedWin){
    var iy = lm[8].y*H;
    if(J.focusedWin._lastScrollY !== undefined){
      var body = J.focusedWin.el.querySelector('.fw-body');
      if(body) body.scrollTop += (J.focusedWin._lastScrollY - iy) * 2.5;
    }
    J.focusedWin._lastScrollY = iy;
  } else if(J.focusedWin){ J.focusedWin._lastScrollY = undefined; }

  if(label === 'FIST' && J.focusedWin){
    var ix2 = mxf(lm[9].x)*W, iy2 = lm[9].y*H;
    if(J.focusedWin._lastDragX !== undefined){
      var cl = parseInt(J.focusedWin.el.style.left)||100;
      var ct = parseInt(J.focusedWin.el.style.top)||100;
      J.focusedWin.el.style.left = (cl + ix2-J.focusedWin._lastDragX)+'px';
      J.focusedWin.el.style.top  = (ct + iy2-J.focusedWin._lastDragY)+'px';
    }
    J.focusedWin._lastDragX = ix2; J.focusedWin._lastDragY = iy2;
  } else if(J.focusedWin){ J.focusedWin._lastDragX = undefined; }

  if(label === 'PEACE' && J.focusedWin && J.focusedWin._rotation){
    J.focusedWin._rotation = 0;
    J.focusedWin.el.style.transform = '';
    J.focusedWin.el.style.transition = 'transform 0.3s ease';
    setTimeout(function(){ if(J.focusedWin) J.focusedWin.el.style.transition=''; }, 300);
    showGestureFlash('✌️','RESET ROTATION');
  }

  if(label === 'THUMBS UP'){ showMenu(); }
  if(label === 'PINKY' && !J.isListening){ startVoice(); }
}

// ── THROW ─────────────────────────────────────────────────
function throwWindow(win){
  if(!win) return;
  showGestureFlash('🚀','THROW TO DISMISS');
  spawnParticleBurst(win.el.offsetLeft+win.el.offsetWidth/2, win.el.offsetTop, '#FF453A');
  var el = win.el;
  el.style.transition = 'transform 0.5s cubic-bezier(.2,.8,.2,1), opacity 0.4s ease';
  el.style.transform = (win._rotation?'rotate('+win._rotation+'deg) ':'') + 'translateY(-120vh) scale(0.5)';
  el.style.opacity = '0';
  setTimeout(function(){ closeWindow(win.id); }, 500);
}
function throwWindowDir(win, dir){
  if(!win) return;
  showGestureFlash(dir==='right'?'➡️':'⬅️','SWIPE TO DISMISS');
  var el = win.el;
  var tx = dir==='right'?'130vw':'-130vw';
  el.style.transition = 'transform 0.45s cubic-bezier(.2,.8,.6,1), opacity 0.35s ease';
  el.style.transform = (win._rotation?'rotate('+win._rotation+'deg) ':'') + 'translateX('+tx+') rotate('+(dir==='right'?15:-15)+'deg)';
  el.style.opacity = '0';
  setTimeout(function(){ closeWindow(win.id); }, 450);
}

// ── GESTURE DETECTION ─────────────────────────────────────
function detectGesture(lm, mxf){
  var up = function(tip,pip){ return lm[tip].y < lm[pip].y - 0.04; };
  var iu=up(8,6), mu=up(12,10), ru=up(16,14), pu=up(20,18);
  var tu = mxf(lm[4].x) < mxf(lm[3].x) - 0.04;
  var allUp = iu&&mu&&ru&&pu, allDown = !iu&&!mu&&!ru&&!pu;
  if(allDown) return{label:'FIST',icon:'✊'};
  if(allUp) return{label:'OPEN',icon:'✋'};
  if(iu&&!mu&&!ru&&!pu) return{label:'POINT',icon:'☝️'};
  if(iu&&mu&&!ru&&!pu) return{label:'PEACE',icon:'✌️'};
  if(tu&&allDown) return{label:'THUMBS UP',icon:'👍'};
  if(!iu&&!mu&&!ru&&pu) return{label:'PINKY',icon:'🤙'};
  return null;
}

// ── PINCH ACTION (now routed through fusion) ──────────────
function onPinch(x, y, gesture){
  FUSION.trigger('hand', 'pinch', x, y);
    }
