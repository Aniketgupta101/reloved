/**
 * In-app browser → device default browser (one handoff).
 *
 * - Android: generic https Intent (NO Chrome package) → user's default browser
 * - iOS / iPadOS: Safari via x-safari-https://
 * - One Intent only (no double leave-app dialog)
 * - GO BACK: reload https?_ext=1 so the Wall isn't a white screen
 *
 * Note: Instagram/Facebook may still show their own "You're leaving our app"
 * confirmation — that prompt is controlled by the app, not Reloved.
 */
(function () {
  if (typeof window === "undefined") return;

  var LOCK = "reloved_ext_once_v7";
  try {
    if (sessionStorage.getItem(LOCK) === "1") return;
  } catch (e) {}

  var searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("_ext") === "1") return;

  var ua = navigator.userAgent || "";
  var lowerUa = ua.toLowerCase();
  var isInApp =
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

  if (!isInApp) return;

  try {
    sessionStorage.setItem(LOCK, "1");
  } catch (e) {}

  var isIOS = /iPad|iPhone|iPod/.test(ua) || (lowerUa.indexOf("mac") !== -1 && "ontouchend" in document);
  var isAndroid = /Android/i.test(ua);

  var params = new URLSearchParams(window.location.search);
  params.delete("_ext");
  var qs = params.toString();
  var pathOnly =
    window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
  var httpsUrl = window.location.origin + pathOnly;

  function restoreUrl() {
    var p = new URLSearchParams(window.location.search);
    p.set("_ext", "1");
    return (
      window.location.origin +
      window.location.pathname +
      "?" +
      p.toString() +
      window.location.hash
    );
  }

  var restored = false;
  function restoreSite() {
    if (restored) return;
    if (document.visibilityState === "hidden") return;
    restored = true;
    window.location.replace(restoreUrl());
  }

  var openUrl;
  if (isAndroid) {
    // Default browser — do NOT set package=com.android.chrome
    var clean = httpsUrl.replace(/^https?:\/\//, "");
    openUrl =
      "intent://" +
      clean +
      "#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";
  } else if (isIOS) {
    // Apple → Safari (system browser handoff from in-app WebViews)
    openUrl = "x-safari-https://" + window.location.host + pathOnly;
  } else {
    return;
  }

  try {
    history.pushState({ relovedExt: 1 }, "", location.href);
  } catch (e) {}

  var handoffStarted = false;
  window.addEventListener("pageshow", function () {
    if (handoffStarted) restoreSite();
  });

  handoffStarted = true;
  window.location.href = openUrl;

  setTimeout(restoreSite, 1600);
})();
