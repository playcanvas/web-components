import { Script } from 'playcanvas';

/**
 * Drives the dynamic list inside the scroll view:
 *
 * - populates it with an initial set of entries on startup;
 * - adds a new random entry when the "Add entry" button is clicked;
 * - removes an entry when its remove button is clicked;
 * - resizes the content area to fit its entries so the scroll view reports the correct range.
 *
 * Entries are created by cloning the `<template class="entry">` blocks declared in the page, so
 * each entry's layout stays declarative. Attached to the scroll view entity.
 */
export class ScrollView extends Script {
    static scriptName = 'scrollView';

    // Number of entries to create on startup.
    initialEntryCount = 15;

    initialize() {
        // The content `<pc-entity>` we clone entries into, plus its backing engine entity.
        this.contentElement = document.getElementById('scroll-content');
        this.contentEntity = this.contentElement.entity;

        // The entry templates to choose from.
        this.templates = document.querySelectorAll('template.entry');

        // Add a new entry whenever the "Add entry" button is clicked.
        const addButton = this.app.root.findByName('Add Entry Button');
        addButton?.button?.on('click', () => this.addEntry());

        for (let i = 0; i < this.initialEntryCount; i++) {
            this.addEntry();
        }
    }

    addEntry() {
        // Clone a random template into the content element. The web-components lifecycle turns the
        // cloned `<pc-entity>` markup into engine entities.
        const template = this.templates[Math.floor(Math.random() * this.templates.length)];
        const fragment = template.content.cloneNode(true);
        const entryElement = fragment.querySelector('pc-entity');
        this.contentElement.appendChild(fragment);

        // Wait a frame so the entry's child entities and their components are attached, then assign
        // its label, wire up its remove button and resize the content area.
        requestAnimationFrame(() => {
            const entity = entryElement.entity;
            if (!entity) {
                return;
            }

            entity.findByName('Text').element.text = Math.floor(Math.random() * 100000).toString();
            entity.findByName('Remove Button').button.on('click', () => this.removeEntry(entryElement));

            this.refit();
        });
    }

    removeEntry(entryElement) {
        // Removing the element destroys its engine entity via the web-components lifecycle.
        entryElement.remove();
        requestAnimationFrame(() => this.refit());
    }

    // Resizes the content element to exactly fit its laid-out children.
    refit() {
        const layoutGroup = this.contentEntity.layoutgroup;

        // Start with the top and bottom padding.
        let height = layoutGroup.padding.y + layoutGroup.padding.w;

        // Add the height of every laid-out child, plus the spacing between them.
        const children = this.contentEntity.children;
        let childCount = 0;
        for (let i = 0; i < children.length; i++) {
            if (children[i].layoutchild && children[i].element) {
                childCount++;
                height += children[i].element.height;
            }
        }
        height += Math.max(0, childCount - 1) * layoutGroup.spacing.y;

        this.contentEntity.element.height = height;
    }
}
