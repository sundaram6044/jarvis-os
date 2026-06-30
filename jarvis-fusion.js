// ══════════════════════════════════════════════════════════
//  JARVIS-FUSION.JS
//  Multi-modal intent engine — merges hand, eye, voice
//  "Whichever signal is fastest/clearest wins"
// ══════════════════════════════════════════════════════════

var FUSION = {
  // Confidence scores per channel (0-1) — updated continuously
  confidence: { hand: 0, eye: 0, voice: 0 },
  // Which channel is currently driving the cursor
  activeChannel: 'hand',
  // Last time each channel gave fresh input
  lastSignal: { hand: 0, eye: 0, voice: 0 },
  // Fusion history for debug
  log: [],

  // ── Called by any input module when it has a clear signal ──
  trigger: function(channel, action, x, y){
    this.lastSignal[channel] = Date.now();
    this.log.unshift({channel:channel, action:action, t:Date.now()});
    if(this.log.length > 8) this.log.pop();

    if(action === 'blink-double' || action === 'pinch' || action === 'voice-select'){
      // This is a SELECT/CLICK action regardless of which channel
      this.executeSelect(channel, x, y);
    }
    updateFusionStatus();
  },

  // ── Unified select/click — works from hand pinch, eye blink, or voice ──
  executeSelect: function(channel, x, y){
    spawnRipple(x, y);
    var hit = hitTestWindows(x, y);
    if(hit){
      focusWindow(hit);
      var btn = hitTestButton(hit, x, y);
      if(btn === 'close') throwWindow(hit);
      else if(btn === 'min') minimizeWindow(hit.id);
      showGestureFlash(channelIcon(channel), channel.toUpperCase()+' SELECT');
    } else {
      if(!J.menuVisible) showMenu(); else hideMenu();
    }
  },

  // ── Decide which channel should drive the cursor RIGHT NOW ──
  // Priority: most recent + most confident signal wins
  updateActiveChannel: function(){
    var now = Date.now();
    var scores = {};
    ['hand','eye','voice'].forEach(function(ch){
      var age = now - FUSION.lastSignal[ch];
      var recency = Math.max(0, 1 - age/1000); // decays over 1 second
      scores[ch] = FUSION.confidence[ch] * 0.6 + recency * 0.4;
    });
    var best = Object.keys(scores).reduce(function(a,b){ return scores[a]>scores[b]?a:b; });
    if(scores[best] > 0.15) this.activeChannel = best;
  }
};

function channelIcon(ch){
  return {hand:'🤏', eye:'👁', voice:'🎤'}[ch] || '⬡';
}

// ── FUSION LOOP — runs continuously, blends gaze position ──
function startFusionLoop(){
  setInterval(function(){
    // Update confidence based on each channel's freshness
    var now = Date.now();
    FUSION.confidence.hand = J.hands.R || J.hands.L ? Math.min(1, FUSION.confidence.hand+0.1) : Math.max(0,FUSION.confidence.hand-0.08);
    FUSION.confidence.eye  = EYE.active ? EYE.confidence : 0;
    FUSION.confidence.voice = J.isListening ? 1 : Math.max(0, FUSION.confidence.voice-0.15);

    FUSION.updateActiveChannel();

    // Blend target position — weighted average favoring active channel
    var hx = J.tgx, hy = J.tgy; // hand position (already set by hands module)
    var ex = EYE.tgx, ey = EYE.tgy;

    if(FUSION.activeChannel === 'eye' && FUSION.confidence.eye > 0.3){
      // Eye-led: blend mostly eye, slight hand correction
      J.tgx = ex*0.75 + hx*0.25;
      J.tgy = ey*0.75 + hy*0.25;
    } else if(FUSION.activeChannel === 'hand' && FUSION.confidence.hand > 0.3){
      // Hand-led (default): pure hand position (already set)
      // no change needed - J.tgx/tgy already point to hand position
    }
    // Voice doesn't move cursor, just triggers actions

    updateFusionStatus();
  }, 50);
}

// ── STATUS DISPLAY ────────────────────────────────────────
function updateFusionStatus(){
  var pill = document.getElementById('fusion-pill');
  if(!pill) return;
  var ch = FUSION.activeChannel;
  var icon = channelIcon(ch);
  pill.textContent = icon + ' ' + ch.toUpperCase();
  pill.style.borderColor = ch==='eye' ? 'rgba(180,255,200,.4)' : ch==='voice' ? 'rgba(255,180,100,.4)' : 'rgba(74,158,255,.4)';

  if(J.debugMode){
    var lines = ['hand: '+(FUSION.confidence.hand*100|0)+'%','eye: '+(FUSION.confidence.eye*100|0)+'%','voice: '+(FUSION.confidence.voice*100|0)+'%','active: '+ch];
    updateDebug(lines.join('<br>'));
  }
}

// ── VOICE INTEGRATION — "select that" / "click" trigger fusion ──
// Patches into existing startVoice() result handler
var _originalVoiceResultHandled = false;
function hookVoiceFusion(){
  if(_originalVoiceResultHandled) return;
  _originalVoiceResultHandled = true;
  // We intercept by checking transcript for selection commands
}

function handleVoiceFusionCommand(transcript){
  var low = transcript.toLowerCase();
  if(low.includes('select') || low.includes('click') || low === 'go' || low.includes('choose')){
    FUSION.trigger('voice', 'voice-select', J.gazeX, J.gazeY);
    return true;
  }
  return false;
  }
