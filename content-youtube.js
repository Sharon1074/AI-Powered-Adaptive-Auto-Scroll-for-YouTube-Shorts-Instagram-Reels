// content-youtube.js
// AI-powered version: classifies each Short's video content with an
// on-device MobileNet model and learns a per-category interest score,
// which sets how many loops to allow before auto-advancing.

(async function () {
  const STORAGE_KEY = 'yt_state';
  let state = await AutoScrollEngine.getState(STORAGE_KEY);

  AIEngine.loadModel();

  let currentVideo = null;
  let loopCount = 0;
  let currentBucket = null;
  let classifiedThisVideo = false;
  let manualScrollTimer = null;
  let userManuallyScrolled = false;

  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) state = { ...state, ...changes[STORAGE_KEY].newValue };
  });

  function findActiveShortVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    const viewportArea = window.innerWidth * window.innerHeight;
    const candidates = videos
      .map((v) => {
        const r = v.getBoundingClientRect();
        const top = Math.max(r.top, 0);
        const bottom = Math.min(r.bottom, window.innerHeight);
        const left = Math.max(r.left, 0);
        const right = Math.min(r.right, window.innerWidth);
        const area = Math.max(0, bottom - top) * Math.max(0, right - left);
        return { v, area };
      })
      .filter((c) => c.area > viewportArea * 0.3);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const scoreOf = (c) => (c.v.paused ? 0 : 2) + (isFinite(c.v.duration) ? 1 : 0);
      const diff = scoreOf(b) - scoreOf(a);
      if (diff !== 0) return diff;
      return b.area - a.area;
    });
    return candidates[0].v;
  }

  function scrollToNext() {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true })
    );
  }

  async function classifyCurrent(video) {
    if (classifiedThisVideo) return;
    classifiedThisVideo = true;
    const predictions = await AIEngine.classifyVideo(video);
    if (predictions) {
      currentBucket = AIEngine.topBucket(predictions);
      console.log('[AI] classified short as:', currentBucket, '| top guess:', predictions[0].className);
    } else {
      currentBucket = null;
    }
  }

  function attachToVideo(video) {
    if (!video || video === currentVideo) return;
    if (currentVideo) currentVideo.removeEventListener('timeupdate', onTimeUpdate);
    currentVideo = video;
    loopCount = 0;
    currentBucket = null;
    classifiedThisVideo = false;
    userManuallyScrolled = false;
    video._lastTime = video.currentTime;
    video.addEventListener('timeupdate', onTimeUpdate);
    setTimeout(() => classifyCurrent(video), 400);
  }

  function currentScoreAndThreshold() {
    if (currentBucket && state.categories[currentBucket] !== undefined) {
      const score = state.categories[currentBucket];
      return { threshold: AutoScrollEngine.loopsThreshold(score, state.sensitivity), source: currentBucket };
    }
    const score = currentBucket ? 0.3 : state.engagement;
    return { threshold: AutoScrollEngine.loopsThreshold(score, state.sensitivity), source: currentBucket || 'fallback' };
  }

  async function onTimeUpdate() {
    if (!state.enabled || !currentVideo) return;
    const v = currentVideo;
    if (!v.duration || !isFinite(v.duration)) {
      v._lastTime = v.currentTime;
      return;
    }
    if (v._lastTime !== undefined && v._lastTime > v.duration - 0.5 && v.currentTime < 0.5) {
      loopCount += 1;
      const { threshold, source } = currentScoreAndThreshold();
      console.log('[AutoScroll] loop', loopCount, '/', threshold, ' category=', source);
      if (loopCount >= threshold) {
        try {
          if (currentBucket) {
            const prev = state.categories[currentBucket];
            const updated = AutoScrollEngine.nextCategoryScore(prev, loopCount, false);
            const newCategories = { ...state.categories, [currentBucket]: updated };
            state = await AutoScrollEngine.setState(STORAGE_KEY, { categories: newCategories });
          } else {
            const newEngagement = AutoScrollEngine.nextEngagement(state.engagement, loopCount, false);
            state = await AutoScrollEngine.setState(STORAGE_KEY, { engagement: newEngagement });
          }
        } catch (err) {
          console.log('[AutoScroll] storage update failed (continuing to scroll anyway):', err && err.message);
        }
        loopCount = 0;
        scrollToNext();
      }
    }
    v._lastTime = v.currentTime;
  }

  window.addEventListener(
    'wheel',
    () => {
      userManuallyScrolled = true;
      clearTimeout(manualScrollTimer);
      manualScrollTimer = setTimeout(async () => {
        if (!userManuallyScrolled) return;
        try {
          if (currentBucket) {
            const prev = state.categories[currentBucket];
            const updated = AutoScrollEngine.nextCategoryScore(prev, loopCount, true);
            const newCategories = { ...state.categories, [currentBucket]: updated };
            state = await AutoScrollEngine.setState(STORAGE_KEY, { categories: newCategories });
          } else {
            const newEngagement = AutoScrollEngine.nextEngagement(state.engagement, loopCount, true);
            state = await AutoScrollEngine.setState(STORAGE_KEY, { engagement: newEngagement });
          }
        } catch (err) {
          console.log('[AutoScroll] storage update failed on manual skip:', err && err.message);
        }
        loopCount = 0;
      }, 300);
    },
    { passive: true }
  );

  const observer = new MutationObserver(() => {
    const v = findActiveShortVideo();
    if (v) attachToVideo(v);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(() => {
    const v = findActiveShortVideo();
    if (v) attachToVideo(v);
  }, 1000);

  console.log('[AutoScroll] AI-powered content-youtube.js initialized');
})();
