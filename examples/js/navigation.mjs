import { examples } from './examples.mjs';

export function setupNavigation(loadExample) {
    function updateURL(path) {
        history.pushState(null, '', `#${path}`);
    }

    window.addEventListener('popstate', () => {
        const hash = window.location.hash.slice(1);
        if (hash && examples.some(ex => ex.path === hash)) {
            loadExample(hash);
            document.querySelectorAll('.example-link').forEach((link) => {
                link.classList.toggle('active', link.getAttribute('href') === `#${hash}`);
            });
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const links = Array.from(document.querySelectorAll('.example-link'));
            const currentIndex = links.findIndex(link => link.classList.contains('active'));
            const nextIndex = e.key === 'ArrowUp' ?
                Math.max(0, currentIndex - 1) :
                Math.min(links.length - 1, currentIndex + 1);

            links[nextIndex].click();
        }
    });

    return { updateURL };
}
