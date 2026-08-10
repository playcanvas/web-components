import { examples } from './example-list.mjs';
import { setupNavigation } from './navigation.mjs';
import { showQRCode } from './qr-code.mjs';

const QR_ICON = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
    </svg>`;

const OPEN_ICON = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>`;

/** How long a hung example may keep the shell in its loading state. */
const LOAD_TIMEOUT_MS = 10000;

class ExampleBrowser {
    constructor() {
        this.main = document.querySelector('.main');
        this.frame = document.getElementById('example-frame');
        this.exampleList = document.getElementById('example-list');
        this.searchInput = document.getElementById('search-input');
        this.searchCount = document.querySelector('.search-count');
        this.searchClear = document.querySelector('.search-clear');
        this.menuToggle = document.querySelector('.menu-toggle');
        this.sidebar = document.getElementById('sidebar');
        this.overlay = document.querySelector('.sidebar-overlay');
        this.exampleTitle = document.getElementById('example-title');
        this.exampleCategory = document.getElementById('example-category');
        this.exampleName = document.getElementById('example-name');
        this.prevButton = document.getElementById('prev-example');
        this.nextButton = document.getElementById('next-example');
        this.qrButton = document.getElementById('title-qr-button');
        this.standaloneLink = document.getElementById('standalone-link');

        this.activePath = null;
        this.loadTimeout = null;

        // Per-example render state used by the search filter and prev/next navigation
        this.entries = [];

        // Fires for every cross-document navigation in the frame, including those driven by
        // contentWindow.location.replace()
        this.frame.addEventListener('load', () => this.endLoading());

        this.updateURL = setupNavigation((path) => {
            this.loadExample(path);
            this.setActiveExample(path);
        }).updateURL;

        this.createExampleList();
        this.setupSearch();
        this.setupTitleBar();
        this.setupKeyboard();
        this.setupMobileMenu();
        this.loadInitialExample();
    }

    loadExample(path) {
        this.beginLoading();
        // Use location.replace() rather than setting the iframe's src: it swaps the iframe's
        // history entry instead of pushing a new one, so browser back/forward only steps through
        // the hash entries
        this.frame.contentWindow.location.replace(new URL(path, window.location.href));
    }

    beginLoading() {
        clearTimeout(this.loadTimeout);
        this.main.classList.add('loading');
        // A hung example must never leave the shell dimmed; a later 'load' is harmless
        this.loadTimeout = setTimeout(() => this.endLoading(), LOAD_TIMEOUT_MS);
    }

    endLoading() {
        clearTimeout(this.loadTimeout);
        this.main.classList.remove('loading');
    }

    createExampleList() {
        // Group examples by category, preserving first-occurrence order
        const categories = new Map();
        examples.forEach((example) => {
            if (!categories.has(example.category)) {
                categories.set(example.category, []);
            }
            categories.get(example.category).push(example);
        });

        categories.forEach((categoryExamples, category) => {
            const section = document.createElement('section');
            section.className = 'category';

            const title = document.createElement('h3');
            title.className = 'category-title';
            title.textContent = category;
            section.appendChild(title);

            const list = document.createElement('ul');
            list.className = 'category-list';

            categoryExamples.forEach((example) => {
                const { row, link } = this.createExampleRow(example);
                list.appendChild(row);
                this.entries.push({
                    example,
                    row,
                    link,
                    searchText: `${example.name} ${example.category}`.toLowerCase()
                });
            });

            section.appendChild(list);
            this.exampleList.appendChild(section);
        });

        this.noResults = document.createElement('p');
        this.noResults.className = 'no-results';
        this.noResults.setAttribute('role', 'status');
        this.noResults.textContent = 'No examples found';
        this.noResults.hidden = true;
        this.exampleList.appendChild(this.noResults);
    }

