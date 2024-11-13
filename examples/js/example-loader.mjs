export function loadExample(frame, sourceCode, codePanel, prism) {
    return async (path) => {
        frame.src = path;
        const response = await fetch(path);
        const code = await response.text();
        sourceCode.textContent = code;
        prism.highlightElement(sourceCode);
        codePanel.style.display = 'none';
    };
}
