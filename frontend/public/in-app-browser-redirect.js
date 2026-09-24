/**
 * In-app browser → external browser redirect
 * Detects Instagram/Facebook/TikTok/etc. WebViews and opens the same URL
 * in the system browser (needed for OAuth / cookies / Google login).
 *
 * Usage: <script src="/in-app-browser-redirect.js" defer></script>
 * Loop guard: ?_ext=1 stops further redirects.
 */
(function () {
  if (typeof window === "undefined") return;

  var searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("_ext") === "1") return;

  var ua = navigator.userAgent || "";
  var lowerUa = ua.toLowerCase();
  var isInAppBrowser =
    lowerUa.indexOf("instagram") !== -1 ||
    lowerUa.indexOf("fb_iab") !== -1 ||
    lowerUa.indexOf("fban") !== -1 ||
    lowerUa.indexOf("fbav") !== -1 ||
    lowerUa.indexOf("messenger") !== -1 ||
    lowerUa.indexOf("musical_ly") !== -1 ||
    lowerUa.indexOf("tiktok") !== -1 ||
    lowerUa.indexOf("bytedance") !== -1 ||
    lowerUa.indexOf("linkedin") !== -1 ||
    lowerUa.indexOf("snapchat") !== -1 ||
    (lowerUa.indexOf("twitter") !== -1 && lowerUa.indexOf("mobile") !== -1);

  if (!isInAppBrowser) return;

  var isIOS = /iPad|iPhone|iPod/.test(ua);
  var isAndroid = /Android/i.test(ua);
  var targetUrl = getCleanCurrentUrl();
  var fallbackUrl = getFallbackUrl();

  triggerExternalOpen();

  function getCleanCurrentUrl() {
    var params = new URLSearchParams(window.location.search);
    params.delete("_ext");
    var qs = params.toString();
    return window.location.origin + window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
  }

  function getFallbackUrl() {
    var params = new URLSearchParams(window.location.search);
    params.set("_ext", "1");
    var qs = params.toString();
    return window.location.origin + window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
  }

  function triggerExternalOpen() {
    if (isAndroid) {
      var clean = targetUrl.replace(/^https?:\/\//, "");
      var androidIntent =
        "intent://" + clean + "#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";
      var androidChromeIntent =
        "intent://" +
        clean +
        "#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";
      window.location.href = androidIntent;
      setTimeout(function () {
        window.location.href = androidChromeIntent;
      }, 400);
      setTimeout(function () {
        window.location.href = fallbackUrl;
      }, 1400);
      return;
    }

    if (isIOS) {
      var pathWithParamsAndHash =
        window.location.pathname + window.location.search + window.location.hash;
      var safariUrl = "x-safari-https://" + window.location.host + pathWithParamsAndHash;
      var chromeUrl = "googlechrome://" + window.location.host + pathWithParamsAndHash;
      try {
        var opened = window.open(safariUrl, "_blank");
        if (!opened) {
          window.location.href = safariUrl;
        }
      } catch (e) {
        window.location.href = safariUrl;
      }
      setTimeout(function () {
        window.location.href = chromeUrl;
      }, 700);
      setTimeout(function () {
        window.location.href = fallbackUrl;
      }, 1600);
      return;
    }

    window.location.href = fallbackUrl;
  }
})();
