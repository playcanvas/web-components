/**
 * The Engine Web Components module provides a set of Web Components for the PlayCanvas Engine.
 * While these components are normally instantiated in a declarative fashion using HTML, this
 * reference covers the TypeScript/JavaScript API that allows these components to be created
 * programmatically.
 *
 * @module EngineWebComponents
 */

/* eslint-disable import-x/order */

// Note that order matters here (e.g. pc-entity must be defined before components)
import { AsyncElement, whenReady } from './async-element';
import { ModuleElement } from './module';
import { AppElement } from './app';
import { EntityElement } from './entity';
import { AssetElement } from './asset';
import { ListenerComponentElement } from './components/listener-component';
import { ButtonComponentElement } from './components/button-component';
import { CameraComponentElement } from './components/camera-component';
import { CollisionComponentElement } from './components/collision-component';
import { ComponentElement } from './components/component';
import { ElementComponentElement } from './components/element-component';
import { LayoutChildComponentElement } from './components/layoutchild-component';
import { LayoutGroupComponentElement } from './components/layoutgroup-component';
import { LightComponentElement } from './components/light-component';
import { ParticleSystemComponentElement } from './components/particlesystem-component';
import { RenderComponentElement } from './components/render-component';
import { RigidBodyComponentElement } from './components/rigidbody-component';
import { ScreenComponentElement } from './components/screen-component';
import { ScrollbarComponentElement } from './components/scrollbar-component';
import { ScrollViewComponentElement } from './components/scrollview-component';
import { ScriptComponentElement } from './components/script-component';
import { ScriptElement } from './components/script';
import { SoundComponentElement } from './components/sound-component';
import { SoundSlotElement } from './components/sound-slot';
import { GSplatComponentElement } from './components/gsplat-component';
import { EntityBaseElement } from './entity-base';
import { MaterialElement } from './material';
import { ModelElement } from './model';
import { NodeElement } from './node';
import { SceneElement } from './scene';
import { SkyElement } from './sky';

import type {
    ScriptAttributesChangeEvent,
    ScriptEnableChangeEvent,
    ScriptNameChangeEvent
} from './components/script-component';

declare global {
    interface HTMLElementEventMap {
        scriptattributeschange: ScriptAttributesChangeEvent;
        scriptenablechange: ScriptEnableChangeEvent;
        scriptnamechange: ScriptNameChangeEvent;
    }

    interface HTMLElementTagNameMap {
        'pc-app': AppElement;
        'pc-asset': AssetElement;
        'pc-button': ButtonComponentElement;
        'pc-camera': CameraComponentElement;
        'pc-collision': CollisionComponentElement;
        'pc-element': ElementComponentElement;
        'pc-entity': EntityElement;
        'pc-gsplat': GSplatComponentElement;
        'pc-layoutchild': LayoutChildComponentElement;
        'pc-layoutgroup': LayoutGroupComponentElement;
        'pc-light': LightComponentElement;
        'pc-listener': ListenerComponentElement;
        'pc-material': MaterialElement;
        'pc-model': ModelElement;
        'pc-module': ModuleElement;
        'pc-node': NodeElement;
        'pc-particles': ParticleSystemComponentElement;
        'pc-render': RenderComponentElement;
        'pc-rigidbody': RigidBodyComponentElement;
        'pc-scene': SceneElement;
        'pc-screen': ScreenComponentElement;
        'pc-script': ScriptElement;
        'pc-scripts': ScriptComponentElement;
        'pc-scrollbar': ScrollbarComponentElement;
        'pc-scrollview': ScrollViewComponentElement;
        'pc-sky': SkyElement;
        'pc-sound': SoundSlotElement;
        'pc-sounds': SoundComponentElement;
    }
}

export {
    AsyncElement,
    ModuleElement,
    AppElement,
    EntityElement,
    AssetElement,
    ButtonComponentElement,
    CameraComponentElement,
    CollisionComponentElement,
    ComponentElement,
    ElementComponentElement,
    LayoutChildComponentElement,
    LayoutGroupComponentElement,
    ParticleSystemComponentElement,
    LightComponentElement,
    ListenerComponentElement,
    RenderComponentElement,
    RigidBodyComponentElement,
    ScreenComponentElement,
    ScrollbarComponentElement,
    ScrollViewComponentElement,
    ScriptComponentElement,
    ScriptElement,
    SoundComponentElement,
    SoundSlotElement,
    GSplatComponentElement,
    EntityBaseElement,
    MaterialElement,
    ModelElement,
    NodeElement,
    SceneElement,
    SkyElement,
    whenReady
};

export type { AsyncElementTagName } from './async-element';
export type { HierarchyMaterial, HierarchyNode } from './model';
export type { MaterialOverrides } from './node';