    createExampleRow(example) {
        const row = document.createElement('li');
        row.className = 'example-row';

        // The row's actions are siblings of the anchor, never children - interactive elements
        // must not nest. The anchor stretches over the whole row via CSS.
        const link = document.createElement('a');
        link.className = 'example-link';
        link.href = `#${example.path}`;
        link.textContent = example.name;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadExample(example.path);
            this.updateURL(example.path);
            this.setActiveExample(example.path);
            this.setMobileMenu(false);
        });
        row.appendChild(link);

        const actions = document.createElement('div');
        actions.className = 'row-actions';

        const qrButton = document.createElement('button');
        qrButton.type = 'button';
        qrButton.className = 'row-action';
        qrButton.setAttribute('aria-label', `Show QR code for ${example.name}`);
        qrButton.title = 'View QR code for mobile';
        qrButton.innerHTML = QR_ICON;
        qrButton.addEventListener('click', () => showQRCode(example.path, example.name));
        actions.appendChild(qrButton);

        const openLink = document.createElement('a');
        openLink.className = 'row-action';
        openLink.href = example.path;
        openLink.target = '_blank';
        openLink.rel = 'noopener';
        openLink.setAttribute('aria-label', `Open ${example.name} in a new tab`);
        openLink.title = 'Open in new tab';
        openLink.innerHTML = OPEN_ICON;
        actions.appendChild(openLink);

        row.appendChild(actions);

        return { row, link };
    }

    /**
     * The single place all active-example UI syncs: sidebar row, title bar, document title,
     * iframe title and the standalone link. Called from row clicks, prev/next, popstate and the
     * initial load.
     * @param {string} path - The path of the example to mark active.
     */
    setActiveExample(path) {
        this.activePath = path;
        const example = examples.find((ex) => ex.path === path);

        this.entries.forEach(({ example: ex, row, link }) => {
            const active = ex.path === path;
            row.classList.toggle('active', active);
            if (active) {
                link.setAttribute('aria-current', 'page');
                link.scrollIntoView({ block: 'nearest' });
            } else {
                link.removeAttribute('aria-current');
            }
        });

        this.exampleCategory.textContent = example?.category ?? '';
        this.exampleName.textContent = example?.name ?? '';
        this.frame.title = example ? `Example: ${example.name}` : 'Example';
        this.standaloneLink.href = example?.path ?? '#';
        if (example) {
            document.title = `${example.name} - PlayCanvas Web Components Examples`;
        }

        this.updatePrevNextState();
    }

    /** @returns {Array<object>} The entries not hidden by the search filter, in list order. */
    visibleEntries() {
        return this.entries.filter(({ row }) => !row.classList.contains('hidden'));
    }

    /**
     * Navigates to the previous or next visible example. No wrap-around. When the active example
     * is itself filtered out, forward enters the visible list at its start and backward at its
     * end.
     * @param {number} step - `-1` for previous, `1` for next.
     */
    navigateExample(step) {
        const visible = this.visibleEntries();
        if (visible.length === 0) {
            return;
        }

        const index = visible.findIndex(({ example }) => example.path === this.activePath);
        let target;
        if (index === -1) {
            target = step > 0 ? 0 : visible.length - 1;
        } else {
            target = index + step;
            if (target < 0 || target >= visible.length) {
                return;
            }
        }

        const { example } = visible[target];
        this.loadExample(example.path);
        this.updateURL(example.path);
        this.setActiveExample(example.path);
    }

    updatePrevNextState() {
        const visible = this.visibleEntries();
        const index = visible.findIndex(({ example }) => example.path === this.activePath);

        this.prevButton.disabled = visible.length === 0 || index === 0;
        this.nextButton.disabled = visible.length === 0 || index === visible.length - 1;

        // Never strand keyboard focus on a control that just disabled itself
        if (this.prevButton.disabled && document.activeElement === this.prevButton) {
            (this.nextButton.disabled ? this.exampleTitle : this.nextButton).focus();
        } else if (this.nextButton.disabled && document.activeElement === this.nextButton) {
            (this.prevButton.disabled ? this.exampleTitle : this.prevButton).focus();
        }
    }

    setupTitleBar() {
        this.prevButton.addEventListener('click', () => this.navigateExample(-1));
        this.nextButton.addEventListener('click', () => this.navigateExample(1));
        this.qrButton.addEventListener('click', () => {
            const example = examples.find((ex) => ex.path === this.activePath);
            if (example) {
                showQRCode(example.path, example.name);
            }
        });
    }

    setupSearch() {
        this.searchInput.addEventListener('input', () => {
            this.filterExamples(this.searchInput.value);
        });

        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // preventDefault marks the key as handled, so the document-level handler does
                // not also close the mobile drawer - dismissal is layered, innermost first
                e.preventDefault();
                if (this.searchInput.value) {
                    this.searchInput.value = '';
                    this.filterExamples('');
                } else {
                    this.searchInput.blur();
                }
            } else if (e.key === 'Enter') {
                this.exampleList.querySelector('.example-row:not(.hidden) .example-link')?.click();
            }
        });

        this.searchClear.addEventListener('click', () => {
            this.searchInput.value = '';
            this.filterExamples('');
            this.searchInput.focus();
        });
    }

    filterExamples(query) {
        const q = query.trim().toLowerCase();
        let visible = 0;

        this.entries.forEach(({ row, searchText }) => {
            const match = q === '' || searchText.includes(q);
            row.classList.toggle('hidden', !match);
            if (match) visible++;
        });

        this.exampleList.querySelectorAll('.category').forEach((section) => {
            section.classList.toggle('hidden', !section.querySelector('.example-row:not(.hidden)'));
        });

        this.noResults.hidden = visible > 0;
        this.searchCount.textContent = q === '' ? '' : `${visible}/${this.entries.length}`;
        this.updatePrevNextState();
    }

    setupKeyboard() {
        // These shortcuts live on the shell document: once focus is inside the iframe, keys go
        // to the example (which may legitimately consume them) until focus returns to the shell.
        document.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) {
                return;
            }

            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                // Deliberately active while the search input is focused: filter-then-arrow is
                // the established affordance
                e.preventDefault();
                this.navigateExample(e.key === 'ArrowUp' ? -1 : 1);
            } else if (e.key === '[' || e.key === ']') {
                if (e.target instanceof Element && e.target.closest('input, textarea, select')) {
                    return;
                }
                e.preventDefault();
                this.navigateExample(e.key === '[' ? -1 : 1);
            } else if (e.key === '/' && document.activeElement !== this.searchInput) {
                e.preventDefault();
                this.searchInput.focus();
                this.searchInput.select();
            } else if (e.key === 'Escape' && this.sidebar.classList.contains('open')) {
                this.setMobileMenu(false);
                this.menuToggle.focus();
            }
        });
    }

    loadInitialExample() {
        if (examples.length === 0) {
            return;
        }
        const hash = window.location.hash.slice(1);
        const initial = examples.find((ex) => ex.path === hash) ?? examples[0];
        if (initial.path !== hash) {
            this.updateURL(initial.path, true);
        }
        this.loadExample(initial.path);
        this.setActiveExample(initial.path);
    }

    setMobileMenu(open) {
        this.sidebar.classList.toggle('open', open);
        this.overlay.classList.toggle('open', open);
        this.menuToggle.setAttribute('aria-expanded', String(open));
        this.syncSidebarInert();
        if (open) {
            // Focus the drawer itself rather than the search input, which would pop the soft
            // keyboard
            this.sidebar.focus();
        }
    }

    /**
     * The closed drawer is only translated offscreen, so without `inert` it would still be
     * tabbable - keyboard and AT users would traverse an invisible sidebar.
     */
    syncSidebarInert() {
        this.sidebar.inert = this.mobileQuery.matches && !this.sidebar.classList.contains('open');
    }

    setupMobileMenu() {
        this.mobileQuery = window.matchMedia('(max-width: 768px)');

        this.menuToggle.addEventListener('click', () => {
            this.setMobileMenu(!this.sidebar.classList.contains('open'));
        });
        this.overlay.addEventListener('click', () => this.setMobileMenu(false));

        this.mobileQuery.addEventListener('change', () => {
            if (this.mobileQuery.matches) {
                this.syncSidebarInert();
            } else {
                this.setMobileMenu(false);
            }
        });

        // Initial sync of aria-expanded and inert
        this.setMobileMenu(false);
    }
}

// Initialize the browser when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ExampleBrowser();
});
