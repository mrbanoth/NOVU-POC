/* NotiFly white-label — rebrands the (MIT) Novu dashboard at runtime.
   Injected by the nginx branding proxy. Non-destructive; no app rebuild needed.
   Logo <img> assets are swapped by the proxy at /images/novu-*.svg; the "Powered by Novu"
   watermark in emails/inbox is removed via the org's removeNovuBranding flag. This script
   handles the remaining UI surface: title, favicon, visible "Novu" text, leftover
   "Powered by" blocks, and external Novu (docs/marketing) links. */
(function () {
  var BRAND = "NotiFly";
  var FAVICON = "/notifly-favicon.svg";
  var NOVU_LINK = /novu\.(co|com|io)/i;

  function setFavicon() {
    var l = document.querySelector("link[rel='icon']");
    if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
    if (l.getAttribute("href") !== FAVICON) l.setAttribute("href", FAVICON);
  }

  // Rename visible "Novu" text -> "NotiFly" (text nodes only; never touches code/attrs).
  function replaceText() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeValue && n.nodeValue.indexOf("Novu") !== -1) {
        n.nodeValue = n.nodeValue.replace(/Novu/g, BRAND);
      }
    }
  }

  // Remove external Novu links (Powered-by, docs, marketing).
  function hideNovuLinks() {
    var as = document.querySelectorAll("a[href]");
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      if (a.getAttribute("data-nf") ) continue;
      if (NOVU_LINK.test(a.getAttribute("href") || "")) { a.setAttribute("data-nf", "1"); a.style.display = "none"; }
    }
  }

  // Remove any leftover "Powered by Novu/NotiFly" watermark block.
  function hidePoweredBy() {
    var q = document.querySelectorAll('[aria-label="Powered by Novu"],[aria-label="Powered by NotiFly"]');
    for (var i = 0; i < q.length; i++) { q[i].setAttribute("data-nf", "1"); q[i].style.display = "none"; }
    var els = document.querySelectorAll("div,span,p,a,footer,li");
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      if (el.getAttribute("data-nf")) continue;
      if (el.children.length <= 2) {
        var t = (el.textContent || "").trim();
        if (t.length < 40 && /^powered by\s*(novu|notifly)\b/i.test(t)) { el.setAttribute("data-nf", "1"); el.style.display = "none"; }
      }
    }
  }

  function apply() {
    if (document.title.indexOf(BRAND) === -1) document.title = BRAND;
    setFavicon();
    hidePoweredBy();
    hideNovuLinks();
    replaceText();
  }

  var scheduled = false;
  function schedule() { if (scheduled) return; scheduled = true; setTimeout(function () { scheduled = false; apply(); }, 150); }

  function start() {
    apply();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
