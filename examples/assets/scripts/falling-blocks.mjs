import {
    BoundingBox,
    Entity,
    KEY_DOWN,
    KEY_LEFT,
    KEY_P,
    KEY_RETURN,
    KEY_RIGHT,
    KEY_SPACE,
    KEY_UP,
    Script,
    Vec3,
    math
} from 'playcanvas';

import { MaterialElement } from '@playcanvas/web-components';

/**
 * The seven tetrominoes. Each shape is authored as top-down rows for readability and
 * converted at load into a y-up numeric matrix (row 0 = bottom) matching the board's
 * coordinate system. The key doubles as the block material id: piece K is skinned with
 * the `pc-material` whose id is `block-k`.
 */
const TETROMINOES = Object.entries({
    I: ['....', 'XXXX', '....', '....'],
    J: ['X..', 'XXX', '...'],
    L: ['..X', 'XXX', '...'],
    O: ['XX', 'XX'],
    S: ['.XX', 'XX.', '...'],
    T: ['.X.', 'XXX', '...'],
    Z: ['XX.', '.XX', '...']
}).map(([key, rows]) => ({
    key,
    matrix: rows.map((row) => [...row].map((char) => (char === 'X' ? 1 : 0))).reverse()
}));

/**
 * Returns a new matrix holding the given square matrix rotated a quarter turn clockwise
 * (as seen by the player, with y up). Never mutates its input, so the shared shapes in
 * TETROMINOES stay pristine.
 *
 * @param {number[][]} matrix - The matrix to rotate.
 * @returns {number[][]} The rotated matrix.
 */
const rotateCW = (matrix) => {
    const size = matrix.length;
    return matrix.map((row, y) => row.map((_, x) => matrix[x][size - 1 - y]));
};

/**
 * The core falling-blocks game. The board is a `_cells[y][x]` grid (y up, row 0 at the
 * bottom) where each cell holds either `null` or the block Entity resting there - the
 * occupancy test and the visual are the same thing. The active piece's four block
 * entities are created once at spawn and only repositioned as it moves and rotates;
 * locking simply files them into the grid.
 *
 * The game is driven entirely by application events, so the DOM page never reaches into
 * the script:
 *
 * - `game:start` (in) - reset and start play. Fired by the page's buttons.
 * - `game:pause` (in) - toggle pause, or force it with a boolean payload.
 * - `game:state` (out) - 'ready' | 'playing' | 'paused' | 'over'.
 * - `game:score` (out) - `{ score, lines, level }` after every scoring change.
 * - `game:over` (out) - `{ score, lines, level }` when the stack tops out.
 * - `game:shake` (out) - impact strength, consumed by the cameraShake script.
 */
export class FallingBlocks extends Script {
    static scriptName = 'fallingBlocks';

    /**
     * The glTF container asset instantiated for each block (a unit rounded cube).
     *
     * @attribute
     * @type {import('playcanvas').Asset}
     */
    blockAsset = null;

    /**
     * The width of the board in cells. Note that the well geometry in the HTML is
     * authored for the default 10x20 board.
     *
     * @attribute
     * @type {number}
     */
    boardWidth = 10;

    /**
     * The height of the board in cells.
     *
     * @attribute
     * @type {number}
     */
    boardHeight = 20;

    /**
     * The gravity interval at level 1, in milliseconds per row.
     *
     * @attribute
     * @type {number}
     */
    dropInterval = 1000;

    /**
     * The floor the gravity interval can never drop below, in milliseconds.
     *
     * @attribute
     * @type {number}
     */
    minDropInterval = 100;

    /**
     * How much faster gravity gets per level, in milliseconds.
     *
     * @attribute
     * @type {number}
     */
    speedStep = 100;

    /**
     * How long cleared rows flash and shrink before the stack drops, in seconds.
     *
     * @attribute
     * @type {number}
     */
    flashDuration = 0.25;

