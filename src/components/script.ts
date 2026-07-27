import { Script } from 'playcanvas';

import { AsyncElement } from '../async-element';
import { parseBool } from '../utils';

/**
 * The ScriptElement interface provides properties and methods for manipulating
 * `<pc-script>` elements. The ScriptElement interface also inherits the properties and
 * methods of the {@link AsyncElement} interface.
 *
 * Script attributes can be supplied through two channels:
 *
 * - **Per-property attributes**: any non-reserved attribute on the element maps to the script
 *   attribute of the same name (kebab-case to camelCase, e.g. `focus-point` → `focusPoint`).
 *   Values are parsed according to the type of the attribute's current value — initially the
 *   script's declared default (numbers, booleans, strings, Vec2/3/4, Color, Quat as Euler
 *   angles) — and the `asset:`/`entity:`/`vec2:`/`vec3:`/`vec4:`/`color:` prefixes may be used
 *   to be explicit.
 * - **The `attributes` JSON attribute**: an object supporting nested structures and attribute
 *   names that collide with reserved HTML attribute names (e.g. `title`).
 *
 * When both specify the same attribute, the per-property attribute wins — at creation and
 * whenever either channel changes at runtime. The element's own `name` and `enabled`
 * attributes configure the element itself and are not script attributes.
 *
 * The element becomes ready once its script instance has been created by the parent
 * `<pc-scripts>` element.
 */
class ScriptElement extends AsyncElement {
    private _attributes: Record<string, any> = {};

    private _enabled: boolean = true;

    private _name: string = '';

    /**
     * The Script instance created for this element by its parent `<pc-scripts>` element.
     * @ignore
     */
    _script: Script | null = null;

    /**
     * Sets the attributes of the script as an object. Values are converted with the same rules
     * as the `attributes` attribute: `asset:`/`entity:` references and `vec2:`/`vec3:`/`vec4:`/
     * `color:` prefixed strings are resolved, and a plain numeric array is converted to the
     * type of the attribute it targets when that attribute currently holds a Vec2, Vec3, Vec4
     * or Color.
     * @param value - The attributes of the script.
     */
    set scriptAttributes(value: Record<string, any>) {
        this._attributes = value ?? {};
        this.dispatchEvent(new CustomEvent('scriptattributeschange', {
            detail: { attributes: this._attributes },
            bubbles: true
        }));
    }

    /**
     * Gets the attributes of the script.
     * @returns The attributes of the script.
     */
    get scriptAttributes(): Record<string, any> {
        return this._attributes;
    }

    /**
     * Sets the enabled state of the script.
     * @param value - The enabled state of the script.
     */
    set enabled(value: boolean) {
        this._enabled = value;
        this.dispatchEvent(new CustomEvent('scriptenablechange', {
            detail: { enabled: value },
            bubbles: true
        }));
    }

    /**
     * Gets the enabled state of the script.
     * @returns The enabled state of the script.
     */
    get enabled() {
        return this._enabled;
    }

    /**
     * Sets the name of the script to create.
     * @param value - The name.
     */
    set name(value: string) {
        this._name = value;
    }

    /**
     * Gets the name of the script.
     * @returns The name.
     */
    get name() {
        return this._name;
    }

    /**
     * Gets the {@link Script} instance created for this element. Returns `null` until the
     * instance exists — await {@link whenReady} or the element's `ready()` promise before
     * accessing it.
     * @returns The script instance, or `null`.
     */
    get script(): Script | null {
        return this._script;
    }

    /**
     * Called by the parent `<pc-scripts>` element when the script instance has been created.
     * @ignore
     */
    _onScriptCreated() {
        this._onReady();
    }

    static get observedAttributes() {
        return ['attributes', 'enabled', 'name'];
    }

    attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        switch (name) {
            case 'attributes':
                if (newValue === null) {
                    this.scriptAttributes = {};
                    break;
                }
                try {
                    this.scriptAttributes = JSON.parse(newValue);
                } catch (error) {
                    console.warn(`Invalid 'attributes' JSON on pc-script '${this.getAttribute('name')}': ${(error as Error).message}`);
                }
                break;
            case 'enabled':
                this.enabled = parseBool(newValue, true);
                break;
            case 'name':
                this.name = newValue;
                break;
        }
    }
}

customElements.define('pc-script', ScriptElement);

declare global {
    interface HTMLElementTagNameMap {
        'pc-script': ScriptElement;
    }
}

export { ScriptElement };
