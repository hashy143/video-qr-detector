(function initUniversalQRScanner() {
  if (typeof jsQR === 'undefined') {
    console.error('[QR Detector] Библиотека jsQR не найдена');
    return;
  }

  console.log('[QR Detector] Сервис сканирования инициализирован');

  let isScannerEnabled = true;
  const trackedVideos = new WeakSet();
  const activeUpdaters = new Set();
  let lastPageUrl = location.href;

  function removeAllOverlays() {
    document.querySelectorAll('.qr-video-overlay-box').forEach((el) => el.remove());
  }

  // Синхронизация с Popup
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get({ isEnabled: true }, (res) => {
      isScannerEnabled = res.isEnabled;
      if (!isScannerEnabled) removeAllOverlays();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && 'isEnabled' in changes) {
        isScannerEnabled = changes.isEnabled.newValue;
        if (!isScannerEnabled) removeAllOverlays();
      }
    });
  }

  // Сброс при SPA-навигации
  function checkNavigation() {
    if (location.href === lastPageUrl) return;
    lastPageUrl = location.href;
    removeAllOverlays();
  }

  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  history.pushState = function (...args) {
    const res = originalPush.apply(this, args);
    setTimeout(checkNavigation, 0);
    return res;
  };
  history.replaceState = function (...args) {
    const res = originalReplace.apply(this, args);
    setTimeout(checkNavigation, 0);
    return res;
  };
  window.addEventListener('popstate', checkNavigation);

  // Точный расчет активной области видеокадра с учетом черных полос (letterbox)
  function getVideoRenderBox(video) {
    const rect = video.getBoundingClientRect();
    const vW = video.videoWidth;
    const vH = video.videoHeight;

    if (!vW || !vH || !rect.width || !rect.height) {
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }

    const videoRatio = vW / vH;
    const elementRatio = rect.width / rect.height;

    let rWidth = rect.width;
    let rHeight = rect.height;
    let xOffset = 0;
    let yOffset = 0;

    if (elementRatio > videoRatio) {
      rWidth = rect.height * videoRatio;
      xOffset = (rect.width - rWidth) / 2;
    } else if (elementRatio < videoRatio) {
      rHeight = rect.width / videoRatio;
      yOffset = (rect.height - rHeight) / 2;
    }

    return {
      x: rect.left + xOffset,
      y: rect.top + yOffset,
      width: rWidth,
      height: rHeight
    };
  }

  function trackVideo(video) {
    if (trackedVideos.has(video)) return;
    trackedVideos.add(video);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const activeEntries = new Map();
    let lastScanTime = 0;
    let isLoopScheduled = false;

    const SCAN_INTERVAL = 350;
    const HOLD_TIME_MS = 2500;
    const MAX_QR_COUNT = 4;

    function clearAllOverlays() {
      activeEntries.forEach((entry) => entry.element.remove());
      activeEntries.clear();
    }

    // Точка монтирования с учетом DOM Twitch, YouTube и Fullscreen
    function getMountPoint() {
      if (document.fullscreenElement) {
        return document.fullscreenElement;
      }
      return (
        video.closest('[data-a-target="video-ref"]') ||
        video.closest('.video-player__container') ||
        video.closest('.html5-video-player') ||
        video.closest('#movie_player') ||
        video.parentElement ||
        document.body
      );
    }

    function createOverlayNode(mountPoint) {
      const overlay = document.createElement('div');
      overlay.className = 'qr-video-overlay-box';
      overlay.style.position = 'absolute';
      overlay.style.zIndex = '1000'; // Поверх видео-слоя Twitch
      overlay.style.pointerEvents = 'none';

      const badge = document.createElement('a');
      badge.className = 'qr-video-badge';
      badge.target = '_blank';
      badge.rel = 'noopener noreferrer';
      badge.style.pointerEvents = 'auto';

      badge.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align: middle; margin-right: 6px;">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="qr-text"></span>
      `;

      badge.addEventListener('click', (e) => e.stopPropagation());
      overlay.appendChild(badge);
      mountPoint.appendChild(overlay);

      return {
        element: overlay,
        badge: badge,
        textEl: badge.querySelector('.qr-text')
      };
    }

    function updateOverlaysPosition() {
      if (!video.isConnected || !isScannerEnabled) {
        clearAllOverlays();
        return;
      }

      const now = performance.now();
      const mountPoint = getMountPoint();
      const mountRect = mountPoint.getBoundingClientRect();
      const renderBox = getVideoRenderBox(video);

      if (renderBox.width === 0 || renderBox.height === 0) return;

      const isVisible = (
        renderBox.y + renderBox.height > 0 &&
        renderBox.y < window.innerHeight
      );

      activeEntries.forEach((entry, key) => {
        if (!video.paused && (now - entry.lastSeen > HOLD_TIME_MS)) {
          entry.element.remove();
          activeEntries.delete(key);
          return;
        }

        if (entry.element.parentElement !== mountPoint) {
          const mountStyle = window.getComputedStyle(mountPoint);
          if (mountStyle.position === 'static') {
            mountPoint.style.position = 'relative';
          }
          mountPoint.appendChild(entry.element);
        }

        const qr = entry.qrData;
        const scaleX = renderBox.width / qr.frameWidth;
        const scaleY = renderBox.height / qr.frameHeight;

        const qrWidth = (qr.maxX - qr.minX) * scaleX;
        const qrHeight = (qr.maxY - qr.minY) * scaleY;

        const left = (renderBox.x - mountRect.left) + mountPoint.scrollLeft + (qr.minX * scaleX);
        const top = (renderBox.y - mountRect.top) + mountPoint.scrollTop + (qr.minY * scaleY);

        entry.element.style.left = `${left}px`;
        entry.element.style.top = `${top}px`;
        entry.element.style.width = `${qrWidth}px`;
        entry.element.style.height = `${qrHeight}px`;
        entry.element.style.display = isVisible ? 'block' : 'none';
      });
    }

    activeUpdaters.add(updateOverlaysPosition);

    function updateDetectedQRs(rawDetectedList) {
      if (!isScannerEnabled) return;

      const now = performance.now();
      const mountPoint = getMountPoint();

      const mountStyle = window.getComputedStyle(mountPoint);
      if (mountStyle.position === 'static') {
        mountPoint.style.position = 'relative';
      }

      rawDetectedList.forEach((qr) => {
        let entry = activeEntries.get(qr.value);

        if (!entry) {
          const nodes = createOverlayNode(mountPoint);
          entry = {
            ...nodes,
            qrData: qr,
            lastSeen: now
          };

          const isURL = /^https?:\/\//i.test(qr.value);
          entry.badge.href = isURL ? qr.value : `https://www.google.com/search?q=${encodeURIComponent(qr.value)}`;

          let displayText = qr.value;
          if (isURL) {
            try {
              displayText = new URL(qr.value).hostname;
            } catch (_) {}
          }
          if (entry.textEl) entry.textEl.textContent = displayText;

          activeEntries.set(qr.value, entry);
        } else {
          entry.lastSeen = now;
          entry.qrData = qr;
        }
      });

      updateOverlaysPosition();
    }

    function processFrame() {
      isLoopScheduled = false;

      if (!isScannerEnabled || !video.isConnected) {
        if (!video.isConnected) activeUpdaters.delete(updateOverlaysPosition);
        return;
      }

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        if (!video.paused) scheduleNextFrame();
        return;
      }

      const now = performance.now();
      if (now - lastScanTime >= SCAN_INTERVAL) {
        lastScanTime = now;

        const scale = Math.min(1, 640 / video.videoWidth);
        const targetWidth = Math.max(1, Math.floor(video.videoWidth * scale));
        const targetHeight = Math.max(1, Math.floor(video.videoHeight * scale));

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
        }

        try {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

          const foundQRs = [];
          for (let i = 0; i < MAX_QR_COUNT; i++) {
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth'
            });

            if (!code || !code.data) break;

            const points = [
              code.location.topLeftCorner,
              code.location.topRightCorner,
              code.location.bottomRightCorner,
              code.location.bottomLeftCorner
            ];

            const minX = Math.min(...points.map((p) => p.x));
            const maxX = Math.max(...points.map((p) => p.x));
            const minY = Math.min(...points.map((p) => p.y));
            const maxY = Math.max(...points.map((p) => p.y));

            foundQRs.push({
              value: code.data.trim(),
              minX,
              maxX,
              minY,
              maxY,
              frameWidth: targetWidth,
              frameHeight: targetHeight
            });

            ctx.fillStyle = '#808080';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            ctx.lineTo(points[2].x, points[2].y);
            ctx.lineTo(points[3].x, points[3].y);
            ctx.closePath();
            ctx.fill();
            ctx.fillRect(minX - 4, minY - 4, (maxX - minX) + 8, (maxY - minY) + 8);
          }

          if (foundQRs.length > 0) {
            updateDetectedQRs(foundQRs);
          } else {
            updateOverlaysPosition();
          }
        } catch (err) {
          // Если стрим заблокирован CORS политикой
          console.warn('[QR Detector] Ошибка чтения кадра (проверьте rules.json):', err);
        }
      } else {
        updateOverlaysPosition();
      }

      if (!video.paused) {
        scheduleNextFrame();
      }
    }

    function scheduleNextFrame() {
      if (isLoopScheduled) return;
      isLoopScheduled = true;

      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => processFrame());
      } else {
        requestAnimationFrame(() => processFrame());
      }
    }

    video.addEventListener('pause', () => updateOverlaysPosition());
    video.addEventListener('play', () => scheduleNextFrame());
    video.addEventListener('seeked', () => processFrame());
    video.addEventListener('ended', () => updateOverlaysPosition());

    const resizeObserver = new ResizeObserver(() => updateOverlaysPosition());
    resizeObserver.observe(video);

    scheduleNextFrame();
  }

  function findVideosDeep(root = document) {
    const videos = [];
    const elements = root.querySelectorAll('*');
    for (const el of elements) {
      if (el.tagName === 'VIDEO') {
        videos.push(el);
      } else if (el.shadowRoot) {
        videos.push(...findVideosDeep(el.shadowRoot));
      }
    }
    return videos;
  }

  function scanAllVideos() {
    const list = findVideosDeep(document);
    list.forEach(trackVideo);
  }

  setInterval(scanAllVideos, 1000);

  window.addEventListener('resize', () => activeUpdaters.forEach((cb) => cb()), { passive: true });
  window.addEventListener('scroll', () => activeUpdaters.forEach((cb) => cb()), { passive: true, capture: true });
  document.addEventListener('fullscreenchange', () => activeUpdaters.forEach((cb) => cb()));

  scanAllVideos();
  const domObserver = new MutationObserver(scanAllVideos);
  domObserver.observe(document.documentElement, { childList: true, subtree: true });
})();