    initialize() {
        this._state = 'ready';
        this._paused = false;
        this._cells = [];
        this._piece = null;
        this._blockRoot = null;
        this._score = 0;
        this._lines = 0;
        this._level = 1;
        this._interval = this.dropInterval;
        this._dropTimer = 0;
        this._clearTimer = 0;
        this._clearedRows = [];
        this._blockScale = this._measureBlockScale();

        this.app.on('game:start', this._start, this);
        this.app.on('game:pause', this._pause, this);
        this.app.keyboard.on('keydown', this._onKeyDown, this);

        this.on('destroy', () => {
            this.app.off('game:start', this._start, this);
            this.app.off('game:pause', this._pause, this);
            this.app.keyboard.off('keydown', this._onKeyDown, this);
        });
    }

    update(dt) {
        if (this._paused) {
            return;
        }

        if (this._state === 'playing') {
            this._dropTimer += dt * 1000;
            if (this._dropTimer >= this._interval) {
                this._dropTimer = 0;
                if (this._piece && !this._tryMove(0, -1)) {
                    this._lock(false);
                }
            }
        } else if (this._state === 'clearing') {
            // Cleared rows flare up (their material was swapped in _beginClear) and
            // shrink away before the rows above drop down
            this._clearTimer += dt;
            const t = Math.min(this._clearTimer / this.flashDuration, 1);
            const scale = Math.max(this._blockScale * (1 - t) * (1 - t), 0.001);
            for (const y of this._clearedRows) {
                for (const block of this._cells[y]) {
                    block.setLocalScale(scale, scale, scale);
                }
            }
            if (t >= 1) {
                this._finishClear();
            }
        }
    }

    /** Moves the active piece one column to the left. */
    moveLeft() {
        this._tryMove(-1, 0);
    }

    /** Moves the active piece one column to the right. */
    moveRight() {
        this._tryMove(1, 0);
    }

    /** Moves the active piece down one row, locking it if it cannot move. */
    softDrop() {
        if (!this._active()) {
            return;
        }
        if (this._tryMove(0, -1)) {
            this._dropTimer = 0;
        } else {
            this._lock(false);
        }
    }

    /** Drops the active piece to the bottom and locks it immediately. */
    hardDrop() {
        if (!this._active()) {
            return;
        }
        const piece = this._piece;
        while (this._fits(piece.matrix, piece.x, piece.y - 1)) {
            piece.y--;
        }
        this._placePiece();
        this._play('drop');
        this.app.fire('game:shake', 0.25);
        this._lock(true);
    }

    /** Rotates the active piece a quarter turn clockwise, if there is room. */
    rotate() {
        if (!this._active()) {
            return;
        }
        const piece = this._piece;
        const rotated = rotateCW(piece.matrix);
        if (!this._fits(rotated, piece.x, piece.y)) {
            return;
        }
        piece.matrix = rotated;
        this._placePiece();
        this._play('rotate');
    }

    /** @returns {boolean} Whether the piece can currently be controlled. */
    _active() {
        return this._state === 'playing' && !this._paused && this._piece !== null;
    }

    _start() {
        // All dynamic blocks live under one container entity, so resetting the game is
        // just a matter of replacing it
        this._blockRoot?.destroy();
        this._blockRoot = new Entity('blocks', this.app);
        this.entity.addChild(this._blockRoot);

        this._cells = [];
        for (let y = 0; y < this.boardHeight; y++) {
            this._cells.push(new Array(this.boardWidth).fill(null));
        }

        this._piece = null;
        this._score = 0;
        this._lines = 0;
        this._level = 1;
        this._interval = this.dropInterval;
        this._dropTimer = 0;
        this._clearedRows = [];
        this._paused = false;
        this._state = 'playing';

        this._fireScore();
        this._announce();
        this._spawn();
    }

    _pause(force) {
        if (this._state !== 'playing' && this._state !== 'clearing') {
            return;
        }
        const paused = typeof force === 'boolean' ? force : !this._paused;
        if (paused === this._paused) {
            return;
        }
        this._paused = paused;
        this._announce();
    }

    _announce() {
        // The internal 'clearing' phase is presentation detail - the page sees 'playing'
        const state = this._state === 'clearing' ? 'playing' : this._state;
        this.app.fire('game:state', this._paused ? 'paused' : state);
    }

    _spawn() {
        const { key, matrix } = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];

        // Position the piece so its topmost filled cell sits on the top row
        let top = 0;
        for (let y = 0; y < matrix.length; y++) {
            if (matrix[y].some((cell) => cell)) {
                top = y;
            }
        }

