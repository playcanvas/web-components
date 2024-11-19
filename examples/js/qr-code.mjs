export function showQRCode(path) {
    const qr = window.qrcode(0, 'L');
    const url = `${window.location.origin}${window.location.pathname}${path}`;
    qr.addData(url);
    qr.make();

    const modal = document.getElementById('qr-modal');
    const qrDiv = document.getElementById('qr-code');
    qrDiv.innerHTML = qr.createImgTag(4);

    // Add click handler to close on backdrop click
    modal.addEventListener('click', (e) => {
        const rect = modal.getBoundingClientRect();
        const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
        if (!isInDialog) {
            modal.close();
        }
    });

    modal.showModal();
}
