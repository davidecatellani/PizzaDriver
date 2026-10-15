// AdMob for the Android app build: interstitial between deliveries ('midgame') and rewarded video.
// Loaded only when VITE_PLATFORM=android. Ad unit ids come from .env.android; until real ones are
// set they are Google's public test units, which show "Test Ad" banners and never pay.

import { AdMob, InterstitialAdPluginEvents, RewardAdPluginEvents, AdmobConsentStatus } from '@capacitor-community/admob';

const TEST_INTERSTITIAL = 'ca-app-pub-3940256099942544/1033173712';
const TEST_REWARDED = 'ca-app-pub-3940256099942544/5224354917';
const UNITS = {
  midgame: import.meta.env.VITE_ADMOB_INTERSTITIAL || TEST_INTERSTITIAL,
  rewarded: import.meta.env.VITE_ADMOB_REWARDED || TEST_REWARDED,
};
const TESTING = UNITS.midgame === TEST_INTERSTITIAL;

const ready = { midgame: false, rewarded: false };
let ok = false;

function load(type) {
  ready[type] = false;
  const opts = { adId: UNITS[type], isTesting: TESTING, immersiveMode: true };
  const p = type === 'midgame' ? AdMob.prepareInterstitial(opts) : AdMob.prepareRewardVideoAd(opts);
  p.then(() => { ready[type] = true; }).catch(() => {
    // No fill or offline: try again later.
    setTimeout(() => load(type), 60000);
  });
}

export async function init() {
  try {
    await AdMob.initialize({ initializeForTesting: TESTING });
    // EU/UK players must be asked for consent (Google UMP form) before personalised ads.
    try {
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
    } catch { /* ads still run, non-personalised */ }
    ok = true;
    load('midgame');
    load('rewarded');
  } catch {
    ok = false;
  }
}

// Same contract as the CrazyGames wrapper: resolves true when the game may continue / grant the reward.
// With no ad ready (no fill, offline) a rewarded bonus is granted anyway, so the button never feels broken.
export function show(type, { onStart, onEnd } = {}) {
  if (!ok || !ready[type]) return Promise.resolve(true);
  const ev = type === 'midgame' ? InterstitialAdPluginEvents : RewardAdPluginEvents;
  return new Promise((resolve) => {
    let earned = type === 'midgame';
    let started = false;
    let done = false;
    const handles = [];
    const finish = (result) => {
      if (done) return;
      done = true;
      handles.forEach((h) => h.then((x) => x.remove()));
      if (started) onEnd?.();
      load(type);
      resolve(result);
    };
    handles.push(AdMob.addListener(ev.Showed, () => { started = true; onStart?.(); }));
    handles.push(AdMob.addListener(ev.Dismissed, () => finish(earned)));
    handles.push(AdMob.addListener(ev.FailedToShow, () => finish(true)));
    if (type === 'rewarded') handles.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }));
    ready[type] = false;
    const shown = type === 'midgame' ? AdMob.showInterstitial() : AdMob.showRewardVideoAd();
    shown.catch(() => finish(true));
  });
}
