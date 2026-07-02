import { examples } from './example-list.mjs';
import { setupNavigation } from './navigation.mjs';
import { showQRCode } from './qr-code.mjs';

class ExampleBrowser {
    constructor() {
        this.frame = document.getElementById('example-frame');
        this.exampleList = document.getElementById('example-list');
        this.searchInput = document.getElementById('search-input');
        this.menuToggle = document.querySelector('.menu-toggle');
        this.sidebar = document.querySelector('.sidebar');
        this.overlay = document.querySelector('.sidebar-overlay');

        // Per-example render state used by the search filter
        this.entries = [];

        this.setupNavigation();
        this.createExampleList();
        this.setupSearch();
        this.loadInitialExample();
        this.setupMobileMenu();
    }

    setupNavigation() {
        this.updateURL = setupNavigation(path => this.loadExample(path)).updateURL;
    }

    loadExample(path) {
        // Use location.replace() rather than setting the iframe's src: it
        // swaps the iframe's history entry instead of pushing a new one, so
        // browser back/forward only steps through the hash entries
        this.frame.contentWindow.location.replace(new URL(path, window.location.href));
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

            categoryExamples.forEach((example) => {
                const link = this.createExampleLink(example);
                section.appendChild(link);
                this.entries.push({
                    link,
                    searchText: `${example.name} ${example.category}`.toLowerCase()
                });
            });

            this.exampleList.appendChild(section);
        });

        this.noResults = document.createElement('p');
        this.noResults.className = 'no-results';
        this.noResults.textContent = 'No examples found';
        this.noResults.hidden = true;
        this.exampleList.appendChild(this.noResults);
    }

    createExampleLink(example) {
        const link = document.createElement('a');
        link.href = `#${example.path}`;
        link.className = 'example-link';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = example.name;
        link.appendChild(nameSpan);

        const buttonContainer = this.createButtonContainer(example);
        link.appendChild(buttonContainer);

        link.onclick = e => this.handleExampleClick(e, example, link);

        return link;
    }

    createButtonContainer(example) {
        const container = document.createElement('div');
        container.className = 'link-buttons';

        container.appendChild(this.createQRButton(example));
        container.appendChild(this.createOpenInNewButton(example));

        return container;
    }

    createQRButton(example) {
        const button = document.createElement('button');
        button.className = 'qr-button';
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
            </svg>`;
        button.title = 'View QR code for mobile';
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showQRCode(example.path);
        };
        return button;
    }

    createOpenInNewButton(example) {
        const button = document.createElement('button');
        button.className = 'open-in-new';
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>`;
        button.title = 'Open in new tab';
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(example.path, '_blank');
        };
        return button;
    }

    handleExampleClick(e, example, link) {
        if (e.target.className !== 'open-in-new') {
            e.preventDefault();
            this.loadExample(example.path);
            this.updateURL(example.path);
            document.querySelectorAll('.example-link')
            .forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        }
    }

    setupSearch() {
        this.searchInput.addEventListener('input', () => {
            this.filterExamples(this.searchInput.value);
        });

        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.searchInput.value) {
                    this.searchInput.value = '';
                    this.filterExamples('');
                } else {
                    this.searchInput.blur();
                }
            } else if (e.key === 'Enter') {
                this.exampleList.querySelector('.example-link:not(.hidden)')?.click();
            }
        });

        // Press / anywhere to focus the search box
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== this.searchInput) {
                e.preventDefault();
                this.searchInput.focus();
                this.searchInput.select();
            }
        });
    }

    filterExamples(query) {
        const q = query.trim().toLowerCase();
        let visible = 0;

        this.entries.forEach(({ link, searchText }) => {
            const match = q === '' || searchText.includes(q);
            link.classList.toggle('hidden', !match);
            if (match) visible++;
        });

        this.exampleList.querySelectorAll('.category').forEach((section) => {
            section.classList.toggle('hidden', !section.querySelector('.example-link:not(.hidden)'));
        });

        this.noResults.hidden = visible > 0;
    }

    loadInitialExample() {
        if (examples.length > 0) {
            const hash = window.location.hash.slice(1);
            if (hash && examples.some(ex => ex.path === hash)) {
                this.loadExample(hash);
                document.querySelector(`a[href="#${hash}"]`)?.classList.add('active');
            } else {
                this.loadExample(examples[0].path);
                this.updateURL(examples[0].path, true);
                this.exampleList.querySelector('.example-link')?.classList.add('active');
            }
        }
    }

    setupMobileMenu() {
        const toggleMenu = () => {
            this.sidebar.classList.toggle('open');
            this.overlay.classList.toggle('open');
        };

        this.menuToggle.addEventListener('click', toggleMenu);
        this.overlay.addEventListener('click', toggleMenu);

        document.querySelectorAll('.example-link').forEach((link) => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    toggleMenu();
                }
            });
        });
    }
}

// Initialize the browser when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const browser = new ExampleBrowser(); /* eslint-disable-line no-unused-vars */
});
