/**
 * The Engine Web Components module provides a set of Web Components for the PlayCanvas Engine.
 * While these components are normally instantiated in a declarative fashion using HTML, this
 * reference covers the TypeScript/JavaScript API that allows these components to be created
 * programmatically.
 *
 * @module EngineWebComponents
 */

/* eslint-disable import-x/order */

// Note that order matters here (e.g. pc-entity and pc-model must be defined before components)
import { AsyncElement, whenReady } from './async-element';
import { WasmElement } from './wasm';
import { AppElement } from './app';
import { EntityElement } from './entity';
import { ModelElement } from './model';
import { AssetElement } from './asset';
import { AnimComponentElement } from './components/anim-component';
import { AnimClipElement } from './components/anim-clip';
import { AudioListenerComponentElement } from './components/audio-listener-component';
import { ButtonComponentElement } from './components/button-component';
import { CameraComponentElement } from './components/camera-component';
import { CollisionComponentElement } from './components/collision-component';
import { ComponentElement } from './components/component';
import { ElementComponentElement } from './components/element-component';
import { JointComponentElement } from './components/joint-component';
import { LayoutChildComponentElement } from './components/layout-child-component';
import { LayoutGroupComponentElement } from './components/layout-group-component';
import { LightComponentElement } from './components/light-component';
import { ParticleSystemComponentElement } from './components/particle-system-component';
import { RenderComponentElement } from './components/render-component';
import { RigidBodyComponentElement } from './components/rigid-body-component';
import { ScreenComponentElement } from './components/screen-component';
import { ScrollbarComponentElement } from './components/scrollbar-component';
import { ScrollViewComponentElement } from './components/scroll-view-component';
import { ScriptComponentElement } from './components/script-component';
import { ScriptInstanceElement } from './components/script-instance';
import { SoundComponentElement } from './components/sound-component';
import { SoundSlotElement } from './components/sound-slot';
import { GSplatComponentElement } from './components/gsplat-component';
import { EntityBaseElement } from './entity-base';
import { EntityOwnerElement } from './entity-owner';
import { MaterialElement } from './material';
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
        break: CustomEvent;
        scriptattributeschange: ScriptAttributesChangeEvent;
        scriptenablechange: ScriptEnableChangeEvent;
        scriptnamechange: ScriptNameChangeEvent;
    }

    interface HTMLElementTagNameMap {
        'pc-anim': AnimComponentElement;
        'pc-anim-clip': AnimClipElement;
        'pc-app': AppElement;
        'pc-asset': AssetElement;
        'pc-button': ButtonComponentElement;
        'pc-camera': CameraComponentElement;
        'pc-collision': CollisionComponentElement;
        'pc-element': ElementComponentElement;
        'pc-entity': EntityElement;
        'pc-gsplat': GSplatComponentElement;
        'pc-joint': JointComponentElement;
        'pc-layout-child': LayoutChildComponentElement;
        'pc-layout-group': LayoutGroupComponentElement;
        'pc-light': LightComponentElement;
        'pc-audio-listener': AudioListenerComponentElement;
        'pc-material': MaterialElement;
        'pc-model': ModelElement;
        'pc-wasm': WasmElement;
        'pc-node': NodeElement;
        'pc-particle-system': ParticleSystemComponentElement;
        'pc-render': RenderComponentElement;
        'pc-rigid-body': RigidBodyComponentElement;
        'pc-scene': SceneElement;
        'pc-screen': ScreenComponentElement;
        'pc-script-instance': ScriptInstanceElement;
        'pc-script': ScriptComponentElement;
        'pc-scrollbar': ScrollbarComponentElement;
        'pc-scroll-view': ScrollViewComponentElement;
        'pc-sky': SkyElement;
        'pc-sound-slot': SoundSlotElement;
        'pc-sound': SoundComponentElement;
    }
}

export {
    AsyncElement,
    WasmElement,
    AppElement,
    EntityElement,
    AssetElement,
    AnimComponentElement,
    AnimClipElement,
    ButtonComponentElement,
    CameraComponentElement,
    CollisionComponentElement,
    ComponentElement,
    ElementComponentElement,
    JointComponentElement,
    LayoutChildComponentElement,
    LayoutGroupComponentElement,
    ParticleSystemComponentElement,
    LightComponentElement,
    AudioListenerComponentElement,
    RenderComponentElement,
    RigidBodyComponentElement,
    ScreenComponentElement,
    ScrollbarComponentElement,
    ScrollViewComponentElement,
    ScriptComponentElement,
    ScriptInstanceElement,
    SoundComponentElement,
    SoundSlotElement,
    GSplatComponentElement,
    EntityBaseElement,
    EntityOwnerElement,
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
