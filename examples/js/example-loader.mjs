export function loadExample(frame, sourceCode, codePanel, prism) {
    return async (path) => {
        frame.src = path;
    };
}
