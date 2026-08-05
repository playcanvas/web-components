import type { ContainerResource, Entity, EventHandle } from 'playcanvas';

import { AssetElement } from './asset';
import { AsyncElement } from './async-element';

/**
 * The ModelElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-model/ | `<pc-model>`} elements.
 * The ModelElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class ModelElement extends AsyncElement {
    private _asset = '';

    private _entity: Entity | null = null;

    /**
     * Incremented on every new load and on disconnect, and captured by a load when it starts. A
     * load that resumes from an await or a load callback abandons itself if the value has moved
     * on, so a superseded load can neither instantiate a second entity nor parent one that has
     * since been destroyed.
     */
    private _loadGeneration = 0;

    /**
     * The pending asset-load subscription of the current load, if it is waiting for its asset.
     * Held so that whatever supersedes the load can detach the handler from the asset, rather
     * than leave it registered until the asset loads (or forever, if it never does).
     */
    private _loadHandle: EventHandle | null = null;

    /**
     * The root entity of the instantiated model. `null` until the container asset has loaded
     * and been instantiated, and again once the element has been removed from the document.
     * @returns The model's root entity, or `null`.
     */
    get entity(): Entity | null {
        return this._entity;
    }

    connectedCallback() {
        this._loadModel();
        this._onReady();
    }

    disconnectedCallback() {
        this._loadGeneration++;
        this._detachLoadHandler();
        this._unloadModel();
        this._resetReady();
    }

    private _detachLoadHandler() {
        this._loadHandle?.off();
        this._loadHandle = null;
    }

    private _instantiate(container: ContainerResource) {
        const generation = this._loadGeneration;

        const entity = container.instantiateRenderEntity();
        this._entity = entity;

        // @ts-ignore
        if (container.animations.length > 0) {
            entity.addComponent('anim');
            // @ts-ignore
            entity.anim.assignAnimation('animation', container.animations[0].resource);
        }

        // The parent's readiness re-arms when it is torn down, so these can resume in a later
        // connection cycle. The entity is captured above and the generation re-checked, so a
        // stale resume cannot parent an entity a newer cycle has already destroyed.
        const parentEntityElement = this.closestEntity;
        if (parentEntityElement) {
            parentEntityElement.ready().then(() => {
                if (generation !== this._loadGeneration) {
                    return;
                }
                parentEntityElement.entity!.addChild(entity);
            });
        } else {
            const appElement = this.closestApp;
            if (appElement) {
                appElement.ready().then(() => {
                    if (generation !== this._loadGeneration) {
                        return;
                    }
                    appElement.app!.root.addChild(entity);
                });
            }
        }
    }

    private async _loadModel() {
        this._unloadModel();

        // Supersede any load already in flight - only the newest load may instantiate
        const generation = ++this._loadGeneration;
        this._detachLoadHandler();

        const appElement = await this.closestApp?.ready();

        // The element may have been removed, or another load started, while we waited
        if (generation !== this._loadGeneration) {
            return;
        }

        const app = appElement?.app;

        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }

        if (asset.loaded) {
            this._instantiate(asset.resource as ContainerResource);
        } else {
            // The generation is re-checked even though a superseded handler is detached: the
            // detach relies on how the engine's event emitter treats removal, while the check
            // holds on its own.
            this._loadHandle = asset.once('load', () => {
                this._loadHandle = null;
                if (generation !== this._loadGeneration) {
                    return;
                }
                this._instantiate(asset.resource as ContainerResource);
            });
            app!.assets.load(asset);
        }
    }

    private _unloadModel() {
        this._entity?.destroy();
        this._entity = null;
    }

    /**
     * Sets the id of the `pc-asset` to use for the model.
     * @param value - The asset ID.
     */
    set asset(value: string) {
        this._asset = value;
        if (this.isConnected) {
            this._loadModel();
        }
    }

    /**
     * Gets the id of the `pc-asset` to use for the model.
     * @returns The asset ID.
     */
    get asset(): string {
        return this._asset;
    }

    static get observedAttributes() {
        return ['asset'];
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        switch (name) {
            case 'asset':
                this.asset = newValue ?? '';
                break;
        }
    }
}

customElements.define('pc-model', ModelElement);

export { ModelElement };
