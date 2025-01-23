import {
    CULLFACE_NONE,
    FILTER_LINEAR,
    PIXELFORMAT_RGBA8,
    BlendState,
    Color,
    Entity,
    Layer,
    Mesh,
    MeshInstance,
    PlaneGeometry,
    Script,
    StandardMaterial,
    Texture
} from 'playcanvas';

/** @import { Application, CameraComponent, Quat, Vec3 } from 'playcanvas' */

/**
 * A script for creating interactive 3D annotations in a scene. Each annotation consists of:
 *
 * - A 3D hotspot that maintains constant screen-space size. The hotspot is rendered with muted
 * appearance when obstructed by geometry but is still clickable. The hotspot relies on an
 * invisible DOM element that matches the hotspot's size and position to detect clicks.
 * - An annotation panel that shows title and description text.
 */
export class Annotation extends Script {
    /** @type {HTMLDivElement | null} */
    static _activeTooltip = null;

    /** @type {Layer | null} */
    static layerNormal = null;

    /** @type {Layer | null} */
    static layerMuted = null;

    /** @type {StandardMaterial | null} */
    static materialNormal = null;

    /** @type {StandardMaterial | null} */
    static materialMuted = null;

    /** @type {Mesh | null} */
    static mesh = null;

    /** @type {Entity | null} */
    hotspotNormal = null;

    /** @type {Entity | null} */
    hotspotMuted = null;

    /**
     * @type {string}
     * @attribute
     */
    title;

    /**
     * @type {string}
     * @attribute
     */
    text;

    /**
     * @type {CameraComponent}
     * @private
     */
    camera;

    /**
     * @type {HTMLDivElement}
     * @private
     */
    _tooltip;

    /**
     * @type {HTMLDivElement}
     * @private
     */
    _hotspot;

    /** @type {HTMLStyleElement | null} */
    static _styleSheet = null;

    /**
     * Injects required CSS styles into the document
     * @private
     */
    static _injectStyles() {
        if (this._styleSheet) return;

        const css = `
            .pc-annotation {
                display: block;
                position: absolute;
                background-color: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
                pointer-events: none;
                max-width: 200px;
                word-wrap: break-word;
                overflow-x: visible;
                white-space: normal;
                width: fit-content;
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
                visibility: hidden;
            }

            .pc-annotation-title {
                font-weight: bold;
                margin-bottom: 4px;
            }

            .pc-annotation-hotspot {
                display: none;
                position: absolute;
                width: 30px;
                height: 30px;
                opacity: 0;
                cursor: pointer;
                transform: translate(-50%, -50%);
            }
        `;

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        this._styleSheet = style;
    }

    /**
     * Creates a circular hotspot texture.
     * @param {Application} app - The PlayCanvas application
     * @param {number} [alpha] - The opacity of the hotspot
     * @param {number} [size] - The texture size (should be power of 2)
     * @param {string} [fillColor] - The circle fill color
     * @param {string} [strokeColor] - The border color
     * @param {number} [borderWidth] - The border width in pixels
     * @returns {Texture} The hotspot texture
     */
    static createHotspotTexture(app, alpha = 0.8, size = 64, fillColor = '#000000', strokeColor = '#939393', borderWidth = 6) {
        // Create canvas for hotspot texture
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // First clear with stroke color at zero alpha
        ctx.fillStyle = strokeColor;
        ctx.globalAlpha = 0;
        ctx.fillRect(0, 0, size, size);
        ctx.globalAlpha = alpha;

        // Draw dark circle with light border
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = (size / 2) - 4; // Leave space for border

        // Draw main circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Draw border
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();

        // Create texture from canvas
        const texture = new Texture(app.graphicsDevice, {
            width: size,
            height: size,
            format: PIXELFORMAT_RGBA8,
            magFilter: FILTER_LINEAR,
            minFilter: FILTER_LINEAR,
            mipmaps: false
        });
        texture.setSource(canvas);

        return texture;
    }

