export function showQRCode(path) {
    const qr = window.qrcode(0, 'L');
    const url = `${window.location.origin}${window.location.pathname}${path}`;
    qr.addData(url);
    qr.make();

    const modal = document.getElementById('qr-modal');
    const qrDiv = document.getElementById('qr-code');
    qrDiv.innerHTML = qr.createImgTag(4);
    modal.showModal();
}
