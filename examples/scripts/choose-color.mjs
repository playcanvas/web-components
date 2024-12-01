import { math, Script, Color } from 'playcanvas';

export class ChooseColor extends Script {
    // Define available colors as a static property
    static PAINT_OPTIONS = [
        { name: 'Guards Red', color: new Color(0.902, 0.004, 0.086), metallic: false },
        { name: 'Racing Yellow', color: new Color(1, 0.831, 0), metallic: false },
        { name: 'GT Silver', color: new Color(0.82, 0.82, 0.82), metallic: true },
        { name: 'Jet Black', color: new Color(0.05, 0.05, 0.05), metallic: true },
        { name: 'Carrara White', color: new Color(0.95, 0.95, 0.95), metallic: false },
        { name: 'Gentian Blue', color: new Color(0.15, 0.24, 0.41), metallic: true },
        { name: 'Agate Grey', color: new Color(0.47, 0.47, 0.47), metallic: true },
        { name: 'Shark Blue', color: new Color(0.16, 0.33, 0.47), metallic: true },
        { name: 'Python Green', color: new Color(0.38, 0.45, 0.23), metallic: true },
        { name: 'Miami Blue', color: new Color(0, 0.67, 0.87), metallic: false }
    ];

    // Constants
    static TRANSITION_SPEED = 2;  // 0.5 seconds transition

    static METALNESS = {
        METALLIC: 0.9,
        NON_METALLIC: 0
    };

    // Initialize properties
    /**
     * @type {import('playcanvas').StandardMaterial}
     */
    material = null;

    fromColor = new Color();

    toColor = new Color();

    fromMetalness = 0;

    toMetalness = 0;

    lerpTime = 0;

    isTransitioning = false;

    initialize() {
        this.findMaterial();
        this.createUI();
    }

    findMaterial() {
        for (const render of this.entity.findComponents('render')) {
            for (const meshInstance of render.meshInstances) {
                if (meshInstance.material.name === 'coat') {
                    this.material = meshInstance.material;
                    this.fromColor.copy(this.material.diffuse);
                    this.toColor.copy(this.material.diffuse);
                    this.fromMetalness = this.material.metalness;
                    this.toMetalness = this.material.metalness;
                    return;
                }
            }
        }
    }

    createUI() {
        const container = this.createContainer();
        ChooseColor.PAINT_OPTIONS.forEach((color) => {
            container.appendChild(this.createColorButton(color));
        });
        document.body.appendChild(container);
    }

    createContainer() {
        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            right: 'max(16px, env(safe-area-inset-right))',
            zIndex: '1000',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '8px'
        });
        return container;
    }

    createColorButton(color) {
        const button = document.createElement('button');
        button.title = color.name;
        Object.assign(button.style, {
            width: '40px',
            height: '40px',
            border: '2px solid black',
            backgroundColor: color.color.toString(),
            cursor: 'pointer',
            padding: '0',
            borderRadius: '4px'
        });
        button.onclick = () => this.startColorTransition(color);
        return button;
    }

    startColorTransition(color) {
        if (!this.material) return;

        this.fromColor.copy(this.material.diffuse);
        this.toColor.copy(color.color);
        this.fromMetalness = this.material.metalness;
        this.toMetalness = color.metallic ?
            ChooseColor.METALNESS.METALLIC :
            ChooseColor.METALNESS.NON_METALLIC;
        this.lerpTime = 0;
        this.isTransitioning = true;
    }

    update(dt) {
        if (!this.isTransitioning || !this.material) return;

        this.lerpTime += dt * ChooseColor.TRANSITION_SPEED;
        const t = Math.min(this.lerpTime, 1);

        this.updateMaterial(t);

        if (t >= 1) {
            this.isTransitioning = false;
        }
    }

    updateMaterial(t) {
        this.material.diffuse.lerp(this.fromColor, this.toColor, t);
        this.material.metalness = math.lerp(this.fromMetalness, this.toMetalness, t);
        this.material.clearCoat = 0.25;
        this.material.clearCoatGloss = 0.9;
        this.material.update();
    }
}
