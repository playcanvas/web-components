import { Script, Entity, KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_SPACE, KEY_P } from 'playcanvas';

// Falling Blocks Game Controller
export class FallingBlocksGame extends Script {
    static scriptName = 'fallingBlocksGame';

    // Attributes
    boardWidth = 10;

    boardHeight = 20;

    blockSize = 1;

    // Private properties
    _board = [];

    _currentPiece = null;

    _nextPiece = null;

    _gameOver = false;

    _paused = false;

    _score = 0;

    _level = 1;

    _lines = 0;

    _dropInterval = 1000; // milliseconds

    _dropTimer = 0;

    _lastUpdate = 0;

    // Block shapes (I, J, L, O, S, T, Z)
    _shapes = [
        { // I
            shape: [
                [0, 0, 0, 0],
                [1, 1, 1, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0]
            ],
            material: 'block-i'
        },
        { // J
            shape: [
                [1, 0, 0],
                [1, 1, 1],
                [0, 0, 0]
            ],
            material: 'block-j'
        },
        { // L
            shape: [
                [0, 0, 1],
                [1, 1, 1],
                [0, 0, 0]
            ],
            material: 'block-l'
        },
        { // O
            shape: [
                [1, 1],
                [1, 1]
            ],
            material: 'block-o'
        },
        { // S
            shape: [
                [0, 1, 1],
                [1, 1, 0],
                [0, 0, 0]
            ],
            material: 'block-s'
        },
        { // T
            shape: [
                [0, 1, 0],
                [1, 1, 1],
                [0, 0, 0]
            ],
            material: 'block-t'
        },
        { // Z
            shape: [
                [1, 1, 0],
                [0, 1, 1],
                [0, 0, 0]
            ],
            material: 'block-z'
        }
    ];

    initialize() {
        // Initialize the game board
        this.initBoard();

        // Create the visual board
        this.createBoardVisuals();

        // Set up input handling
        this.app.keyboard.on('keydown', this.onKeyDown, this);

        // Generate the first piece
        this.generateNewPiece();

        // Update UI
        this.updateUI();

        // Set up restart button
        const restartButton = document.getElementById('restart-button');
        if (restartButton) {
            restartButton.addEventListener('click', () => {
                this.restartGame();
            });
        }
    }

    update(dt) {
        if (this._gameOver || this._paused) return;

        // Update drop timer
        this._dropTimer += dt * 1000;

        // Move piece down when timer exceeds interval
        if (this._dropTimer >= this._dropInterval) {
            this.movePieceDown();
            this._dropTimer = 0;
        }
    }

    initBoard() {
        // Initialize empty board
        this._board = [];
        for (let y = 0; y < this.boardHeight; y++) {
            this._board[y] = [];
            for (let x = 0; x < this.boardWidth; x++) {
                this._board[y][x] = null;
            }
        }
    }

    createBoardVisuals() {
        // Create container for board
        this._boardEntity = new Entity('board-visual');
        this.entity.addChild(this._boardEntity);

        // Get the rounded-box asset element and resource
        const assetElement = document.querySelector('pc-asset#rounded-box');
        const containerResource = assetElement.asset.resource;

        // Get grid material
        const materialElement = document.querySelector('pc-material#block-grid');
        const gridMaterial = materialElement.material;

        // Create grid
        for (let y = 0; y < this.boardHeight; y++) {
            for (let x = 0; x < this.boardWidth; x++) {
                // Instantiate the model from the container resource
                const gridCell = containerResource.instantiateRenderEntity();
                this._boardEntity.addChild(gridCell);

                // Set the name for identification
                gridCell.name = `grid-${x}-${y}`;

                // Position the cell
                const posX = (x - this.boardWidth / 2 + 0.5) * this.blockSize;
                const posY = y * this.blockSize;
                gridCell.setLocalPosition(posX, posY, 0);

                // Apply the material to all mesh instances
                const renders = gridCell.findComponents('render');
                renders.forEach((render) => {
                    render.meshInstances.forEach((meshInstance) => {
                        meshInstance.material = gridMaterial;
                    });
                });

                // Adjust scale - if your model is 1x1x1, use these values:
                // Scale slightly smaller to create grid effect (0.9 width/depth, very thin height)
                gridCell.setLocalScale(0.9 * this.blockSize * 0.5, 0.05 * this.blockSize * 0.5, 0.9 * this.blockSize * 0.5);
            }
        }

        // Create walls
        this.createWalls();
    }

