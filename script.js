const storageKey = 'wang-shuai-jiang-forest-site';
const pageNames = new Set(['index.html', 'home.html', 'about.html', 'projects.html', 'contact.html']);
let sectionObserver;
let revealObserver;

function setupPage() {
  sectionObserver?.disconnect();
  revealObserver?.disconnect();
  const menuToggle = document.querySelector('.mobile-menu');
  const sideNav = document.querySelector('.side-nav');
  const toast = document.querySelector('#save-toast');

  menuToggle?.addEventListener('click', () => {
    const open = sideNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.side-nav a').forEach((link) => {
    link.addEventListener('click', () => {
      sideNav.classList.remove('open');
      menuToggle?.setAttribute('aria-expanded', 'false');
    });
  });

  const editable = [...document.querySelectorAll('[data-editable]')];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) {}
  editable.forEach((node) => {
    const value = saved[node.dataset.editable];
    if (value) node.innerHTML = value;
  });
  document.querySelector('#save-content')?.addEventListener('click', () => {
    const next = {};
    editable.forEach((node) => { next[node.dataset.editable] = node.innerHTML; });
    localStorage.setItem(storageKey, JSON.stringify(next));
    toast.textContent = '内容已保存到这台设备';
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2200);
  });

  const sections = [...document.querySelectorAll('.section-anchor')];
  const navLinks = [...document.querySelectorAll('.side-nav a')];
  sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-35% 0px -55% 0px' });
  sections.forEach((section) => sectionObserver.observe(section));

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach((node) => revealObserver.observe(node));
}

async function navigateWithinSite(destination, addHistory = true) {
  const url = new URL(destination, location.href);
  const response = await fetch(url.pathname, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Page could not load');
  const next = new DOMParser().parseFromString(await response.text(), 'text/html');
  const widget = document.querySelector('.music-widget');
  if (!widget || !next.querySelector('script[src="script.js"]')) throw new Error('Page is outside the music section');
  const nodes = [...next.body.children].filter((node) => node.tagName !== 'SCRIPT');
  document.body.replaceChildren(...nodes, widget);
  document.body.className = next.body.className;
  document.title = next.title;
  if (addHistory) history.pushState({}, '', url);
  setupPage();
  if (url.hash) document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
  else window.scrollTo(0, 0);
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link || link.id === 'enter-site' || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || !pageNames.has(url.pathname.split('/').pop())) return;
  if (url.pathname === location.pathname && url.hash) return;
  event.preventDefault();
  navigateWithinSite(url.href).catch(() => { location.href = url.href; });
});
window.addEventListener('popstate', () => {
  navigateWithinSite(location.href, false).catch(() => location.reload());
});
setupPage();

