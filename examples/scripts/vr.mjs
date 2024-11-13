document.addEventListener('DOMContentLoaded', async () => {
    const camera = await document.querySelector('pc-camera').ready();

    if (camera.xrAvailable) {
        const button = document.createElement('button');
        button.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 48 48">
                <path d="M30,34 L26,30 L22,30 L18,34 L14,34 C11.7908610,34 10,32.2091390 10,30 L10,18 C10,15.7908610 11.7908610,14 14,14 L34,14 C36.2091390,14 38,15.7908610 38,18 L38,30 C38,32.2091390 36.2091390,34 34,34 L30,34 Z M44,28 C44,29.1045694 43.1045694,30 42,30 C40.8954306,30 40,29.1045694 40,28 L40,20 C40,18.8954305 40.8954306,18 42,18 C43.1045694,18 44,18.8954305 44,20 L44,28 Z M8,28 C8,29.1045694 7.10456940,30 6,30 C4.89543060,30 4,29.1045694 4,28 L4,20 C4,18.8954305 4.89543060,18 6,18 C7.10456940,18 8,18.8954305 8,20 L8,28 Z" id="Shape" fill="currentColor">
            </svg>
            Enter VR
        `;
        
        Object.assign(button.style, {
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            padding: '4px 8px',
            background: '#f5f5f5',
            color: '#333',
            border: 'none',
            borderRadius: '4px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none'
        });

        // Add hover effect
        button.onmouseenter = () => {
            Object.assign(button.style, {
                background: '#ffe0cc'
            });
        };

        button.onmouseleave = () => {
            Object.assign(button.style, {
                background: '#f5f5f5'
            });
        };

        // Add active state
        button.onclick = () => {
            button.style.background = '#ff8533';
            button.style.color = 'white';
            camera.startXr('immersive-vr', 'local-floor');
        };

        document.body.appendChild(button);

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                camera.endXr();
                // Reset button style
                button.style.background = '#f5f5f5';
                button.style.color = '#333';
            }
        });
    }
});