    /**
     * Creates a material for hotspot rendering.
     * @param {Texture} texture - The texture to use for emissive and opacity
     * @param {object} [options] - Material options
     * @param {number} [options.opacity] - Base opacity multiplier
     * @param {boolean} [options.depthTest] - Whether to perform depth testing
     * @param {boolean} [options.depthWrite] - Whether to write to depth buffer
     * @returns {StandardMaterial} The configured material
     * @private
     */
    static _createHotspotMaterial(texture, { opacity = 1, depthTest = true, depthWrite = true } = {}) {
        const material = new StandardMaterial();

        // Base properties
        material.diffuse = Color.BLACK;
        material.emissive = Color.WHITE;
        material.emissiveMap = texture;
        material.opacityMap = texture;

        // Alpha properties
        material.opacity = opacity;
        material.alphaTest = 0.01;
        material.blendState = BlendState.ALPHABLEND;

        // Depth properties
        material.depthTest = depthTest;
        material.depthWrite = depthWrite;

        // Rendering properties
        material.cull = CULLFACE_NONE;
        material.useLighting = false;

        material.update();
        return material;
    }

    initialize() {
        // Ensure styles are injected
        Annotation._injectStyles();

        // Create tooltip element
        this._tooltip = document.createElement('div');
        this._tooltip.className = 'pc-annotation';

        // Add title
        const titleElement = document.createElement('div');
        titleElement.className = 'pc-annotation-title';
        titleElement.textContent = this.title;
        this._tooltip.appendChild(titleElement);

        // Add text
        const textElement = document.createElement('div');
        textElement.textContent = this.text;
        this._tooltip.appendChild(textElement);

        // Create hotspot element
        this._hotspot = document.createElement('div');
        this._hotspot.className = 'pc-annotation-hotspot';

        // Add click handlers
        this._hotspot.addEventListener('click', (e) => {
            e.stopPropagation();

            // Hide any other active tooltip
            if (Annotation._activeTooltip && Annotation._activeTooltip !== this._tooltip) {
                this._hideTooltip(Annotation._activeTooltip);
            }

            // Toggle this tooltip
            if (Annotation._activeTooltip === this._tooltip) {
                this._hideTooltip(this._tooltip);
                Annotation._activeTooltip = null;
            } else {
                this._showTooltip(this._tooltip);
                Annotation._activeTooltip = this._tooltip;
            }
        });

        document.addEventListener('click', () => {
            if (Annotation._activeTooltip) {
                this._hideTooltip(Annotation._activeTooltip);
                Annotation._activeTooltip = null;
            }
        });

        document.body.appendChild(this._tooltip);
        document.body.appendChild(this._hotspot);

        this.camera = this.app.root.findComponent('camera');

        // Create static resources
        if (!Annotation.layerMuted) {
            const createLayer = (name) => {
                const layer = new Layer({
                    name: name
                });
                const worldLayer = this.app.scene.layers.getLayerByName('World');
                const idx = this.app.scene.layers.getTransparentIndex(worldLayer);
                this.app.scene.layers.insert(layer, idx + 1);
                return layer;
            };
            Annotation.layerMuted = createLayer('HotspotMuted');
            Annotation.layerNormal = createLayer('HotspotNormal');

            // After creating layers
            this.camera.layers = [
                ...this.camera.layers,
                Annotation.layerNormal.id,
                Annotation.layerMuted.id
            ];

            // Create textures
            const textureNormal = Annotation.createHotspotTexture(this.app, 0.9);
            const textureMuted = Annotation.createHotspotTexture(this.app, 0.25);

            // Create materials using helper
            Annotation.materialNormal = Annotation._createHotspotMaterial(textureNormal, {
                opacity: 1,
                depthTest: true,
                depthWrite: true
            });

            Annotation.materialMuted = Annotation._createHotspotMaterial(textureMuted, {
                opacity: 0.25,
                depthTest: false,
                depthWrite: true
            });

            Annotation.mesh = Mesh.fromGeometry(this.app.graphicsDevice, new PlaneGeometry());
        }

        const meshInstanceNormal = new MeshInstance(Annotation.mesh, Annotation.materialNormal);
        const meshInstanceMuted = new MeshInstance(Annotation.mesh, Annotation.materialMuted);

        this.hotspotNormal = new Entity();
        this.hotspotNormal.addComponent('render', {
            layers: [Annotation.layerNormal.id],
            meshInstances: [meshInstanceNormal]
        });
        this.entity.addChild(this.hotspotNormal);

        this.hotspotMuted = new Entity();
        this.hotspotMuted.addComponent('render', {
            layers: [Annotation.layerMuted.id],
            meshInstances: [meshInstanceMuted]
        });
        this.entity.addChild(this.hotspotMuted);

        // Clean up on entity destruction
        this.on('destroy', () => {
            this._tooltip.remove();
            this._hotspot.remove();
            if (Annotation._activeTooltip === this._tooltip) {
                Annotation._activeTooltip = null;
            }
        });
    }

