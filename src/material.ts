import { Color, StandardMaterial } from 'playcanvas';

import { AssetElement } from './asset';
import { parseColor } from './utils';

/**
 * The MaterialElement interface provides properties and methods for manipulating
 * `<pc-material>` elements. The MaterialElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 */
class MaterialElement extends HTMLElement {
    private _diffuse = new Color(1, 1, 1);

    private _diffuseMap = '';

    private _metalnessMap = '';

    private _normalMap = '';

    private _roughnessMap = '';

    material: StandardMaterial | null = null;

    createMaterial() {
        this.material = new StandardMaterial();
        this.material.glossInvert = true;
        this.material.useMetalness = true;
        this.material.diffuse = this._diffuse;
        this.diffuseMap = this._diffuseMap;
        this.metalnessMap = this._metalnessMap;
        this.normalMap = this._normalMap;
        this.roughnessMap = this._roughnessMap;
        this.material.update();
    }

    disconnectedCallback() {
        if (this.material) {
            this.material.destroy();
            this.material = null;
        }
    }

    setMap(map: string, property: 'diffuseMap' | 'metalnessMap' | 'normalMap' | 'glossMap') {
        if (this.material) {
            const asset = AssetElement.get(map);
            if (asset) {
                if (asset.loaded) {
                    this.material[property] = asset.resource;
                    this.material[property]!.anisotropy = 4;
                } else {
                    asset.once('load', () => {
                        this.material![property] = asset.resource;
                        this.material![property]!.anisotropy = 4;
                        this.material!.update();
                    });
                }
            }
        }
    }

    set diffuse(value: Color) {
        this._diffuse = value;
        if (this.material) {
            this.material.diffuse = value;
        }
    }

    get diffuse(): Color {
        return this._diffuse;
    }

    set diffuseMap(value: string) {
        this._diffuseMap = value;
        this.setMap(value, 'diffuseMap');
    }

    get diffuseMap() {
        return this._diffuseMap;
    }

    set metalnessMap(value: string) {
        this._metalnessMap = value;
        this.setMap(value, 'metalnessMap');
    }

    get metalnessMap() {
        return this._metalnessMap;
    }

    set normalMap(value: string) {
        this._normalMap = value;
        this.setMap(value, 'normalMap');
    }

    get normalMap() {
        return this._normalMap;
    }

    set roughnessMap(value: string) {
        this._roughnessMap = value;
        this.setMap(value, 'glossMap');
    }

    get roughnessMap() {
        return this._roughnessMap;
    }

    static get(id: string) {
        const materialElement = document.querySelector<MaterialElement>(`pc-material[id="${id}"]`);
        return materialElement?.material;
    }

    static get observedAttributes() {
        return ['diffuse', 'diffuse-map', 'metalness-map', 'normal-map', 'roughness-map'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'diffuse':
                this.diffuse = parseColor(newValue);
                break;
            case 'diffuse-map':
                this.diffuseMap = newValue;
                break;
            case 'metalness-map':
                this.metalnessMap = newValue;
                break;
            case 'normal-map':
                this.normalMap = newValue;
                break;
            case 'roughness-map':
                this.roughnessMap = newValue;
                break;
        }
    }
}

customElements.define('pc-material', MaterialElement);

export { MaterialElement };
