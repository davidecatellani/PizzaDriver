// Thin wrapper around the CrazyGames SDK v3. Outside CrazyGames (local dev, other hosts)
// every call is a safe no-op and rewarded ads are granted straight away.
// The Android app build (VITE_PLATFORM=android) never loads the SDK: it shows AdMob ads instead (src/admob.js).

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
let sdk = null;
let admob = null;

function loadScript(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    setTimeout(() => reject(new Error('timeout')), timeoutMs);
    document.head.appendChild(s);
  });
}

export async function initSDK() {
  if (import.meta.env.VITE_PLATFORM === 'android') {
    admob = await import('./admob.js');
    admob.init();   // consent form and ad loading run in the background
    return;
  }
  try {
    await loadScript(SDK_URL, 3000);
    await window.CrazyGames.SDK.init();
    sdk = window.CrazyGames.SDK;
    if (sdk.environment === 'disabled') sdk = null;
  } catch {
    sdk = null;
  }
}

export function loadingStart() { try { sdk?.game.loadingStart(); } catch { /* ignore */ } }
export function loadingStop() { try { sdk?.game.loadingStop(); } catch { /* ignore */ } }
export function gameplayStart() { try { sdk?.game.gameplayStart(); } catch { /* ignore */ } }
export function gameplayStop() { try { sdk?.game.gameplayStop(); } catch { /* ignore */ } }
export function happyTime() { try { sdk?.game.happytime(); } catch { /* ignore */ } }

// type: 'midgame' | 'rewarded'. Resolves true when the ad finished (reward earned).
// onStart/onEnd let the game mute audio and pause while the ad plays.
export function showAd(type, { onStart, onEnd } = {}) {
  if (admob) return admob.show(type, { onStart, onEnd });
  if (!sdk) return Promise.resolve(true);
  return new Promise((resolve) => {
    let started = false;
    try {
      sdk.ad.requestAd(type, {
        adStarted: () => { started = true; onStart?.(); },
        adFinished: () => { if (started) onEnd?.(); resolve(true); },
        adError: () => { if (started) onEnd?.(); resolve(type === 'midgame'); },
      });
    } catch {
      resolve(type === 'midgame');
    }
  });
}

// The CrazyGames account name when the player is logged in, else null.
export async function username() {
  try {
    if (!sdk?.user?.isUserAccountAvailable) return null;
    const u = await sdk.user.getUser();
    return u?.username || null;
  } catch {
    return null;
  }
}

// CrazyGames "mute audio" setting: the current value, and a listener for when the player changes it.
export function platformMuted() {
  try { return !!sdk?.game?.settings?.muteAudio; } catch { return false; }
}
export function onPlatformMute(fn) {
  try { sdk?.game?.addSettingsChangeListener((s) => fn(!!s?.muteAudio)); } catch { /* ignore */ }
}
