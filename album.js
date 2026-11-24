/* Albumy – strona jednego albumu: od razu odtwarzacz, bez siatki i edycji */
(function () {
  "use strict";
  var A = window.Albumy, $ = function (id) { return document.getElementById(id); };
  function plural(n) { return n + " " + A.plural(n, "zdjęcie", "zdjęcia", "zdjęć"); }
  function screen(a) {
    $("cs-img").src = A.coverUrl(a.c, 600);
    $("cs-t").textContent = a.t;
    $("cs-n").textContent = a.f ? plural(a.f) : "";
    document.title = a.t + " · Album";
    $("cover-screen").hidden = false;
  }
  function start(a) {
    if (!a) { $("cs-t").textContent = "Nie ma takiego albumu."; $("cs-again").hidden = true; $("cover-screen").hidden = false; return; }
    screen(a);
    if (!(a.f > 0)) {
      $("cs-again").textContent = "Otwórz w Google Foto";
      $("cs-again").onclick = function () { location.href = a.u; };
      return;
    }
    var play = function () {
      $("cover-screen").hidden = true;
      var m = "";
      try { m = new URLSearchParams(location.search).get("m") || ""; } catch (e) {}
      window.AlbumPlayer.open(a, $("cs-again"), { single: true, m: m, onClose: function () { $("cover-screen").hidden = false; } });
    };
    $("cs-again").onclick = play;
    play();
  }
  A.loadMusicCatalog();
  if (window.ALBUM) return start(window.ALBUM);
  var n = parseInt(new URLSearchParams(location.search).get("n") || new URLSearchParams(location.search).get("album"), 10);
  A.loadCatalog().then(function (c) { start(c.byN[n]); }).catch(function () { start(null); });
})();
