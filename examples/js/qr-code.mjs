/**
 * The QR generator is loaded on first use rather than with the page: the modal is a rarely-used
 * feature and the library was previously a render-blocking classic script. The pinned /+esm
 * bundle's default export is the same factory the classic build exposed as a global. (SRI is not
 * possible on jsdelivr's /+esm bundles; if it ever becomes a requirement, switch to injecting
 * the static qrcode.min.js with an integrity attribute.)
 */
const QR_LIB_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';

let qrcodePromise = null;
let modalWired = false;

function loadLibrary() {
    if (!qrcodePromise) {
        qrcodePromise = import(QR_LIB_URL).then(
            (module) => module.default,
            (error) => {
                // Drop the failed attempt so the next click retries
                qrcodePromise = null;
                throw error;
            }
        );
    }
    return qrcodePromise;
}

function wireModal(modal) {
    if (modalWired) {
        return;
    }
    modalWired = true;

    modal.querySelector('.qr-modal-close').addEventListener('click', () => modal.close());

    // Close on backdrop click: a click outside the dialog's own rectangle can only be the
    // backdrop, which browsers report with the dialog itself as the target
    modal.addEventListener('click', (e) => {
        const rect = modal.getBoundingClientRect();
        const isInDialog =
            rect.top <= e.clientY &&
            e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX &&
            e.clientX <= rect.left + rect.width;
        if (!isInDialog) {
            modal.close();
        }
    });
}

/**
 * Shows the QR modal for an example. The modal opens immediately with a pending state; the
 * generator library loads on first use.
 * @param {string} path - The example's path, resolved against the current page's URL.
 * @param {string} name - The example's display name, shown as the dialog heading.
 */
export async function showQRCode(path, name) {
    const modal = document.getElementById('qr-modal');
    const title = document.getElementById('qr-modal-title');
    const qrDiv = document.getElementById('qr-code');
    wireModal(modal);

    title.textContent = name;
    qrDiv.textContent = 'Generating…';
    modal.showModal();

    try {
        const qrcode = await loadLibrary();
        if (!modal.open) {
            return; // closed while the library was loading
        }
        // Resolved against the page URL rather than concatenated: the shell is also reachable
        // as .../index.html (the PWA's start_url), where concatenation would corrupt the URL
        const url = new URL(path, window.location.href).href;
        const qr = qrcode(0, 'L');
        qr.addData(url);
        qr.make();
        qrDiv.innerHTML = qr.createImgTag(4, undefined, `QR code linking to ${url}`);
    } catch {
        if (modal.open) {
            qrDiv.textContent = 'Could not load the QR code generator. Check your connection and try again.';
        }
    }
}
