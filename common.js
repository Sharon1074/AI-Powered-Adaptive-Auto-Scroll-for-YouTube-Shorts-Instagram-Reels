// common.js
// Shared adaptive engine used by both content scripts. Now tracks a
// separate learned "interest score" per AI-classified content category
// (see ai-engine.js), instead of one blind global score — so scroll
// timing reflects what you actually tend to watch fully vs. skip.

const AutoScrollEngine = (() => {
  const DEFAULTS = {
    enabled: true,
    sensitivity: 0.5,     // 0.5 = scroll away faster, 2.0 = more patient
    engagement: 0.2,      // fallback global score (used if AI classification unavailable)
    categories: {},        // { bucketName: emaScore0to1 }
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  async function getState(key) {
    const stored = await chrome.storage.local.get(key);
    const merged = { ...DEFAULTS, ...(stored[key] || {}) };
    merged.categories = { ...(stored[key]?.categories || {}) };
    return merged;
  }

  async function setState(key, patch) {
    const current = await getState(key);
    const next = { ...current, ...patch };
    await chrome.storage.local.set({ [key]: next });
    return next;
  }

  function nextEngagement(prevEngagement, loopsWatched, wasManualSkip) {
    const alpha = 0.3;
    let signal = clamp(loopsWatched / 3, 0, 1);
    if (wasManualSkip) signal = clamp(signal - 0.3, 0, 1);
    return clamp(alpha * signal + (1 - alpha) * prevEngagement, 0, 1);
  }

  // Update the learned score for one AI-classified content bucket.
  function nextCategoryScore(prevScore, loopsWatched, wasManualSkip) {
    const alpha = 0.35; // learn a bit faster per-category since data is sparser
    let signal = clamp(loopsWatched / 3, 0, 1);
    if (wasManualSkip) signal = clamp(signal - 0.3, 0, 1);
    const prev = prevScore === undefined ? 0.3 : prevScore;
    return clamp(alpha * signal + (1 - alpha) * prev, 0, 1);
  }

  function loopsThreshold(engagement, sensitivity) {
    const base = 1 + engagement * 3;
    return Math.round(clamp(base * sensitivity, 1, 6));
  }

  return {
    getState,
    setState,
    nextEngagement,
    nextCategoryScore,
    loopsThreshold,
    clamp,
    DEFAULTS,
  };
})();
