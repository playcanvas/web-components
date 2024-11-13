export function setupCodePanel() {
    const codePanel = document.getElementById('code-panel');
    const sourceCode = document.getElementById('source-code');

    function toggleCode() {
        const isVisible = codePanel.style.display === 'block';
        codePanel.style.display = isVisible ? 'none' : 'block';
        document.getElementById('overlay').style.display = isVisible ? 'none' : 'block';
    }

    document.querySelector('.controls button').onclick = toggleCode;
    
    document.getElementById('overlay').addEventListener('click', () => {
        codePanel.style.display = 'none';
        document.getElementById('overlay').style.display = 'none';
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && codePanel.style.display === 'block') {
            codePanel.style.display = 'none';
        }
    });

    return { codePanel, sourceCode };
} 