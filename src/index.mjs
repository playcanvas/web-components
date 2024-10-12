/**
 * PlayDOM - Declarative PlayCanvas
 *
 * This file ensures all PlayDOM custom elements are registered.
 * Import this file to make all PlayDOM elements available in your HTML.
 *
 * Usage in HTML after importing this file:
 * <pc-application>
 *   <pc-entity>
 *     <pc-camera></pc-camera>
 *   </pc-entity>
 * </pc-application>
 */

/* eslint-disable no-unused-vars */

// Note that order matters here (e.g. pc-entity must be defined before components)
import { ApplicationElement } from './application.mjs';
import { EntityElement } from './entity.mjs';
import { AssetElement } from './asset.mjs';
import { CameraComponentElement } from './components/camera-component.mjs';
import { LightComponentElement } from './components/light-component.mjs';
import { RenderComponentElement } from './components/render-component.mjs';
import { ScriptComponentElement } from './components/script-component.mjs';
import { ModelElement } from './model.mjs';
import { SceneElement } from './scene.mjs';
import { SkyElement } from './sky.mjs';
