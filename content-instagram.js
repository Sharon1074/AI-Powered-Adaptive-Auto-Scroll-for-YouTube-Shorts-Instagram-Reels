// content-instagram.js
// AI-powered version: classifies each reel's actual video content with an
// on-device MobileNet model, learns a per-category interest score, and
// uses that (instead of one generic loop count) to decide scroll timing.

(async function () {
  const STORAGE_KEY = 'ig_state';
  let state = await AutoScrollEngine.getState(STORAGE_KEY);
  console.log('[AutoScroll] loaded state', state);

  // Warm up the model in the background as soon as the page loads.
  AIEngine.loadModel();

  let currentVideo = null;
  let loopCount = 0;
  let currentBucket = null;
  let classifiedThisVideo = false;
  let manualScrollTimer = null;
  let userManuallyScrolled = false;

  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      state = { ...state, ...changes[STORAGE_KEY].newValue };
    }
  });

  function onReelsPage() {
    return location.pathname.startsWith('/reels') || location.pathname.startsWith('/reel/');
  }

  function visibleArea(rect) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, vh);
    const left = Math.max(rect.left, 0);
    const right = Math.min(rect.right, vw);
    return Math.max(0, bottom - top) * Math.max(0, right - left);
  }

  function findActiveReelVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;
    const viewportArea = window.innerWidth * window.innerHeight;
    const candidates = videos
      .map((v) => ({ v, area: visibleArea(v.getBoundingClientRect()) }))
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

  function getScrollableAncestor(el) {
    let node = el;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      const scrollable = style.overflowY === 'auto' || style.overflowY === 'scroll';
      if (scrollable && node.scrollHeight > node.clientHeight + 10) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollToNext() {
    const container = getScrollableAncestor(currentVideo);
    const amount = container.clientHeight || window.innerHeight;
    container.scrollBy({ top: amount, behavior: 'smooth' });
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
      console.log(
        '[AI] classified reel as:',
        currentBucket,
        '| top guess:', predictions[0].className,
        `(${Math.round(predictions[0].probability * 100)}%)`
      );
    } else {
      currentBucket = null;
      console.log('[AI] could not classify this reel (using fallback score)');
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
    // Give the frame a moment to actually render before grabbing it.
    setTimeout(() => classifyCurrent(video), 400);
  }

  function currentScoreAndThreshold() {
    if (currentBucket && state.categories[currentBucket] !== undefined) {
      const score = state.categories[currentBucket];
      return { score, threshold: AutoScrollEngine.loopsThreshold(score, state.sensitivity), source: currentBucket };
    }
    // New/unclassified category: use a neutral starting score, not the
    // global fallback, so it doesn't inherit stale bias immediately.
    const score = currentBucket ? 0.3 : state.engagement;
    return { score, threshold: AutoScrollEngine.loopsThreshold(score, state.sensitivity), source: currentBucket || 'fallback' };
  }

  async function onTimeUpdate() {
    if (!state.enabled || !currentVideo || !onReelsPage()) return;
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
            console.log('[AI] updated interest score for', currentBucket, '→', updated.toFixed(2));
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
    if (!onReelsPage()) return;
    const v = findActiveReelVideo();
    if (v) attachToVideo(v);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(() => {
    if (!onReelsPage()) return;
    if (currentVideo && currentVideo.paused && !isFinite(currentVideo.duration)) {
      currentVideo.removeEventListener('timeupdate', onTimeUpdate);
      currentVideo = null;
    }
    const v = findActiveReelVideo();
    if (v) attachToVideo(v);
  }, 1000);

  console.log('[AutoScroll] AI-powered content-instagram.js initialized on', location.pathname);
})();
