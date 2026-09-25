// ai-engine.js
// Real, local, on-device AI: runs a MobileNet convolutional neural network
// (via TensorFlow.js) directly in your browser to classify what's actually
// in each reel's video frame, then learns which content categories you
// watch fully vs. skip — and adjusts scroll timing per category.
//
// Nothing here ever leaves your browser. No frames, images, or labels are
// sent to any server — everything runs and stays in chrome.storage.local.

const AIEngine = (() => {
  let model = null;
  let modelLoadPromise = null;

  async function loadModel() {
    if (model) return model;
    if (modelLoadPromise) return modelLoadPromise;
    console.log('[AI] loading MobileNet model (first time only, cached after)...');
    modelLoadPromise = mobilenet.load({ version: 2, alpha: 0.5 }).then((m) => {
      model = m;
      console.log('[AI] MobileNet model ready');
      return m;
    });
    return modelLoadPromise;
  }

  // Grab the current visible frame of a <video> element as a classifiable
  // tensor input, without saving/storing the image anywhere.
  function captureFrame(video) {
    const canvas = document.createElement('canvas');
    const w = 224, h = 224; // MobileNet's expected input size
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(video, 0, 0, w, h);
      return canvas;
    } catch (err) {
      console.log('[AI] could not capture frame (likely cross-origin/CORS-protected video):', err.message);
      return null;
    }
  }

  // Classify a video's current frame. Returns an array like
  // [{ className: 'golden retriever', probability: 0.83 }, ...] or null.
  async function classifyVideo(video) {
    const m = await loadModel();
    const frame = captureFrame(video);
    if (!frame) return null;
    try {
      const predictions = await m.classify(frame, 3);
      return predictions;
    } catch (err) {
      console.log('[AI] classification failed:', err.message);
      return null;
    } finally {
      frame.remove();
    }
  }

  // Map an ImageNet label to a broader bucket so the preference model
  // doesn't need a separate score for all 1000 raw classes.
  const BUCKET_KEYWORDS = {
    food: ['food', 'pizza', 'burger', 'kitchen', 'plate', 'cup', 'bowl', 'dish', 'fruit', 'vegetable', 'cake', 'bread'],
    animals: ['dog', 'cat', 'retriever', 'terrier', 'bird', 'animal', 'puppy', 'kitten', 'horse', 'fish'],
    people_fitness: ['gym', 'weight', 'jersey', 'ball', 'sport', 'running shoe', 'dumbbell', 'exercise'],
    music_performance: ['microphone', 'guitar', 'stage', 'speaker', 'drum', 'piano', 'concert'],
    nature_travel: ['beach', 'mountain', 'valley', 'seashore', 'landscape', 'lake', 'sky', 'sunset'],
    fashion_beauty: ['dress', 'gown', 'makeup', 'lipstick', 'sunglasses', 'jean', 'shoe'],
    tech: ['laptop', 'phone', 'computer', 'screen', 'keyboard', 'monitor'],
  };

  function bucketFor(label) {
    const lower = label.toLowerCase();
    for (const [bucket, keywords] of Object.entries(BUCKET_KEYWORDS)) {
      if (keywords.some((k) => lower.includes(k))) return bucket;
    }
    return 'other';
  }

  function topBucket(predictions) {
    if (!predictions || predictions.length === 0) return 'other';
    return bucketFor(predictions[0].className);
  }

  return { loadModel, classifyVideo, topBucket };
})();
