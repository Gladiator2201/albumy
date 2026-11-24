/* Albumy – odtwarzacz albumu w oknie (zdjęcia bez wychodzenia do Google Foto) */
(function (global) {
  "use strict";
  var A = global.Albumy, esc = A.esc;
  var LH3 = "https://lh3.googleusercontent.com/pw/";
  var el = null, album = null, photos = [], cur = 0, timer = null, pushed = false, opener = null, reqId = 0;
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
      '<a class="pl-gf" target="_blank" rel="noopener" title="Otwórz ten album w Google Foto">Google Foto ↗</a>' +
      '<button type="button" class="pl-btn pl-close" title="Zamknij (Esc)" aria-label="Zamknij">✕ Zamknij</button></div></div>' +
      '<div class="pl-stage"><img class="pl-img" alt="" referrerpolicy="no-referrer" draggable="false">' +
      '<a class="pl-video" target="_blank" rel="noopener" hidden>▶ Film – obejrzyj w Google Foto</a>' +
      '<p class="pl-msg" hidden></p>' +
      '<button type="button" class="pl-nav pl-prev" aria-label="Poprzednie zdjęcie (strzałka w lewo)">‹</button>' +
      '<button type="button" class="pl-nav pl-next" aria-label="Następne zdjęcie (strzałka w prawo)">›</button></div>' +
      '<div class="pl-strip" role="listbox" aria-label="Miniatury"></div>';
    document.body.appendChild(el);
    var q = function (s) { return el.querySelector(s); };
    q(".pl-prev").addEventListener("click", function () { stopShow(); go(cur - 1); });
    q(".pl-next").addEventListener("click", function () { stopShow(); go(cur + 1); });
    q(".pl-close").addEventListener("click", function () { close(); });
    q(".pl-play").addEventListener("click", toggleShow);
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

  function open(a, fromEl) {
    if (!el) build();
    album = a; photos = []; cur = 0; opener = fromEl || null;
    var my = ++reqId;
    el.querySelector(".pl-title").textContent = a.t;
    el.querySelector(".pl-gf").href = a.u;
    el.querySelector(".pl-strip").innerHTML = "";
    el.querySelector(".pl-img").removeAttribute("src");
    el.querySelector(".pl-count").textContent = "";
    msg("Ładuję zdjęcia…");
    el.hidden = false; el.classList.add("loading");
    document.body.classList.add("noscroll");
    if (!pushed) { try { history.pushState({ albumPlayer: 1 }, ""); pushed = true; } catch (e) {} }
    el.querySelector(".pl-close").focus({ preventScroll: true });
    return fetch("data/a/" + a.n + ".json?v=" + A.VER).then(function (r) {
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
    stopShow(); reqId++;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    el.hidden = true;
    document.body.classList.remove("noscroll");
    if (pushed && !fromPop) { pushed = false; history.back(); }
    if (opener) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
    if (global.AlbumyOnPlayerClose) global.AlbumyOnPlayerClose(opener);
  }
  global.AlbumPlayer = { open: open, close: close, isOpen: function () { return !!el && !el.hidden; }, index: function () { return cur; }, count: function () { return photos.length; } };
})(window);
