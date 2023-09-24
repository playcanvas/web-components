import { ApplicationElement } from './application.mjs';
import { EntityElement } from "./entity.mjs";
import { SceneElement } from './scene.mjs';

import { CameraComponentElement } from './camera-component.mjs';
import { LightComponentElement } from './light-component.mjs';
import { RenderComponentElement } from './render-component.mjs';

document.addEventListener("DOMContentLoaded", () => {
    customElements.define('pc-app', ApplicationElement);
    customElements.define('pc-entity', EntityElement);
    customElements.define('pc-camera', CameraComponentElement);
    customElements.define('pc-light', LightComponentElement);
    customElements.define('pc-render', RenderComponentElement);
    customElements.define('pc-scene', SceneElement);
});
