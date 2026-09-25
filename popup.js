// popup.js
const YT_KEY = 'yt_state';
const IG_KEY = 'ig_state';
const DEFAULTS = { enabled: true, sensitivity: 0.5, engagement: 0.2, categories: {} };

async function getState(key) {
  const stored = await chrome.storage.local.get(key);
  const merged = { ...DEFAULTS, ...(stored[key] || {}) };
  merged.categories = { ...(stored[key]?.categories || {}) };
  return merged;
}

async function setBoth(patch) {
  const yt = await getState(YT_KEY);
  const ig = await getState(IG_KEY);
  await chrome.storage.local.set({
    [YT_KEY]: { ...yt, ...patch },
    [IG_KEY]: { ...ig, ...patch },
  });
}

function renderCategories(container, categories) {
  container.innerHTML = '';
  const entries = Object.entries(categories || {});
  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-note">Not enough data yet — keep scrolling.</div>';
    return;
  }
  entries
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, score]) => {
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <div class="cat-name">${name.replace(/_/g, ' ')}</div>
        <div class="bar-bg"><div class="bar-fill" style="width:${Math.round(score * 100)}%"></div></div>
      `;
      container.appendChild(row);
    });
}

async function refreshUI() {
  const yt = await getState(YT_KEY);
  const ig = await getState(IG_KEY);

  document.getElementById('enabledToggle').checked = yt.enabled;
  document.getElementById('sensitivitySlider').value = yt.sensitivity;

  renderCategories(document.getElementById('ytCategories'), yt.categories);
  renderCategories(document.getElementById('igCategories'), ig.categories);
}

document.getElementById('enabledToggle').addEventListener('change', async (e) => {
  await setBoth({ enabled: e.target.checked });
});

document.getElementById('sensitivitySlider').addEventListener('input', async (e) => {
  await setBoth({ sensitivity: parseFloat(e.target.value) });
});

document.getElementById('resetBtn').addEventListener('click', async () => {
  await setBoth({ engagement: DEFAULTS.engagement, categories: {} });
  refreshUI();
});

refreshUI();
