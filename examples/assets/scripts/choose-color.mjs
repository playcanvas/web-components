import { math, Script, Color } from 'playcanvas';

/**
 * Exterior paint options, drawn from the 991-generation 911's own palette. `finish` is Porsche's
 * own grouping and drives both the label and the shading: only Metallic paints get metalness,
 * while Solid and Special colors are pigment over a clear coat.
 */
const PAINTS = [
    { name: 'Carrara White', hex: '#e6e7e4', finish: 'Metallic' },
    { name: 'GT Silver', hex: '#b4b7b8', finish: 'Metallic' },
    { name: 'Agate Grey', hex: '#585c5e', finish: 'Metallic' },
    { name: 'Jet Black', hex: '#0e0f10', finish: 'Metallic' },
    { name: 'Sapphire Blue', hex: '#1b3868', finish: 'Metallic' },
    { name: 'Guards Red', hex: '#cc0000', finish: 'Solid' },
    { name: 'Racing Yellow', hex: '#ffcc00', finish: 'Solid' },
    { name: 'Miami Blue', hex: '#00a2d8', finish: 'Special' },
    { name: 'Lava Orange', hex: '#f4550c', finish: 'Special' },
    { name: 'Carmine Red', hex: '#9d0b25', finish: 'Special' }
];

/** The paint applied on load, so the panel's name always matches what is on the car. */
const DEFAULT_PAINT = 'GT Silver';

const STYLES = `
.cfg-panel {
    position: fixed;
    bottom: max(16px, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 18px 16px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(14, 15, 16, 0.72);
    backdrop-filter: blur(20px) saturate(1.3);
    -webkit-backdrop-filter: blur(20px) saturate(1.3);
    box-shadow: 0 10px 36px rgba(0, 0, 0, 0.4);
    font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    transition: opacity 0.5s ease;
}

.cfg-caption {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-height: 18px;
}

.cfg-name {
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
}

.cfg-finish {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.cfg-swatches {
    display: flex;
    gap: 10px;
}

.cfg-swatch {
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    /* A soft highlight reads as paint under a studio light rather than a flat chip */
    background-image: radial-gradient(circle at 34% 26%, rgba(255, 255, 255, 0.5), transparent 46%);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28), 0 2px 6px rgba(0, 0, 0, 0.35);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

/* Metallic flake catches the light more sharply than solid pigment */
.cfg-swatch[data-finish="Metallic"] {
    background-image: radial-gradient(circle at 34% 24%, rgba(255, 255, 255, 0.72), transparent 40%);
}

.cfg-swatch:hover {
    transform: translateY(-2px);
}

.cfg-swatch:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 3px;
}

.cfg-swatch[aria-pressed="true"] {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28), 0 0 0 2px #fff, 0 2px 8px rgba(0, 0, 0, 0.45);
}

/* Keep clear of the example harness's own buttons in the bottom-right corner */
@media (max-width: 700px) {
    .cfg-panel {
        bottom: max(72px, env(safe-area-inset-bottom));
    }
}
`;

export class ChooseColor extends Script {
    static scriptName = 'chooseColor';

    /** Seconds are the reciprocal of this: 2 gives a half-second cross-fade. */
    static TRANSITION_SPEED = 2;

    /**
     * Metallic paint is a pigmented base coat with aluminium flake, so it wants some metalness -
     * but not a mirror. Solid and Special colors get their shine from the clear coat alone.
     */
    static METALNESS = {
        Metallic: 0.8,
        Solid: 0,
        Special: 0
    };

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

    /** @type {HTMLElement} */
    panel = null;

    /** @type {HTMLElement} */
    nameEl = null;

    /** @type {HTMLElement} */
    finishEl = null;

    /** @type {HTMLButtonElement[]} */
    swatches = [];

    initialize() {
        this.findMaterial();
        this.createUI();

        const initial = PAINTS.find((paint) => paint.name === DEFAULT_PAINT) ?? PAINTS[0];
        this.select(initial, false);

        this.on('destroy', () => this.panel?.remove());
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

                    // Automotive paint is pigment under lacquer: the clear coat supplies the
                    // sharp reflection, so it is set once rather than per frame.
                    this.material.useMetalness = true;
                    this.material.clearCoat = 0.25;
                    this.material.clearCoatGloss = 0.9;
                    this.material.gloss = 0.85;
                    this.material.update();
                    return;
                }
            }
        }
    }

    createUI() {
        if (!document.getElementById('cfg-styles')) {
            const style = document.createElement('style');
            style.id = 'cfg-styles';
            style.textContent = STYLES;
            document.head.appendChild(style);
        }

        this.panel = document.createElement('div');
        this.panel.classList.add('cfg-panel');

        const caption = document.createElement('div');
        caption.classList.add('cfg-caption');
        this.nameEl = document.createElement('span');
        this.nameEl.classList.add('cfg-name');
        this.finishEl = document.createElement('span');
        this.finishEl.classList.add('cfg-finish');
        caption.append(this.nameEl, this.finishEl);

        const swatches = document.createElement('div');
        swatches.classList.add('cfg-swatches');
        swatches.setAttribute('role', 'group');
        swatches.setAttribute('aria-label', 'Exterior color');
        this.swatches = PAINTS.map((paint) => {
            const button = document.createElement('button');
            button.classList.add('cfg-swatch');
            button.style.backgroundColor = paint.hex;
            button.dataset.finish = paint.finish;
            button.title = `${paint.name} - ${paint.finish}`;
            button.setAttribute('aria-label', `${paint.name}, ${paint.finish}`);
            button.setAttribute('aria-pressed', 'false');
            button.onclick = () => this.select(paint, true);
            swatches.appendChild(button);
            return button;
        });

        this.panel.append(caption, swatches);
        document.body.appendChild(this.panel);
    }

    /**
     * Applies a paint, cross-fading from whatever is on the car unless `animate` is false.
     *
     * @param {object} paint - The entry from PAINTS to apply.
     * @param {boolean} animate - Whether to cross-fade rather than snap.
     */
    select(paint, animate) {
        this.nameEl.textContent = paint.name;
        this.finishEl.textContent = paint.finish;
        this.swatches.forEach((button, i) => {
            button.setAttribute('aria-pressed', String(PAINTS[i] === paint));
        });

        if (!this.material) return;

        this.fromColor.copy(this.material.diffuse);
        this.toColor.fromString(paint.hex);
        this.fromMetalness = this.material.metalness;
        this.toMetalness = ChooseColor.METALNESS[paint.finish];
        this.lerpTime = 0;
        this.isTransitioning = true;

        if (!animate) {
            this.updateMaterial(1);
            this.isTransitioning = false;
        }
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
        this.material.update();
    }
}