// The shared player is appended to script.js when publishing.
(() => {
  const audio = new Audio();
  const parts = Array.from({ length: 22 }, (_, index) => `music/part-${String(index).padStart(2, '0')}.mp3`);
  const downloads = parts.map((path) => fetch(path).then((response) => {
    if (!response.ok) throw new Error(`Music file ${path} could not load`);
    return response.arrayBuffer();
  }));
  let audioReady;
  const streamable = Boolean(window.MediaSource && MediaSource.isTypeSupported('audio/mpeg'));
  if (streamable) {
    const source = new MediaSource();
    audio.src = URL.createObjectURL(source);
    audioReady = new Promise((resolve, reject) => {
      source.addEventListener('sourceopen', async () => {
        try {
          const buffer = source.addSourceBuffer('audio/mpeg');
          for (const download of downloads) {
            const bytes = await download;
            await new Promise((done, failed) => {
              buffer.addEventListener('updateend', done, { once: true });
              buffer.addEventListener('error', failed, { once: true });
              buffer.appendBuffer(bytes);
            });
            resolve(); // Playback can start while the rest is still loading.
          }
          if (source.readyState === 'open') source.endOfStream();
        } catch (error) { reject(error); }
      }, { once: true });
    });
  } else {
    audioReady = Promise.all(downloads).then((buffers) => {
      audio.src = URL.createObjectURL(new Blob(buffers, { type: 'audio/mpeg' }));
    });
  }
  const sessionKey = 'forest-music-session';
  const preferenceKey = 'forest-music-preferences';
  let session = {};
  let preferences = {};
  try { session = JSON.parse(sessionStorage.getItem(sessionKey) || '{}'); } catch (_) {}
  try { preferences = JSON.parse(localStorage.getItem(preferenceKey) || '{}'); } catch (_) {}
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = Number.isFinite(preferences.volume) ? preferences.volume : 0.35;
  audio.muted = Boolean(preferences.muted);
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(session.time) && session.time < audio.duration) audio.currentTime = session.time;
  }, { once: true });

  const widget = document.createElement('div');
  widget.className = 'music-widget';
  widget.innerHTML = `<button class="music-toggle" type="button" aria-label="播放背景音乐"><span class="music-icon" aria-hidden="true">♫</span><span class="music-state">播放音乐</span></button><button class="music-settings-toggle" type="button" aria-label="调整音乐" aria-expanded="false" title="调整音乐">⌄</button><div class="music-panel" hidden><p class="music-track">冬与春与我（纯享）</p><label for="music-volume">音量 <span class="music-volume-value"></span></label><input id="music-volume" type="range" min="0" max="100"><button class="music-mute" type="button">静音</button><p class="music-error" role="status" aria-live="polite"></p></div>`;
  document.body.append(widget);
  const playButton = widget.querySelector('.music-toggle');
  const state = widget.querySelector('.music-state');
  const panelButton = widget.querySelector('.music-settings-toggle');
  const panel = widget.querySelector('.music-panel');
  const volume = widget.querySelector('#music-volume');
  const volumeValue = widget.querySelector('.music-volume-value');
  const muteButton = widget.querySelector('.music-mute');
  const error = widget.querySelector('.music-error');
  volume.value = Math.round(audio.volume * 100);

  const savePreferences = () => localStorage.setItem(preferenceKey, JSON.stringify({ volume: audio.volume, muted: audio.muted }));
  const saveSession = () => sessionStorage.setItem(sessionKey, JSON.stringify({ started: session.started, paused: session.paused, time: audio.currentTime || 0 }));
  const refresh = () => {
    const playing = !audio.paused;
    state.textContent = playing ? (audio.muted ? '音乐已静音' : '音乐播放中') : '播放音乐';
    playButton.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
    muteButton.textContent = audio.muted ? '取消静音' : '静音';
    volumeValue.textContent = `${volume.value}%`;
    widget.classList.toggle('playing', playing);
  };
  const play = async () => {
    session.started = true;
    session.paused = false;
    saveSession();
    try {
      const started = streamable ? audio.play() : null;
      await audioReady;
      await (started || audio.play());
      error.textContent = '';
    } catch (_) {
      error.textContent = '轻点“播放音乐”即可继续收听';
      session.paused = true;
      saveSession();
    }
    refresh();
  };
  playButton.addEventListener('click', () => {
    if (audio.paused) play();
    else { audio.pause(); session.paused = true; saveSession(); refresh(); }
  });
  panelButton.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    panelButton.setAttribute('aria-expanded', String(!panel.hidden));
  });
  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value) / 100;
    if (audio.volume > 0) audio.muted = false;
    savePreferences();
    refresh();
  });
  muteButton.addEventListener('click', () => {
    audio.muted = !audio.muted;
    savePreferences();
    refresh();
  });
  audio.addEventListener('error', () => { error.textContent = '音乐加载失败，请稍后重试'; refresh(); });
  window.addEventListener('pagehide', saveSession);

  document.addEventListener('click', async (event) => {
    const enter = event.target.closest('#enter-site');
    if (!enter || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    await play();
    navigateWithinSite(enter.href).catch(() => { window.location.href = enter.href; });
  });
  if (!document.querySelector('#enter-site') && session.started && !session.paused) {
    // Browsers may block playback after a page navigation. The play button remains available.
    play();
  }
  refresh();
})();

