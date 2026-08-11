/** Covers the 0.2s opacity transition; jsdom never fires transitionend, so removal is timed. */
const REMOVAL_DELAY_MS = 250;

/**
 * The slim progress bar `<pc-app>` shows while it boots and preloads. An implementation detail of
 * AppElement rather than a custom element, so its shape can change without a breaking change.
 *
 * All styling is inline, so the library injects no stylesheet. The colors and height resolve CSS
 * custom properties — `--pc-loading-bar-color`, `--pc-loading-bar-background` and
 * `--pc-loading-bar-height` — so a page can theme the bar from `pc-app` or `:root`.
 * @internal
 */
export class LoadingBar {
    private _track: HTMLDivElement;

    private _fill: HTMLDivElement;

    private _sweep: Animation | null = null;

    private _removal: ReturnType<typeof setTimeout> | null = null;

    /**
     * Creates the bar and appends it to `parent`, starting in the indeterminate state.
     * @param parent - The element to append the bar to.
     */
    constructor(parent: HTMLElement) {
        this._track = document.createElement('div');
        this._track.setAttribute('role', 'progressbar');
        this._track.setAttribute('aria-label', 'Loading');
        this._track.setAttribute('aria-valuemin', '0');
        this._track.setAttribute('aria-valuemax', '100');
        // Anchored to the pc-app element, which the library's base styles make a positioned box
        this._track.style.cssText = [
            'position: absolute',
            'top: 0',
            'left: 0',
            'width: 100%',
            'height: var(--pc-loading-bar-height, 3px)',
            'background: var(--pc-loading-bar-background, rgba(0, 0, 0, 0.1))',
            'z-index: 10000',
            'pointer-events: none',
            'opacity: 1',
            'transition: opacity 0.2s ease'
        ].join('; ');

        this._fill = document.createElement('div');
        this._fill.style.cssText = [
            'width: 100%',
            'height: 100%',
            'transform-origin: left center',
            'transform: scaleX(0)',
            'background: var(--pc-loading-bar-color, #f60)',
            'transition: transform 0.2s ease'
        ].join('; ');

        this._track.appendChild(this._fill);
        parent.appendChild(this._track);

        // Indeterminate sweep until the first progress() call reports a real total. No
        // aria-valuenow is set, which is what marks a progressbar indeterminate. jsdom has no Web
        // Animations API, so the guard degrades to a static bar there rather than crashing boot.
        if (typeof this._fill.animate === 'function') {
            this._sweep = this._fill.animate(
                [{ transform: 'scaleX(0.25) translateX(-100%)' }, { transform: 'scaleX(0.25) translateX(500%)' }],
                {
                    duration: 1000,
                    iterations: Infinity,
                    easing: 'ease-in-out'
                }
            );
        }
    }

    /**
     * Reflects preload progress, switching the bar from indeterminate to determinate on the first
     * call.
     * @param loaded - The number of assets that have finished loading.
     * @param total - The number of assets being preloaded.
     */
    progress(loaded: number, total: number) {
        if (this._sweep) {
            this._sweep.cancel();
            this._sweep = null;
        }
        const fraction = total === 0 ? 1 : loaded / total;
        this._track.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
        this._fill.style.transform = `scaleX(${fraction})`;
    }

    /**
     * Fills the bar, fades it out and removes it. Idempotent.
     */
    complete() {
        if (this._removal !== null) {
            return;
        }
        if (this._sweep) {
            this._sweep.cancel();
            this._sweep = null;
        }
        this._track.setAttribute('aria-valuenow', '100');
        this._fill.style.transform = 'scaleX(1)';
        this._track.style.opacity = '0';
        this._removal = setTimeout(() => this._track.remove(), REMOVAL_DELAY_MS);
    }

    /**
     * Removes the bar immediately, cancelling any pending fade. Idempotent.
     */
    destroy() {
        if (this._sweep) {
            this._sweep.cancel();
            this._sweep = null;
        }
        if (this._removal !== null) {
            clearTimeout(this._removal);
            this._removal = null;
        }
        this._track.remove();
    }
}
