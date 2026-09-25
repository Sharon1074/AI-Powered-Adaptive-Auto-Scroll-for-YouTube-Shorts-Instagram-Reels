# AI Auto-Scroll: Shorts & Reels (v2 — genuinely AI-powered)

Automatically advances YouTube Shorts and Instagram Reels using a real, on-device neural network that classifies what's actually in each video, and learns which content categories you watch fully vs. skip.

## What changed from v1
v1 used a pure heuristic: count video loops, nudge one global "engagement" number up or down. It worked, but it wasn't AI — it never looked at *what* you were watching, just *how long*.

v2 adds real computer vision:

1. **MobileNet (via TensorFlow.js)** — a convolutional neural network — runs directly in your browser. For each reel/short, it grabs the current video frame and classifies it (e.g. "golden retriever," "pizza," "microphone," "beach").
2. Each classification gets mapped into a broader content bucket: `food`, `animals`, `people_fitness`, `music_performance`, `nature_travel`, `fashion_beauty`, `tech`, or `other`.
3. A **separate learned interest score** (0–1) is tracked per bucket, updated the same way as before (loops watched vs. manual skips), but now specific to that category.
4. Scroll timing is now calculated **per category** — if you consistently watch `food` content fully but skip `fashion_beauty` quickly, the system learns that distinction and adjusts independently, instead of treating all content the same.
5. Open the popup to see your **learned interest bars per category**, live.

## Is this "real" AI?
Yes — MobileNet is a genuine, pretrained convolutional neural network (the same family of models used in real production computer-vision systems), doing actual image classification on real video frames, running fully on-device via TensorFlow.js. It is not a cloud API call and not a simulated/fake result.

What it is *not*: a large multimodal model that "understands" reels the way a human does, or something that reads captions/audio/comments — it's frame-level object/scene classification (ImageNet's 1000 classes), bucketed into broader categories. It's genuinely AI-driven personalization, within the real constraints of what can run instantly, locally, and privately in a browser extension.

## Privacy
- All inference happens locally in your browser. No frame, image, or classification is ever sent to any server.
- Only the small learned numeric scores per category (e.g. `{"food": 0.62}`) are stored, via `chrome.storage.local` — not images, not video, not anything identifying.
- The model files (`tf.min.js`, `mobilenet.min.js`) are bundled inside the extension itself, not fetched from a CDN at runtime.

## Install (Chrome / Edge / Brave)
1. Unzip this folder.
2. Go to `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked**, select the unzipped folder.
5. Click the extension icon → make sure site access is set to **"On all sites"** (or at least youtube.com/instagram.com) under the extension's details.
6. Open YouTube Shorts or Instagram Reels.

## Files
- `manifest.json` — extension config
- `tf.min.js`, `mobilenet.min.js` — bundled TensorFlow.js + MobileNet model (runs 100% locally)
- `ai-engine.js` — loads the model, classifies video frames, buckets predictions into categories
- `common.js` — shared adaptive scoring engine (per-category learning)
- `content-youtube.js` / `content-instagram.js` — platform-specific detection + scroll logic
- `popup.html` / `popup.js` — on/off toggle, sensitivity slider, live learned-category bars

## Tuning
- **Sensitivity** slider scales how many loops it waits, on top of the learned score.
- **Reset learned preferences** wipes all category scores back to neutral.
- The first classification on a fresh page load takes ~1–2 seconds while the model initializes (cached after that, subsequent classifications are near-instant).

## Limitations
- MobileNet's labels are general-purpose (ImageNet categories, ~1000 classes) — it doesn't know social-media-specific concepts like "dance trend" or "meme format," so classification quality varies with content type.
- Instagram's DOM is obfuscated and changes often; detection logic may need occasional updates.
- This automates your own scrolling on your own view — it doesn't scrape or interact with other accounts, but automating any site interaction is technically covered by that site's Terms of Service, so treat it as personal-use tooling.
