import { Script } from 'playcanvas';

import { AsyncElement } from '../async-element';
import { parseBool } from '../parse';

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
 * Changing `name` on a live element destroys the old-name script instance and creates the
 * new-name one, re-applying both attribute channels to it.
 *
 * The element becomes ready once its script instance has been created by the parent
 * `<pc-scripts>` element.
 *
 * @fires {CustomEvent} scriptattributeschange - Fired when the script's attributes change. The
 * `detail` carries the new `attributes` object. Bubbles.
 * @fires {CustomEvent} scriptenablechange - Fired when the script's enabled state changes. The
 * `detail` carries the new `enabled` state. Bubbles.
 * @fires {CustomEvent} scriptnamechange - Fired when the script is renamed on a live element. The
 * `detail` carries `oldName` and `newName`. Bubbles.
 */
class ScriptElement extends AsyncElement {
    private _attributes: Record<string, any> = {};

    private _enabled: boolean = true;

    /**
     * Whether readiness has been signalled. Creation can happen more than once over an
     * element's life (a runtime `name` change recreates the instance), but `ready` is a
     * one-shot signal, so only the first successful creation fires it.
     */
    private _readySignalled: boolean = false;

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
     * Sets the name of the script to create. The `name` attribute is the single source of truth
     * (it is what the parent `<pc-scripts>` element reads when creating the instance), so the
     * property writes through to it — assigning before insertion works as expected:
     *
     * ```js
     * const script = document.createElement('pc-script');
     * script.name = 'rotate';
     * scriptsElement.appendChild(script);
     * await script.ready();
     * ```
     * @param value - The name.
     */
    set name(value: string) {
        this.setAttribute('name', value);
    }

    /**
     * Gets the name of the script.
     * @returns The name.
     */
    get name() {
        return this.getAttribute('name') ?? '';
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

    connectedCallback() {
        // Script instances are created by the parent pc-scripts element, so an element placed
        // anywhere else is inert and never becomes ready - warn rather than hang silently
        if (this.parentElement?.tagName !== 'PC-SCRIPTS') {
            console.warn(`pc-script '${this.getAttribute('name')}' must be a direct child of pc-scripts - script not created`);
        }
    }

    /**
     * Called by the parent `<pc-scripts>` element when the script instance has been created.
     * @ignore
     */
    _onScriptCreated() {
        if (this._readySignalled) return;
        this._readySignalled = true;
        this._onReady();
    }

    static get observedAttributes() {
        return ['attributes', 'enabled', 'name'];
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
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
                // The first set is handled by the parent's creation paths (the boot query and
                // the added-node mutation), so only a genuine rename is signalled here. Note
                // that setAttribute fires this callback even when the value is unchanged.
                if (oldValue !== null && oldValue !== newValue) {
                    this.dispatchEvent(new CustomEvent('scriptnamechange', {
                        detail: { oldName: oldValue, newName: newValue },
                        bubbles: true
                    }));
                }
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