    /**
     * @private
     * @param {HTMLDivElement} tooltip - The tooltip element
     */
    _showTooltip(tooltip) {
        tooltip.style.visibility = 'visible';
        tooltip.style.opacity = '1';
    }

    /**
     * @private
     * @param {HTMLDivElement} tooltip - The tooltip element
     */
    _hideTooltip(tooltip) {
        tooltip.style.opacity = '0';
        // Wait for fade out before hiding
        setTimeout(() => {
            if (tooltip.style.opacity === '0') {
                tooltip.style.visibility = 'hidden';
            }
        }, 200); // Match the transition duration
    }

    update(dt) {
        if (!this.camera) return;

        const position = this.entity.getPosition();
        const screenPos = this.camera.worldToScreen(position);

        if (screenPos.z <= 0) {
            this._hideElements();
            return;
        }

        this._updatePositions(screenPos);
        this._updateRotationAndScale();
    }

    /**
     * Hide all elements when annotation is behind camera.
     * @private
     */
    _hideElements() {
        this._hotspot.style.display = 'none';
        if (this._tooltip.style.visibility !== 'hidden') {
            this._hideTooltip(this._tooltip);
            if (Annotation._activeTooltip === this._tooltip) {
                Annotation._activeTooltip = null;
            }
        }
    }

    /**
     * Update screen-space positions of HTML elements.
     * @param {Vec3} screenPos - Screen coordinate
     * @private
     */
    _updatePositions(screenPos) {
        // Show and position hotspot
        this._hotspot.style.display = 'block';
        this._hotspot.style.left = `${screenPos.x}px`;
        this._hotspot.style.top = `${screenPos.y}px`;

        // Position tooltip
        this._tooltip.style.left = `${screenPos.x}px`;
        this._tooltip.style.top = `${screenPos.y}px`;
    }

    /**
     * Update 3D rotation and scale of hotspot planes.
     * @private
     */
    _updateRotationAndScale() {
        // Copy camera rotation to align with view plane
        const cameraRotation = this.camera.entity.getRotation();
        this._updateHotspotTransform(this.hotspotNormal, cameraRotation);
        this._updateHotspotTransform(this.hotspotMuted, cameraRotation);

        // Calculate scale based on distance to maintain constant screen size
        const scale = this._calculateScreenSpaceScale();
        this.hotspotNormal.setLocalScale(scale, scale, scale);
        this.hotspotMuted.setLocalScale(scale, scale, scale);
    }

    /**
     * Update rotation of a single hotspot entity.
     * @param {Entity} hotspot - The hotspot entity to update
     * @param {Quat} cameraRotation - The camera's current rotation
     * @private
     */
    _updateHotspotTransform(hotspot, cameraRotation) {
        hotspot.setRotation(cameraRotation);
        hotspot.rotateLocal(90, 0, 0);
    }

    /**
     * Calculate scale factor to maintain constant screen-space size.
     * @returns {number} The scale to apply to hotspot entities
     * @private
     */
    _calculateScreenSpaceScale() {
        const cameraPos = this.camera.entity.getPosition();
        const cameraForward = this.camera.entity.forward;
        const toAnnotation = this.entity.getPosition().sub(cameraPos);
        const distanceToNearPlane = toAnnotation.dot(cameraForward);
        return distanceToNearPlane * Math.tan(this.camera.fov * Math.PI / 180) * 0.025;
    }
}
