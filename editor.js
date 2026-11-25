/* Albumy – edytor zestawów (tylko dla Stacha, adres ukryty) */
(function () {
  "use strict";
  var A = window.Albumy, esc = A.esc;
  var $ = function (id) { return document.getElementById(id); };
  var K_SETS = "albumy.zestawy.v1", K_WORK = "albumy.robocze.v1", K_LIB = "albumy.dodane.v1";
  var cat = null, sel = new Set(), lib = [], xon = new Set(), payload = "", loadedKey = "";
  var muzCat = null, muzTrack = null, muzAlbums = {};
  var lower = {}, rendered = {};

  function status(id, msg, err) { var el = $(id); if (!el) return; el.textContent = msg || ""; el.classList.toggle("err", !!err); }
  function explainStore(e) {
    var n = (e && e.name) || "", m = (e && e.message) || "", t = n + " " + m;
    if (/QuotaExceeded|NS_ERROR_DOM_QUOTA|QUOTA/i.test(t) || (e && (e.code === 22 || e.code === 1014)))
      return "w tej przeglądarce zabrakło miejsca na automatyczny zapis. Użyj przycisku „Zapisz (JSON)”, żeby nie stracić zestawu.";
    if (/SecurityError|insecure|Access is denied|private/i.test(t))
      return "ta przeglądarka nie pozwala zapisać pracy (tryb prywatny albo zablokowany zapis). Użyj przycisku „Zapisz (JSON)”, żeby nie stracić zestawu.";
    return "nie mogę zapisać pracy w tej przeglądarce" + (m ? " (" + m + ")" : "") + ". Użyj przycisku „Zapisz (JSON)”, żeby nie stracić zestawu.";
  }
  function showStoreWarn(msg) {
    var el = $("store-warn");
    if (el) { el.hidden = false; el.textContent = "Uwaga: " + msg; }
  }
  function hideStoreWarn() { var el = $("store-warn"); if (el) { el.hidden = true; el.textContent = ""; } }
  function probeStore() {
    try {
      var k = "albumy.__t";
      localStorage.setItem(k, "1");
      if (localStorage.getItem(k) !== "1") throw new Error("odczyt nie zgadza się z zapisem");
      localStorage.removeItem(k);
      hideStoreWarn();
      return true;
    } catch (e) { showStoreWarn(explainStore(e)); return false; }
  }
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      hideStoreWarn();
      return true;
    } catch (e) { showStoreWarn(explainStore(e)); return false; }
  }
  function ded() { return $("in-ded").value.trim(); }
  function ttl() { return $("in-title").value.trim(); }
  function xList() { return lib.filter(function (a) { return xon.has(a.u); }).map(function (a) { return { u: a.u, t: a.t, c: a.c }; }); }
  function curSet() { return { d: ded(), t: ttl(), ids: Array.from(sel).sort(function (a, b) { return a - b; }), x: xList(), muz: { track: muzTrack, albums: Object.assign({}, muzAlbums) } }; }

  /* ---------- zapis roboczy i łącze ---------- */
  var tmr = null;
  function changed() {
    $("dedication").textContent = ded(); $("dedication").hidden = !ded();
    updateSum();
    clearTimeout(tmr);
    tmr = setTimeout(function () {
      var s = curSet();
      jset(K_WORK, { d: s.d, t: s.t, m: A.idsToMask(s.ids), xon: Array.from(xon), key: loadedKey, muz: s.muz });
      A.encodeSet(s).then(function (p) { payload = p; $("share-link").value = A.shareUrl(p); });
    }, 120);
  }
  function updateSum() {
    var n = sel.size, all = cat ? cat.albums.length : 0, x = xList().length;
    $("sum").textContent = "Zaznaczone: " + n + " z " + all + (lib.length ? " · dodane: " + x + " z " + lib.length : "");
    if (muzCat) renderMuzAlbums();
  }

  /* ---------- lata i kafelki ---------- */
  function buildYears() {
    var html = "";
    cat.years.forEach(function (y) {
      html += '<details class="ey" data-y="' + esc(y) + '"><summary><input type="checkbox" class="ych" aria-label="Cały rok ' + esc(y) + '">' +
        "<span>" + esc(y) + '</span><span class="yc"></span></summary><div class="egrid"></div></details>';
    });
    $("years").innerHTML = html;
    cat.albums.forEach(function (a) { lower[a.n] = (a.t + " " + a.y).toLowerCase(); });
    refreshYearHeads();
  }
  function yearAlbums(y) { return cat.albums.filter(function (a) { return a.y === y; }); }
  function renderYear(det) {
    var y = det.dataset.y;
    if (rendered[y]) return;
    rendered[y] = true;
    det.querySelector(".egrid").innerHTML = yearAlbums(y).map(function (a) {
      return '<div class="et' + (sel.has(a.n) ? "" : " off") + '" data-n="' + a.n + '" title="' + esc(a.t) + '" role="checkbox" tabindex="0" aria-checked="' + sel.has(a.n) + '">' +
        '<div class="sq"><img loading="lazy" alt="" referrerpolicy="no-referrer" src="' + esc(A.coverUrl(a.c, 200)) + '"><span class="ck">' + (sel.has(a.n) ? "✓" : "✕") + "</span>" +
        (a.f > 0 ? '<button type="button" class="et-play" title="Obejrzyj album / udostępnij" aria-label="Obejrzyj album">▶</button>' : "") + "</div>" +
        '<div class="cap">' + esc(a.t) + "</div></div>";
    }).join("");
    applySearch();
  }
  function paintTile(el) {
    var on = sel.has(+el.dataset.n);
    el.classList.toggle("off", !on); el.setAttribute("aria-checked", on);
    el.querySelector(".ck").textContent = on ? "✓" : "✕";
  }
  function refreshYearHeads() {
    document.querySelectorAll("details.ey").forEach(function (det) {
      var al = yearAlbums(det.dataset.y), on = al.filter(function (a) { return sel.has(a.n); }).length;
      var ch = det.querySelector(".ych");
      ch.checked = on === al.length && on > 0; ch.indeterminate = on > 0 && on < al.length;
      det.querySelector(".yc").textContent = on + " z " + al.length;
    });
  }
  function repaintAll() {
    document.querySelectorAll(".et").forEach(paintTile);
    refreshYearHeads(); renderExtras(); changed();
  }
  $("years").addEventListener("toggle", function (e) { if (e.target.open) renderYear(e.target); }, true);
  $("years").addEventListener("click", function (e) {
    var ch = e.target.closest(".ych");
    if (ch) {
      e.stopPropagation();
      var y = ch.closest("details").dataset.y, on = ch.checked;
      yearAlbums(y).forEach(function (a) { on ? sel.add(a.n) : sel.delete(a.n); });
      ch.closest("details").querySelectorAll(".et").forEach(paintTile);
      refreshYearHeads(); changed();
      return;
    }
    var pl = e.target.closest(".et-play");
    if (pl) { e.stopPropagation(); var et = pl.closest(".et"); window.AlbumPlayer.open(cat.byN[+et.dataset.n], pl, { muz: curSet().muz }); return; }
    var t = e.target.closest(".et");
    if (t) toggleTile(t);
  });
  $("years").addEventListener("keydown", function (e) {
    var t = e.target.closest(".et");
    if (e.target.closest(".et-play")) return;
    if (t && (e.key === " " || e.key === "Enter")) { e.preventDefault(); toggleTile(t); }
  });
  function toggleTile(t) {
    var n = +t.dataset.n;
    sel.has(n) ? sel.delete(n) : sel.add(n);
    paintTile(t); refreshYearHeads(); changed();
  }

  /* ---------- wyszukiwanie i hurtowe zaznaczanie ---------- */
  function query() { return $("in-search").value.trim().toLowerCase(); }
  function matches(n, q) { return !q || q.split(/\s+/).every(function (w) { return lower[n].indexOf(w) !== -1; }); }
  function applySearch() {
    var q = query();
    document.querySelectorAll("details.ey").forEach(function (det) {
      var any = yearAlbums(det.dataset.y).some(function (a) { return matches(a.n, q); });
      det.hidden = !any;
      if (q && any && !det.open) { det.open = true; renderYear(det); }
      det.querySelectorAll(".et").forEach(function (el) { el.hidden = !matches(+el.dataset.n, q); });
    });
  }
  var stmr = null;
  $("in-search").addEventListener("input", function () { clearTimeout(stmr); stmr = setTimeout(applySearch, 200); });
  $("btn-all").addEventListener("click", function () { cat.albums.forEach(function (a) { sel.add(a.n); }); lib.forEach(function (a) { xon.add(a.u); }); repaintAll(); });
  $("btn-none").addEventListener("click", function () { sel.clear(); xon.clear(); repaintAll(); });
  function bulkVisible(on) {
    var q = query();
    if (!q) return status("st-set", "Najpierw wpisz coś w polu „Szukaj” – te przyciski dotyczą tylko znalezionych albumów.", true);
    var c = 0;
    cat.albums.forEach(function (a) { if (matches(a.n, q)) { on ? sel.add(a.n) : sel.delete(a.n); c++; } });
    status("st-set", (on ? "Zaznaczyłem " : "Odznaczyłem ") + c + " " + A.plural(c, "album", "albumy", "albumów") + " pasujących do „" + q + "”.");
    repaintAll();
  }
  $("btn-vis-on").addEventListener("click", function () { bulkVisible(true); });
  $("btn-vis-off").addEventListener("click", function () { bulkVisible(false); });

  /* ---------- dodane linki ---------- */
  function saveLib() { jset(K_LIB, lib); }
  function renderExtras() {
    if (!lib.length) { $("extra-list").innerHTML = ""; return; }
    $("extra-list").innerHTML = '<p class="note">Dodane linki (odznacz, jeśli mają nie wejść do tego zestawu; tytuł i okładkę możesz poprawić):</p>' +
      lib.map(function (a, i) {
        return '<div class="xrow" data-i="' + i + '"><input type="checkbox" class="xon"' + (xon.has(a.u) ? " checked" : "") + ' aria-label="W zestawie">' +
          '<img alt="" referrerpolicy="no-referrer" src="' + esc(A.coverUrl(a.c, 200)) + '">' +
          '<div class="xf"><input class="inp xt" value="' + esc(a.t) + '" placeholder="Tytuł albumu">' +
          '<input class="inp xc" value="' + esc(A.coverUrl(a.c, 600)) + '" placeholder="Adres okładki (obrazka) – można wkleić ręcznie">' +
          '<span class="xurl">' + esc(a.u) + '</span><span class="xb"><button type="button" class="btn ghost xre">Pobierz okładkę jeszcze raz</button>' +
          '<button type="button" class="btn warn xdel">Usuń z listy</button></span></div></div>';
      }).join("");
  }
  $("extra-list").addEventListener("change", function (e) {
    var row = e.target.closest(".xrow"); if (!row) return;
    var a = lib[+row.dataset.i];
    if (e.target.classList.contains("xon")) { e.target.checked ? xon.add(a.u) : xon.delete(a.u); }
    else if (e.target.classList.contains("xt")) { a.t = e.target.value.trim(); saveLib(); }
    else if (e.target.classList.contains("xc")) { a.c = A.packCover(e.target.value); saveLib(); row.querySelector("img").src = A.coverUrl(a.c, 200); }
    changed();
  });
  $("extra-list").addEventListener("click", function (e) {
    var row = e.target.closest(".xrow"); if (!row) return;
    var a = lib[+row.dataset.i];
    if (e.target.classList.contains("xdel")) {
      if (!confirm("Usunąć z listy dodanych: " + (a.t || a.u) + "?")) return;
      lib.splice(+row.dataset.i, 1); xon.delete(a.u); saveLib(); renderExtras(); changed();
    } else if (e.target.classList.contains("xre")) {
      status("st-add", "Pobieram okładkę: " + a.u + " …");
      fetchMeta(a.u).then(function (m) {
        if (m.c) a.c = m.c; if (m.t && !a.t) a.t = m.t;
        saveLib(); renderExtras(); changed();
        status("st-add", m.c ? "Okładka pobrana." : "Nie udało się pobrać okładki" + (m.err ? " (" + m.err + ")" : "") + ". Wklej adres obrazka ręcznie.", !m.c);
      });
    }
  });

  function cleanTitle(t, u) {
    t = String(t || "").split(" · ")[0].replace(/\s*📸\s*$/, "").trim();
    if (!t || t === A.shortCode(u) || /^(Google Photos|Zdjęcia Google)$/i.test(t)) return "";
    return t;
  }
  function parseHtmlMeta(html, base) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    function meta(p) { var m = doc.querySelector('meta[property="' + p + '"],meta[name="' + p + '"]'); return m ? m.getAttribute("content") : ""; }
    var t = meta("og:title") || (doc.querySelector("title") || {}).textContent || "";
    var img = meta("og:image");
    if (!img) { var im = doc.querySelector("img[src]"); if (im) img = im.getAttribute("src"); }
    if (img) try { img = new URL(img, base).href; } catch (e) {}
    return { t: t.trim(), c: img || "" };
  }
  function microlink(u) {
    return fetch("https://api.microlink.io/?url=" + encodeURIComponent(u)).then(function (r) {
      if (r.status === 429) throw new Error("dzienny limit darmowego pobierania okładek wyczerpany");
      return r.json();
    }).then(function (j) {
      if (j.status !== "success") throw new Error(j.message || "brak odpowiedzi");
      var d = j.data || {};
      return { t: d.title || "", c: (d.image && d.image.url) || "", url: d.url || u };
    });
  }
  /* Tytuł i okładka dla nowego linku. Google Foto nie pozwala przeglądarce czytać swoich stron,
     więc korzystamy z darmowej usługi microlink.io (ok. 50 zapytań dziennie). */
  function fetchMeta(u) {
    var kind = A.linkKind(u);
    if (kind === "gh") {
      return fetch(u).then(function (r) { if (!r.ok) throw new Error("strona " + r.status); return r.text(); })
        .then(function (h) { return parseHtmlMeta(h, u); })
        .catch(function (e) { return { t: "", c: "", err: e.message }; });
    }
    return microlink(u).then(function (m) {
      if (!m.c && m.url && m.url !== u) return microlink(m.url).then(function (m2) { m2.url = m2.url || m.url; return m2; });
      return m;
    }).then(function (m) { return { t: cleanTitle(m.t, u), c: A.packCover(m.c), url: m.url }; })
      .catch(function (e) { return { t: "", c: "", err: e.message }; });
  }
  function libFind(u) {
    var s = A.shortCode(u), f = A.afId(u);
    return lib.filter(function (a) { return a.u === u || (s && A.shortCode(a.u) === s) || (f && (A.afId(a.u) === f || a.f === f)); })[0];
  }
  function addLinks(links) {
    var msgs = [], chain = Promise.resolve();
    links.forEach(function (u) {
      chain = chain.then(function () {
        var hit = A.findInCatalog(cat, u);
        if (hit) { sel.add(hit.n); msgs.push("✓ jest w katalogu (" + hit.y + "): " + hit.t + " – zaznaczony"); return; }
        var ex = libFind(u);
        if (ex) { xon.add(ex.u); msgs.push("✓ już dodany wcześniej: " + (ex.t || ex.u)); return; }
        status("st-add", msgs.concat("… pobieram tytuł i okładkę: " + u).join("\n"));
        return fetchMeta(u).then(function (m) {
          var hit2 = m.url && A.findInCatalog(cat, m.url);
          if (hit2) { sel.add(hit2.n); msgs.push("✓ jest w katalogu (" + hit2.y + "): " + hit2.t + " – zaznaczony"); return; }
          var a = { u: u, t: m.t || "", c: m.c || "" };
          if (m.url && A.afId(m.url)) a.f = A.afId(m.url);
          lib.push(a); xon.add(u);
          msgs.push((m.c ? "✓ dodany z okładką: " : "! dodany bez okładki – wpisz tytuł/okładkę niżej: ") + (a.t || u) + (m.err ? " (" + m.err + ")" : ""));
        });
      });
    });
    return chain.then(function () {
      saveLib(); repaintAll();
      status("st-add", msgs.join("\n") || "Nie znalazłem żadnego linku (adres musi zaczynać się od https://).", !msgs.length);
    });
  }
  $("btn-add").addEventListener("click", function () {
    var links = A.extractLinks($("in-links").value);
    if (!links.length) return status("st-add", "Nie znalazłem żadnego linku (adres musi zaczynać się od https://).", true);
    $("btn-add").disabled = true;
    addLinks(links).then(function () { $("in-links").value = ""; $("btn-add").disabled = false; });
  });

  /* ---------- zapisane zestawy ---------- */
  function sets() { return jget(K_SETS, {}); }
  function fillSetList(selectKey) {
    var s = sets(), keys = Object.keys(s).sort(function (a, b) { return a.localeCompare(b, "pl"); });
    $("set-list").innerHTML = '<option value="">— wybierz zapisany zestaw —</option>' + keys.map(function (k) {
      var n = A.maskToIds(s[k].m || "").length + (s[k].x || []).length;
      return '<option value="' + esc(k) + '">' + esc(k) + " (" + n + ")</option>";
    }).join("");
    $("set-list").value = selectKey || "";
  }
  function applySet(o, key) {
    $("in-ded").value = o.d || ""; $("in-title").value = o.t || "";
    sel = new Set((o.ids || A.maskToIds(o.m || "")).filter(function (n) { return cat.byN[n]; }));
    xon = new Set();
    (o.x || []).forEach(function (a) {
      var ex = libFind(a.u);
      if (!ex) { ex = { u: a.u, t: a.t || "", c: a.c || "" }; lib.push(ex); }
      xon.add(ex.u);
    });
    applyMuz(o.muz);
    saveLib();
    loadedKey = key || "";
    renderMuz();
    repaintAll();
  }
  $("set-list").addEventListener("change", function () {
    var k = this.value; if (!k) return;
    var o = sets()[k]; if (!o) return;
    applySet(o, k);
    status("st-set", "Wczytany zestaw „" + k + "”.");
  });
  $("btn-save").addEventListener("click", function () {
    var key = ded() || ttl();
    if (!key) { $("in-ded").focus(); return status("st-set", "Wpisz najpierw, dla kogo jest zestaw (np. Dla Zosi).", true); }
    var s = sets(), c = curSet();
    if (!c.ids.length && !c.x.length && !confirm("Zestaw nie ma żadnego albumu. Zapisać pusty?")) return;
    if (s[key] && key !== loadedKey && !confirm("Zestaw „" + key + "” już jest. Zastąpić go?")) return;
    s[key] = { d: c.d, t: c.t, m: A.idsToMask(c.ids), x: c.x, muz: c.muz, saved: new Date().toISOString() };
    if (!jset(K_SETS, s)) return;
    loadedKey = key; fillSetList(key); changed();
    status("st-set", "Zapisany zestaw „" + key + "”: " + (c.ids.length + c.x.length) + " " + A.plural(c.ids.length + c.x.length, "album", "albumy", "albumów") + ".");
  });
  $("btn-new").addEventListener("click", function () {
    if (!confirm("Wyczyścić bieżącą pracę i zacząć od pełnej listy (wszystko zaznaczone)? Zapisane zestawy zostaną.")) return;
    $("in-ded").value = ""; $("in-title").value = ""; $("in-search").value = "";
    sel = new Set(cat.albums.map(function (a) { return a.n; }));
    xon = new Set(lib.map(function (a) { return a.u; }));
    muzTrack = null; muzAlbums = {}; renderMuz();
    loadedKey = ""; fillSetList(""); applySearch(); repaintAll();
    status("st-set", "Nowy zestaw: wszystkie albumy zaznaczone. Odznacz te, których ma nie być.");
  });
  $("btn-del").addEventListener("click", function () {
    var k = $("set-list").value || loadedKey;
    if (!k || !sets()[k]) return status("st-set", "Wybierz z listy „Zapisane zestawy” ten, który mam usunąć.", true);
    if (!confirm("Usunąć zapis „" + k + "” z tej przeglądarki?")) return;
    var s = sets(); delete s[k]; jset(K_SETS, s);
    if (loadedKey === k) loadedKey = "";
    fillSetList(""); changed();
    status("st-set", "Usunięty zapis „" + k + "”. Bieżąca praca została na ekranie.");
  });

  /* ---------- plik JSON ---------- */
  function slug(s) {
    return String(s || "zestaw").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "zestaw";
  }
  function todayStamp() {
    var d = new Date(), p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function packAlbums(c) {
    return c.ids.map(function (n) { var a = cat.byN[n]; return { n: a.n, rok: a.y, tytul: a.t, link: a.u, okladka: A.coverUrl(a.c, 600) }; })
      .concat(c.x.map(function (a) { return { rok: A.yearOf(a), tytul: a.t, link: a.u, okladka: A.coverUrl(a.c, 600) }; }));
  }
  function packMuzJson(muz) {
    var u = A.unpackSetMusic(muz) || muz || {};
    var o = {};
    if (u.track) o.muzyka = { k: u.track.k, id: u.track.id, t: u.track.t || "" };
    var am = u.albums || {}, keys = Object.keys(am);
    if (keys.length) {
      o.muzykaAlbumow = {};
      keys.forEach(function (n) { o.muzykaAlbumow[n] = { k: am[n].k, id: am[n].id, t: am[n].t || "" }; });
    }
    return o;
  }
  function parseAlbumsFromJson(j) {
    var albums = Array.isArray(j) ? j : (j.albumy || j.albums || (j.biezacy && (j.biezacy.albumy || j.biezacy.albums)) || []);
    var links = (j.linki || j.links || (j.biezacy && (j.biezacy.linki || j.biezacy.links)) || []).slice();
    var newSel = [], x = [], seen = {};
    albums.forEach(function (a) {
      if (typeof a === "string") { links.push(a); return; }
      var u = a.link || a.u || a.url; if (!u) return;
      seen[u] = 1;
      var hit = (a.n != null && cat.byN[a.n] && cat.byN[a.n].u === u) ? cat.byN[a.n] : A.findInCatalog(cat, u);
      if (hit) newSel.push(hit.n);
      else x.push({ u: u, t: a.tytul || a.t || "", c: A.packCover(a.okladka || a.c || "") });
    });
    var rest = links.filter(function (u) { return !seen[u]; });
    return { ids: newSel, x: x, rest: rest };
  }
  function muzFromJson(j) {
    if (!j) return null;
    if (j.muzykaAlbumow || (j.muzyka && !Array.isArray(j.muzyka))) {
      return importMuz({ track: j.muzyka, albums: j.muzykaAlbumow || j.am });
    }
    return importMuz(j.muzyka || j.muz);
  }
  function stripBom(t) { return String(t || "").replace(/^\uFEFF/, ""); }
  function parseBackup(txt) {
    txt = stripBom(txt).trim();
    if (!txt) throw new Error("empty");
    var j;
    try { j = JSON.parse(txt); } catch (e) { throw new Error("not-json"); }
    if (j == null || (typeof j !== "object" && !Array.isArray(j))) throw new Error("unknown");
    if (Array.isArray(j)) return { kind: "v1", data: { format: "albumy-zestaw", v: 1, albumy: j } };
    var fmt = j.format || "";
    if (fmt === "albumy-zestawy" || j.zestawy || j.biezacy) return { kind: "v2", data: j };
    if (fmt === "albumy-zestaw" || j.albumy || j.albums || j.linki || j.links || j.dla || j.d) return { kind: "v1", data: j };
    throw new Error("unknown");
  }
  function countMsg(nAlb, nX, muz) {
    var t = nAlb + " " + A.plural(nAlb, "album", "albumy", "albumów");
    if (nX) t += " + " + nX + " " + A.plural(nX, "dodany", "dodane", "dodanych");
    if (muz && muz.track) t += ", muzyka: " + trackLabel(muz.track);
    else t += ", bez muzyki";
    var na = muz && muz.albums ? Object.keys(muz.albums).length : 0;
    if (na) t += " (+ " + na + " " + A.plural(na, "album z własnym utworem", "albumy z własnym utworem", "albumów z własnym utworem") + ")";
    return t;
  }
  function parseSavedSets(raw) {
    if (!raw) return {};
    var out = {}, list = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) {
      var o = raw[k] || {}; if (!o.d && !o.dla && !o.t && !o.tytul) o = Object.assign({ d: k }, o);
      return o;
    });
    if (!Array.isArray(raw)) {
      Object.keys(raw).forEach(function (k) {
        var o = raw[k] || {}, c = parseAlbumsFromJson(o);
        out[k] = {
          d: o.d || o.dla || k, t: o.t || o.tytul || "",
          m: o.m || A.idsToMask(o.ids || c.ids), x: o.x || c.x,
          muz: muzFromJson(o) || (o.muz ? importMuz(o.muz) : null),
          saved: o.saved || o.zapisano || ""
        };
      });
      return out;
    }
    list.forEach(function (o) {
      var c = parseAlbumsFromJson(o);
      var key = o.d || o.dla || o.t || o.tytul || o.nazwa; if (!key) return;
      out[key] = {
        d: o.d || o.dla || "", t: o.t || o.tytul || "",
        m: o.m || A.idsToMask(o.ids || c.ids), x: o.x || c.x,
        muz: muzFromJson(o) || (o.muz ? importMuz(o.muz) : null),
        saved: o.saved || o.zapisano || ""
      };
    });
    return out;
  }

  $("btn-export").addEventListener("click", function () {
    var c = curSet(), albums = packAlbums(c), saved = sets(), savedKeys = Object.keys(saved).sort(function (a, b) { return a.localeCompare(b, "pl"); });
    var muzJ = packMuzJson(c.muz);
    var zestawy = {};
    savedKeys.forEach(function (k) {
      var o = saved[k], ids = A.maskToIds(o.m || ""), xx = o.x || [];
      var rec = { dla: o.d || "", tytul: o.t || "", zapisano: o.saved || "", m: o.m || "", x: xx,
        albumy: ids.map(function (n) { var a = cat.byN[n]; return a ? { n: a.n, rok: a.y, tytul: a.t, link: a.u, okladka: A.coverUrl(a.c, 600) } : null; }).filter(Boolean)
          .concat(xx.map(function (a) { return { rok: A.yearOf(a), tytul: a.t, link: a.u, okladka: A.coverUrl(a.c, 600) }; })),
        linki: ids.map(function (n) { return cat.byN[n] && cat.byN[n].u; }).filter(Boolean).concat(xx.map(function (a) { return a.u; }))
      };
      var mj = packMuzJson(o.muz); if (mj.muzyka) rec.muzyka = mj.muzyka; if (mj.muzykaAlbumow) rec.muzykaAlbumow = mj.muzykaAlbumow;
      zestawy[k] = rec;
    });
    var data = {
      format: "albumy-zestawy", v: 2, zapisano: new Date().toISOString(),
      dla: c.d, tytul: c.t, lacze: $("share-link").value,
      albumy: albums, linki: albums.map(function (a) { return a.link; }),
      zestawy: zestawy, dodane: lib.slice()
    };
    if (muzJ.muzyka) data.muzyka = muzJ.muzyka;
    if (muzJ.muzykaAlbumow) data.muzykaAlbumow = muzJ.muzykaAlbumow;
    var name = "albumy-" + slug(c.d || c.t || "zestawy") + "-" + todayStamp() + ".json";
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    var msg = "Zapisany plik „" + name + "”: " + countMsg(c.ids.length, c.x.length, c.muz);
    if (savedKeys.length) msg += " Oraz " + savedKeys.length + " " + A.plural(savedKeys.length, "zapisany zestaw", "zapisane zestawy", "zapisanych zestawów") + " z tej przeglądarki (" + savedKeys.join(", ") + ").";
    status("st-set", msg);
  });
  $("btn-import").addEventListener("click", function () { $("import-file").value = ""; $("import-file").click(); });
  $("import-file").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    f.text().then(function (txt) {
      var parsed;
      try { parsed = parseBackup(txt); }
      catch (e) {
        var why = e.message === "not-json" ? "to nie jest poprawny plik JSON (może zły plik albo uszkodzony zapis)."
          : e.message === "empty" ? "plik jest pusty."
          : "to nie jest plik zestawu Albumy (oczekuję formatu „albumy-zestaw” albo „albumy-zestawy”).";
        return status("st-set", "Nie wczytałem „" + f.name + "”: " + why, true);
      }
      var j = parsed.data, src = j.biezacy || j;
      var parsedCur = parseAlbumsFromJson(src);
      var muz = muzFromJson(src);
      var nAlb = parsedCur.ids.length + parsedCur.x.length;
      var savedIn = parseSavedSets(j.zestawy);
      var savedNames = Object.keys(savedIn);
      var who = (src.dla || src.d || src.tytul || src.t || "").trim();
      var lines = "Wczytam plik „" + f.name + "”:\n• bieżąca praca" + (who ? " „" + who + "”" : "") + ": " + countMsg(parsedCur.ids.length, parsedCur.x.length, muz);
      if (savedNames.length) lines += "\n• zapisane zestawy: " + savedNames.length + " (" + savedNames.join(", ") + ")\nTo zastąpi bieżącą pracę i zapisane zestawy w tej przeglądarce. Kontynuować?";
      else lines += "\nTo zastąpi bieżącą pracę. Zapisane zestawy w przeglądarce zostaną. Kontynuować?";
      if (!confirm(lines)) return status("st-set", "Anulowane – nic nie zmieniłem.");
      if (j.dodane && j.dodane.length) {
        (j.dodane || []).forEach(function (a) {
          if (!a || !a.u || libFind(a.u)) return;
          lib.push({ u: a.u, t: a.t || "", c: a.c || "" });
        });
        saveLib();
      }
      applySet({ d: src.dla || src.d || "", t: src.tytul || src.t || "", ids: parsedCur.ids, x: parsedCur.x, muz: muz }, "");
      if (savedNames.length) {
        if (!jset(K_SETS, savedIn)) return;
        fillSetList("");
      } else fillSetList("");
      var msg = "Wczytany plik „" + f.name + "”: " + countMsg(parsedCur.ids.length, parsedCur.x.length, muz) + ".";
      if (savedNames.length) msg += " Przywróciłem też " + savedNames.length + " " + A.plural(savedNames.length, "zapisany zestaw", "zapisane zestawy", "zapisanych zestawów") + ".";
      else msg += " Zapisane zestawy w przeglądarce zostawiłem bez zmian.";
      status("st-set", msg);
      if (parsedCur.rest.length) return addLinks(parsedCur.rest);
    }).catch(function (e) { status("st-set", "Nie umiem odczytać tego pliku: " + e.message, true); });
  });

  /* ---------- muzyka ---------- */
  function applyMuz(muz) {
    var u = A.unpackSetMusic(muz) || { track: null, albums: {} };
    muzTrack = u.track || null;
    muzAlbums = u.albums || {};
  }
  function importMuz(raw) {
    if (raw == null) return null;
    if (Array.isArray(raw) && A.looksLikeFullCatalog(raw)) return null;
    return A.unpackSetMusic(raw);
  }
  function trackLabel(t) {
    if (!t) return "";
    var src = t.k === "d" ? "Dysk Google" : "YouTube";
    return (t.t || (t.k === "d" ? "Plik z Dysku" : "Film z YouTube")) + " (" + src + ")";
  }
  function muzQuery() { return $("in-muz-search").value.trim().toLowerCase(); }
  function muzMatch(t, q) {
    if (!q) return true;
    return (t.t + " " + (t.w || "") + " " + t.id).toLowerCase().indexOf(q) !== -1;
  }
  function renderMuz() {
    if (!muzCat) { $("muz-cat").innerHTML = ""; return; }
    var ch = $("muz-chosen"), clr = $("btn-muz-clear");
    if (muzTrack) {
      ch.innerHTML = "Muzyka tego zestawu: <b>" + A.esc(trackLabel(muzTrack)) + "</b>. Gość usłyszy ten utwór w pętli i może go tylko włączyć albo wyłączyć.";
      ch.classList.add("on");
      if (clr) clr.hidden = false;
    } else {
      ch.textContent = "Nie wybrano jeszcze utworu dla tego zestawu – gość nie zobaczy przycisku muzyki.";
      ch.classList.remove("on");
      if (clr) clr.hidden = true;
    }
    var q = muzQuery(), years = {}, order = [];
    muzCat.tracks.forEach(function (t) {
      var y = (t.w || "").slice(0, 4) || "Inne";
      if (!years[y]) { years[y] = []; order.push(y); }
      years[y].push(t);
    });
    var html = "", shown = 0;
    order.forEach(function (y) {
      var vis = years[y].filter(function (t) { return muzMatch(t, q); });
      if (!vis.length) return;
      html += '<details class="mz-year" open data-y="' + A.esc(y) + '"><summary><span>' + A.esc(y) + "</span><span class=\"yc\">" + vis.length + "</span></summary>";
      vis.forEach(function (t) {
        var dis = t.embed === 0, on = !dis && muzTrack && A.musicKey(t) === A.musicKey(muzTrack);
        var meta = [];
        if (t.s) meta.push(A.fmtDur(t.s));
        if (t.short) meta.push("short");
        if (dis) meta.push("YouTube nie pozwala osadzić tego filmu na innej stronie");
        html += '<button type="button" class="mzrow' + (on ? " pick" : "") + (dis ? " noembed" : "") + '" data-id="' + A.esc(t.id) + '"' + (dis ? " disabled" : "") + ">" +
          '<span class="mt">' + A.esc(t.t) + (meta.length ? '<span class="md">' + A.esc(meta.join(" · ")) + "</span>" : "") + "</span></button>";
        shown++;
      });
      html += "</details>";
    });
    $("muz-cat").innerHTML = html || '<p class="note">Brak utworów pasujących do wyszukiwania.</p>';
    $("muz-sum").textContent = muzCat.tracks.length + " " + A.plural(muzCat.tracks.length, "utwór", "utwory", "utworów") + " z kanału @niepale" + (q ? " · pokazuję " + shown : "");
    renderMuzAlbums();
  }
  function albumOptions() {
    var ids = Array.from(sel).sort(function (a, b) { return a - b; });
    return ids.map(function (n) { return cat.byN[n]; }).filter(Boolean);
  }
  function renderMuzAlbums() {
    var selEl = $("muz-alb-n");
    if (!selEl) return;
    var cur = selEl.value;
    selEl.innerHTML = '<option value="">— wybierz album —</option>' + albumOptions().map(function (a) {
      return '<option value="' + a.n + '">' + A.esc(a.t) + " (nr " + a.n + ")</option>";
    }).join("");
    if (cur && selEl.querySelector('option[value="' + cur + '"]')) selEl.value = cur;
    var keys = Object.keys(muzAlbums).sort(function (a, b) { return a - b; });
    $("muz-alb-list").innerHTML = keys.map(function (n) {
      var a = cat.byN[+n], t = muzAlbums[n];
      return '<div class="mz-alb-row" data-n="' + A.esc(n) + '"><span>' + A.esc(a ? a.t : ("Album nr " + n)) + " — " + A.esc(trackLabel(t)) +
        '</span><button type="button" class="btn warn mz-alb-del">Usuń</button></div>';
    }).join("");
  }
  function chooseTrack(tr, msg) {
    muzTrack = A.normTrack(tr);
    renderMuz(); changed();
    if (msg) status("st-muz", msg);
  }
  $("muz-cat").addEventListener("click", function (e) {
    var row = e.target.closest(".mzrow"); if (!row || row.disabled || row.classList.contains("noembed")) return;
    var t = muzCat.tracks.filter(function (x) { return x.id === row.dataset.id; })[0];
    if (!t || t.embed === 0) return;
    chooseTrack(t, "Wybrany utwór zestawu: " + trackLabel(t) + ".");
  });
  var mzQ = null;
  $("in-muz-search").addEventListener("input", function () { clearTimeout(mzQ); mzQ = setTimeout(function () { renderMuz(); }, 150); });
  $("btn-muz-clear").addEventListener("click", function () {
    muzTrack = null; renderMuz(); changed();
    status("st-muz", "Usunąłem muzykę zestawu. Gość nie zobaczy przycisku muzyki, chyba że album ma swój utwór albo jest utwór domyślny na stronie.");
  });
  $("btn-muz-add").addEventListener("click", function () {
    var links = A.extractLinks($("in-muz").value);
    if (!links.length) return status("st-muz", "Nie znalazłem żadnego linku (adres musi zaczynać się od https://).", true);
    var u = links[0], p = A.parseMusicLink(u);
    if (!p) return status("st-muz", "Nie rozpoznaję tego linku (potrzebny YouTube albo plik z Dysku Google).", true);
    var hit = muzCat && muzCat.byKey[A.musicKey(p)];
    if (hit && hit.embed === 0) return status("st-muz", "Ten film jest w katalogu, ale YouTube nie pozwala go osadzić: " + hit.t, true);
    $("btn-muz-add").disabled = true;
    var base = hit || { k: p.k, id: p.id, t: "" };
    (hit ? Promise.resolve(hit.t) : A.fetchMusicTitle(base)).then(function (t) {
      if (t) base.t = t;
      $("in-muz").value = ""; $("btn-muz-add").disabled = false;
      chooseTrack(base, "Wybrany utwór zestawu: " + trackLabel(base) + (t ? "." : " (wpisz albo popraw tytuł, jeśli trzeba)."));
    });
  });
  $("btn-muz-alb").addEventListener("click", function () {
    var n = $("muz-alb-n").value;
    if (!n) return status("st-muz", "Najpierw wybierz album z listy.", true);
    if (!muzTrack) return status("st-muz", "Najpierw wybierz utwór (kliknij w katalogu albo wklej link).", true);
    muzAlbums[n] = { k: muzTrack.k, id: muzTrack.id, t: muzTrack.t || "" };
    renderMuz(); changed();
    var a = cat.byN[+n];
    status("st-muz", "Album „" + (a ? a.t : n) + "” będzie miał utwór: " + trackLabel(muzTrack) + ".");
  });
  $("muz-alb-list").addEventListener("click", function (e) {
    if (!e.target.classList.contains("mz-alb-del")) return;
    var row = e.target.closest(".mz-alb-row"); if (!row) return;
    delete muzAlbums[row.dataset.n];
    renderMuz(); changed();
  });
  $("btn-muz-default").addEventListener("click", function () {
    if (!muzTrack) return status("st-muz", "Najpierw wybierz utwór, który ma być domyślny na stronie.", true);
    var tracks = (muzCat ? muzCat.tracks : []).map(function (t) {
      var o = { k: t.k, id: t.id, t: t.t }; if (t.s) o.s = t.s; if (t.w) o.w = t.w; if (t.short) o.short = 1; if (t.embed === 0) o.embed = 0; return o;
    });
    var data = { v: 1, zrodlo: (muzCat && muzCat.zrodlo) || "https://www.youtube.com/@niepale",
      domyslny: { k: muzTrack.k, id: muzTrack.id, t: muzTrack.t || "" }, tracks: tracks };
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "muzyka.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    status("st-muz", "Zapisałem plik muzyka.json z domyślnym utworem „" + (muzTrack.t || muzTrack.id) + "”. Żeby zaczął obowiązywać na stronie, wgraj go do folderu data/ w repozytorium (zastępując dotychczasowy plik) albo wyślij mi ten plik, a ja go wgram i opublikuję.");
  });

  /* ---------- udostępnianie ---------- */
  function previewUrl() { return location.href.replace(/[?#].*$/, "").replace(/[^\/]*$/, "") + "?z=" + payload; }
  $("btn-preview").addEventListener("click", function () { window.open(previewUrl(), "_blank", "noopener"); });
  $("btn-copy").addEventListener("click", function () {
    var t = $("share-link").value;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
      status("st-share", "Łącze skopiowane – wklej je w wiadomości (Ctrl+V).");
    }, function () { $("share-link").select(); document.execCommand("copy"); status("st-share", "Łącze zaznaczone i skopiowane."); });
  });
  $("btn-fb").addEventListener("click", function () { A.openFacebook(payload); });
  $("in-ded").addEventListener("input", changed);
  $("in-title").addEventListener("input", changed);

  window.__albumyTest = { fetchMeta: fetchMeta, fetchMusicTitle: A.fetchMusicTitle, parseMusicLink: A.parseMusicLink, parseBackup: parseBackup, probeStore: probeStore };

  /* ---------- start ---------- */
  Promise.all([A.loadCatalog(), A.loadMusicCatalog()]).then(function (r) {
    cat = r[0];
    muzCat = r[1];
    probeStore();
    lib = jget(K_LIB, []);
    buildYears();
    var w = jget(K_WORK, null);
    if (w && w.m != null) {
      $("in-ded").value = w.d || ""; $("in-title").value = w.t || "";
      sel = new Set(A.maskToIds(w.m || "").filter(function (n) { return cat.byN[n]; }));
      xon = new Set((w.xon || []).filter(function (u) { return libFind(u); }));
      loadedKey = w.key || "";
      applyMuz(w.muz);
    } else {
      sel = new Set(cat.albums.map(function (a) { return a.n; }));
      xon = new Set(lib.map(function (a) { return a.u; }));
      muzTrack = null; muzAlbums = {};
    }
    renderMuz();
    fillSetList(loadedKey && sets()[loadedKey] ? loadedKey : "");
    repaintAll();
  }).catch(function (e) { status("st-set", "Nie udało się wczytać katalogu albumów: " + e.message, true); });
})();
