import { CULLFACE_NONE, FILTER_LINEAR, PIXELFORMAT_RGBA8, BlendState, Color, Entity, Layer, Mesh, MeshInstance, PlaneGeometry, Script, StandardMaterial, Texture } from 'playcanvas';

/** @import { Application, CameraComponent } from 'playcanvas' */

/** @type {HTMLDivElement | null} */
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

    /**
     * Creates a circular hotspot texture
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

    initialize() {
        // Create tooltip element
        this._tooltip = document.createElement('div');
        this._tooltip.className = 'pc-annotation';
        Object.assign(this._tooltip.style, {
            display: 'block',  // Changed from 'none' to always be in layout
            position: 'absolute',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
            pointerEvents: 'none',
            maxWidth: '200px',
            wordWrap: 'break-word',
            overflowX: 'visible',
            whiteSpace: 'normal',
            width: 'fit-content',
            opacity: '0',  // Start hidden
            transition: 'opacity 0.2s ease-in-out',
            visibility: 'hidden'  // Hide from interactions when faded out
        });

        // Add title
        const titleElement = document.createElement('div');
        Object.assign(titleElement.style, {
            fontWeight: 'bold',
            marginBottom: '4px'
        });
        titleElement.textContent = this.title;
        this._tooltip.appendChild(titleElement);

        // Add text
        const textElement = document.createElement('div');
        textElement.textContent = this.text;
        this._tooltip.appendChild(textElement);

        // Create hotspot element
        this._hotspot = document.createElement('div');
        this._hotspot.className = 'pc-annotation-hotspot';
        Object.assign(this._hotspot.style, {
            display: 'none',
            position: 'absolute',
            width: '30px',
            height: '30px',
            // backgroundColor: 'white',
            // border: '2px solid black',
            // borderRadius: '50%',
            opacity: '0',  // Make invisible
            cursor: 'pointer',
            transform: 'translate(-50%, -50%)'  // Center the hotspot
        });

        // Add click handlers
        this._hotspot.addEventListener('click', (e) => {
            e.stopPropagation();
            if (Annotation._activeTooltip && Annotation._activeTooltip !== this._tooltip) {
                this._hideTooltip(Annotation._activeTooltip);
            }
            if (this._tooltip.style.visibility === 'hidden') {
                this._showTooltip(this._tooltip);
            } else {
                this._hideTooltip(this._tooltip);
            }
            Annotation._activeTooltip = this._tooltip.style.visibility === 'hidden' ? null : this._tooltip;
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

            // Create texture for both materials
            const textureNormal = Annotation.createHotspotTexture(this.app, 0.8);
            const textureMuted = Annotation.createHotspotTexture(this.app, 0.25);

            // Create materials
            Annotation.materialNormal = new StandardMaterial();
            Annotation.materialNormal.diffuse = Color.BLACK;
            Annotation.materialNormal.emissive = Color.WHITE;
            Annotation.materialNormal.emissiveMap = textureNormal;
            Annotation.materialNormal.opacityMap = textureNormal;
            Annotation.materialNormal.blendState = BlendState.ALPHABLEND;
            Annotation.materialNormal.alphaTest = 0.01;
            Annotation.materialNormal.depthTest = true;
            Annotation.materialNormal.depthWrite = true;
            Annotation.materialNormal.cull = CULLFACE_NONE;
            Annotation.materialNormal.useLighting = false;
            Annotation.materialNormal.update();

            Annotation.materialMuted = new StandardMaterial();
            Annotation.materialMuted.diffuse = Color.BLACK;
            Annotation.materialMuted.emissive = Color.WHITE;
            Annotation.materialMuted.emissiveMap = textureMuted;
            Annotation.materialMuted.opacityMap = textureMuted;
            Annotation.materialMuted.opacity = 0.25;
            Annotation.materialMuted.alphaTest = 0.01;
            Annotation.materialMuted.blendState = BlendState.ALPHABLEND;
            Annotation.materialMuted.depthWrite = true;
            Annotation.materialMuted.depthTest = false;
            Annotation.materialMuted.cull = CULLFACE_NONE;
            Annotation.materialMuted.useLighting = false;
            Annotation.materialMuted.update();

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

    update() {
        if (!this.camera) return;

        // Convert world position to screen space
        const { x, y, z } = this.camera.worldToScreen(this.entity.getPosition());

        // Check if annotation is in front of camera
        if (z > 0) {
            // Show and position hotspot
            this._hotspot.style.display = 'block';
            this._hotspot.style.left = `${x}px`;
            this._hotspot.style.top = `${y}px`;

            // Position tooltip
            this._tooltip.style.left = `${x}px`;
            this._tooltip.style.top = `${y}px`;

            // Copy camera rotation to align with view plane
            const cameraRotation = this.camera.entity.getRotation();
            this.hotspotNormal.setRotation(cameraRotation);
            this.hotspotNormal.rotateLocal(90, 0, 0);
            this.hotspotMuted.setRotation(cameraRotation);
            this.hotspotMuted.rotateLocal(90, 0, 0);

            // Calculate scale based on distance to near plane to maintain constant screen size
            const cameraPos = this.camera.entity.getPosition();
            const cameraForward = this.camera.entity.forward;
            const toAnnotation = this.entity.getPosition().sub(cameraPos);
            const distanceToNearPlane = toAnnotation.dot(cameraForward);
            const scale = distanceToNearPlane * Math.tan(this.camera.fov * Math.PI / 180) * 0.025;
            this.hotspotNormal.setLocalScale(scale, scale, scale);
            this.hotspotMuted.setLocalScale(scale, scale, scale);
        } else {
            // Hide both if behind camera
            this._hotspot.style.display = 'none';
            if (this._tooltip.style.visibility !== 'hidden') {
                this._hideTooltip(this._tooltip);
                if (Annotation._activeTooltip === this._tooltip) {
                    Annotation._activeTooltip = null;
                }
            }
        }
    }
}
