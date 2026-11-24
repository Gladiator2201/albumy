/* Albumy – edytor zestawów (tylko dla Stacha, adres ukryty) */
(function () {
  "use strict";
  var A = window.Albumy, esc = A.esc;
  var $ = function (id) { return document.getElementById(id); };
  var K_SETS = "albumy.zestawy.v1", K_WORK = "albumy.robocze.v1", K_LIB = "albumy.dodane.v1";
  var cat = null, sel = new Set(), lib = [], xon = new Set(), payload = "", loadedKey = "";
  var muzCat = null, muzOff = new Set(), muzExtra = [];
  var lower = {}, rendered = {};

  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { status("st-set", "Nie mogę zapisać w przeglądarce: " + e.message, true); return false; } }
  function status(id, msg, err) { var el = $(id); el.textContent = msg || ""; el.classList.toggle("err", !!err); }
  function ded() { return $("in-ded").value.trim(); }
  function ttl() { return $("in-title").value.trim(); }
  function xList() { return lib.filter(function (a) { return xon.has(a.u); }).map(function (a) { return { u: a.u, t: a.t, c: a.c }; }); }
  function curSet() { return { d: ded(), t: ttl(), ids: Array.from(sel).sort(function (a, b) { return a - b; }), x: xList(), muz: { off: Array.from(muzOff), x: muzExtra.slice() } }; }

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
    muzOff = new Set(); muzExtra = []; renderMuz();
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
  $("btn-export").addEventListener("click", function () {
    var c = curSet();
    var albums = c.ids.map(function (n) { var a = cat.byN[n]; return { n: a.n, rok: a.y, tytul: a.t, link: a.u, okladka: A.coverUrl(a.c, 600) }; })
      .concat(c.x.map(function (a) { return { rok: A.yearOf(a), tytul: a.t, link: a.u, okladka: A.coverUrl(a.c, 600) }; }));
    var data = { format: "albumy-zestaw", v: 1, dla: c.d, tytul: c.t, zapisano: new Date().toISOString(), lacze: $("share-link").value,
      albumy: albums, linki: albums.map(function (a) { return a.link; }),
      muzyka: exportMuzList(c.muz) };
    var name = "albumy-" + slug(c.d || c.t) + ".json";
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    status("st-set", "Zapisany plik „" + name + "” (" + albums.length + " " + A.plural(albums.length, "album", "albumy", "albumów") + ", z linkami i okładkami).");
  });
  $("btn-import").addEventListener("click", function () { $("import-file").value = ""; $("import-file").click(); });
  $("import-file").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    f.text().then(function (txt) {
      var j = JSON.parse(txt);
      var albums = Array.isArray(j) ? j : (j.albumy || j.albums || []);
      var links = (j.linki || j.links || []).slice();
      var newSel = new Set(), x = [], seen = {};
      albums.forEach(function (a) {
        if (typeof a === "string") { links.push(a); return; }
        var u = a.link || a.u || a.url; if (!u) return;
        seen[u] = 1;
        var hit = (a.n != null && cat.byN[a.n] && cat.byN[a.n].u === u) ? cat.byN[a.n] : A.findInCatalog(cat, u);
        if (hit) newSel.add(hit.n);
        else x.push({ u: u, t: a.tytul || a.t || "", c: A.packCover(a.okladka || a.c || "") });
      });
      var rest = links.filter(function (u) { return !seen[u]; });
      applySet({ d: j.dla || j.d || "", t: j.tytul || j.t || "", ids: Array.from(newSel), x: x, muz: importMuz(j.muzyka || j.muz) }, "");
      fillSetList("");
      var msg = "Wczytany plik „" + f.name + "”: " + (newSel.size + x.length) + " " + A.plural(newSel.size + x.length, "album", "albumy", "albumów") + ". Popraw zaznaczenia i kliknij „Zapisz zestaw”.";
      status("st-set", msg);
      if (rest.length) return addLinks(rest);
    }).catch(function (e) { status("st-set", "Nie umiem odczytać tego pliku: " + e.message, true); });
  });


  /* ---------- muzyka ---------- */
  function playableMuz() { return muzCat ? muzCat.tracks.filter(function (t) { return t.embed !== 0; }) : []; }
  function applyMuz(muz) {
    muzOff = new Set(); muzExtra = [];
    if (!muz) return;
    if (muz.explicit && muz.x) {
      var want = {};
      muz.x.forEach(function (t) { want[A.musicKey(t)] = t; });
      playableMuz().forEach(function (t) { if (!want[A.musicKey(t)]) muzOff.add(t.id); });
      var inCat = {};
      (muzCat ? muzCat.tracks : []).forEach(function (t) { inCat[A.musicKey(t)] = 1; });
      muzExtra = muz.x.filter(function (t) { return !inCat[A.musicKey(t)]; }).map(function (t) { return A.normTrack(t); });
      return;
    }
    (muz.off || []).forEach(function (id) { if (id !== "*") muzOff.add(id); });
    if ((muz.off || []).indexOf("*") >= 0) playableMuz().forEach(function (t) { muzOff.add(t.id); });
    muzExtra = (muz.x || []).map(function (t) { return A.normTrack(t); }).filter(Boolean);
  }
  function importMuz(raw) {
    if (raw == null) return null;
    if (Array.isArray(raw)) return A.unpackSetMusic(raw);
    if (raw.off || raw.x) return { off: raw.off || [], x: A.unpackMusicList(raw.x) };
    if (raw.utwory || raw.tracks) return A.unpackSetMusic(raw.utwory || raw.tracks);
    return null;
  }
  function exportMuzList(muz) {
    var r = A.resolveMusic(muz, null, null);
    return r.tracks.map(function (t) {
      var o = { k: t.k, id: t.id, t: t.t || "" };
      if (t.n) o.album = t.n;
      return o;
    });
  }
  function muzQuery() { return $("in-muz-search").value.trim().toLowerCase(); }
  function muzMatch(t, q) {
    if (!q) return true;
    return (t.t + " " + (t.w || "") + " " + t.id).toLowerCase().indexOf(q) !== -1;
  }
  function renderMuz() {
    if (!muzCat) { $("muz-cat").innerHTML = ""; $("muz-sum").textContent = ""; return; }
    var q = muzQuery(), years = {}, order = [];
    muzCat.tracks.forEach(function (t) {
      var y = (t.w || "").slice(0, 4) || "Inne";
      if (!years[y]) { years[y] = []; order.push(y); }
      years[y].push(t);
    });
    var html = "";
    order.forEach(function (y) {
      var vis = years[y].filter(function (t) { return muzMatch(t, q); });
      if (q && !vis.length) return;
      var on = years[y].filter(function (t) { return t.embed !== 0 && !muzOff.has(t.id); }).length;
      var allp = years[y].filter(function (t) { return t.embed !== 0; }).length;
      html += '<details class="mz-year" open data-y="' + A.esc(y) + '"><summary><input type="checkbox" class="mz-ych"' +
        (allp && on === allp ? " checked" : "") + (on && on < allp ? " data-ind=1" : "") +
        ' aria-label="Cały rok ' + A.esc(y) + '"><span>' + A.esc(y) + '</span><span class="yc">' + on + " z " + allp +
        "</span></summary>";
      (q ? vis : years[y]).forEach(function (t) {
        var dis = t.embed === 0, checked = !dis && !muzOff.has(t.id);
        var meta = [];
        if (t.s) meta.push(A.fmtDur(t.s));
        if (t.short) meta.push("short");
        if (dis) meta.push("YouTube nie pozwala osadzić tego filmu na innej stronie");
        html += '<label class="mzrow' + (checked ? "" : " off") + (dis ? " noembed" : "") + '">' +
          '<input type="checkbox" class="mz-on" data-id="' + A.esc(t.id) + '"' + (checked ? " checked" : "") + (dis ? " disabled" : "") + ">" +
          '<span class="mt">' + A.esc(t.t) + (meta.length ? '<span class="md">' + A.esc(meta.join(" · ")) + "</span>" : "") + "</span></label>";
      });
      html += "</details>";
    });
    $("muz-cat").innerHTML = html;
    $("muz-cat").querySelectorAll(".mz-ych[data-ind]").forEach(function (ch) { ch.indeterminate = true; });
    var p = playableMuz(), n = p.filter(function (t) { return !muzOff.has(t.id); }).length;
    $("muz-sum").textContent = "Zaznaczone: " + n + " z " + p.length + (muzExtra.length ? " · dodane: " + muzExtra.length : "");
    renderMuzExtra();
  }
  function renderMuzExtra() {
    if (!muzExtra.length) { $("muz-extra").innerHTML = ""; return; }
    $("muz-extra").innerHTML = '<p class="note">Dodane spoza katalogu (tytuł można poprawić; pole „nr albumu” zostaw puste, jeśli utwór ma grać w całym zestawie):</p>' +
      muzExtra.map(function (t, i) {
        var src = t.k === "d" ? "Dysk Google" : "YouTube";
        return '<div class="xrow" data-i="' + i + '"><span class="xsrc">' + src + "</span>" +
          '<div class="xf"><input class="inp mz-t" value="' + A.esc(t.t) + '" placeholder="Tytuł utworu">' +
          '<input class="inp mz-alb" value="' + (t.n || "") + '" placeholder="nr albumu (puste = cały zestaw)" inputmode="numeric" style="max-width:14em">' +
          '<span class="xurl">' + A.esc(t.k === "d" ? ("https://drive.google.com/file/d/" + t.id + "/view") : ("https://www.youtube.com/watch?v=" + t.id)) + "</span>" +
          '<span class="xb"><button type="button" class="btn warn mz-del">Usuń</button></span></div></div>';
      }).join("");
  }
  $("muz-cat").addEventListener("change", function (e) {
    var ych = e.target.closest(".mz-ych");
    if (ych) {
      var y = ych.closest("details").dataset.y, on = ych.checked;
      muzCat.tracks.forEach(function (t) {
        if (t.embed === 0) return;
        if (((t.w || "").slice(0, 4) || "Inne") === y) { on ? muzOff.delete(t.id) : muzOff.add(t.id); }
      });
      renderMuz(); changed();
      return;
    }
    var box = e.target.closest(".mz-on");
    if (!box || box.disabled) return;
    if (box.checked) muzOff.delete(box.dataset.id); else muzOff.add(box.dataset.id);
    renderMuz(); changed();
  });
  $("muz-cat").addEventListener("click", function (e) {
    if (e.target.closest(".mz-ych")) e.stopPropagation();
  }, true);
  var mzQ = null;
  $("in-muz-search").addEventListener("input", function () { clearTimeout(mzQ); mzQ = setTimeout(function () { renderMuz(); }, 150); });
  $("btn-muz-all").addEventListener("click", function () { muzOff = new Set(); renderMuz(); changed(); });
  $("btn-muz-none").addEventListener("click", function () { playableMuz().forEach(function (t) { muzOff.add(t.id); }); renderMuz(); changed(); });
  $("btn-muz-add").addEventListener("click", function () {
    var links = A.extractLinks($("in-muz").value);
    if (!links.length) return status("st-muz", "Nie znalazłem żadnego linku (adres musi zaczynać się od https://).", true);
    var msgs = [], chain = Promise.resolve();
    $("btn-muz-add").disabled = true;
    links.forEach(function (u) {
      chain = chain.then(function () {
        var p = A.parseMusicLink(u);
        if (!p) { msgs.push("! nie rozpoznaję linku: " + u); return; }
        var hit = muzCat && muzCat.byKey[A.musicKey(p)];
        if (hit) {
          if (hit.embed === 0) { msgs.push("! ten film jest w katalogu, ale YouTube nie pozwala go osadzić: " + hit.t); return; }
          muzOff.delete(hit.id);
          msgs.push("✓ jest w katalogu @niepale: " + hit.t + " – zaznaczony");
          return;
        }
        var ex = muzExtra.filter(function (t) { return t.k === p.k && t.id === p.id; })[0];
        if (ex) { msgs.push("✓ już dodany: " + (ex.t || u)); return; }
        var tr = { k: p.k, id: p.id, t: "" };
        return A.fetchMusicTitle(tr).then(function (t) {
          tr.t = t || (p.k === "d" ? "Plik z Dysku" : "");
          muzExtra.push(tr);
          msgs.push((t ? "✓ dodany: " : "! dodany bez tytułu (wpisz go niżej): ") + (tr.t || u));
        });
      });
    });
    chain.then(function () {
      $("in-muz").value = ""; $("btn-muz-add").disabled = false;
      renderMuz(); changed();
      status("st-muz", msgs.join("\n") || "Nie znalazłem żadnego linku.", !msgs.length);
    });
  });
  $("muz-extra").addEventListener("change", function (e) {
    var row = e.target.closest(".xrow"); if (!row) return;
    var t = muzExtra[+row.dataset.i]; if (!t) return;
    if (e.target.classList.contains("mz-t")) t.t = e.target.value.trim();
    if (e.target.classList.contains("mz-alb")) {
      var n = parseInt(e.target.value, 10);
      if (n) t.n = n; else delete t.n;
    }
    changed();
  });
  $("muz-extra").addEventListener("click", function (e) {
    if (!e.target.classList.contains("mz-del")) return;
    var row = e.target.closest(".xrow"); if (!row) return;
    muzExtra.splice(+row.dataset.i, 1);
    renderMuz(); changed();
  });
  $("btn-muz-default").addEventListener("click", function () {
    var tracks = [];
    playableMuz().forEach(function (t) {
      var o = { k: t.k, id: t.id, t: t.t }; if (t.s) o.s = t.s; if (t.w) o.w = t.w; if (t.short) o.short = 1;
      tracks.push(o);
    });
    muzExtra.forEach(function (t) {
      var o = { k: t.k, id: t.id, t: t.t || "" }; if (t.s) o.s = t.s; tracks.push(o);
    });
    (muzCat ? muzCat.tracks : []).forEach(function (t) {
      if (t.embed !== 0) return;
      tracks.push({ k: t.k, id: t.id, t: t.t, s: t.s, w: t.w, embed: 0 });
    });
    var data = { v: 1, zrodlo: (muzCat && muzCat.zrodlo) || "https://www.youtube.com/@niepale", tracks: tracks };
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "muzyka.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    status("st-muz", "Zapisałem plik muzyka.json (" + tracks.length + " " + A.plural(tracks.length, "utwór", "utwory", "utworów") + "). Żeby stał się domyślną listą na stronie, wgraj go do folderu data/ w repozytorium (zastępując dotychczasowy plik) albo wyślij mi ten plik, a ja go wgram i opublikuję.");
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

  window.__albumyTest = { fetchMeta: fetchMeta, fetchMusicTitle: A.fetchMusicTitle, parseMusicLink: A.parseMusicLink };

  /* ---------- start ---------- */
  Promise.all([A.loadCatalog(), A.loadMusicCatalog()]).then(function (r) {
    cat = r[0];
    muzCat = r[1];
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
      muzOff = new Set(); muzExtra = [];
    }
    renderMuz();
    fillSetList(loadedKey && sets()[loadedKey] ? loadedKey : "");
    repaintAll();
  }).catch(function (e) { status("st-set", "Nie udało się wczytać katalogu albumów: " + e.message, true); });
})();
