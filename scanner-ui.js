// Barcode scanner. Tap the Scan button → camera modal opens → first barcode
// detected is fed into the search input, which highlights + jumps.
// Uses the native BarcodeDetector API where available (Chrome/Edge/Android).
// On Safari/iOS the button still works — falls back to a typed input prompt
// so warehouse staff can read the code off the label and key it in.
(() => {
  const wrap = document.querySelector('.search-field');
  if (!wrap) return;

  const supportsDetector =
    typeof window.BarcodeDetector !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function';

  // --- Scan button slot in the search field --------------------------------
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'scanButton';
  btn.className = 'scan-button';
  btn.setAttribute('aria-label', 'Scan a barcode');
  btn.title = supportsDetector ? 'Scan a barcode' : 'Type a barcode (camera scan needs Chrome)';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
      <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
      <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <path d="M7 8h0"/>
      <path d="M7 12h0"/>
      <path d="M7 16h0"/>
      <path d="M11 8v8"/>
      <path d="M15 8v8"/>
      <path d="M19 8v8"/>
    </svg>
  `;
  wrap.appendChild(btn);

  btn.addEventListener('click', openScanner);

  // --- Helpers --------------------------------------------------------------
  function deliverCode(rawValue) {
    if (!rawValue) return;
    const value = String(rawValue).trim();
    if (!value) return;

    // First try to map a numeric/barcode value to a SKU via the index baked
    // into /api/inventory. If no map hit, just feed the raw value to search.
    const map = window.WAREHOUSE_DATA?.barcodeToSku || {};
    const resolved = map[value] || value;

    const input = document.getElementById('globalSearch');
    if (!input) return;
    input.value = resolved;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Auto-pick first result by pressing Enter after the debounce.
    setTimeout(() => {
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      input.dispatchEvent(enter);
    }, 160);
  }

  // --- Camera scanner -------------------------------------------------------
  let activeStream = null;
  let detectorLoop = null;

  async function openScanner() {
    if (!supportsDetector) {
      // Manual entry fallback so the button still does something useful.
      const value = window.prompt('Barcode (paste from another scanner or type the SKU):');
      if (value) deliverCode(value);
      return;
    }

    const formats = await safeFormats();
    const detector = new window.BarcodeDetector({ formats });

    const dialog = document.createElement('div');
    dialog.className = 'scanner-modal';
    dialog.innerHTML = `
      <div class="scanner-modal__backdrop" data-close></div>
      <div class="scanner-modal__panel">
        <button type="button" class="scanner-modal__close" data-close aria-label="Close scanner">×</button>
        <h2 class="scanner-modal__title">Scan a barcode</h2>
        <p class="scanner-modal__hint">Hold a SKU or location barcode in the frame.</p>
        <div class="scanner-modal__video-wrap">
          <video autoplay playsinline muted></video>
          <div class="scanner-modal__reticle"></div>
        </div>
        <div class="scanner-modal__status">Starting camera…</div>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeScanner();
    });
    const video = dialog.querySelector('video');
    const statusEl = dialog.querySelector('.scanner-modal__status');

    function closeScanner() {
      if (detectorLoop) {
        cancelAnimationFrame(detectorLoop);
        detectorLoop = null;
      }
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
      }
      dialog.remove();
    }
    dialog.dataset.escListener = '1';
    const onKey = (e) => {
      if (e.key === 'Escape') closeScanner();
    };
    document.addEventListener('keydown', onKey, { once: true });

    try {
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      video.srcObject = activeStream;
      await video.play();
      statusEl.textContent = 'Looking for a barcode…';

      let lastHit = 0;
      const tick = async () => {
        if (!activeStream) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            const now = Date.now();
            if (now - lastHit > 600) {
              lastHit = now;
              const value = barcodes[0].rawValue;
              statusEl.textContent = `Detected: ${value}`;
              closeScanner();
              deliverCode(value);
              return;
            }
          }
        } catch (_) {
          // detector throws on bad frames — ignore
        }
        detectorLoop = requestAnimationFrame(tick);
      };
      detectorLoop = requestAnimationFrame(tick);
    } catch (err) {
      statusEl.textContent = `Camera access failed: ${err.message}`;
      console.warn('[scanner] camera failed:', err);
    }
  }

  async function safeFormats() {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const useful = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'];
      const intersection = useful.filter((f) => supported.includes(f));
      return intersection.length ? intersection : supported;
    } catch (_) {
      return ['code_128', 'qr_code'];
    }
  }
})();
