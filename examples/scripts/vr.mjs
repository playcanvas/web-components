// Add VR support
document.addEventListener('DOMContentLoaded', async () => {
    const camera = await document.querySelector('pc-camera').ready();

    if (camera.xrAvailable) {
        const button = document.getElementById('xr-button');
        button.style.display = 'block';

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
