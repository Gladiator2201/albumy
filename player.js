/* Albumy – odtwarzacz albumu w oknie (zdjęcia bez wychodzenia do Google Foto) */
(function (global) {
  "use strict";
  var A = global.Albumy, esc = A.esc;
  var LH3 = "https://lh3.googleusercontent.com/pw/";
  var caps = null, el = null, album = null, photos = [], cur = 0, timer = null, pushed = false, opener = null, reqId = 0, opts = {};
  var BASE = global.ALBUMY_BASE || "";
  var SLIDE_MS = 4000;

  function full(u) { return /^https?:/.test(u) ? u : LH3 + u; }
  function size() {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.ceil(innerWidth * dpr / 400) * 400, h = Math.ceil(innerHeight * dpr / 300) * 300;
    return "=w" + Math.min(w, 2560) + "-h" + Math.min(h, 1920);
  }
  function isG(p) { return !/^https?:/.test(p[0]) || /googleusercontent\.com\//.test(p[0]); }
  function big(p) { return isG(p) ? full(p[0]).replace(/=[^\/]*$/, "") + size() : p[0]; }
  function thumb(p) { return isG(p) ? full(p[0]).replace(/=[^\/]*$/, "") + "=w160-h160-c" : p[0].replace("/media/foto/", "/media/foto_mini/"); }
  function videoUrl(p) {
    if (!album || !album.u) return "";
    return album.u.replace(/(\/share\/[^\/?#]+)/, "$1/photo/" + encodeURIComponent(p[4]));
  }

  function build() {
    el = document.createElement("div");
    el.id = "player"; el.className = "player"; el.hidden = true;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Odtwarzacz albumu");
    el.innerHTML =
      '<div class="pl-top"><h2 class="pl-title"></h2><span class="pl-count" aria-live="polite"></span>' +
      '<div class="pl-tools"><button type="button" class="pl-btn pl-play" aria-pressed="false" title="Pokaz slajdów (spacja)">▶<span class="t"> Pokaz</span></button>' +
      '<button type="button" class="pl-btn pl-fs" title="Pełny ekran (F)" aria-label="Pełny ekran">⛶<span class="t"> Pełny ekran</span></button>' +
      '<button type="button" class="pl-btn pl-order" hidden title="Zmień kolejność zdjęć">⇅<span class="t"> Od najnowszych</span></button>' +
      '<button type="button" class="pl-btn pl-muz" aria-pressed="false" title="Muzyka w tle" aria-label="Muzyka">♪<span class="t"> Muzyka</span></button>' +
      '<button type="button" class="pl-btn pl-fb" title="Udostępnij ten album na Facebooku">f<span class="t"> Facebook</span></button>' +
      '<button type="button" class="pl-btn pl-share" title="Link i kod QR do tego albumu">⤴<span class="t"> Udostępnij</span></button>' +
      '<button type="button" class="pl-btn pl-close" title="Zamknij (Esc)" aria-label="Zamknij">✕<span class="t"> Zamknij</span></button></div></div>' +
      '<div class="pl-stage"><img class="pl-img" alt="" referrerpolicy="no-referrer" draggable="false">' +
      '<a class="pl-video" target="_blank" rel="noopener" hidden>▶ Film – obejrzyj w Google Foto</a>' +
      '<p class="pl-msg" hidden></p>' +
      '<div class="pl-cap" hidden><b class="c-t"></b> <span class="c-d"></span><span class="c-o"></span></div>' +
      '<button type="button" class="pl-nav pl-prev" aria-label="Poprzednie zdjęcie (strzałka w lewo)">‹</button>' +
      '<button type="button" class="pl-nav pl-next" aria-label="Następne zdjęcie (strzałka w prawo)">›</button></div>' +
      '<div class="pl-strip" role="listbox" aria-label="Miniatury"></div>' +
      '<div class="pl-sharebox" hidden role="dialog" aria-label="Udostępnij album"><div class="sb-card">' +
      '<div class="sb-head"><h3>Udostępnij album</h3><button type="button" class="x sb-x" aria-label="Zamknij">✕</button></div>' +
      '<p class="sb-t"></p><canvas class="sb-qr" width="300" height="300" aria-label="Kod QR"></canvas>' +
      '<a class="sb-link" target="_blank" rel="noopener"></a>' +
      '<div class="sb-btns"><button type="button" class="btn sb-copy">Kopiuj link</button>' +
      '<button type="button" class="btn ghost sb-cqr">Kopiuj QR</button>' +
      '<button type="button" class="btn fb sb-fb">Facebook</button>' +
      '<button type="button" class="btn ghost sb-png">Pobierz QR</button></div>' +
      '<p class="sb-msg" aria-live="polite"></p><p class="sb-note">Ten link pokazuje tylko ten album – bez możliwości zmian.</p></div></div>' +
      '<div class="pl-muzbox" hidden role="dialog" aria-label="Muzyka"><div class="mz-card">' +
      '<div class="sb-head"><h3>Muzyka</h3><button type="button" class="x mz-x" aria-label="Zamknij">✕</button></div>' +
      '<ul class="mz-list"></ul>' +
      '<div class="mz-ctrl"><button type="button" class="pl-btn mz-pp" title="Odtwórz / pauza" aria-label="Odtwórz">▶</button>' +
      '<button type="button" class="pl-btn mz-next" title="Następny utwór" aria-label="Następny utwór">⏭</button>' +
      '<label class="mz-vol">🔊 <input type="range" min="0" max="100" value="70" aria-label="Głośność"></label></div>' +
      '<p class="mz-now"></p><p class="mz-msg" aria-live="polite"></p></div>' +
      '<div class="mz-yt" hidden></div><audio class="mz-audio" preload="none"></audio>' +
      '<iframe class="mz-iframe" hidden allow="autoplay" title="Podgląd pliku z Dysku"></iframe></div>';
    document.body.appendChild(el);
    var q = function (s) { return el.querySelector(s); };
    q(".pl-prev").addEventListener("click", function () { stopShow(); go(cur - 1); });
    q(".pl-next").addEventListener("click", function () { stopShow(); go(cur + 1); });
    q(".pl-close").addEventListener("click", function () { close(); });
    q(".pl-play").addEventListener("click", toggleShow);
    q(".pl-share").addEventListener("click", openShare);
    q(".pl-fb").addEventListener("click", shareFb);
    q(".pl-order").addEventListener("click", function () {
      stopShow();
      photos.reverse(); if (caps) caps.reverse();
      newestFirst = !newestFirst;
      q(".pl-order .t").textContent = newestFirst ? " Od najstarszych" : " Od najnowszych";
      buildStrip(); go(0);
    });
    q(".pl-muz").addEventListener("click", toggleMuzBox);
    q(".mz-x").addEventListener("click", closeMuzBox);
    q(".mz-pp").addEventListener("click", toggleMuzPlay);
    q(".mz-next").addEventListener("click", function () { muzSkip(1); });
    q(".mz-list").addEventListener("click", function (e) {
      var li = e.target.closest("li"); if (!li || li.classList.contains("empty")) return;
      muzSel = +li.dataset.i; paintMuzList(); startMuz();
    });
    q(".mz-vol input").addEventListener("input", function () { setMuzVol(+this.value); });
    try { var sv = parseInt(localStorage.getItem("albumy.muzyka.vol"), 10); if (sv >= 0 && sv <= 100) q(".mz-vol input").value = sv; } catch (e) {}
    q(".sb-x").addEventListener("click", closeShare);
    q(".pl-sharebox").addEventListener("click", function (e) { if (e.target === this) closeShare(); });
    q(".sb-copy").addEventListener("click", function () {
      var inp = q(".sb-link"), b = this, done = function () { b.textContent = "Skopiowany ✓"; setTimeout(function () { b.textContent = "Kopiuj link"; }, 2000); };
      (navigator.clipboard ? navigator.clipboard.writeText(albumLink()) : Promise.reject()).then(done, function () {
        var r = document.createRange(); r.selectNodeContents(inp); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand("copy"); } catch (e) {} done();
      });
    });
    q(".sb-fb").addEventListener("click", shareFb);
    q(".sb-png").addEventListener("click", downloadQr);
    q(".sb-cqr").addEventListener("click", copyQr);
    q(".pl-fs").addEventListener("click", toggleFs);
    q(".pl-strip").addEventListener("click", function (e) {
      var t = e.target.closest(".pl-th"); if (t) { stopShow(); go(+t.dataset.i); }
    });
    q(".pl-img").addEventListener("load", function () { el.classList.remove("loading"); });
    q(".pl-img").addEventListener("error", function () { el.classList.remove("loading"); });
    q(".pl-img").addEventListener("dblclick", toggleFs);
    // przesuwanie palcem / myszą
    var sx = 0, sy = 0, st = 0, down = false;
    var stage = q(".pl-stage");
    stage.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button,a")) return;
      down = true; sx = e.clientX; sy = e.clientY; st = Date.now();
    });
    stage.addEventListener("pointerup", function (e) {
      if (!down) return; down = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2 && Date.now() - st < 1200) { stopShow(); go(cur + (dx < 0 ? 1 : -1)); }
    });
    stage.addEventListener("pointercancel", function () { down = false; });
    stage.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) > 30 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); stopShow(); go(cur + (e.deltaX > 0 ? 1 : -1)); }
    }, { passive: false });
    document.addEventListener("keydown", function (e) {
      if (!el || el.hidden) return;
      var k = e.key;
      if (!el.querySelector(".pl-sharebox").hidden) { if (k === "Escape") { e.preventDefault(); closeShare(); } return; }
      if (!el.querySelector(".pl-muzbox").hidden && k === "Escape") { e.preventDefault(); closeMuzBox(); return; }
      if (k === "ArrowRight" || k === "PageDown") { e.preventDefault(); stopShow(); go(cur + 1); }
      else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); stopShow(); go(cur - 1); }
      else if (k === "Home") { e.preventDefault(); go(0); }
      else if (k === "End") { e.preventDefault(); go(photos.length - 1); }
      else if (k === " ") { if (!e.target.closest("button,a,input,textarea,label")) { e.preventDefault(); toggleShow(); } }
      else if (k === "f" || k === "F") { if (!e.target.closest("input,textarea")) toggleFs(); }
      else if (k === "Escape") { if (!document.fullscreenElement) { e.preventDefault(); close(); } }
    });
    document.addEventListener("fullscreenchange", function () {
      var on = !!document.fullscreenElement;
      el.classList.toggle("fs", on);
      el.querySelector(".pl-fs .t").textContent = on ? " Zwykły widok" : " Pełny ekran";
      if (photos.length) show(false);
    });
    global.addEventListener("popstate", function () { if (el && !el.hidden && pushed) { pushed = false; close(true); } });
    var rt = null;
    global.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (el && !el.hidden && photos.length) show(false); }, 250); });
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) q(".pl-fs").hidden = true;
  }

  function open(a, fromEl, o) {
    if (!el) build();
    opts = o || {};
    album = a; photos = []; caps = null; cur = 0; opener = fromEl || null; newestFirst = false;
    el.querySelector(".pl-order").hidden = true;
    el.querySelector(".pl-order .t").textContent = " Od najnowszych";
    el.querySelector(".pl-cap").hidden = true;
    el.classList.toggle("single", !!opts.single);
    el.querySelector(".pl-sharebox").hidden = true;
    closeMuzBox();
    stopMuz(true);
    muzTracks = []; muzSel = 0; muzParam = A.parseMusicParam(opts.m || opts.mParam || "");
    prepareMusic(a, opts);
    var my = ++reqId;
    el.querySelector(".pl-title").textContent = a.t;
    el.querySelector(".pl-strip").innerHTML = "";
    el.querySelector(".pl-img").removeAttribute("src");
    el.querySelector(".pl-count").textContent = "";
    msg("Ładuję zdjęcia…");
    el.hidden = false; el.classList.add("loading");
    document.body.classList.add("noscroll");
    if (!pushed && !opts.single) { try { history.pushState({ albumPlayer: 1 }, ""); pushed = true; } catch (e) {} }
    el.querySelector(".pl-close").focus({ preventScroll: true });
    return fetch(BASE + "data/a/" + a.n + ".json?v=" + A.VER).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (my !== reqId) return;
      photos = (j.p || []).slice();
      caps = j.cap ? j.cap.slice() : null;
      if (!photos.length) throw new Error("pusty album");
      msg("");
      el.querySelector(".pl-order").hidden = !j.d;
      buildStrip();
      go(0);
    }).catch(function () {
      if (my !== reqId) return;
      el.classList.remove("loading");
      el.querySelector(".pl-msg").innerHTML = 'Nie udało się wczytać zdjęć tego albumu.<br><a href="' + esc(a.u) + '" target="_blank" rel="noopener">Otwórz go w Google Foto ↗</a>';
      el.querySelector(".pl-msg").hidden = false;
    });
  }
  var newestFirst = false;
  function buildStrip() {
    el.querySelector(".pl-strip").innerHTML = photos.map(function (p, i) {
      var c = caps && caps[i];
      return '<button type="button" class="pl-th' + (p[3] === "v" ? " vid" : "") + '" data-i="' + i + '" role="option" aria-label="Zdjęcie ' + (i + 1) + (c && c[0] ? ": " + esc(c[0]) : "") + '">' +
        '<img loading="lazy" alt="" referrerpolicy="no-referrer" src="' + esc(thumb(p)) + '"></button>';
    }).join("");
  }
  function shareFb() {
    stopShow();
    var u = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(albumLink());
    var w = global.open(u, "fbshare", "width=640,height=680,scrollbars=yes,resizable=yes"); if (w) try { w.opener = null; } catch (e) {}
  }
  function msg(t) { var m = el.querySelector(".pl-msg"); m.textContent = t; m.hidden = !t; }

  function go(i) {
    if (!photos.length) return;
    if (i < 0) i = photos.length - 1;
    if (i >= photos.length) i = 0;
    cur = i; show(true);
  }
  function show(scrollStrip) {
    var p = photos[cur], img = el.querySelector(".pl-img"), src = big(p);
    if (img.getAttribute("src") !== src) { el.classList.add("loading"); img.src = src; }
    var c = caps && caps[cur], cap = el.querySelector(".pl-cap");
    img.alt = (c && c[0]) || (album.t + " – zdjęcie " + (cur + 1));
    if (c && (c[0] || c[1])) {
      cap.querySelector(".c-t").textContent = c[0] || "";
      cap.querySelector(".c-d").textContent = c[1] ? "· " + c[1].slice(0, 10) : "";
      cap.querySelector(".c-o").textContent = c[2] || "";
      cap.hidden = false;
    } else cap.hidden = true;
    var v = el.querySelector(".pl-video");
    if (p[3] === "v") { v.hidden = false; v.href = videoUrl(p); } else v.hidden = true;
    el.querySelector(".pl-count").textContent = (cur + 1) + " / " + photos.length;
    var strip = el.querySelector(".pl-strip"), old = strip.querySelector(".on");
    if (old) { old.classList.remove("on"); old.setAttribute("aria-selected", "false"); }
    var th = strip.children[cur];
    if (th) {
      th.classList.add("on"); th.setAttribute("aria-selected", "true");
      if (scrollStrip !== false) strip.scrollTo({ left: th.offsetLeft - strip.clientWidth / 2 + th.offsetWidth / 2, behavior: "smooth" });
    }
    [cur + 1, cur - 1].forEach(function (k) {
      var q = photos[(k + photos.length) % photos.length]; if (q) { var im = new Image(); im.referrerPolicy = "no-referrer"; im.src = big(q); }
    });
  }

  function toggleShow() { timer ? stopShow() : startShow(); }
  function startShow() {
    if (!photos.length) return;
    var b = el.querySelector(".pl-play"); b.innerHTML = '❚❚<span class="t"> Zatrzymaj</span>'; b.setAttribute("aria-pressed", "true");
    timer = setInterval(function () { go(cur + 1); }, SLIDE_MS);
  }
  function stopShow() {
    if (!timer) return;
    clearInterval(timer); timer = null;
    var b = el.querySelector(".pl-play"); b.innerHTML = '▶<span class="t"> Pokaz</span>'; b.setAttribute("aria-pressed", "false");
  }
  function toggleFs() {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    var r = el.requestFullscreen || el.webkitRequestFullscreen;
    if (r) { var pr = r.call(el); if (pr && pr.catch) pr.catch(function () {}); }
  }
  function close(fromPop) {
    if (!el || el.hidden) return;
    stopShow(); reqId++; closeShare(); closeMuzBox(); stopMuz(true);
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    el.hidden = true;
    document.body.classList.remove("noscroll");
    if (pushed && !fromPop) { pushed = false; history.back(); }
    if (opener) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
    if (opts.onClose) opts.onClose();
    else if (global.AlbumyOnPlayerClose) global.AlbumyOnPlayerClose(opener);
  }
  /* ---- udostępnianie: link + kod QR ---- */
  function albumLink() {
    var u = A.albumUrl(album.n);
    if (muzPlaying && muzTracks[muzSel]) u += "?m=" + encodeURIComponent(A.musicParam(muzTracks[muzSel]));
    return u;
  }

  /* ---- muzyka w tle ---- */
  var muzTracks = [], muzSel = 0, muzPlaying = false, muzParam = null, ytPlayer = null, ytReady = null, muzVol = 70, muzWant = 0;
  function prepareMusic(a, o) {
    A.loadMusicCatalog().then(function () {
      var r = A.resolveMusic(o.muz != null ? o.muz : null, a && a.n, muzParam);
      muzTracks = r.tracks; muzSel = r.sel || 0;
      if (muzParam && muzParam.id && (!muzTracks[muzSel] || !muzTracks[muzSel].t)) {
        var tr = muzTracks[muzSel];
        A.fetchMusicTitle(tr).then(function (t) { if (t && muzTracks[muzSel] === tr) { tr.t = t; paintMuzList(); } });
      }
      paintMuzList();
    });
  }
  function muzBox() { return el && el.querySelector(".pl-muzbox"); }
  function toggleMuzBox() {
    var box = muzBox(); if (!box) return;
    if (box.hidden) { closeShare(); box.hidden = false; paintMuzList(); el.querySelector(".mz-pp").focus({ preventScroll: true }); }
    else closeMuzBox();
  }
  function closeMuzBox() { if (el) el.querySelector(".pl-muzbox").hidden = true; }
  function paintMuzList() {
    if (!el) return;
    var ul = el.querySelector(".mz-list"), empty = !muzTracks.length;
    ul.innerHTML = empty
      ? '<li class="empty">W tym zestawie nie ma jeszcze muzyki. W edytorze zaznacz utwory z kanału @niepale albo wklej link z YouTube lub z Dysku Google.</li>'
      : muzTracks.map(function (t, i) {
          var src = t.k === "d" ? "Dysk Google" : "YouTube";
          var meta = [src, t.s ? A.fmtDur(t.s) : ""].filter(Boolean).join(" · ");
          return '<li data-i="' + i + '" class="' + (i === muzSel ? "on" : "") + '" role="option" aria-selected="' + (i === muzSel) + '">' +
            esc(t.t || (t.k === "d" ? "Plik z Dysku" : "Film z YouTube")) +
            (meta ? '<span class="md">' + esc(meta) + "</span>" : "") + "</li>";
        }).join("");
    var on = muzTracks[muzSel];
    el.querySelector(".mz-now").textContent = muzPlaying && on ? ("▶ " + (on.t || "")) : (on ? (on.t || "") : "");
    el.querySelector(".mz-pp").textContent = muzPlaying ? "❚❚" : "▶";
    el.querySelector(".mz-pp").setAttribute("aria-label", muzPlaying ? "Pauza" : "Odtwórz");
    el.querySelector(".pl-muz").setAttribute("aria-pressed", muzPlaying ? "true" : "false");
    var li = ul.querySelector("li.on");
    if (li && !empty) try { li.scrollIntoView({ block: "nearest" }); } catch (e) {}
  }
  function setMuzVol(v) {
    muzVol = Math.max(0, Math.min(100, +v || 0));
    try { localStorage.setItem("albumy.muzyka.vol", String(muzVol)); } catch (e) {}
    if (ytPlayer && ytPlayer.setVolume) try { ytPlayer.setVolume(muzVol); } catch (e) {}
    var a = el.querySelector(".mz-audio"); if (a) a.volume = muzVol / 100;
  }
  function muzMsg(t) { var m = el.querySelector(".mz-msg"); if (m) m.textContent = t || ""; }
  function toggleMuzPlay() { muzPlaying ? pauseMuz() : startMuz(); }
  function muzSkip(dir) {
    if (!muzTracks.length) return;
    muzSel = (muzSel + dir + muzTracks.length) % muzTracks.length;
    paintMuzList();
    if (muzPlaying || muzWant) startMuz();
  }
  function pauseMuz() {
    muzWant = 0; muzPlaying = false;
    if (ytPlayer && ytPlayer.pauseVideo) try { ytPlayer.pauseVideo(); } catch (e) {}
    var a = el.querySelector(".mz-audio"); if (a && !a.paused) a.pause();
    paintMuzList();
  }
  function stopMuz(destroy) {
    muzWant = 0; muzPlaying = false;
    if (ytPlayer) {
      try { ytPlayer.stopVideo(); } catch (e) {}
      if (destroy) {
        try { ytPlayer.destroy(); } catch (e) {}
        ytPlayer = null;
        var h = el && el.querySelector(".mz-yt"); if (h) h.innerHTML = "";
      }
    }
    var a = el && el.querySelector(".mz-audio");
    if (a) { try { a.pause(); a.removeAttribute("src"); a.load(); } catch (e) {} }
    var f = el && el.querySelector(".mz-iframe");
    if (f) { f.hidden = true; f.removeAttribute("src"); }
    if (el) paintMuzList();
  }
  function ensureYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise(function (res) {
      if (global.YT && YT.Player) return res();
      var prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = function () { if (typeof prev === "function") prev(); res(); };
      if (!document.querySelector('script[src*="iframe_api"]')) {
        var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
      }
      if (global.YT && YT.Player) res();
    });
    return ytReady;
  }
  function startMuz() {
    var tr = muzTracks[muzSel];
    if (!tr) { muzMsg("Nie ma utworu do odtworzenia."); return; }
    var my = ++muzWant;
    muzMsg("");
    setMuzVol(el.querySelector(".mz-vol input").value);
    if (tr.k === "d") playDrive(tr, my);
    else playYT(tr, my);
  }
  function playYT(tr, my) {
    var a = el.querySelector(".mz-audio"); if (a) { try { a.pause(); a.removeAttribute("src"); } catch (e) {} }
    var f = el.querySelector(".mz-iframe"); if (f) { f.hidden = true; f.removeAttribute("src"); }
    if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) {} ytPlayer = null; }
    var host = el.querySelector(".mz-yt");
    host.hidden = false; host.innerHTML = '<div id="pl-yt-host"></div>';
    ensureYT().then(function () {
      if (my !== muzWant || !el) return;
      ytPlayer = new YT.Player("pl-yt-host", {
        host: "https://www.youtube-nocookie.com",
        videoId: tr.id,
        width: 1, height: 1,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1, origin: location.origin },
        events: {
          onReady: function (e) { if (my !== muzWant) return; try { e.target.setVolume(muzVol); e.target.playVideo(); } catch (ex) {} },
          onStateChange: function (e) {
            if (my !== muzWant) return;
            if (e.data === 1) { muzPlaying = true; paintMuzList(); }
            else if (e.data === 0) muzSkip(1);
            else if (e.data === 2) { muzPlaying = false; paintMuzList(); }
          },
          onError: function (e) {
            if (my !== muzWant) return;
            muzPlaying = false;
            var code = e && e.data, m = { 2: "Niepoprawny identyfikator filmu.", 5: "Błąd odtwarzacza YouTube.", 100: "Nie ma takiego filmu.", 101: "Właściciel filmu nie pozwala go osadzić na innej stronie.", 150: "Właściciel filmu nie pozwala go osadzić na innej stronie." };
            muzMsg((m[code] || ("YouTube zgłosił błąd " + code)) + " Spróbuj następnego utworu albo innego linku.");
            paintMuzList();
          }
        }
      });
    }).catch(function () { if (my === muzWant) muzMsg("Nie udało się wczytać odtwarzacza YouTube."); });
  }
  function playDrive(tr, my) {
    if (ytPlayer) { try { ytPlayer.stopVideo(); } catch (e) {} }
    var audio = el.querySelector(".mz-audio"), urls = A.driveStreamUrls(tr.id), i = 0;
    var f = el.querySelector(".mz-iframe"); if (f) { f.hidden = true; f.removeAttribute("src"); }
    function ok() { if (my !== muzWant) return; muzPlaying = true; paintMuzList(); }
    function fail() {
      if (my !== muzWant) return;
      muzPlaying = false;
      muzMsg("Nie udało się odtworzyć pliku z Dysku bezpośrednio. Próbuję podglądu Dysku (sterowanie może być ograniczone).");
      paintMuzList();
      if (f) { f.hidden = false; f.src = A.drivePreviewUrl(tr.id); muzPlaying = true; paintMuzList(); }
    }
    audio.onended = function () { if (my === muzWant) muzSkip(1); };
    audio.onplay = ok;
    audio.onplaying = ok;
    audio.onerror = function () {
      i++;
      if (i < urls.length) { audio.src = urls[i]; var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
      else fail();
    };
    audio.volume = muzVol / 100;
    audio.src = urls[0];
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function () {});
  }

  function wrapLines(c, text, maxW, byChar, maxLines) {
    var parts = byChar ? String(text).split(/(?<=[\/?=&.-])/) : String(text).split(/\s+/);
    var lines = [], line = "";
    parts.forEach(function (p) {
      var cand = line ? line + (byChar ? "" : " ") + p : p;
      if (c.measureText(cand).width <= maxW || !line) { line = cand; }
      else { lines.push(line); line = p; }
      while (c.measureText(line).width > maxW && line.length > 1) {   // za długi kawałek – tniemy po znakach
        var k = line.length; while (k > 1 && c.measureText(line.slice(0, k)).width > maxW) k--;
        lines.push(line.slice(0, k)); line = line.slice(k);
      }
    });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…"); }
    return lines;
  }
  /* Kod QR z białym marginesem, a pod nim tytuł albumu i link (czytelny tekst). */
  function drawQr(canvas, text, scale, caption) {
    var qr = qrcode(0, "M"); qr.addData(text); qr.make();
    var n = qr.getModuleCount(), quiet = 4, side = (n + quiet * 2) * scale;
    var c = canvas.getContext("2d");
    var W = Math.max(side, 48 * scale), off = Math.round((W - side) / 2), pad = scale * 3, maxW = W - pad * 2;
    var tf = "bold " + Math.round(scale * 2.6) + "px Arial, Helvetica, sans-serif", lf = Math.round(scale * 2) + "px Arial, Helvetica, sans-serif";
    var tl = Math.round(scale * 3.3), ll = Math.round(scale * 2.6);
    c.font = tf; var tLines = caption ? wrapLines(c, caption, maxW, false, 3) : [];
    c.font = lf; var lLines = wrapLines(c, text.replace(/^https:\/\//, ""), maxW, true, 3);
    var capH = tLines.length * tl + lLines.length * ll + scale * 3;
    canvas.width = W; canvas.height = side + capH;
    c = canvas.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = "#000";
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(off + (k + quiet) * scale, (r + quiet) * scale, scale, scale);
    c.textAlign = "center"; c.textBaseline = "top";
    var y = side - scale;
    c.font = tf; c.fillStyle = "#000";
    tLines.forEach(function (t) { c.fillText(t, W / 2, y); y += tl; });
    y += Math.round(scale * 0.6);
    c.font = lf; c.fillStyle = "#1b4f8a";
    lLines.forEach(function (t) { c.fillText(t, W / 2, y); y += ll; });
    return canvas;
  }
  function openShare() {
    if (!album || typeof qrcode !== "function") return;
    stopShow(); closeMuzBox();
    var box = el.querySelector(".pl-sharebox");
    el.querySelector(".sb-t").textContent = album.t;
    var sl = el.querySelector(".sb-link"); sl.href = albumLink(); sl.textContent = albumLink();
    drawQr(el.querySelector(".sb-qr"), albumLink(), 8, album.t);
    box.hidden = false;
    el.querySelector(".sb-copy").focus({ preventScroll: true });
  }
  function closeShare() { if (el) el.querySelector(".pl-sharebox").hidden = true; }
  function qrBlob() {
    var cv = drawQr(document.createElement("canvas"), albumLink(), 12, album.t);
    return new Promise(function (res, rej) { cv.toBlob(function (b) { b ? res(b) : rej(new Error("brak obrazka")); }, "image/png"); });
  }
  function sbMsg(t) { var m = el.querySelector(".sb-msg"); m.textContent = t; clearTimeout(sbMsg.t); sbMsg.t = setTimeout(function () { m.textContent = ""; }, 6000); }
  function htmlFor(blob) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () {
        var u = albumLink();
        res('<div><img src="' + fr.result + '" alt="Kod QR: ' + esc(album.t) + '" width="288"><br>' +
          '<b>' + esc(album.t) + '</b><br><a href="' + esc(u) + '">' + esc(u) + '</a></div>');
      };
      fr.readAsDataURL(blob);
    });
  }
  /* Kopiuj QR: obrazek PNG + HTML (obrazek, tytuł, klikalny link) + zwykły tekst z linkiem */
  function copyQr() {
    var b = el.querySelector(".sb-cqr"), u = albumLink();
    if (!(navigator.clipboard && navigator.clipboard.write && global.ClipboardItem)) return fallback();
    var png = qrBlob();
    var html = png.then(htmlFor).then(function (h) { return new Blob([h], { type: "text/html" }); });
    var txt = new Blob([u], { type: "text/plain" });
    var full;
    try { full = new ClipboardItem({ "image/png": png, "text/html": html, "text/plain": txt }); } catch (e) { full = null; }
    (full ? navigator.clipboard.write([full]) : Promise.reject())
      .catch(function () { return navigator.clipboard.write([new ClipboardItem({ "image/png": qrBlob() })]); })
      .then(function () {
        b.textContent = "Skopiowany ✓"; setTimeout(function () { b.textContent = "Kopiuj QR"; }, 2000);
        sbMsg("Kod QR z linkiem jest w schowku – wklej go (Ctrl+V) w wiadomości albo dokumencie.");
      }, fallback);
    function fallback() {
      downloadQr();
      sbMsg("Ta przeglądarka nie pozwala skopiować obrazka – zapisałem kod QR jako plik PNG.");
    }
  }
  function downloadQr() {
    qrBlob().then(function (b) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "album-" + album.n + "-qr.png";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });
  }

  global.AlbumPlayer = { open: open, close: close, isOpen: function () { return !!el && !el.hidden; }, index: function () { return cur; }, count: function () { return photos.length; },
    musicState: function () {
      var t = muzTracks[muzSel];
      return {
        open: !!(el && muzBox() && !muzBox().hidden),
        playing: !!muzPlaying,
        kind: t ? t.k : "",
        id: t ? t.id : "",
        title: t ? t.t : "",
        index: muzSel,
        count: muzTracks.length,
        volume: muzVol,
        param: t && muzPlaying ? A.musicParam(t) : "",
        ytState: ytPlayer && ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : null
      };
    }
  };
})(window);
