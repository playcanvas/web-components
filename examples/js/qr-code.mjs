export function showQRCode(path) {
    const modal = document.getElementById('qr-modal');
    const qrContainer = document.getElementById('qr-code');
    const url = `${window.location.origin}${window.location.pathname.replace('index.html', '')}${path}`;
    
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    qrContainer.innerHTML = qr.createImgTag(5);
    
    modal.style.display = 'flex';
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            modal.style.display = 'none';
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
} 