        const material = MaterialElement.get(`block-${key.toLowerCase()}`);
        this._piece = {
            matrix,
            x: (this.boardWidth - matrix.length) >> 1,
            y: this.boardHeight - 1 - top,
            blocks: [
                this._createBlock(material),
                this._createBlock(material),
                this._createBlock(material),
                this._createBlock(material)
            ]
        };
        this._dropTimer = 0;
        this._placePiece();

        // A new piece with nowhere to go means the stack has reached the top
        if (!this._fits(matrix, this._piece.x, this._piece.y)) {
            this._gameOver();
        }
    }

    /**
     * Measures the block model once and derives the root scale at which a block fills
     * 95% of a 1-unit cell - glTF nodes can carry baked scales, so neither the mesh
     * extents nor the natural size of the model are assumed.
     *
     * @returns {number} The local scale to apply to instantiated blocks.
     */
    _measureBlockScale() {
        const probe = this.blockAsset.resource.instantiateRenderEntity();
        this.entity.addChild(probe);
        probe.syncHierarchy();

        const aabb = new BoundingBox();
        let first = true;
        for (const render of probe.findComponents('render')) {
            for (const meshInstance of render.meshInstances) {
                if (first) {
                    aabb.copy(meshInstance.aabb);
                    first = false;
                } else {
                    aabb.add(meshInstance.aabb);
                }
            }
        }
        const size = first ? 1 : 2 * Math.max(aabb.halfExtents.x, aabb.halfExtents.y, aabb.halfExtents.z);
        const scale = (probe.getLocalScale().x * 0.95) / size;
        probe.destroy();
        return scale;
    }

    _createBlock(material) {
        const block = this.blockAsset.resource.instantiateRenderEntity();
        block.setLocalScale(this._blockScale, this._blockScale, this._blockScale);

        // The render components instantiated from a glTF ignore the component-level
        // material property, so assign the material to each mesh instance
        for (const render of block.findComponents('render')) {
            for (const meshInstance of render.meshInstances) {
                meshInstance.material = material;
            }
        }

        this._blockRoot.addChild(block);
        return block;
    }

    _placeBlock(block, x, y) {
        block.setLocalPosition(x - this.boardWidth / 2 + 0.5, y + 0.5, 0);
    }

    _placePiece() {
        const { matrix, x, y, blocks } = this._piece;
        let i = 0;
        for (let my = 0; my < matrix.length; my++) {
            for (let mx = 0; mx < matrix.length; mx++) {
                if (matrix[my][mx]) {
                    this._placeBlock(blocks[i++], x + mx, y + my);
                }
            }
        }
    }

    /**
     * Tests whether a piece matrix fits at a board position. Cells above the top of the
     * board are legal (pieces spawn there and may poke out of the well) - only the side
     * walls, the floor and the occupancy of in-board cells reject a position.
     *
     * @param {number[][]} matrix - The piece matrix to test.
     * @param {number} px - The board x coordinate of the matrix origin.
     * @param {number} py - The board y coordinate of the matrix origin.
     * @returns {boolean} Whether the piece fits.
     */
    _fits(matrix, px, py) {
        for (let my = 0; my < matrix.length; my++) {
            for (let mx = 0; mx < matrix.length; mx++) {
                if (!matrix[my][mx]) {
                    continue;
                }
                const bx = px + mx;
                const by = py + my;
                if (bx < 0 || bx >= this.boardWidth || by < 0) {
                    return false;
                }
                if (by < this.boardHeight && this._cells[by][bx]) {
                    return false;
                }
            }
        }
        return true;
    }

    _tryMove(dx, dy) {
        if (!this._active()) {
            return false;
        }
        const piece = this._piece;
        if (!this._fits(piece.matrix, piece.x + dx, piece.y + dy)) {
            return false;
        }
        piece.x += dx;
        piece.y += dy;
        this._placePiece();
        return true;
    }

    _lock(hard) {
        const { matrix, x, y, blocks } = this._piece;
        let topOut = false;
        let i = 0;
        for (let my = 0; my < matrix.length; my++) {
            for (let mx = 0; mx < matrix.length; mx++) {
                if (!matrix[my][mx]) {
                    continue;
                }
                const by = y + my;
                if (by >= this.boardHeight) {
                    // Locking above the well tops the game out; the block entity stays
                    // visible where it came to rest
                    topOut = true;
                    i++;
                } else {
                    this._cells[by][x + mx] = blocks[i++];
                }
            }
        }
        this._piece = null;

        if (topOut) {
            this._gameOver();
            return;
        }

        const rows = [];
        for (let by = 0; by < this.boardHeight; by++) {
            if (this._cells[by].every((cell) => cell !== null)) {
                rows.push(by);
            }
        }

        if (rows.length > 0) {
            this._beginClear(rows);
        } else {
            // The hard drop already made its own noise
            if (!hard) {
                this._play('lock');
            }
            this._spawn();
        }
    }

    _beginClear(rows) {
        this._state = 'clearing';
        this._clearTimer = 0;
        this._clearedRows = rows;

        const flash = MaterialElement.get('block-flash');
        for (const y of rows) {
            for (const block of this._cells[y]) {
                for (const render of block.findComponents('render')) {
                    for (const meshInstance of render.meshInstances) {
                        meshInstance.material = flash;
                    }
                }
            }
        }

        this._applyScore(rows.length);
        this._play(rows.length === 4 ? 'clear4' : 'clear1');
        this.app.fire('game:shake', rows.length === 4 ? 0.5 : 0.3);
    }

    _finishClear() {
        const cleared = new Set(this._clearedRows);
        for (const y of this._clearedRows) {
            for (const block of this._cells[y]) {
                block.destroy();
            }
            this._cells[y].fill(null);
        }

        // Compact the surviving rows downward in a single bottom-up pass, repositioning
        // each block entity to its new row
        let write = 0;
        for (let read = 0; read < this.boardHeight; read++) {
            if (cleared.has(read)) {
                continue;
            }
            if (write !== read) {
                for (let x = 0; x < this.boardWidth; x++) {
                    const block = this._cells[read][x];
                    this._cells[write][x] = block;
                    this._cells[read][x] = null;
                    if (block) {
                        this._placeBlock(block, x, write);
                    }
                }
            }
            write++;
        }

        this._clearedRows = [];
        this._state = 'playing';
        this._spawn();
    }

    _applyScore(rowCount) {
        // The classic Nintendo scoring system
        const points = [40, 100, 300, 1200];
        this._score += points[rowCount - 1] * this._level;
        this._lines += rowCount;

        const level = Math.floor(this._lines / 10) + 1;
        if (level !== this._level) {
            this._level = level;
            this._interval = Math.max(this.minDropInterval, this.dropInterval - (level - 1) * this.speedStep);
        }
        this._fireScore();
    }

    _fireScore() {
        this.app.fire('game:score', { score: this._score, lines: this._lines, level: this._level });
    }

    _gameOver() {
        this._state = 'over';
        this._paused = false;
        this._play('gameover');
        this.app.fire('game:shake', 0.6);
        this.app.fire('game:over', { score: this._score, lines: this._lines, level: this._level });
        this._announce();
    }

    _play(slot) {
        this.entity.sound?.play(slot);
    }

    _onKeyDown(event) {
        // OS key repeat is welcome on the movement keys (it approximates the auto-shift
        // of a real game) but must not re-trigger the one-shot actions
        const repeat = event.event?.repeat;

        switch (event.key) {
            case KEY_LEFT:
                this.moveLeft();
                break;
            case KEY_RIGHT:
                this.moveRight();
                break;
            case KEY_DOWN:
                this.softDrop();
                break;
            case KEY_UP:
                if (!repeat) this.rotate();
                break;
            case KEY_SPACE:
                if (!repeat) this.hardDrop();
                break;
            case KEY_P:
                if (!repeat) this._pause();
                break;
            case KEY_RETURN:
                if (!repeat && (this._state === 'ready' || this._state === 'over')) {
                    this.app.fire('game:start');
                }
                break;
        }
    }
}

