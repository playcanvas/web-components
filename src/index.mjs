import { ApplicationElement } from './application.mjs';
import { CameraComponentElement } from './camera-component.mjs';
import { LightComponentElement } from './light-component.mjs';
import { RenderComponentElement } from './render-component.mjs';
import { EntityElement } from "./entity.mjs";

customElements.define('pc-application', ApplicationElement);
customElements.define('pc-entity', EntityElement);
customElements.define('pc-camera-component', CameraComponentElement);
customElements.define('pc-light-component', LightComponentElement);
customElements.define('pc-render-component', RenderComponentElement);
