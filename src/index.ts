/**
 * The Engine Web Components module provides a set of Web Components for the PlayCanvas Engine.
 * While these components are normally instantiated in a declarative fashion using HTML, this
 * reference covers the TypeScript/JavaScript API that allows these components to be created
 * programmatically.
 *
 * @module EngineWebComponents
 */

/* eslint-disable import/order */

// Note that order matters here (e.g. pc-entity must be defined before components)
import { AsyncElement } from './async-element';
import { ModuleElement } from './module';
import { AppElement } from './app';
import { EntityElement } from './entity';
import { AssetElement } from './asset';
import { ListenerComponentElement } from './components/listener-component';
import { CameraComponentElement } from './components/camera-component';
import { CollisionComponentElement } from './components/collision-component';
import { ComponentElement } from './components/component';
import { ElementComponentElement } from './components/element-component';
import { GSplatComponentElement } from './components/gsplat-component';
import { LightComponentElement } from './components/light-component';
import { RenderComponentElement } from './components/render-component';
import { RigidBodyComponentElement } from './components/rigidbody-component';
import { ScreenComponentElement } from './components/screen-component';
import { ScriptComponentElement } from './components/script-component';
import { ScriptElement } from './components/script';
import { SoundComponentElement } from './components/sound-component';
import { SoundSlotElement } from './components/sound-slot';
import { MaterialElement } from './material';
import { ModelElement } from './model';
import { SceneElement } from './scene';
import { SkyElement } from './sky';

export {
    AsyncElement,
    ModuleElement,
    AppElement,
    EntityElement,
    AssetElement,
    CameraComponentElement,
    CollisionComponentElement,
    ComponentElement,
    ElementComponentElement,
    GSplatComponentElement,
    LightComponentElement,
    ListenerComponentElement,
    RenderComponentElement,
    RigidBodyComponentElement,
    ScreenComponentElement,
    ScriptComponentElement,
    ScriptElement,
    SoundComponentElement,
    SoundSlotElement,
    MaterialElement,
    ModelElement,
    SceneElement,
    SkyElement
};
