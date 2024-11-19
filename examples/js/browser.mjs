import { examples } from './examples.mjs';
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
        button.innerHTML = '📱';
        button.title = 'View QR code for mobile';
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showQRCode(example.path);
        };
        return button;
    }

    createOpenInNewButton(example) {
        const link = document.createElement('a');
        link.href = example.path;
        link.target = '_blank';
        link.className = 'open-in-new';
        link.innerHTML = '↗️';
        link.title = 'Open in new tab';
        link.onclick = e => e.stopPropagation();
        return link;
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
