import { Script } from 'playcanvas';

/**
 * Drives the world-space layout board. The controls along its foot resize the panel, retune the
 * tile field's layout group and add or remove tiles.
 *
 * Everything the script touches, it touches through element attributes rather than through the
 * engine components behind them. That keeps the board's state readable in devtools, and it side
 * steps a timing trap: a cloned tile's `<pc-element>` component does not exist the instant the
 * `<pc-entity>` reports ready, so assigning `entity.element.text` there is a silent no-op, while
 * an attribute is picked up whenever the component does arrive.
 *
 * Two things the board is built to show off:
 *
 * - Nine-slicing. The panel, its shadow, the header, the field, every tile and every button are
 *   all the same two sliced sprites, tinted. Resizing the panel restretches them together and
 *   their corners stay the size the atlas declares, however far the middle grows.
 * - Anchoring and fitting doing the work instead of script. The panel's width is the only thing
 *   animated here. The header, field and control row are each anchored to two opposite edges, so
 *   they follow on their own, and the control row hands its width out to its buttons in
 *   proportion to each one's `fit-width-proportion`.
 *
 * Attached to the board entity.
 */
export class UiLayout extends Script {
    static scriptName = 'uiLayout';

    /** Tiles present when the board first appears. */
    initialTileCount = 12;

    /** Bounds on the tile count, so the field can be neither emptied nor overrun. */
    minTileCount = 1;

    maxTileCount = 16;

    /**
     * The width range the - and + controls move the panel through, in screen units. The floor is
     * set by the control row: below it the buttons would be at their `min-width` and would start
     * to overrun the panel rather than shrink any further.
     */
    minPanelWidth = 600;

    maxPanelWidth = 940;

    widthStep = 85;

    /**
     * Tile footprint and field insets, mirroring the markup. The script needs these to work out
     * how many rows the tiles will wrap into, which is what the panel height follows.
     */
    tileWidth = 128;

    tileHeight = 86;

    tileSpacing = 12;

    /** Panel width less the field's own margins and the tile group's padding. */
    fieldInset = 48;

    /** Panel height less the field: the header band, the control row and the gaps around them. */
    chromeHeight = 210;

    /** Rows the field holds when tiles run in columns instead, where rows cannot be counted. */
    verticalRows = 3;

    /** Seconds a width change takes to play out. */
    transitionDuration = 0.3;

    /** Tile tints, cycled by index. */
    palette = [
        '0.19 0.6 0.85',
        '0.4 0.76 0.35',
        '0.97 0.75 0.1',
        '0.88 0.4 0.14',
        '0.6 0.44 0.85'
    ];

    initialize() {
        this.panelElement = document.getElementById('panel-element');
        this.shadowElement = document.getElementById('shadow-element');
        this.readoutElement = document.getElementById('readout-element');
        this.tilesGroup = document.getElementById('tiles-group');
        this.tileTemplate = document.getElementById('tile');

        // The field is where tiles are appended, so it is the group element's parent entity.
        this.tilesElement = this.tilesGroup.parentElement;

        this.horizontal = true;
        this.wrap = true;

        // Both dimensions are eased, so each needs a current value and a target to move towards.
        this.width = this.maxPanelWidth;
        this.targetWidth = this.width;
        this.tiles = [];
        this.height = this._targetHeight();

        this._wireControls();

        for (let i = 0; i < this.initialTileCount; i++) {
            this.addTile();
        }

        // Snap rather than ease on the first frame, so the board does not unfold on load.
        this.height = this._targetHeight();
        this._applySize();
        this._applyLayout();
    }

    /**
     * Binds each control to its action. The buttons are declared in the page so their labels and
     * layout stay in the markup; only the behaviour lives here.
     */
    _wireControls() {
        const actions = {
            narrower: () => this._nudgeWidth(-this.widthStep),
            wider: () => this._nudgeWidth(this.widthStep),
            orientation: () => {
                this.horizontal = !this.horizontal;
                this._applyLayout();
            },
            wrap: () => {
                this.wrap = !this.wrap;
                this._applyLayout();
            },
            remove: () => this.removeTile(),
            add: () => this.addTile()
        };

        for (const [name, action] of Object.entries(actions)) {
            this.entity.findByName(`control-${name}`)?.button?.on('click', action);
        }
    }

    _nudgeWidth(delta) {
        const width = this.targetWidth + delta;
        this.targetWidth = Math.max(this.minPanelWidth, Math.min(this.maxPanelWidth, width));
        this._updateReadout();
    }

