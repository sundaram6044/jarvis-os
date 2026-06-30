// ══════════════════════════════════════════════════════════
//  JARVIS-EYE.JS
//  Eye tracking via MediaPipe FaceMesh - feeds into fusion engine
// ══════════════════════════════════════════════════════════

var EYE = {
  active: false,
  faceModel: null,
  blinks: 0,
  blinkCD: false,
  tgx: window.innerWidth/2, tgy: window.innerHeight/2,
  confidence: 0,        // 0-1, how confident we are in gaze tracking
  lastUpdate: 0
};

// MediaPipe FaceMesh eye landmark indices
var L_UP=[159,160,161], L_DN=[145,144,163];
var R_UP=[386,387,388], R_DN=[374,373,390];
var L_IRIS=468, R_IRIS=473;

// ── LOAD FACEMESH (runs alongside Hands on same video stream) ──
function loadEyeTracking(vid){
  loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js', function(){
    if(!window.FaceMesh){
      console.log('FaceMesh unavailable - eye tracking disabled');
      return;
    }
    setupFaceMesh(vid);
  });
}

function setupFaceMesh(vid){
  EYE.faceModel = new FaceMesh({
    locateFile: function(f){ return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/'+f; }
  });
  EYE.faceModel.setOptions({
    maxNumFaces: 1, refineLandmarks: true,
    minDetectionConfidence: 0.6, minTrackingConfidence: 0.5
  });
  EYE.faceModel.onResults(onEyeResults);

  var busy = false;
  (async function loop(){
    requestAnimationFrame(loop);
    if(busy || !EYE.faceModel || vid.readyState < 2) return;
    busy = true;
    try{ await EYE.faceModel.send({image:vid}); }catch(e){}
    busy = false;
  })();

  EYE.active = true;
  updateFusionStatus();
}

function onEyeResults(results){
  if(!results.multiFaceLandmarks || !results.multiFaceLandmarks.length){
    EYE.confidence = Math.max(0, EYE.confidence - 0.05);
    return;
  }
  var lm = results.multiFaceLandmarks[0];
  var W = window.innerWidth, H = window.innerHeight;
  var mxf = function(x){ return 1-x; };

  // Gaze from iris position
  if(lm[L_IRIS] && lm[R_IRIS]){
    var ax = (lm[L_IRIS].x + lm[R_IRIS].x)/2;
    var ay = (lm[L_IRIS].y + lm[R_IRIS].y)/2;
    EYE.tgx = mxf(ax) * W;
    EYE.tgy = ay * H;
    EYE.confidence = Math.min(1, EYE.confidence + 0.08);
    EYE.lastUpdate = Date.now();
  }

  // Blink detection
  var lar = Math.abs(lm[L_UP[1]].y - lm[L_DN[1]].y);
  var rar = Math.abs(lm[R_UP[1]].y - lm[R_DN[1]].y);
  if(lar < 0.012 && rar < 0.012 && !EYE.blinkCD){
    EYE.blinks++; EYE.blinkCD = true;
    onBlink();
    setTimeout(function(){ EYE.blinkCD = false; }, 500);
  }

  drawEyeOverlay(lm, mxf, W, H);
}

// Optional subtle eye overlay on hand-canvas (very light, doesn't clutter)
function drawEyeOverlay(lm, mxf, W, H){
  var canvas = document.getElementById('hand-canvas');
  var ctx = canvas.getContext('2d');
  // Draw small iris dots only - keep it minimal since hands already draw on this canvas
  if(lm[L_IRIS]){
    ctx.beginPath(); ctx.arc(mxf(lm[L_IRIS].x)*W, lm[L_IRIS].y*H, 3, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(180,255,200,0.7)'; ctx.fill();
  }
  if(lm[R_IRIS]){
    ctx.beginPath(); ctx.arc(mxf(lm[R_IRIS].x)*W, lm[R_IRIS].y*H, 3, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(180,255,200,0.7)'; ctx.fill();
  }
}

function onBlink(){
  // Double blink within 600ms = confirm/click action
  var now = Date.now();
  if(EYE._lastBlinkTime && now - EYE._lastBlinkTime < 600){
    FUSION.trigger('eye', 'blink-double', J.gazeX, J.gazeY);
  }
  EYE._lastBlinkTime = now;
  }