/**
 * Translates pointer gestures into game moves by calling the public methods of the
 * sibling fallingBlocks script: drag sideways to move (one column per dragCell pixels),
 * drag down to soft drop, tap to rotate and flick down to hard drop. Works for touch,
 * pen and mouse alike.
 */
export class TouchControls extends Script {
    static scriptName = 'touchControls';

    /**
     * The horizontal drag distance that moves the piece one column, in CSS pixels.
     *
     * @attribute
     * @type {number}
     */
    dragCell = 24;

    /**
     * The downward drag distance that soft-drops the piece one row, in CSS pixels.
     *
     * @attribute
     * @type {number}
     */
    dragRow = 28;

    initialize() {
        this._game = this.entity.script.fallingBlocks;
        this._pointerId = null;
        this._dragged = false;
        this._startX = 0;
        this._startY = 0;
        this._lastX = 0;
        this._lastY = 0;
        this._accX = 0;
        this._accY = 0;
        this._startTime = 0;

        this._onDown = this._onDown.bind(this);
        this._onMove = this._onMove.bind(this);
        this._onUp = this._onUp.bind(this);
        this._onCancel = this._onCancel.bind(this);

        // Capture phase on window, so a press is seen whatever the page's own UI above the
        // canvas does with it on the way back up
        window.addEventListener('pointerdown', this._onDown, { capture: true });
        window.addEventListener('pointermove', this._onMove, { capture: true });
        window.addEventListener('pointerup', this._onUp, { capture: true });
        window.addEventListener('pointercancel', this._onCancel, { capture: true });

        this.on('destroy', () => {
            window.removeEventListener('pointerdown', this._onDown, { capture: true });
            window.removeEventListener('pointermove', this._onMove, { capture: true });
            window.removeEventListener('pointerup', this._onUp, { capture: true });
            window.removeEventListener('pointercancel', this._onCancel, { capture: true });
        });
    }

