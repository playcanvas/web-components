// Add VR support
document.addEventListener('DOMContentLoaded', async () => {
    const camera = await document.querySelector('pc-camera').ready();

    if (camera.xrAvailable) {
        const button = document.createElement('button');
        button.textContent = 'Enter VR';
        button.style.position = 'absolute';
        button.style.bottom = '20px';
        button.style.right = '20px';
        document.body.appendChild(button);

        button.addEventListener('click', () => {
            camera.startXr('immersive-vr', 'local-floor');
        });

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                camera.endXr();
            }
        });
    }
});
