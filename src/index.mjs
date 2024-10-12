import { ApplicationElement } from './application.mjs';
import { AssetElement } from './asset.mjs';
import { EntityElement } from './entity.mjs';
import { ModelElement } from './model.mjs';
import { SceneElement } from './scene.mjs';
import { SkyElement } from './sky.mjs';

import { CameraComponentElement } from './components/camera-component.mjs';
import { LightComponentElement } from './components/light-component.mjs';
import { RenderComponentElement } from './components/render-component.mjs';
import { ScriptComponentElement } from './components/script-component.mjs';

document.addEventListener('DOMContentLoaded', () => {
    customElements.define('pc-app', ApplicationElement);
    customElements.define('pc-asset', AssetElement);
    customElements.define('pc-entity', EntityElement);
    customElements.define('pc-model', ModelElement);
    customElements.define('pc-camera', CameraComponentElement);
    customElements.define('pc-light', LightComponentElement);
    customElements.define('pc-render', RenderComponentElement);
    customElements.define('pc-script', ScriptComponentElement);
    customElements.define('pc-scene', SceneElement);
    customElements.define('pc-sky', SkyElement);
});