    /**
     * Adds one tile by cloning the page's `<template>`. The web-components lifecycle turns the
     * cloned markup into entities, so the tile only needs its tint and its number.
     */
    addTile() {
        if (this.tiles.length >= this.maxTileCount) {
            return;
        }

        const fragment = this.tileTemplate.content.cloneNode(true);
        const tileElement = fragment.querySelector('pc-entity');
        const index = this.tiles.length + 1;

        tileElement.querySelector(':scope > pc-element')
            .setAttribute('color', this.palette[(index - 1) % this.palette.length]);
        tileElement.querySelector('pc-entity[name="tile-label"] > pc-element')
            .setAttribute('text', String(index));

        this.tiles.push(tileElement);
        this.tilesElement.appendChild(fragment);
        this._updateReadout();
    }

    removeTile() {
        if (this.tiles.length <= this.minTileCount) {
            return;
        }

        // Removing the element destroys its entity through the web-components lifecycle.
        this.tiles.pop().remove();
        this._updateReadout();
    }

    /** Pushes the current orientation and wrap onto the tile field's layout group. */
    _applyLayout() {
        this.tilesGroup.setAttribute('orientation', this.horizontal ? 'horizontal' : 'vertical');

        // A boolean element attribute is presence-based, so wrap is added and removed rather
        // than set to a string - `wrap="false"` would still read as wrap on.
        if (this.wrap) {
            this.tilesGroup.setAttribute('wrap', '');
        } else {
            this.tilesGroup.removeAttribute('wrap');
        }

        this._label('control-orientation', this.horizontal ? 'Row' : 'Column');
        this._label('control-wrap', this.wrap ? 'Wrap on' : 'Wrap off');
        this._updateReadout();
    }

    /**
     * Sizes the panel and its shadow. Nothing inside the panel is touched: the bands are anchored
     * to its edges, so they follow, and the control row refits its own buttons.
     */
    _applySize() {
        for (const element of [this.panelElement, this.shadowElement]) {
            element.setAttribute('width', String(Math.round(this.width)));
            element.setAttribute('height', String(Math.round(this.height)));
        }
    }

    /**
     * The height the panel wants: enough for the rows the tiles wrap into at the target width, so
     * the panel grows and shrinks with its content instead of reserving room for the largest case.
     * This is also the only thing here that stretches a sliced sprite vertically.
     */
    _targetHeight() {
        const rows = this._rowsAt(this.targetWidth);
        return this.chromeHeight + rows * this.tileHeight + (rows - 1) * this.tileSpacing;
    }

    /**
     * How many rows of tiles the field has to be tall enough for, at a given panel width.
     *
     * Only one of the four cases can be counted. Running in columns, the wrap goes the other way
     * and the answer is whatever the field is tall enough to hold, which is circular; and with
     * wrap off the tiles run past the field's edge however tall it is. Both are fixed rather than
     * derived, and the field masks whatever spills.
     */
    _rowsAt(panelWidth) {
        if (!this.horizontal) {
            return this.verticalRows;
        }
        if (!this.wrap) {
            return 1;
        }

        const usable = panelWidth - this.fieldInset;
        const stride = this.tileWidth + this.tileSpacing;
        const perRow = Math.max(1, Math.floor((usable + this.tileSpacing) / stride));
        return Math.max(1, Math.ceil(this.tiles.length / perRow));
    }

    _label(controlName, text) {
        const control = this.entity.findByName(controlName);
        const label = control?.findByName('label');
        if (label?.element) {
            label.element.text = text;
        }
    }

    _updateReadout() {
        const parts = [
            this.horizontal ? 'horizontal' : 'vertical',
            this.wrap ? 'wrap on' : 'wrap off',
            `${this.tiles.length} tiles`,
            `${Math.round(this.targetWidth)} wide`
        ];
        this.readoutElement.setAttribute('text', parts.join('   '));
    }

    update(dt) {
        const targetHeight = this._targetHeight();
        if (Math.abs(this.targetWidth - this.width) < 0.5 && Math.abs(targetHeight - this.height) < 0.5) {
            return;
        }

        // Framerate-independent exponential ease towards both targets.
        const t = 1 - Math.exp(-dt / (this.transitionDuration / 3));
        this.width += (this.targetWidth - this.width) * t;
        this.height += (targetHeight - this.height) * t;
        this._applySize();
    }
}