    createWalls() {
        // Create container for walls
        const walls = new Entity('walls');
        this.entity.addChild(walls);

        // Get wall material from MaterialElement
        const materialElement = document.querySelector('pc-material#block-wall');
        const wallMaterial = materialElement.material;

        // Left wall
        const leftWall = new Entity('left-wall');
        walls.addChild(leftWall);
        leftWall.addComponent('render', {
            type: 'box',
            material: wallMaterial
        });
        leftWall.setLocalPosition(
            (-this.boardWidth / 2 - 0.5) * this.blockSize,
            (this.boardHeight / 2) * this.blockSize,
            0
        );
        leftWall.setLocalScale(
            this.blockSize,
            this.boardHeight * this.blockSize,
            this.blockSize
        );

        // Right wall
        const rightWall = new Entity('right-wall');
        walls.addChild(rightWall);
        rightWall.addComponent('render', {
            type: 'box',
            material: wallMaterial
        });
        rightWall.setLocalPosition(
            (this.boardWidth / 2 + 0.5) * this.blockSize,
            (this.boardHeight / 2) * this.blockSize,
            0
        );
        rightWall.setLocalScale(
            this.blockSize,
            this.boardHeight * this.blockSize,
            this.blockSize
        );

        // Bottom wall
        const bottomWall = new Entity('bottom-wall');
        walls.addChild(bottomWall);
        bottomWall.addComponent('render', {
            type: 'box',
            material: wallMaterial
        });
        bottomWall.setLocalPosition(
            0,
            -0.5 * this.blockSize,
            0
        );
        bottomWall.setLocalScale(
            (this.boardWidth + 2) * this.blockSize,
            this.blockSize,
            this.blockSize
        );

        // Back wall
        const backWall = new Entity('back-wall');
        walls.addChild(backWall);
        backWall.addComponent('render', {
            type: 'box',
            material: wallMaterial
        });
        backWall.setLocalPosition(
            0,
            (this.boardHeight / 2) * this.blockSize,
            -0.5 * this.blockSize
        );
        backWall.setLocalScale(
            (this.boardWidth + 2) * this.blockSize,
            this.boardHeight * this.blockSize,
            this.blockSize
        );
    }

    generateNewPiece() {
        // If there's a next piece, make it the current piece
        if (this._nextPiece) {
            this._currentPiece = this._nextPiece;
        } else {
            // Generate a random piece
            const index = Math.floor(Math.random() * this._shapes.length);
            this._currentPiece = {
                shape: JSON.parse(JSON.stringify(this._shapes[index].shape)),
                material: this._shapes[index].material,
                x: Math.floor(this.boardWidth / 2) - Math.floor(this._shapes[index].shape[0].length / 2),
                y: this.boardHeight - this._shapes[index].shape.length,
                blocks: []
            };
        }

        // Generate next piece
        const index = Math.floor(Math.random() * this._shapes.length);
        this._nextPiece = {
            shape: JSON.parse(JSON.stringify(this._shapes[index].shape)),
            material: this._shapes[index].material,
            x: Math.floor(this.boardWidth / 2) - Math.floor(this._shapes[index].shape[0].length / 2),
            y: this.boardHeight - this._shapes[index].shape.length,
            blocks: []
        };

        // Create visual blocks for the piece
        this.createPieceBlocks();

        // Check if the new piece can be placed
        if (!this.isValidPosition()) {
            this.gameOver();
        }
    }

    createPieceBlocks() {
        // Remove any existing blocks
        this._currentPiece.blocks.forEach((block) => {
            block.destroy();
        });
        this._currentPiece.blocks = [];

        // Get material from MaterialElement
        const materialElement = document.querySelector(`pc-material#${this._currentPiece.material}`);
        const material = materialElement.material;

        // Get the rounded-box asset element and resource
        const assetElement = document.querySelector('pc-asset#rounded-box');
        const containerResource = assetElement.asset.resource;

        for (let y = 0; y < this._currentPiece.shape.length; y++) {
            for (let x = 0; x < this._currentPiece.shape[y].length; x++) {
                if (this._currentPiece.shape[y][x]) {
                    // Instantiate the model from the container resource
                    const block = containerResource.instantiateRenderEntity();
                    this.entity.addChild(block);

                    // Set the name for identification
                    block.name = `block-${x}-${y}`;

                    // Apply the material to all mesh instances
                    const renders = block.findComponents('render');
                    renders.forEach((render) => {
                        render.meshInstances.forEach((meshInstance) => {
                            meshInstance.material = material;
                        });
                    });

                    // Adjust scale - if your model is 1x1x1, use these values:
                    // Scale to block size (0.95 of full size)
                    block.setLocalScale(this.blockSize * 0.95 * 0.5, this.blockSize * 0.95 * 0.5, this.blockSize * 0.95 * 0.5);

                    // Position will be updated in updatePiecePosition
                    this._currentPiece.blocks.push(block);
                }
            }
        }

        // Update the position of the blocks
        this.updatePiecePosition();
    }

