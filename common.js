/* Albumy – wspólne funkcje (katalog, okładki, łącza do udostępniania) */
(function (global) {
  "use strict";
  var VER = "20261124g";
  var CANONICAL = "https://gladiator2201.github.io/albumy/";
  var LH3 = "https://lh3.googleusercontent.com/pw/";
  var catalog = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Okładka w wymuszonym kwadratowym rozmiarze (miniatura). */
  function coverUrl(c, size) {
    c = String(c || "");
    if (!c) return "";
    size = size || 400;
    if (c.charAt(0) === "~") c = LH3 + c.slice(1);
    if (/^https:\/\/lh\d\.googleusercontent\.com\//.test(c)) {
      return c.replace(/=[^\/]*$/, "") + "=w" + size + "-h" + size + "-c";
    }
    return c;
  }
  function packCover(c) {
    c = String(c || "").trim();
    if (c.indexOf(LH3) === 0) return "~" + c.slice(LH3.length).replace(/=[^\/]*$/, "");
    return c;
  }

  function afId(u) {
    var m = String(u || "").match(/photos\.google\.com\/(?:u\/\d+\/)?share\/(AF1Qip[A-Za-z0-9_-]+)/);
    return m ? m[1] : "";
  }
  function shortCode(u) {
    var m = String(u || "").match(/goo\.gl\/(?:photos\/)?([A-Za-z0-9]+)\/?(?:[?#].*)?$/);
    return m ? m[1] : "";
  }
  function normUrl(u) {
    return String(u || "").trim().replace(/[.,;:!?)\]]+$/, "");
  }
  function linkKind(u) {
    u = normUrl(u);
    if (/photos\.app\.goo\.gl\/|goo\.gl\/photos\/|photos\.google\.com\//.test(u)) return "gphotos";
    if (/^https?:\/\/gladiator2201\.github\.io\//i.test(u)) return "gh";
    if (/^https?:\/\//i.test(u)) return "www";
    return "";
  }
  function extractLinks(text) {
    var out = [], seen = {}, m, re = /https?:\/\/[^\s<>"']+/gi;
    while ((m = re.exec(String(text || "")))) {
      var u = normUrl(m[0]);
      if (!seen[u]) { seen[u] = 1; out.push(u); }
    }
    return out;
  }

  function loadCatalog() {
    if (catalog) return Promise.resolve(catalog);
    return fetch((global.ALBUMY_BASE || "") + "catalog.json?v=" + VER).then(function (r) {
      if (!r.ok) throw new Error("katalog " + r.status);
      return r.json();
    }).then(function (j) {
      var c = { albums: j.albums, byN: {}, byShort: {}, byAf: {}, byUrl: {}, maxN: 0, years: [] };
      var yrs = {};
      j.albums.forEach(function (a) {
        c.byN[a.n] = a;
        c.byUrl[a.u] = a;
        if (a.s) c.byShort[a.s] = a;
        var f = afId(a.u); if (f) c.byAf[f] = a;
        if (a.n > c.maxN) c.maxN = a.n;
        if (!yrs[a.y]) { yrs[a.y] = 1; c.years.push(a.y); }
      });
      catalog = c;
      return c;
    });
  }
  function findInCatalog(c, u) {
    u = normUrl(u);
    if (c.byUrl[u]) return c.byUrl[u];
    var s = shortCode(u); if (s && c.byShort[s]) return c.byShort[s];
    var f = afId(u); if (f && c.byAf[f]) return c.byAf[f];
    var g = u.replace(/index\.html$/, "").replace(/\/?$/, "/");
    if (c.byUrl[g]) return c.byUrl[g];
    return null;
  }

  /* base64url */
  function b64e(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64d(str) {
    str = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    var s = atob(str), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  function idsToMask(ids) {
    var max = -1; ids.forEach(function (n) { if (n > max) max = n; });
    var b = new Uint8Array(Math.floor(max / 8) + 1);
    ids.forEach(function (n) { b[n >> 3] |= 1 << (n & 7); });
    return b64e(b);
  }
  function maskToIds(m) {
    var b = b64d(m), out = [];
    for (var i = 0; i < b.length; i++) for (var k = 0; k < 8; k++) if (b[i] & (1 << k)) out.push(i * 8 + k);
    return out;
  }
  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (a) { return new Uint8Array(a); });
  }


  /* ---- muzyka (YouTube / Dysk Google) ---- */
  function parseYtId(s) {
    s = String(s || "").trim();
    var m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    return "";
  }
  function parseDriveId(s) {
    s = String(s || "").trim();
    if (/^d:/.test(s)) s = s.slice(2);
    var m = s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&#]id=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{16,}$/.test(s) && !/^https?:/i.test(s)) return s;
    return "";
  }
  function parseMusicLink(u) {
    u = normUrl(u);
    if (!u) return null;
    if (/youtu(\.be|be\.com|be-nocookie\.com)/i.test(u) || /^[A-Za-z0-9_-]{11}$/.test(u)) {
      var y = parseYtId(u); return y ? { k: "yt", id: y } : null;
    }
    if (/drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com|^d:/.test(u) || /^[A-Za-z0-9_-]{16,}$/.test(u)) {
      var d = parseDriveId(u); return d ? { k: "d", id: d } : null;
    }
    return null;
  }
  function musicParam(tr) { return tr.k === "d" ? "d:" + tr.id : tr.id; }
  function parseMusicParam(m) {
    m = String(m || "").trim();
    if (!m) return null;
    if (/^d:/.test(m)) return { k: "d", id: m.slice(2) };
    if (/^yt:/.test(m)) return { k: "yt", id: m.slice(3) };
    return parseMusicLink(m);
  }
  function musicKey(tr) { return (tr.k || "yt") + ":" + tr.id; }
  function driveStreamUrls(id) {
    id = encodeURIComponent(id);
    return [
      "https://drive.usercontent.google.com/download?id=" + id + "&export=download",
      "https://drive.google.com/uc?export=download&id=" + id,
      "https://docs.google.com/uc?export=download&id=" + id
    ];
  }
  function drivePreviewUrl(id) { return "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/preview"; }
  function fmtDur(s) {
    s = Math.round(+s || 0); if (!s) return "";
    var m = Math.floor(s / 60), sec = s % 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }
  function fetchMusicTitle(tr) {
    if (tr.k === "yt") {
      var url = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + tr.id);
      return fetch(url).then(function (r) { if (!r.ok) throw new Error("oembed " + r.status); return r.json(); })
        .then(function (j) { return (j && j.title) || ""; })
        .catch(function () { return ""; });
    }
    if (tr.k === "d") {
      function cleanName(name) {
        name = String(name || "").trim();
        name = name.replace(/\s*[-–—]\s*Google Drive\s*$/i, "");
        return name.replace(/\.(mp3|m4a|wav|ogg|aac|flac)$/i, "").trim();
      }
      return fetch("https://api.microlink.io/?url=" + encodeURIComponent("https://drive.google.com/file/d/" + tr.id + "/view")).then(function (r) { return r.json(); }).then(function (j) {
        return cleanName((j && j.data && j.data.title) || "");
      }).catch(function () { return ""; });
    }
    return Promise.resolve("");
  }

  var musicCat = null;
  function normTrack(t) {
    if (!t) return null;
    if (Array.isArray(t)) t = { k: t[0], id: t[1], t: t[2], n: t[3] };
    if (!t.k || !t.id) {
      var p = parseMusicLink(t.u || t.url || t.id); if (!p) return null;
      t = { k: p.k, id: p.id, t: t.t || t.tytul || "", n: t.n || t.album };
    }
    var out = { k: t.k, id: String(t.id), t: t.t || "" };
    if (t.s) out.s = +t.s;
    if (t.w) out.w = t.w;
    if (t.embed === 0 || t.embed === false) out.embed = 0;
    if (t.short) out.short = 1;
    if (t.n) out.n = +t.n;
    return out;
  }
  function loadMusicCatalog() {
    if (musicCat) return Promise.resolve(musicCat);
    return fetch((global.ALBUMY_BASE || "") + "data/muzyka.json?v=" + VER).then(function (r) {
      if (!r.ok) throw new Error("muzyka " + r.status);
      return r.json();
    }).then(function (j) {
      var tracks = (j.tracks || []).map(normTrack).filter(Boolean);
      musicCat = { zrodlo: j.zrodlo || j.channel || "", tracks: tracks, byKey: {} };
      tracks.forEach(function (t) { musicCat.byKey[musicKey(t)] = t; });
      return musicCat;
    }).catch(function () {
      musicCat = { zrodlo: "", tracks: [], byKey: {} };
      return musicCat;
    });
  }
  function catalogPlayable() {
    return ((musicCat && musicCat.tracks) || []).filter(function (t) { return t.embed !== 0; });
  }
  function packMusicList(list) {
    return unpackMusicList(list).map(function (t) {
      var a = [t.k, t.id, t.t || ""];
      if (t.n) a.push(+t.n);
      return a;
    });
  }
  function unpackMusicList(x) { return (x || []).map(normTrack).filter(Boolean); }
  /* brak pola muz = cała lista z katalogu; {off,x} = odznaczone z katalogu + dopisane; tablica = lista jawna */
  function packSetMusic(muz) {
    if (!muz) return undefined;
    if (Array.isArray(muz)) return muz.length ? packMusicList(muz) : { off: ["*"] };
    var o = {};
    if (muz.explicit) return (muz.x && muz.x.length) ? packMusicList(muz.x) : { off: ["*"] };
    if (muz.off && muz.off.length) o.off = muz.off.slice();
    if (muz.x && muz.x.length) o.x = packMusicList(muz.x);
    if (!o.off && !o.x) return undefined;
    return o;
  }
  function unpackSetMusic(p) {
    if (p == null) return null;
    if (Array.isArray(p)) return { off: [], x: unpackMusicList(p), explicit: true };
    return { off: p.off || [], x: unpackMusicList(p.x) };
  }
  function resolveMusic(setMuz, albumN, mParam) {
    var cat = catalogPlayable(), off = {}, extras = [], explicit = false;
    if (setMuz && setMuz.explicit) { explicit = true; extras = (setMuz.x || []).slice(); }
    else if (setMuz) {
      (setMuz.off || []).forEach(function (id) { off[id] = 1; });
      extras = (setMuz.x || []).slice();
    }
    var list = [], seen = {};
    function add(t) {
      if (!t || t.embed === 0) return;
      var k = musicKey(t);
      if (seen[k]) return;
      seen[k] = 1;
      list.push(t);
    }
    if (explicit) extras.forEach(add);
    else {
      if (!off["*"]) cat.forEach(function (t) { if (!off[t.id] && !off[musicKey(t)]) add(t); });
      extras.forEach(function (t) {
        if (t.n && albumN != null && +t.n !== +albumN) return;
        add(t);
      });
    }
    var sel = 0;
    if (mParam && mParam.id) {
      var already = -1, i;
      for (i = 0; i < list.length; i++) if (list[i].k === mParam.k && list[i].id === mParam.id) { already = i; break; }
      if (already >= 0) sel = already;
      else { list.unshift({ k: mParam.k, id: mParam.id, t: mParam.t || "" }); sel = 0; }
    }
    return { tracks: list, sel: sel };
  }

  /* zestaw: {d: dedykacja, t: tytuł, ids: [numery z katalogu], x: [{u,t,c}] dodane spoza katalogu} */
  function encodeSet(set) {
    var p = { v: 1, d: set.d || "", t: set.t || "", m: idsToMask(set.ids || []) };
    if (set.x && set.x.length) p.x = set.x.map(function (a) { return [a.u, a.t || "", packCover(a.c)]; });
    var muz = packSetMusic(set.muz);
    if (muz) p.muz = muz;
    var bytes = new TextEncoder().encode(JSON.stringify(p));
    var plain = "j." + b64e(bytes);
    if (typeof CompressionStream === "undefined") return Promise.resolve(plain);
    return pipe(bytes, new CompressionStream("deflate-raw")).then(function (z) {
      return z.length < bytes.length ? "z." + b64e(z) : plain;
    }, function () { return plain; });
  }
  function decodeSet(raw) {
    raw = String(raw || "").replace(/^#/, "").trim();
    var step;
    try {
      if (raw.indexOf("z.") === 0) step = pipe(b64d(raw.slice(2)), new DecompressionStream("deflate-raw"));
      else if (raw.indexOf("j.") === 0) step = Promise.resolve(b64d(raw.slice(2)));
      else return Promise.resolve(null);
    } catch (e) { return Promise.resolve(null); }
    return step.then(function (b) {
      var p = JSON.parse(new TextDecoder().decode(b));
      return {
        d: p.d || "", t: p.t || "",
        ids: p.m ? maskToIds(p.m) : [],
        x: (p.x || []).map(function (a) { return { u: a[0], t: a[1], c: a[2] }; }),
        muz: unpackSetMusic(p.muz)
      };
    }).catch(function () { return null; });
  }
  function payloadFromLocation() {
    try {
      var q = new URLSearchParams(location.search).get("z");
      if (q) return /^[zj]\./.test(q) ? q : "z." + q;
    } catch (e) {}
    return String(location.hash || "").replace(/^#/, "");
  }
  function albumUrl(n) { return CANONICAL + "a/" + n; }
  function shareUrl(hashPart) { return CANONICAL + "?z=" + hashPart; }
  function facebookUrl(hashPart) {
    return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(shareUrl(hashPart));
  }
  function openFacebook(hashPart) {
    var w = 640, h = 680, l = Math.max(0, (screen.width - w) / 2), t = Math.max(0, (screen.height - h) / 2);
    var win = global.open(facebookUrl(hashPart), "fbshare", "width=" + w + ",height=" + h + ",left=" + l + ",top=" + t + ",scrollbars=yes,resizable=yes");
    if (win) try { win.opener = null; } catch (e) {}
  }
  function yearOf(a) {
    if (a.y) return a.y;
    var m = String(a.t || "").match(/^((?:19|20)\d\d)\b/);
    return m ? m[1] : "Dodane";
  }
  /* Albumy zestawu w kolejności: lata rosnąco, pokazy, dodane */
  function resolveSet(c, set) {
    var list = [];
    (set.ids || []).forEach(function (n) { if (c.byN[n]) list.push(c.byN[n]); });
    (set.x || []).forEach(function (a, i) { list.push({ n: "x" + i, y: yearOf(a), t: a.t || a.u, u: a.u, c: a.c, extra: true }); });
    function rank(y) { return /^\d{4}$/.test(y) ? 0 : (y === "Flog Danusi" ? 1 : y === "Pokazy" ? 2 : 3); }
    list.sort(function (a, b) {
      return (rank(a.y) - rank(b.y)) || String(a.y).localeCompare(String(b.y)) ||
        String(a.t).localeCompare(String(b.t), "pl", { numeric: true });
    });
    return list;
  }
  function plural(n, one, few, many) {
    var d = n % 10, dd = n % 100;
    if (n === 1) return one;
    if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return few;
    return many;
  }

  global.Albumy = {
    VER: VER, CANONICAL: CANONICAL, esc: esc, coverUrl: coverUrl, packCover: packCover,
    afId: afId, shortCode: shortCode, linkKind: linkKind, extractLinks: extractLinks, normUrl: normUrl,
    loadCatalog: loadCatalog, findInCatalog: findInCatalog,
    idsToMask: idsToMask, maskToIds: maskToIds, encodeSet: encodeSet, decodeSet: decodeSet,
    payloadFromLocation: payloadFromLocation, shareUrl: shareUrl, albumUrl: albumUrl, facebookUrl: facebookUrl, openFacebook: openFacebook,
    resolveSet: resolveSet, yearOf: yearOf, plural: plural,
    parseYtId: parseYtId, parseDriveId: parseDriveId, parseMusicLink: parseMusicLink,
    musicParam: musicParam, parseMusicParam: parseMusicParam, musicKey: musicKey,
    driveStreamUrls: driveStreamUrls, drivePreviewUrl: drivePreviewUrl, fmtDur: fmtDur,
    fetchMusicTitle: fetchMusicTitle, loadMusicCatalog: loadMusicCatalog, catalogPlayable: catalogPlayable,
    packSetMusic: packSetMusic, unpackSetMusic: unpackSetMusic, resolveMusic: resolveMusic,
    packMusicList: packMusicList, unpackMusicList: unpackMusicList, normTrack: normTrack
  };
})(window);
