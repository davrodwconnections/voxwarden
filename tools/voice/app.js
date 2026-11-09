// The voice page (odd/tasks/nqa-voice.md T3): WebRTC to the OpenAI Realtime API with a short-lived
// client secret from our own server (/session), the model's tool calls relayed to /tool, each finished
// exchange sent to /exchange (the app shows it in the addon's Companion chat), and usage to /usage.
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const ui = { connect: $('connect'), mute: $('mute'), status: $('status'), log: $('log'), level: $('level'), cost: $('cost'), game: $('game') };
  let pc = null, dc = null, mic = null, audioEl = null, meterStop = null, muted = false;
  // Talk mode (odd/tasks/nqa-voice-controls.md T9): one question with the microphone open.
  let talkOnce = false, heardSince = false;
  // Opened by the launcher (?auto=1): it connects by itself with the microphone closed. No location
  // (the tests' sandbox): a page opened by hand.
  const startClosed = typeof location !== 'undefined' && new URLSearchParams(location.search || '').get('auto') === '1';
  let botLine = null, botText = '', stoppedAt = 0, latencies = [];
  // Your words and its answers are paired by the conversation's item ids, never by order: a
  // transcription can arrive after the answer it belongs to (Realtime server events docs).
  let lastCommitted = null;
  const userLines = new Map();   // item_id → your caption line
  const transcripts = new Map(); // item_id → what you said
  const answerOf = new Map();    // response id → the item_id it answers
  const waitingWords = new Map(); // item_id → an answer waiting for your words
  const handled = new Set();

  function status(text, cls) { ui.status.textContent = text; ui.status.className = cls || ''; }
  function line(cls, who, text) {
    const p = document.createElement('p');
    p.className = 'line ' + cls;
    if (who) { const b = document.createElement('b'); b.textContent = who + ': '; p.appendChild(b); }
    p.appendChild(document.createTextNode(text));
    ui.log.appendChild(p);
    ui.log.scrollTop = ui.log.scrollHeight;
    return p;
  }
  async function post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  function send(ev) { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(ev)); }

  function startMeter(stream) {
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let on = true;
      const tick = () => {
        if (!on) return;
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        ui.level.style.width = (muted ? 0 : Math.min(100, peak * 1.6)) + '%';
        requestAnimationFrame(tick);
      };
      tick();
      return () => { on = false; ctx.close(); ui.level.style.width = '0'; };
    } catch { return () => {}; }
  }

  async function runTools(calls) {
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.arguments || '{}'); } catch { args = {}; }
      line('sys', '', c.name === 'get_game_state' ? 'Consultando tus datos del juego…' : c.name === 'place_map_pins' ? 'Poniendo pines en tu mapa…' : 'Consultando Wowhead…');
      let out;
      try { out = await post('/tool', { name: c.name, args }); } catch (e) { out = { error: String(e.message || e) }; }
      if (c.name === 'get_game_state') ui.game.textContent = out.available ? ('Datos del juego: hace ' + (out.ageSeconds ?? '?') + ' s') : 'Datos del juego: no disponibles';
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(out) } });
    }
    send({ type: 'response.create' });
  }

  function sendExchange(user, said) { post('/exchange', { user, assistant: said }).catch(() => {}); }

  function onEvent(ev) {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        heardSince = true;
        status('Te escucho…', 'live');
        // Your line goes in now, in order; its words come when the transcription does.
        if (ev.item_id && !userLines.has(ev.item_id)) userLines.set(ev.item_id, line('you', 'Tú', '…'));
        break;
      case 'input_audio_buffer.committed':
        lastCommitted = ev.item_id || lastCommitted;
        break;
      case 'response.created':
        if (ev.response && ev.response.id) answerOf.set(ev.response.id, lastCommitted);
        break;
      case 'input_audio_buffer.speech_stopped':
        stoppedAt = performance.now();
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const words = (ev.transcript || '').trim();
        const el = userLines.get(ev.item_id);
        if (words) { if (el) el.lastChild.textContent = words; else line('you', 'Tú', words); }
        else if (el) el.remove();
        userLines.delete(ev.item_id);
        transcripts.set(ev.item_id, words);
        if (waitingWords.has(ev.item_id)) { sendExchange(words, waitingWords.get(ev.item_id)); waitingWords.delete(ev.item_id); }
        break;
      }
      case 'response.output_audio_transcript.delta':
        if (stoppedAt) {
          // How long from the end of your words to its first words (the "fluid" number, odd T8).
          latencies.push(Math.round(performance.now() - stoppedAt));
          stoppedAt = 0;
          ui.game.dataset.latency = String(latencies.at(-1));
          ui.cost.title = 'Respuesta en ' + latencies.at(-1) + ' ms';
        }
        if (!botLine) { botText = ''; botLine = line('bot', 'NeverQuestAlone', ''); }
        botText += ev.delta || '';
        botLine.lastChild.textContent = botText;
        ui.log.scrollTop = ui.log.scrollHeight;
        status('Hablando… (interrúmpelo cuando quieras)', 'live');
        break;
      case 'response.done': {
        const r = ev.response || {};
        if (r.id && handled.has(r.id)) break;
        if (r.id) handled.add(r.id);
        if (r.usage) post('/usage', { usage: r.usage }).then(u => { ui.cost.textContent = 'Gasto de hoy: $' + u.todayUsd.toFixed(3) + ' (' + u.responses + ' respuestas)'; }).catch(() => {});
        const calls = (r.output || []).filter(o => o.type === 'function_call');
        if (calls.length) {
          // What it said before looking ("let me check") and the answer after share one line, spaced.
          if (botText.trim()) botText += ' ';
          runTools(calls);
          break;
        }
        const said = botText.trim();
        if (said) {
          const item = answerOf.get(r.id) || null;
          if (!item || transcripts.has(item)) sendExchange(item ? transcripts.get(item) : '', said);
          else {
            // Its answer came before your words: it waits for them, a few seconds at most.
            waitingWords.set(item, said);
            setTimeout(() => { if (waitingWords.has(item)) { sendExchange('', waitingWords.get(item)); waitingWords.delete(item); } }, 6000);
          }
        }
        answerOf.delete(r.id);
        if (r.status === 'cancelled' && said && botLine) botLine.lastChild.textContent = said + ' …';
        botLine = null; botText = '';
        status('Escuchando', 'live');
        // A Talk question was answered: the microphone closes until the next Talk.
        if (talkOnce && r.status !== 'cancelled') endTalk();
        break;
      }
      case 'error':
        line('sys', '', 'Error: ' + ((ev.error && ev.error.message) || 'desconocido'));
        break;
    }
  }

  async function connect() {
    ui.connect.disabled = true;
    status('Conectando…');
    try {
      const s = await post('/session');
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      pc = new RTCPeerConnection();
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      pc.ontrack = e => { audioEl.srcObject = e.streams[0]; };
      pc.addTrack(mic.getTracks()[0], mic);
      dc = pc.createDataChannel('oai-events');
      dc.onmessage = e => { try { onEvent(JSON.parse(e.data)); } catch { /* not ours */ } };
      dc.onopen = () => { status('Escuchando', 'live'); line('sys', '', 'Conectado (' + s.model + '). Háblale.'); };
      pc.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(pc && pc.connectionState)) hangup('Se cortó la conexión'); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { authorization: 'Bearer ' + s.value, 'content-type': 'application/sdp' } });
      if (!r.ok) throw new Error('OpenAI respondió ' + r.status + ': ' + (await r.text()).slice(0, 200));
      await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
      meterStop = startMeter(mic);
      ui.connect.textContent = 'Colgar';
      ui.connect.disabled = false;
      ui.mute.disabled = false;
      // From the launcher the microphone starts closed: the game's Talk button opens it (talk mode).
      if (startClosed && !talkOnce && !muted) toggleMute();
    } catch (e) {
      hangup();
      status('No se pudo conectar: ' + (e.message || e), 'err');
    }
  }

  function hangup(why) {
    try { dc && dc.close(); } catch {}
    try { pc && pc.close(); } catch {}
    if (mic) mic.getTracks().forEach(t => t.stop());
    if (meterStop) meterStop();
    pc = dc = mic = null; meterStop = null; muted = false;
    ui.connect.textContent = 'Conectar';
    ui.connect.disabled = false;
    ui.mute.disabled = true;
    ui.mute.firstChild.textContent = 'Silenciar mic (';
    status(why || 'Desconectado', why ? 'err' : '');
  }

  function toggleMute() {
    if (!mic) return;
    muted = !muted;
    mic.getTracks().forEach(t => { t.enabled = !muted; });
    ui.mute.firstChild.textContent = muted ? 'Activar mic (' : 'Silenciar mic (';
    status(muted ? 'Micrófono silenciado' : 'Escuchando', muted ? '' : 'live');
  }

  ui.connect.addEventListener('click', () => (pc ? hangup() : connect()));
  ui.mute.addEventListener('click', toggleMute);
  document.addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !e.repeat) toggleMute(); });

  // Driven from the game (odd/tasks/nqa-voice-controls.md T3): the addon's buttons and keys reach the
  // server through the app. Mute turns the microphone off; pause hangs up (nothing is spent) and resume
  // starts a new conversation. A command already there when the page opens is not applied again.
  let seenCmd = null, reported = '', reportedAt = 0, talkTimer = null;
  const voiceState = () => (!pc ? (ui.connect.disabled ? 'connecting' : 'paused') : (muted ? 'muted' : 'listening'));
  // Talk (S3): the microphone opens for one question and closes when its answer ends, or after 20 s
  // of nothing said; paused, it connects first.
  function endTalk() {
    clearTimeout(talkTimer); talkTimer = null;
    if (talkOnce) { talkOnce = false; if (mic && !muted) toggleMute(); }
  }
  function talk() {
    talkOnce = true;
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => { if (!heardSince) endTalk(); }, 20000);
    heardSince = false;
    if (!pc) { if (!ui.connect.disabled) connect(); return; }
    if (muted) toggleMute();
  }
  function apply(cmd) {
    if (cmd === 'talk') talk();
    else if (cmd === 'mute') { talkOnce = false; if (mic && !muted) toggleMute(); }
    else if (cmd === 'unmute') { talkOnce = false; if (mic && muted) toggleMute(); }
    else if (cmd === 'pause' && pc) { talkOnce = false; hangup('En pausa desde el juego'); }
    else if (cmd === 'resume' && !pc && !ui.connect.disabled) connect();
  }
  async function follow() {
    try {
      const c = await post('/control');
      if (Number.isInteger(c.n)) {
        if (seenCmd === null) seenCmd = c.n; // the page just opened: that one is old news
        else if (c.n !== seenCmd) { seenCmd = c.n; apply(c.cmd); }
      } else if (seenCmd === null) seenCmd = 0;
    } catch { /* the server restarts now and then */ }
    const st = voiceState();
    if (st !== reported || Date.now() - reportedAt > 5000) {
      reported = st; reportedAt = Date.now();
      post('/status', { state: st }).catch(() => {});
    }
  }
  // Only in a real page (the tests' sandbox has no fetch to follow with).
  if (typeof fetch === 'function' && typeof setInterval === 'function') { setInterval(follow, 1000); follow(); }
  if (startClosed) connect();
  window.NQAVoice = { onEvent, apply, voiceState, talking: () => talkOnce, status: () => ({ connected: !!pc, muted, latencies: latencies.slice() }) }; // for the tests
})();
