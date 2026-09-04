/**
 * The `@playcanvas/web-components` package provides a set of custom HTML elements for building 3D
 * web apps with the PlayCanvas Engine. The elements are normally authored declaratively in HTML,
 * which the {@link https://developer.playcanvas.com/user-manual/web-components/ | User Manual}
 * covers. This reference covers their JavaScript API: the element classes, whose properties mirror
 * their attributes and expose the engine objects behind them, and the {@link whenReady} function
 * that waits for an element to finish initializing.
 *
 * @categoryDescription Application
 * The elements at the top of every document: `<pc-app>`, which creates the application and the
 * canvas it renders into, the `<pc-scene>` it renders, and the `<pc-sky>` behind that scene.
 *
 * @categoryDescription Resources
 * The elements declared directly under `<pc-app>` for the scene to draw on: `<pc-asset>` and
 * `<pc-material>`, which other elements reference by `id`, and `<pc-wasm>`, which loads a
 * WebAssembly module the engine needs before the application starts.
 *
 * @categoryDescription Entities
 * The elements that front an engine entity and host component elements. `<pc-entity>` and
 * `<pc-model>` create their entity; `<pc-node>` binds to one inside the hierarchy a model
 * instantiated.
 *
 * @categoryDescription Components
 * The elements that add an engine component to the entity above them, and the repeatable children
 * three of them take: `<pc-anim-clip>` under `<pc-anim>`, `<pc-script-instance>` under
 * `<pc-script>` and `<pc-sound-slot>` under `<pc-sound>`.
 *
 * @categoryDescription Base Classes
 * The classes the elements extend. None registers a tag of its own; each holds the members the
 * elements of its kind inherit, such as `ready()`, `closestApp`, `entity` and `component`.
 *
 * @categoryDescription Functions
 * Helpers for driving the elements from JavaScript. `whenReady` waits for an element to finish
 * initializing and resolves with it.
 *
 * @categoryDescription Types
 * The string unions and plain-data shapes used by the element properties and by `whenReady`.
 *
 * @module @playcanvas/web-components
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

export type { AddressMode, MagFilterMode, MinFilterMode } from './asset';
export type { AsyncElementTagName } from './async-element';
export type { JointType, MotionMode } from './components/joint-component';
export type {
    BlendType,
    ColorChannel,
    CullMode,
    FresnelModel,
    OccludeSpecular,
    OpacityDither,
    ScalarChannel
} from './material';
export type { HierarchyMaterial, HierarchyNode } from './model';
export type { MaterialOverrides, NodeBindingState } from './node';
