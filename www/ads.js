/**
 * ZenMines - AdMob wrapper (Google TEST ad units only).
 *
 * Runs only inside the native Capacitor Android app, where the
 * @capacitor-community/admob plugin is registered on window.Capacitor.Plugins.
 * In a normal browser (GitHub Pages demo / your own static server) every call
 * is a silent no-op, so the web build never loads any third-party script.
 *
 * These are Google's public sample IDs. Swap them for your own AdMob IDs only
 * in a private release build; never commit real publisher IDs here.
 */
(function (root) {
  'use strict';

  var TEST_IDS = {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712'
  };

  // Show an interstitial at most once every N finished games.
  var INTERSTITIAL_EVERY = 3;

  var plugin = null;
  var initialized = false;
  var bannerVisible = false;
  var interstitialReady = false;
  var finishedGames = 0;

  function getPlugin() {
    var cap = root.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    return (cap.Plugins && cap.Plugins.AdMob) || null;
  }

  function safe(promise) {
    if (promise && typeof promise.catch === 'function') {
      return promise.catch(function () { return null; });
    }
    return Promise.resolve(promise);
  }

  function prepareInterstitial() {
    if (!plugin) return Promise.resolve();
    interstitialReady = false;
    return safe(plugin.prepareInterstitial({ adId: TEST_IDS.interstitial, isTesting: true })).then(function (res) {
      interstitialReady = res !== null;
    });
  }

  var Ads = {
    TEST_IDS: TEST_IDS,

    isAvailable: function () {
      return !!getPlugin();
    },

    init: function () {
      plugin = getPlugin();
      if (!plugin || initialized) return Promise.resolve(false);
      initialized = true;
      return safe(plugin.initialize({ initializeForTesting: true })).then(function () {
        document.body.classList.add('has-banner');
        return Promise.all([Ads.showBanner(), prepareInterstitial()]);
      }).then(function () { return true; });
    },

    showBanner: function () {
      if (!plugin) return Promise.resolve();
      if (bannerVisible) return safe(plugin.resumeBanner());
      bannerVisible = true;
      return safe(plugin.showBanner({
        adId: TEST_IDS.banner,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        isTesting: true
      }));
    },

    hideBanner: function () {
      if (!plugin || !bannerVisible) return Promise.resolve();
      return safe(plugin.hideBanner());
    },

    /** Call when a round ends; shows a test interstitial every few games. */
    onGameFinished: function () {
      finishedGames++;
      if (!plugin || !interstitialReady || finishedGames % INTERSTITIAL_EVERY !== 0) {
        return Promise.resolve(false);
      }
      interstitialReady = false;
      return safe(plugin.showInterstitial()).then(function () {
        prepareInterstitial();
        return true;
      });
    }
  };

  root.ZenAds = Ads;
})(typeof window !== 'undefined' ? window : this);
