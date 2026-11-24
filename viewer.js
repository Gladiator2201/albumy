/* Albumy – przeglądarka dla gości (tylko oglądanie) */
(function () {
  "use strict";
  var A = window.Albumy, esc = A.esc;
  var $ = function (id) { return document.getElementById(id); };
  var gallery = $("gallery"), bubble = $("bubble"), popup = $("popup");
  var list = [], payload = "", bubbleFor = null, lastPointer = "mouse", holdUntil = 0, setMuz = null;

  function render(set, cat) {
    setMuz = set.muz || null;
    list = A.resolveSet(cat, set);
    if (set.t) { $("title").textContent = set.t; document.title = set.t + " · Wszystko co Nasze"; }
    if (set.d) { $("dedication").textContent = set.d; $("dedication").hidden = false; document.title = set.d + " · " + document.title; }
    $("count").textContent = list.length + " " + A.plural(list.length, "album", "albumy", "albumów");
    if (!list.length) { gallery.innerHTML = ""; $("empty-msg").hidden = false; return; }
    var html = "", years = "", cur = null, idx = 0;
    list.forEach(function (a, i) {
      if (a.y !== cur) {
        if (cur !== null) html += "</div></section>";
        cur = a.y;
        var yid = "rok-" + String(a.y).replace(/\W+/g, "");
        html += '<section class="year" id="' + yid + '"><h2 class="ybadge">' + esc(a.y) + '</h2><div class="grid">';
        years += '<a href="#' + yid + '" class="chip">' + esc(a.y) + "</a>";
      }
      var c1 = A.coverUrl(a.c, 300), c2 = A.coverUrl(a.c, 600);
      var link = a.f > 0 ? 'role="button" tabindex="0"' : 'href="' + esc(a.u) + '" target="_blank" rel="noopener"';
      html += '<a class="tile" ' + link + ' data-i="' + i + '" aria-label="' + esc(a.t) + '">' +
        (a.c ? '<img loading="lazy" decoding="async" alt="" src="' + esc(c1) + '"' + (c2 !== c1 ? ' srcset="' + esc(c1) + " 1x, " + esc(c2) + ' 2x"' : "") + ' referrerpolicy="no-referrer">' : "") +
        '<span class="ph">' + esc(a.t) + "</span></a>";
      idx++;
    });
    html += "</div></section>";
    gallery.innerHTML = html;
    $("years").innerHTML = list.length > 24 ? years : "";
    gallery.querySelectorAll("img").forEach(function (im) {
      im.addEventListener("error", function () { im.remove(); }, { once: true });
      im.addEventListener("load", function () { im.parentNode.classList.add("ok"); }, { once: true });
    });
    buildPopup();
    $("btn-list").hidden = false;
    $("btn-fb").hidden = false;
  }

  /* ---- dymek ---- */
  function showBubble(tile, touch) {
    var a = list[+tile.dataset.i];
    if (!a) return;
    bubbleFor = tile;
    bubble.querySelector(".b-title").textContent = a.t;
    bubble.querySelector(".b-hint").textContent = touch ? "Dotknij okładki jeszcze raz, aby otworzyć album" : "";
    bubble.hidden = false;
    bubble.classList.remove("below");
    var r = tile.getBoundingClientRect(), bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    var vw = document.documentElement.clientWidth, cx = r.left + r.width / 2;
    var left = Math.max(8, Math.min(vw - bw - 8, cx - bw / 2));
    var top = r.top - bh - 16;
    if (top < 8) { top = r.bottom + 16; bubble.classList.add("below"); }
    bubble.style.left = left + "px";
    bubble.style.top = top + "px";
    bubble.style.setProperty("--tail", Math.max(18, Math.min(bw - 18, cx - left)) + "px");
  }
  function hideBubble() { bubble.hidden = true; bubbleFor = null; }

  gallery.addEventListener("pointerover", function (e) {
    lastPointer = e.pointerType || "mouse";
    if (lastPointer !== "mouse" || Date.now() < holdUntil) return;
    var t = e.target.closest(".tile"); if (t && t !== bubbleFor) showBubble(t, false);
  });
  gallery.addEventListener("pointerout", function (e) {
    if ((e.pointerType || "mouse") !== "mouse") return;
    var t = e.target.closest(".tile");
    if (t && !t.contains(e.relatedTarget)) hideBubble();
  });
  gallery.addEventListener("pointerdown", function (e) { lastPointer = e.pointerType || "mouse"; });
  function hasPlayer(a) { return a && a.f > 0 && window.AlbumPlayer; }
  function openAlbum(i, from) {
    var a = list[i]; if (!hasPlayer(a)) return false;
    hideBubble(); window.AlbumPlayer.open(a, from, { muz: setMuz }); return true;
  }
  gallery.addEventListener("click", function (e) {
    var t = e.target.closest(".tile"); if (!t) return;
    if (lastPointer !== "mouse" && bubbleFor !== t) { e.preventDefault(); showBubble(t, true); return; }
    if (hasPlayer(list[+t.dataset.i])) { e.preventDefault(); openAlbum(+t.dataset.i, t); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var t = e.target.closest && e.target.closest('.tile[role="button"],.popen[role="button"]');
    if (t) { e.preventDefault(); t.click(); }
  });
  window.AlbumyOnPlayerClose = function (tile) {
    if (!tile) return;
    tile.classList.remove("flash"); void tile.offsetWidth; tile.classList.add("flash");
    setTimeout(function () { tile.classList.remove("flash"); }, 3000);
  };
  var kbd = false;
  document.addEventListener("keydown", function (e) { if (e.key === "Tab") kbd = true; }, true);
  document.addEventListener("pointerdown", function () { kbd = false; }, true);
  gallery.addEventListener("focusin", function (e) { var t = e.target.closest(".tile"); if (t && kbd) showBubble(t, false); });
  gallery.addEventListener("focusout", function () { if (kbd) hideBubble(); });
  window.addEventListener("scroll", function () {
    if (!bubbleFor) return;
    if (lastPointer === "mouse" && Date.now() > holdUntil) hideBubble();
    else showBubble(bubbleFor, lastPointer !== "mouse");
  }, { passive: true });
  window.addEventListener("resize", hideBubble);
  document.addEventListener("pointerdown", function (e) { if (bubbleFor && !e.target.closest(".tile")) hideBubble(); });

  /* ---- wyskakująca lista ---- */
  function buildPopup() {
    var html = "", cur = null;
    list.forEach(function (a, i) {
      if (a.y !== cur) { cur = a.y; html += '<li class="py">' + esc(a.y) + "</li>"; }
      html += '<li class="pi" data-i="' + i + '"><button type="button" class="pgo" data-i="' + i + '">' + esc(a.t) + '</button>' +
        '<a class="popen" data-i="' + i + '" ' + (a.f > 0 ? 'role="button" tabindex="0"' : 'href="' + esc(a.u) + '" target="_blank" rel="noopener"') + ' title="Otwórz album" aria-label="Otwórz album ' + esc(a.t) + '">↗</a></li>';
    });
    $("popup-list").innerHTML = html;
  }
  function openPopup() {
    hideBubble();
    popup.hidden = false;
    document.body.classList.add("noscroll");
    setTimeout(function () { $("popup-search").focus({ preventScroll: true }); }, 30);
  }
  function closePopup() { popup.hidden = true; document.body.classList.remove("noscroll"); }
  function goTo(i) {
    closePopup();
    var tile = gallery.querySelector('.tile[data-i="' + i + '"]');
    if (!tile) return;
    var far = Math.abs(tile.getBoundingClientRect().top - innerHeight / 2) > innerHeight * 2;
    tile.scrollIntoView({ block: "center", behavior: far ? "auto" : "smooth" });
    gallery.querySelectorAll(".tile.flash").forEach(function (x) { x.classList.remove("flash"); });
    tile.classList.add("flash");
    holdUntil = Date.now() + 2500;
    var shown = false;
    function show() { if (shown) return; shown = true; holdUntil = Date.now() + 1200; showBubble(tile, lastPointer !== "mouse"); }
    window.addEventListener("scrollend", show, { once: true });
    setTimeout(show, 900);
    setTimeout(function () { tile.classList.remove("flash"); }, 4000);
  }
  $("btn-list").addEventListener("click", openPopup);
  $("popup-close").addEventListener("click", closePopup);
  popup.addEventListener("click", function (e) {
    if (e.target === popup) return closePopup();
    var b = e.target.closest(".pgo"); if (b) return goTo(+b.dataset.i);
    var o = e.target.closest(".popen");
    if (o) {
      closePopup();
      var i = +o.dataset.i;
      if (hasPlayer(list[i])) { e.preventDefault(); openAlbum(i, gallery.querySelector('.tile[data-i="' + i + '"]')); }
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !popup.hidden) closePopup(); });
  window.AlbumyOpenAlbum = openAlbum;
  $("popup-search").addEventListener("input", function () {
    var q = this.value.trim().toLowerCase();
    var items = $("popup-list").children, lastY = null, anyInY = false;
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      if (li.classList.contains("py")) {
        if (lastY) lastY.hidden = !anyInY;
        lastY = li; anyInY = false;
        if (q && li.textContent.toLowerCase().indexOf(q) !== -1) { lastY.dataset.match = "1"; } else delete li.dataset.match;
        continue;
      }
      var hit = !q || li.textContent.toLowerCase().indexOf(q) !== -1 || (lastY && lastY.dataset.match);
      li.hidden = !hit; if (hit) anyInY = true;
    }
    if (lastY) lastY.hidden = !anyInY;
  });
  $("btn-fb").addEventListener("click", function () { A.openFacebook(payload); });

  /* ---- start ---- */
  payload = A.payloadFromLocation();
  Promise.all([A.loadCatalog(), A.decodeSet(payload), A.loadMusicCatalog()]).then(function (r) {
    var cat = r[0], set = r[1];
    if (!set) { gallery.innerHTML = ""; $("empty-msg").hidden = false; $("count").textContent = ""; return; }
    render(set, cat);
  }).catch(function (e) {
    gallery.innerHTML = '<p class="empty">Nie udało się wczytać albumów. Odśwież stronę.</p>';
    if (window.console) console.warn(e);
  });
})();