    updatePiecePosition() {
        if (!this._currentPiece) return;

        let blockIndex = 0;
        for (let y = 0; y < this._currentPiece.shape.length; y++) {
            for (let x = 0; x < this._currentPiece.shape[y].length; x++) {
                if (this._currentPiece.shape[y][x]) {
                    const block = this._currentPiece.blocks[blockIndex++];
                    const posX = (this._currentPiece.x + x - this.boardWidth / 2 + 0.5) * this.blockSize;
                    const posY = (this._currentPiece.y + y + 0.5) * this.blockSize;
                    block.setLocalPosition(posX, posY, 0);
                }
            }
        }
    }

    isValidPosition(offsetX = 0, offsetY = 0, shape = null) {
        if (!this._currentPiece) return false;

        const testShape = shape || this._currentPiece.shape;
        const testX = this._currentPiece.x + offsetX;
        const testY = this._currentPiece.y + offsetY;

        for (let y = 0; y < testShape.length; y++) {
            for (let x = 0; x < testShape[y].length; x++) {
                if (testShape[y][x]) {
                    const boardX = testX + x;
                    const boardY = testY + y;

                    // Check if out of bounds
                    if (boardX < 0 || boardX >= this.boardWidth || boardY < 0) {
                        return false;
                    }

                    // Check if position is already occupied
                    if (boardY < this.boardHeight && this._board[boardY][boardX]) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    movePieceLeft() {
        if (this.isValidPosition(-1, 0)) {
            this._currentPiece.x--;
            this.updatePiecePosition();
        }
    }

    movePieceRight() {
        if (this.isValidPosition(1, 0)) {
            this._currentPiece.x++;
            this.updatePiecePosition();
        }
    }

    movePieceDown() {
        if (this.isValidPosition(0, -1)) {
            this._currentPiece.y--;
            this.updatePiecePosition();
            return true;
        }
        this.lockPiece();
        return false;

    }

    hardDrop() {
        let distance = 0;
        while (this.isValidPosition(0, -distance - 1)) {
            distance++;
        }

        if (distance > 0) {
            this._currentPiece.y -= distance;
            this.updatePiecePosition();
            this.lockPiece();

            // Play drop sound
            this.playSound('drop');
        }
    }

    rotatePiece() {
        // Create a new rotated shape
        const currentShape = this._currentPiece.shape;
        const size = currentShape.length;
        const rotatedShape = [];

        for (let y = 0; y < size; y++) {
            rotatedShape[y] = [];
            for (let x = 0; x < size; x++) {
                rotatedShape[y][x] = currentShape[size - 1 - x][y];
            }
        }

        // Check if the rotated position is valid
        if (this.isValidPosition(0, 0, rotatedShape)) {
            this._currentPiece.shape = rotatedShape;
            this.createPieceBlocks();

            // Play rotate sound
            this.playSound('rotate');
        }
    }

    lockPiece() {
        // Add the piece to the board
        for (let y = 0; y < this._currentPiece.shape.length; y++) {
            for (let x = 0; x < this._currentPiece.shape[y].length; x++) {
                if (this._currentPiece.shape[y][x]) {
                    const boardX = this._currentPiece.x + x;
                    const boardY = this._currentPiece.y + y;

                    if (boardY >= 0 && boardY < this.boardHeight) {
                        this._board[boardY][boardX] = {
                            material: this._currentPiece.material
                        };
                    }
                }
            }
        }

        // Keep the blocks in the scene
        this._currentPiece.blocks.forEach((block) => {
            // Don't destroy the blocks, they're now part of the board
        });

        // Clear any completed lines
        const linesCleared = this.clearLines();

        // Update score
        if (linesCleared > 0) {
            this.updateScore(linesCleared);
        }

        // Generate a new piece
        this.generateNewPiece();
    }

    clearLines() {
        let linesCleared = 0;

        // Check each row from bottom to top
        for (let y = 0; y < this.boardHeight; y++) {
            let lineComplete = true;

            // Check if the line is complete
            for (let x = 0; x < this.boardWidth; x++) {
                if (!this._board[y][x]) {
                    lineComplete = false;
                    break;
                }
            }

            if (lineComplete) {
                linesCleared++;

                // Remove the line
                for (let x = 0; x < this.boardWidth; x++) {
                    // Find and remove the block entity
                    const posX = (x - this.boardWidth / 2 + 0.5) * this.blockSize;
                    const posY = (y + 0.5) * this.blockSize;

                    // Find blocks at this position
                    const blocks = this.entity.children.filter((child) => {
                        if (!child.name.startsWith('block-')) return false;
                        const pos = child.getLocalPosition();
                        return Math.abs(pos.x - posX) < 0.1 && Math.abs(pos.y - posY) < 0.1;
                    });

                    // Destroy the blocks
                    blocks.forEach((block) => {
                        block.destroy();
                    });

                    this._board[y][x] = null;
                }

                // Move all lines above down
                for (let moveY = y; moveY < this.boardHeight - 1; moveY++) {
                    for (let x = 0; x < this.boardWidth; x++) {
                        this._board[moveY][x] = this._board[moveY + 1][x];

                        // Move the block entity down
                        if (this._board[moveY][x]) {
                            const posX = (x - this.boardWidth / 2 + 0.5) * this.blockSize;
                            const posYOld = (moveY + 1 + 0.5) * this.blockSize;
                            const posYNew = (moveY + 0.5) * this.blockSize;

                            // Find blocks at the old position
                            const blocks = this.entity.children.filter((child) => {
                                if (!child.name.startsWith('block-')) return false;
                                const pos = child.getLocalPosition();
                                return Math.abs(pos.x - posX) < 0.1 && Math.abs(pos.y - posYOld) < 0.1;
                            });

                            // Move the blocks to the new position
                            blocks.forEach((block) => {
                                block.setLocalPosition(posX, posYNew, 0);
                            });
                        }
                    }
                }

                // Clear the top line
                for (let x = 0; x < this.boardWidth; x++) {
                    this._board[this.boardHeight - 1][x] = null;
                }

                // Check the same line again (since we moved everything down)
                y--;
            }
        }

        // Play sound based on lines cleared
        if (linesCleared === 4) {
            this.playSound('clear4');
        } else if (linesCleared > 0) {
            this.playSound('clear1');
        }

        return linesCleared;
    }

    updateScore(linesCleared) {
        // Update lines cleared
        this._lines += linesCleared;

        // Calculate score based on lines cleared and level
        // Using the original Nintendo scoring system
        let points = 0;
        switch (linesCleared) {
            case 1:
                points = 40 * this._level;
                break;
            case 2:
                points = 100 * this._level;
                break;
            case 3:
                points = 300 * this._level;
                break;
            case 4:
                points = 1200 * this._level;
                break;
        }

        this._score += points;

        // Update level (every 10 lines)
        const newLevel = Math.floor(this._lines / 10) + 1;
        if (newLevel > this._level) {
            this._level = newLevel;
            // Increase speed with level
            this._dropInterval = Math.max(100, 1000 - (this._level - 1) * 100);
        }

        // Update UI
        this.updateUI();
    }

    updateUI() {
        document.getElementById('score-value').textContent = this._score;
        document.getElementById('level-value').textContent = this._level;
        document.getElementById('lines-value').textContent = this._lines;
    }

    gameOver() {
        this._gameOver = true;

        // Show game over UI
        document.getElementById('game-over').style.display = 'block';
        document.getElementById('final-score').textContent = this._score;

        // Play game over sound
        this.playSound('gameover');
    }

    restartGame() {
        // Hide game over UI
        document.getElementById('game-over').style.display = 'none';

        // Reset game state
        this._gameOver = false;
        this._paused = false;
        this._score = 0;
        this._level = 1;
        this._lines = 0;
        this._dropInterval = 1000;
        this._dropTimer = 0;

        // Clear the board
        this.initBoard();

        // Remove all block entities
        const blocksToRemove = [];
        this.entity.children.forEach((child) => {
            if (child.name.startsWith('block-')) {
                blocksToRemove.push(child);
            }
        });

        blocksToRemove.forEach((block) => {
            block.destroy();
        });

        // Generate new piece
        this.generateNewPiece();

        // Update UI
        this.updateUI();
    }

    togglePause() {
        this._paused = !this._paused;
    }

    playSound(slotName) {
        // Play the sound by slot name
        this.entity.sound?.play(slotName);
    }

    onKeyDown(event) {
        if (this._gameOver) return;

        // Handle input
        switch (event.key) {
            case KEY_LEFT:
                if (!this._paused) this.movePieceLeft();
                break;
            case KEY_RIGHT:
                if (!this._paused) this.movePieceRight();
                break;
            case KEY_DOWN:
                if (!this._paused) this.movePieceDown();
                break;
            case KEY_UP:
                if (!this._paused) this.rotatePiece();
                break;
            case KEY_SPACE:
                if (!this._paused) this.hardDrop();
                break;
            case KEY_P:
                this.togglePause();
                break;
        }
    }
}
