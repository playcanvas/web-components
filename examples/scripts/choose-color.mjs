import { Script, Color } from 'playcanvas';

export class ChooseColor extends Script {
    material = null;
    fromColor = new Color();
    toColor = new Color();
    fromMetalness = 0;
    toMetalness = 0;
    lerpTime = 0;
    isTransitioning = false;

    createUI() {
        const colors = [
            { name: 'Guards Red', color: new Color(0.77, 0.12, 0.23), metallic: false },
            { name: 'Racing Yellow', color: new Color(1, 0.89, 0), metallic: false },
            { name: 'GT Silver', color: new Color(0.82, 0.82, 0.82), metallic: true },
            { name: 'Jet Black', color: new Color(0.05, 0.05, 0.05), metallic: true },
            { name: 'Carrara White', color: new Color(0.95, 0.95, 0.95), metallic: false },
            { name: 'Gentian Blue', color: new Color(0.15, 0.24, 0.41), metallic: true },
            { name: 'Agate Grey', color: new Color(0.47, 0.47, 0.47), metallic: true },
            { name: 'Shark Blue', color: new Color(0.16, 0.33, 0.47), metallic: true },
            { name: 'Python Green', color: new Color(0.38, 0.45, 0.23), metallic: true },
            { name: 'Miami Blue', color: new Color(0, 0.57, 0.71), metallic: false }
        ];
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '10px';
        container.style.left = '10px';
        container.style.zIndex = '1000';
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(5, 1fr)';  // 5 colors per row
        container.style.gap = '8px';  // Space between buttons

        for (const color of colors) {
            const button = document.createElement('button');
            button.title = color.name;  // Show name on hover
            Object.assign(button.style, {
                width: '40px',
                height: '40px',
                border: '2px solid black',
                backgroundColor: color.color.toString(),
                cursor: 'pointer',
                padding: '0'
            });
            button.onclick = () => {
                if (this.material) {
                    this.fromColor.copy(this.material.diffuse);
                    this.toColor.copy(color.color);
                    this.fromMetalness = this.material.metalness;
                    this.toMetalness = color.metallic ? 0.9 : 0.3;
                    this.lerpTime = 0;
                    this.isTransitioning = true;
                }
            };
            container.appendChild(button);
        }

        document.body.appendChild(container);
    }

    initialize() {
        // find the material with name 'coat'
        const renderComponents = this.entity.findComponents('render');
        for (const renderComponent of renderComponents) {
            const meshInstances = renderComponent.meshInstances;
            for (const meshInstance of meshInstances) {
                const material = meshInstance.material;
                if (material.name === 'coat') {
                    this.material = material;
                    // Store initial color
                    this.fromColor.copy(material.diffuse);
                    this.toColor.copy(material.diffuse);
                    this.fromMetalness = material.metalness;
                    this.toMetalness = material.metalness;
                    break;
                }
            }
        }

        this.createUI();
    }

    update(dt) {
        if (this.isTransitioning && this.material) {
            this.lerpTime += dt * 2;
            const t = Math.min(this.lerpTime, 1);
            
            // Lerp both color and metalness
            this.material.diffuse.lerp(this.fromColor, this.toColor, t);
            this.material.metalness = this.fromMetalness + (this.toMetalness - this.fromMetalness) * t;
            this.material.update();

            if (t >= 1) {
                this.isTransitioning = false;
            }
        }
    }
}
