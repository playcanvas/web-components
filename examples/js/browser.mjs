import { examples } from './example-list.mjs';
import { setupNavigation } from './navigation.mjs';
import { showQRCode } from './qr-code.mjs';

class ExampleBrowser {
    constructor() {
        this.frame = document.getElementById('example-frame');
        this.exampleList = document.getElementById('example-list');
        this.menuToggle = document.querySelector('.menu-toggle');
        this.sidebar = document.querySelector('.sidebar');
        this.overlay = document.querySelector('.sidebar-overlay');

        this.setupNavigation();
        this.createExampleList();
        this.loadInitialExample();
        this.setupMobileMenu();
    }

    setupNavigation() {
        const loadExample = (path) => {
            this.frame.src = path;
        };
        this.updateURL = setupNavigation(loadExample).updateURL;
    }

    createExampleList() {
        examples.forEach((example) => {
            const link = this.createExampleLink(example);
            this.exampleList.appendChild(link);
        });
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
        container.style.display = 'flex';
        container.style.gap = '4px';

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
            this.frame.src = example.path;
            this.updateURL(example.path);
            document.querySelectorAll('.example-link')
            .forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        }
    }

    loadInitialExample() {
        if (examples.length > 0) {
            const hash = window.location.hash.slice(1);
            if (hash && examples.some(ex => ex.path === hash)) {
                this.frame.src = hash;
                document.querySelector(`a[href="#${hash}"]`)?.classList.add('active');
            } else {
                this.frame.src = examples[0].path;
                this.updateURL(examples[0].path);
                this.exampleList.firstChild?.classList.add('active');
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
