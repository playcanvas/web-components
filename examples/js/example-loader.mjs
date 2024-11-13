export function loadExample(frame, sourceCode, codePanel) {
    async function load(path) {
        frame.src = path;
        const response = await fetch(path);
        const code = await response.text();
        sourceCode.textContent = code;
        Prism.highlightElement(sourceCode);
        codePanel.style.display = 'none';
    }
    return load;
}
