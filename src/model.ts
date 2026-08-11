import type { ContainerResource, Entity, EventHandle } from 'playcanvas';

import { useAsset } from './asset';
import { AsyncElement } from './async-element';

/**
 * The ModelElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/web-components/tags/pc-model/ | `<pc-model>`} elements.
 * The ModelElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * The element becomes ready once its container asset has loaded and the instantiated hierarchy has
 * been added to the scene — `entity` is non-null by then. A failed load also settles readiness,
 * with `entity` remaining `null`: readiness means the load settled, not that it succeeded — listen
 * for `error`, or check `entity`, to tell the outcomes apart. Changing `asset` re-arms readiness
 * and instantiates anew, so a `ready()` obtained after the change resolves against the new
 * hierarchy. A `pc-model` outside a `pc-app`, or referencing an unknown asset id, warns and never
 * becomes ready.
 *
 * @fires {Event} load - Fired each time a container asset finishes instantiating, including
 * re-instantiation after `asset` changes. Does not bubble — listen on this element, or use a
 * capture-phase listener on an ancestor.
 * @fires {ErrorEvent} error - Fired when the container asset fails to load, with the engine's
 * error in `message`. Does not bubble. The element still becomes ready — readiness means the load
 * settled, not that it succeeded.
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
     * The pending asset subscriptions of the current load, if it is waiting for its asset. Held
     * so that whatever supersedes the load can detach the handlers from the asset, rather than
     * leave them registered until the asset settles (or forever, if it never does).
     */
    private _loadHandle: EventHandle | null = null;

    private _errorHandle: EventHandle | null = null;

    /**
     * The root entity of the instantiated model. `null` until the container asset has loaded
     * and been instantiated, and again once the element has been removed from the document.
     * @returns The model's root entity, or `null`.
     */
    get entity(): Entity | null {
        return this._entity;
    }

    connectedCallback() {
        // A model outside an application is inert and never becomes ready, so awaiting it hangs.
        // Warn rather than fail silently, naming the parent it requires, as every other misplaced
        // element does.
        if (!this.closestApp) {
            const label = this._asset ? ` '${this._asset}'` : '';
            console.warn(`pc-model${label} must be a descendant of pc-app - model not created`);
            return;
        }
        this._loadModel();
    }

    disconnectedCallback() {
        this._loadGeneration++;
        this._detachLoadHandlers();
        this._unloadModel();
        this._resetReady();
    }

    private _detachLoadHandlers() {
        this._loadHandle?.off();
        this._loadHandle = null;
        this._errorHandle?.off();
        this._errorHandle = null;
    }

    /**
     * Resolves readiness and dispatches the `load` event. Called once the instantiated hierarchy
     * has been parented — readiness means "in the scene graph", matching `pc-entity`, so a ready
     * model's entity always has world transforms.
     */
    private _announceLoad() {
        this._onReady();
        this.dispatchEvent(new Event('load'));
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
                this._announceLoad();
            });
        } else {
            const appElement = this.closestApp;
            if (appElement) {
                appElement.ready().then(() => {
                    if (generation !== this._loadGeneration) {
                        return;
                    }
                    appElement.app!.root.addChild(entity);
                    this._announceLoad();
                });
            }
        }
    }

    private async _loadModel() {
        this._unloadModel();

        // Supersede any load already in flight - only the newest load may instantiate
        const generation = ++this._loadGeneration;
        this._detachLoadHandlers();

        // Re-arm readiness so a waiter obtained after an asset change resolves against the new
        // hierarchy. A no-op on first connection, where readiness is still pending.
        this._resetReady();

        const appElement = this.closestApp;
        if (!appElement) {
            // Outside pc-app; connectedCallback already warned. Reached through the asset setter.
            return;
        }

        await appElement.ready();

        // The element may have been removed, or another load started, while we waited
        if (generation !== this._loadGeneration) {
            return;
        }

        const asset = useAsset(this._asset);
        if (!asset) {
            // An empty id is a legitimate transient (the asset may be assigned later); a
            // non-empty one that resolves to nothing is a dead end - say so rather than staying
            // silently pending.
            if (this._asset) {
                console.warn(`pc-model could not find asset '${this._asset}' - model not created`);
            }
            return;
        }

        if (asset.loaded) {
            this._instantiate(asset.resource as ContainerResource);
        } else {
            // The generation is re-checked even though a superseded handler is detached: the
            // detach relies on how the engine's event emitter treats removal, while the check
            // holds on its own. Whichever of load/error fires first detaches the other.
            this._loadHandle = asset.once('load', () => {
                this._detachLoadHandlers();
                if (generation !== this._loadGeneration) {
                    return;
                }
                this._instantiate(asset.resource as ContainerResource);
            });
            this._errorHandle = asset.once('error', (err: string | Error) => {
                this._detachLoadHandlers();
                if (generation !== this._loadGeneration) {
                    return;
                }
                // A failed load settles readiness with a null entity, mirroring pc-asset:
                // readiness means the load settled, not that it succeeded.
                this.dispatchEvent(
                    new ErrorEvent('error', {
                        message: err instanceof Error ? err.message : String(err)
                    })
                );
                this._onReady();
            });
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
