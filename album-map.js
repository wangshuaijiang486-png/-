(() => {
  const MAPLIBRE_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.19.0/dist/maplibre-gl.mjs';
  const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.19.0/dist/maplibre-gl.css';
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
  const CHINA_BOUNDS = [[73, 17], [135, 54]];
  const DB_NAME = 'forest-map-album';
  const STORE = 'photos';
  let generation = 0;
  let map = null;
  let mountedNode = null;
  let listeners = null;
  let markers = [];
  let previewMarker = null;
  let photos = [];
  let draftIds = new Set();
  let choosingPoint = false;
  let chosenPoint = null;
  let existingImage = '';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readDrafts() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  }

  async function writeDraft(photo) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(photo);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  }

  async function deleteDraft(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  }

  async function loadPhotos() {
    let published = [];
    try {
      const response = await fetch('album-data.json');
      if (response.ok) published = (await response.json()).photos || [];
    } catch (_) {}
    let drafts = [];
    try { drafts = await readDrafts(); }
    catch (_) { document.querySelector('#album-map-status').textContent = '浏览器未开放本地存储；地图仍可浏览。'; }
    draftIds = new Set(drafts.map((photo) => photo.id));
    photos = [...new Map([...published, ...drafts].map((photo) => [photo.id, photo])).values()]
      .filter((photo) => Number.isFinite(photo.lat) && Number.isFinite(photo.lng) && photo.image);
    renderPhotos();
  }

  function renderSelected(photo) {
    const box = document.querySelector('#album-selected');
    if (!box) return;
    box.replaceChildren();
    const image = document.createElement('img');
    image.src = photo.image;
    image.alt = photo.title;
    const title = document.createElement('h3');
    title.textContent = photo.title;
    const place = document.createElement('p');
    place.textContent = photo.place || '地图上的一处风景';
    box.append(image, title, place);
    if (photo.description) {
      const description = document.createElement('p');
      description.textContent = photo.description;
      box.append(description);
    }
  }

  function focusPhoto(photo) {
    renderSelected(photo);
    map?.flyTo({ center: [photo.lng, photo.lat], zoom: Math.max(map.getZoom(), 9), essential: true });
  }

  function showChina() {
    map?.fitBounds(CHINA_BOUNDS, { padding: 28, maxZoom: 3.8, duration: 500 });
  }

  function renderPhotos() {
    const list = document.querySelector('#album-photo-list');
    const count = document.querySelector('#album-count');
    if (!list || !count) return;
    count.textContent = `${photos.length} 张`;
    list.replaceChildren();
    if (!photos.length) {
      const empty = document.createElement('p');
      empty.className = 'album-empty';
      empty.textContent = '还没有标记照片。你可以先添加一张。';
      list.append(empty);
    }
    photos.forEach((photo) => {
      const row = document.createElement('div');
      row.className = 'album-photo-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'album-photo-open';
      const image = document.createElement('img');
      image.src = photo.image;
      image.alt = '';
      const text = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = photo.title;
      const place = document.createElement('small');
      place.textContent = photo.place || '查看地点';
      text.append(title, place);
      button.append(image, text);
      button.addEventListener('click', () => focusPhoto(photo), { signal: listeners.signal });
      row.append(button);
      if (draftIds.has(photo.id)) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'album-photo-delete';
        remove.textContent = '删除';
        remove.setAttribute('aria-label', `删除 ${photo.title}`);
        remove.addEventListener('click', async () => {
          await deleteDraft(photo.id);
          await loadPhotos();
        }, { signal: listeners.signal });
        row.append(remove);
      }
      list.append(row);
    });
    markers.forEach((marker) => marker.remove());
    markers = [];
    if (!map) return;
    photos.forEach((photo) => {
      const pin = document.createElement('button');
      pin.className = 'album-map-pin';
      pin.type = 'button';
      pin.setAttribute('aria-label', `${photo.place || '地点'}：${photo.title}`);
      const thumbnail = document.createElement('img');
      thumbnail.src = photo.image;
      thumbnail.alt = '';
      pin.append(thumbnail);
      pin.addEventListener('click', (event) => { event.stopPropagation(); focusPhoto(photo); }, { signal: listeners.signal });
      markers.push(new window.albumMapLibre.Marker({ element: pin, anchor: 'bottom' }).setLngLat([photo.lng, photo.lat]).addTo(map));
    });
  }

  function prepareEditor(image = '', title = '') {
    const dialog = document.querySelector('#album-editor');
    existingImage = image;
    choosingPoint = false;
    chosenPoint = null;
    previewMarker?.remove();
    previewMarker = null;
    document.querySelector('#album-title').value = title;
    document.querySelector('#album-place').value = '';
    document.querySelector('#album-file').value = '';
    document.querySelector('#album-file-label').hidden = Boolean(image);
    document.querySelector('#album-coordinates').textContent = '尚未选择地点';
    document.querySelector('#album-editor-error').textContent = '';
    dialog.showModal();
  }

  async function compressImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  async function mount() {
    const container = document.querySelector('#album-map');
    if (!container || mountedNode === container) return;
    unmount();
    mountedNode = container;
    const currentGeneration = generation;
    listeners = new AbortController();
    const signal = listeners.signal;
    const status = document.querySelector('#album-map-status');
    const dialog = document.querySelector('#album-editor');
    document.querySelector('#album-add').addEventListener('click', () => prepareEditor(), { signal });
    document.querySelectorAll('.album-place-existing').forEach((button) => {
      button.addEventListener('click', () => {
        const caption = document.querySelector(`[data-editable="${button.dataset.caption}"]`);
        prepareEditor(button.dataset.image, caption?.textContent?.trim() || '一张照片');
      }, { signal });
    });
    document.querySelector('#album-editor-close').addEventListener('click', () => dialog.close(), { signal });
    document.querySelector('#album-pick-place').addEventListener('click', () => {
      if (!map) { document.querySelector('#album-editor-error').textContent = '地图仍在加载，请稍后再选点。'; return; }
      choosingPoint = true;
      dialog.close();
      status.textContent = '请在地图上点击照片拍摄的位置';
      status.hidden = false;
    }, { signal });
    document.querySelector('#album-reset-view').addEventListener('click', showChina, { signal });
    document.querySelector('#album-export').addEventListener('click', async () => {
      const drafts = await readDrafts();
      const file = new Blob([JSON.stringify({ version: 1, photos: drafts }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = '地图相册-待发布.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, { signal });
    document.querySelector('#album-editor-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = document.querySelector('#album-title').value.trim();
      const place = document.querySelector('#album-place').value.trim();
      const file = document.querySelector('#album-file').files[0];
      const error = document.querySelector('#album-editor-error');
      if (!chosenPoint) { error.textContent = '请先在地图上选择拍摄地点。'; return; }
      if (!existingImage && !file) { error.textContent = '请选择一张照片。'; return; }
      try {
        const image = existingImage || await compressImage(file);
        const photo = { id: crypto.randomUUID(), title, place, image, lng: chosenPoint.lng, lat: chosenPoint.lat };
        await writeDraft(photo);
        dialog.close();
        previewMarker?.remove();
        previewMarker = null;
        await loadPhotos();
        focusPhoto(photo);
      } catch (_) { error.textContent = '保存失败，请检查图片或浏览器存储空间。'; }
    }, { signal });

    try {
      if (!document.querySelector('#maplibre-album-css')) {
        const css = document.createElement('link');
        css.id = 'maplibre-album-css';
        css.rel = 'stylesheet';
        css.href = MAPLIBRE_CSS;
        document.head.append(css);
      }
      const library = await import(MAPLIBRE_URL);
      if (currentGeneration !== generation || !container.isConnected) return;
      window.albumMapLibre = library;
      map = new library.Map({ container, style: MAP_STYLE, center: [104, 35], zoom: 3.2, minZoom: 2, maxZoom: 18, attributionControl: true });
      showChina();
      map.addControl(new library.NavigationControl({ showCompass: false }), 'top-right');
      map.once('render', () => { status.hidden = true; });
      map.on('load', () => { status.hidden = true; renderPhotos(); });
      map.on('click', (event) => {
        if (choosingPoint) {
          choosingPoint = false;
          chosenPoint = { lng: Number(event.lngLat.lng.toFixed(6)), lat: Number(event.lngLat.lat.toFixed(6)) };
          document.querySelector('#album-coordinates').textContent = `${chosenPoint.lat.toFixed(5)}° N, ${chosenPoint.lng.toFixed(5)}° E`;
          previewMarker?.remove();
          previewMarker = new library.Marker({ color: '#7ca76d' }).setLngLat([chosenPoint.lng, chosenPoint.lat]).addTo(map);
          status.hidden = true;
          dialog.showModal();
        } else {
          map.easeTo({ center: event.lngLat, zoom: Math.min(map.getZoom() + 0.7, 15) });
        }
      });
      await loadPhotos();
    } catch (_) {
      if (currentGeneration !== generation) return;
      status.hidden = false;
      status.textContent = '地图加载失败，请检查网络后刷新。下方原有照片仍可查看。';
    }
  }

  function unmount() {
    generation += 1;
    listeners?.abort();
    listeners = null;
    previewMarker?.remove();
    previewMarker = null;
    markers.forEach((marker) => marker.remove());
    markers = [];
    map?.remove();
    map = null;
    mountedNode = null;
    choosingPoint = false;
  }

  window.mountAlbumMap = mount;
  window.unmountAlbumMap = unmount;
  mount();
})();

