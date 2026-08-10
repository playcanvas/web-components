import { examples } from './example-list.mjs';

/**
 * Owns the URL and history: hash updates on navigation, and back/forward (popstate) validation.
 * All UI syncing is delegated to the callback, which is the single active-state codepath.
 * @param {(path: string) => void} onNavigate - Called with a valid example path to activate.
 * @returns {{ updateURL: (path: string, replace?: boolean) => void }} The URL updater.
 */
export function setupNavigation(onNavigate) {
    function updateURL(path, replace = false) {
        if (replace) {
            history.replaceState(null, '', `#${path}`);
        } else {
            history.pushState(null, '', `#${path}`);
        }
    }

    window.addEventListener('popstate', () => {
        const hash = window.location.hash.slice(1);
        if (hash && examples.some((ex) => ex.path === hash)) {
            onNavigate(hash);
        }
    });

    return { updateURL };
}