    _onDown(event) {
        // Only gestures that start on the canvas control the game - presses on the HUD,
        // the overlays and the example buttons are DOM-targeted and pass through here
        if (event.target !== this.app.graphicsDevice.canvas) {
            return;
        }
        this._pointerId = event.pointerId;
        this._dragged = false;
        this._startX = this._lastX = event.clientX;
        this._startY = this._lastY = event.clientY;
        this._accX = 0;
        this._accY = 0;
        this._startTime = performance.now();
    }

    _onMove(event) {
        if (event.pointerId !== this._pointerId) {
            return;
        }

        this._accX += event.clientX - this._lastX;
        this._accY += event.clientY - this._lastY;
        this._lastX = event.clientX;
        this._lastY = event.clientY;

        while (this._accX >= this.dragCell) {
            this._game.moveRight();
            this._accX -= this.dragCell;
            this._dragged = true;
        }
        while (this._accX <= -this.dragCell) {
            this._game.moveLeft();
            this._accX += this.dragCell;
            this._dragged = true;
        }
        while (this._accY >= this.dragRow) {
            this._game.softDrop();
            this._accY -= this.dragRow;
            this._dragged = true;
        }
        // Dragging upward never banks soft drops
        if (this._accY < 0) {
            this._accY = 0;
        }

        // Enough total wander disqualifies the gesture as a tap
        if (!this._dragged && Math.hypot(event.clientX - this._startX, event.clientY - this._startY) > 12) {
            this._dragged = true;
        }
    }

    _onUp(event) {
        if (event.pointerId !== this._pointerId) {
            return;
        }
        this._pointerId = null;

        const elapsed = performance.now() - this._startTime;
        const totalX = event.clientX - this._startX;
        const totalY = event.clientY - this._startY;

        if (!this._dragged && elapsed <= 250) {
            // A quick press with no movement is a tap
            this._game.rotate();
        } else if (totalY >= 50 && elapsed <= 300 && totalY > 1.5 * Math.abs(totalX)) {
            // A fast, decisively downward flick slams the piece home
            this._game.hardDrop();
        }
    }

    _onCancel(event) {
        if (event.pointerId === this._pointerId) {
            this._pointerId = null;
        }
    }
}

/**
 * Builds the interior grid of the well once at startup: thin unlit boxes marking the
 * cell boundaries, laid over the back panel. The outermost lines are omitted because
 * the well frame already draws the boundary.
 */
export class BoardGrid extends Script {
    static scriptName = 'boardGrid';

