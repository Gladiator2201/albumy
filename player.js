/* Albumy – odtwarzacz albumu w oknie (zdjęcia bez wychodzenia do Google Foto) */
(function (global) {
  "use strict";
  var A = global.Albumy, esc = A.esc;
  var LH3 = "https://lh3.googleusercontent.com/pw/";
  var el = null, album = null, photos = [], cur = 0, timer = null, pushed = false, opener = null, reqId = 0, opts = {};
  var BASE = global.ALBUMY_BASE || "";
  var SLIDE_MS = 4000;

  function full(u) { return /^https?:/.test(u) ? u : LH3 + u; }
  function size() {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.ceil(innerWidth * dpr / 400) * 400, h = Math.ceil(innerHeight * dpr / 300) * 300;
    return "=w" + Math.min(w, 2560) + "-h" + Math.min(h, 1920);
  }
  function big(p) { return full(p[0]) + size(); }
  function thumb(p) { return full(p[0]) + "=w160-h160-c"; }
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
      '<div class="pl-tools"><button type="button" class="pl-btn pl-play" aria-pressed="false" title="Pokaz slajdów (spacja)">▶ Pokaz</button>' +
      '<button type="button" class="pl-btn pl-fs" title="Pełny ekran (F)" aria-label="Pełny ekran">⛶<span class="t"> Pełny ekran</span></button>' +
      '<button type="button" class="pl-btn pl-share" title="Link i kod QR do tego albumu">⤴<span class="t"> Udostępnij</span></button>' +
      '<button type="button" class="pl-btn pl-close" title="Zamknij (Esc)" aria-label="Zamknij">✕ Zamknij</button></div></div>' +
      '<div class="pl-stage"><img class="pl-img" alt="" referrerpolicy="no-referrer" draggable="false">' +
      '<a class="pl-video" target="_blank" rel="noopener" hidden>▶ Film – obejrzyj w Google Foto</a>' +
      '<p class="pl-msg" hidden></p>' +
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
      '<p class="sb-msg" aria-live="polite"></p><p class="sb-note">Ten link pokazuje tylko ten album – bez możliwości zmian.</p></div></div>';
    document.body.appendChild(el);
    var q = function (s) { return el.querySelector(s); };
    q(".pl-prev").addEventListener("click", function () { stopShow(); go(cur - 1); });
    q(".pl-next").addEventListener("click", function () { stopShow(); go(cur + 1); });
    q(".pl-close").addEventListener("click", function () { close(); });
    q(".pl-play").addEventListener("click", toggleShow);
    q(".pl-share").addEventListener("click", openShare);
    q(".sb-x").addEventListener("click", closeShare);
    q(".pl-sharebox").addEventListener("click", function (e) { if (e.target === this) closeShare(); });
    q(".sb-copy").addEventListener("click", function () {
      var inp = q(".sb-link"), b = this, done = function () { b.textContent = "Skopiowany ✓"; setTimeout(function () { b.textContent = "Kopiuj link"; }, 2000); };
      (navigator.clipboard ? navigator.clipboard.writeText(albumLink()) : Promise.reject()).then(done, function () {
        var r = document.createRange(); r.selectNodeContents(inp); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand("copy"); } catch (e) {} done();
      });
    });
    q(".sb-fb").addEventListener("click", function () {
      var u = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(albumLink());
      var w = global.open(u, "fbshare", "width=640,height=680,scrollbars=yes,resizable=yes"); if (w) try { w.opener = null; } catch (e) {}
    });
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
      if (k === "ArrowRight" || k === "PageDown") { e.preventDefault(); stopShow(); go(cur + 1); }
      else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); stopShow(); go(cur - 1); }
      else if (k === "Home") { e.preventDefault(); go(0); }
      else if (k === "End") { e.preventDefault(); go(photos.length - 1); }
      else if (k === " ") { if (!e.target.closest("button,a")) { e.preventDefault(); toggleShow(); } }
      else if (k === "f" || k === "F") { toggleFs(); }
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
    album = a; photos = []; cur = 0; opener = fromEl || null;
    el.classList.toggle("single", !!opts.single);
    el.querySelector(".pl-sharebox").hidden = true;
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
      photos = j.p || [];
      if (!photos.length) throw new Error("pusty album");
      msg("");
      el.querySelector(".pl-strip").innerHTML = photos.map(function (p, i) {
        return '<button type="button" class="pl-th' + (p[3] === "v" ? " vid" : "") + '" data-i="' + i + '" role="option" aria-label="Zdjęcie ' + (i + 1) + '">' +
          '<img loading="lazy" alt="" referrerpolicy="no-referrer" src="' + esc(thumb(p)) + '"></button>';
      }).join("");
      go(0);
    }).catch(function () {
      if (my !== reqId) return;
      el.classList.remove("loading");
      el.querySelector(".pl-msg").innerHTML = 'Nie udało się wczytać zdjęć tego albumu.<br><a href="' + esc(a.u) + '" target="_blank" rel="noopener">Otwórz go w Google Foto ↗</a>';
      el.querySelector(".pl-msg").hidden = false;
    });
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
    img.alt = album.t + " – zdjęcie " + (cur + 1);
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
    var b = el.querySelector(".pl-play"); b.textContent = "❚❚ Zatrzymaj"; b.setAttribute("aria-pressed", "true");
    timer = setInterval(function () { go(cur + 1); }, SLIDE_MS);
  }
  function stopShow() {
    if (!timer) return;
    clearInterval(timer); timer = null;
    var b = el.querySelector(".pl-play"); b.textContent = "▶ Pokaz"; b.setAttribute("aria-pressed", "false");
  }
  function toggleFs() {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    var r = el.requestFullscreen || el.webkitRequestFullscreen;
    if (r) { var pr = r.call(el); if (pr && pr.catch) pr.catch(function () {}); }
  }
  function close(fromPop) {
    if (!el || el.hidden) return;
    stopShow(); reqId++; closeShare();
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    el.hidden = true;
    document.body.classList.remove("noscroll");
    if (pushed && !fromPop) { pushed = false; history.back(); }
    if (opener) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
    if (opts.onClose) opts.onClose();
    else if (global.AlbumyOnPlayerClose) global.AlbumyOnPlayerClose(opener);
  }
  /* ---- udostępnianie: link + kod QR ---- */
  function albumLink() { return A.albumUrl(album.n); }
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
    stopShow();
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

  global.AlbumPlayer = { open: open, close: close, isOpen: function () { return !!el && !el.hidden; }, index: function () { return cur; }, count: function () { return photos.length; } };
})(window);
