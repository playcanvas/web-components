// Loading/error presentation lives in the DOM; the scene script owns gameplay state.
const appElement = document.querySelector('pc-app');
const button = document.getElementById('observatory-resume');
const hint = document.getElementById('observatory-hint');
let failed = false;

appElement.addEventListener('progress', (event) => {
    if (!failed && event.lengthComputable) {
        const percent = event.total ? Math.round((100 * event.loaded) / event.total) : 100;
        hint.textContent = `Preparing the observatory… ${percent}%`;
    }
});
appElement.addEventListener(
    'error',
    () => {
        failed = true;
        document.querySelector('.observatory-ui').dataset.state = 'error';
        button.hidden = false;
        button.textContent = 'Try again →';
        hint.textContent = 'The observatory could not be loaded.';
    },
    true
);
button.addEventListener('click', () => {
    if (failed) location.reload();
});