    /**
     * The width of the grid in cells.
     *
     * @attribute
     * @type {number}
     */
    width = 10;

    /**
     * The height of the grid in cells.
     *
     * @attribute
     * @type {number}
     */
    height = 20;

    /**
     * The id of the `pc-material` to apply to the lines.
     *
     * @attribute
     * @type {string}
     */
    material = 'grid-line';

    /**
     * The thickness of the lines, in world units.
     *
     * @attribute
     * @type {number}
     */
    thickness = 0.04;

    initialize() {
        const material = MaterialElement.get(this.material);

        const addLine = (name, x, y, scaleX, scaleY) => {
            const line = new Entity(name, this.app);
            line.addComponent('render', {
                type: 'box',
                material,
                castShadows: false,
                receiveShadows: false
            });
            line.setLocalPosition(x, y, 0);
            line.setLocalScale(scaleX, scaleY, this.thickness);
            this.entity.addChild(line);
        };

        for (let x = 1; x < this.width; x++) {
            addLine(`column-${x}`, x - this.width / 2, this.height / 2, this.thickness, this.height);
        }
        for (let y = 1; y < this.height; y++) {
            addLine(`row-${y}`, 0, y, this.width, this.thickness);
        }
    }
}

/**
 * Frames the board for any window shape. Every frame the camera is pulled back along
 * +z just far enough that a world-space rectangle around the well stays fully in view,
 * so the game is as playable on a portrait phone as on a widescreen monitor.
 */
export class BoardCamera extends Script {
    static scriptName = 'boardCamera';

    /**
     * The point the camera looks at.
     *
     * @attribute
     * @type {Vec3}
     */
    target = new Vec3(0, 10, 0);

    /**
     * The width of the world-space rectangle to keep in frame.
     *
     * @attribute
     * @type {number}
     */
    frameWidth = 14;

    /**
     * The height of the world-space rectangle to keep in frame.
     *
     * @attribute
     * @type {number}
     */
    frameHeight = 26;

    /**
     * Extra camera height above the target, giving a slight downward viewing angle.
     *
     * @attribute
     * @type {number}
     */
    elevation = 1.5;

    update(_dt) {
        const camera = this.entity.camera;
        if (!camera) {
            return;
        }

        const { width, height } = this.app.graphicsDevice;
        const aspect = width / Math.max(1, height);
        const halfTan = Math.tan(camera.fov * 0.5 * math.DEG_TO_RAD);

        // The distance at which the frame rectangle exactly fits vertically and
        // horizontally - the larger of the two wins
        const fitHeight = this.frameHeight / 2 / halfTan;
        const fitWidth = this.frameWidth / 2 / (halfTan * aspect);
        const distance = Math.max(fitHeight, fitWidth);

        this.entity.setPosition(this.target.x, this.target.y + this.elevation, this.target.z + distance);
        this.entity.lookAt(this.target);
    }
}

/**
 * Adds game feel: impacts reported through the `game:shake` application event pile up
 * as trauma, which drains over time while jolting the camera around its framed pose.
 * Squaring the trauma keeps small knocks subtle and big ones violent. Runs in
 * postUpdate so it layers on top of whatever pose boardCamera set this frame.
 */
export class CameraShake extends Script {
    static scriptName = 'cameraShake';

    /**
     * The positional offset at full trauma, in world units.
     *
     * @attribute
     * @type {number}
     */
    intensity = 0.4;

    /**
     * The fraction of trauma drained per second.
     *
     * @attribute
     * @type {number}
     */
    decay = 1.4;

    initialize() {
        this._trauma = 0;
        this._time = 0;

        this.app.on('game:shake', this._onShake, this);
        this.on('destroy', () => {
            this.app.off('game:shake', this._onShake, this);
        });
    }

    _onShake(strength) {
        this._trauma = Math.min(this._trauma + strength, 1);
    }

    postUpdate(dt) {
        if (this._trauma <= 0) {
            return;
        }
        this._time += dt;
        this._trauma = Math.max(this._trauma - this.decay * dt, 0);

        const amount = this._trauma * this._trauma * this.intensity;
        this.entity.translateLocal(Math.sin(this._time * 37) * amount, Math.cos(this._time * 41) * amount, 0);
    }
}
