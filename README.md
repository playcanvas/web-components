# PlayCanvas Web Components

[![NPM Version](https://img.shields.io/npm/v/@playcanvas/web-components.svg)](https://www.npmjs.com/package/@playcanvas/web-components)
[![NPM Downloads](https://img.shields.io/npm/dw/@playcanvas/web-components)](https://npmtrends.com/@playcanvas/web-components)
[![License](https://img.shields.io/npm/l/@playcanvas/web-components.svg)](https://github.com/playcanvas/web-components/blob/main/LICENSE)
[![GitHub Actions Build Status](https://github.com/playcanvas/web-components/actions/workflows/deploy.yml/badge.svg)](https://github.com/playcanvas/web-components/actions/workflows/deploy.yml)

PlayCanvas Web Components are a set of custom HTML elements for building 3D interactive web apps. Using the declarative nature of HTML makes it both easy and fun to incorporate 3D into your website.

```html
<!-- A lit sphere -->
<pc-app>
    <pc-scene>
        <pc-entity name="camera" position="0 0 3">
            <pc-camera></pc-camera>
        </pc-entity>
        <pc-entity name="light" rotation="45 45 0">
            <pc-light></pc-light>
        </pc-entity>
        <pc-entity name="ball">
            <pc-render type="sphere"></pc-render>
        </pc-entity>
    </pc-scene>
</pc-app>
```

## Examples

[![image](https://github.com/user-attachments/assets/6106ec23-30ab-4662-8370-c3b286386ce9)](https://playcanvas.github.io/web-components/examples)

See PlayCanvas Web Components in action here: https://playcanvas.github.io/web-components/examples

## Usage 🚧

### Installing from NPM

PlayCanvas Web Components is available as a package on [NPM](https://www.npmjs.com/package/@playcanvas/web-components). 
You can install it (and the PlayCanvas Engine) as follows:

```bash
npm install playcanvas @playcanvas/web-components --save-dev
```

Next, in your HTML file, you will need an import map because the web components need to be able to find the PlayCanvas Engine (which is an external dependency):

```html
<script type="importmap">
    {
        "imports": {
            "playcanvas": "/node_modules/playcanvas/build/playcanvas.mjs"
        }
    }
</script>
```

You can then import the components as follows:

```html
<script type="module" src="/node_modules/@playcanvas/web-components/dist/pwc.mjs"></script>
```

You can now incorporate any of the PlayCanvas Web Components elements into your HTML!

### Using a CDN

Instead of loading the library from a local package, you can instead opt to load it from a CDN (such as jsDelivr). In this case, you would update the import map:

```html
<script type="importmap">
    {
        "imports": {
            "playcanvas": "https://cdn.jsdelivr.net/npm/playcanvas@2.3.3/build/playcanvas.mjs"
        }
    }
</script>
```

And the components would now be imported as follows:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@playcanvas/web-components@0.1.10/dist/pwc.mjs"></script>
```

## Tag Reference 📖

Table of contents:

- [pc-app](#pc-app)
- [pc-asset](#pc-asset)
- [pc-camera](#pc-camera)
- [pc-collision](#pc-collision)
- [pc-element](#pc-element)
- [pc-entity](#pc-entity)
- [pc-light](#pc-light)
- [pc-listener](#pc-listener)
- [pc-module](#pc-module)
- [pc-render](#pc-render)
- [pc-rigidbody](#pc-rigidbody)
- [pc-scene](#pc-scene)
- [pc-script](#pc-script)
- [pc-scripts](#pc-scripts)
- [pc-sky](#pc-sky)
- [pc-screen](#pc-screen)
- [pc-sound](#pc-sound)
- [pc-sounds](#pc-sounds)
- [pc-splat](#pc-splat)

### pc-app

The `pc-app` tag is the root element for your PlayCanvas application. It is used to initialize the PlayCanvas application and provide a container for your scene.

| Attribute | Description |
| --- | --- |
| `alpha` | Boolean attribute. Determines whether the application allocates an alpha channel in the frame buffer. Defaults to `true`. |
| `antialias` | Boolean attribute. Determines whether the application uses anti-aliasing. Defaults to `true`. |
| `depth` | Boolean attribute. Determines whether the application allocates a depth buffer. Defaults to `true`. |
| `high-resolution` | Boolean attribute. Determines whether the application renders using physical resolution or CSS resolution. Defaults to `true`. |
| `stencil` | Boolean attribute. Determines whether the application allocates a stencil buffer. Defaults to `true`. |

### pc-asset

The `pc-asset` tag is used to define an asset. It must be a direct child of `pc-app`.

| Attribute | Description |
| --- | --- |
| `id` | The ID of the asset. This is used to reference the asset in scripts. |
| `src` | The path to the asset. |
| `preload` | Valueless attribute. If present, the asset is loaded immediately. |
| `type` | The type of asset. If not specified, the type is inferred from the file extension. Can be: `audio`, `binary`, `css`, `container`, `gsplat`, `html`, `json`, `script`, `shader`, `text`, `texture`. |

### pc-camera

The `pc-camera` tag is used to define a camera component. It must be a direct child of an `pc-entity`.

| Attribute | Description |
| --- | --- |
| `clear-color` | The background color of the camera. Can be a space-separated list of R, G, B, and A values or a hex color code. If unspecified, `0.75,0.75,0.75,1` is used. |
| `clear-color-buffer` | Boolean attribute. Controls whether the camera clears the color buffer. If unspecified, the color buffer is cleared. |
| `clear-depth-buffer` | Boolean attribute. Controls whether the camera clears the depth buffer. If unspecified, the depth buffer is cleared. |
| `clear-stencil-buffer` | Boolean attribute. Controls whether the camera clears the stencil buffer. If unspecified, the stencil buffer is cleared. |
| `cull-faces` | Boolean attribute. Controls whether the camera culls faces. If unspecified, faces are culled. |
| `far-clip` | The far clipping plane of the camera. If unspecified, `1000` is used. |
| `flip-faces` | Boolean attribute. Controls whether the camera flips faces. If unspecified, faces are not flipped. |
| `fov` | The field of view of the camera. If unspecified, `45` is used. |
| `frustum-culling` | Boolean attribute. Controls whether the camera uses frustum culling. If unspecified, frustum culling is used. |
| `near-clip` | The near clipping plane of the camera. If unspecified, `0.1` is used. |
| `orthographic` | Valueless attribute. If present, the camera uses an orthographic projection. If unspecified, the camera uses a perspective projection. |
| `ortho-height` | The height of the orthographic projection. If unspecified, `10` is used. |
| `priority` | The priority of the camera. If unspecified, `0` is used. |
| `rect` | The viewport rectangle of the camera. Specified as a space-separated list of X, Y, Width, and Height values. If unspecified, `0 0 1 1` is used. |
| `scissor-rect` | The scissor rectangle of the camera. Specified as a space-separated list of X, Y, Width, and Height values. If not specified, `0 0 1 1` is used. |

### pc-collision

The `pc-collision` tag is used to define a collision component. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `axis` | The axis of the collision component. If not specified, `1` is used (Y-axis). |
| `convex-hull` | Valueless attribute. If present, the collision component uses a convex hull. |
| `enabled` | Enabled state of the collision component. If not specified, `true` is used. |
| `half-extents` | The half-extents of the collision component. Specified as a space-separated list of X, Y, and Z values. If not specified, `0.5 0.5 0.5` is used. |
| `height` | The height of the collision component. If not specified, `2` is used. |
| `radius` | The radius of the collision component. If not specified, `0.5` is used. |
| `type` | The type of collision component. Can be `box`, `capsule`, `cone`, `cylinder` or `sphere`. |

### pc-element

The `pc-element` tag is used to define an element component. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `anchor` | The anchor of the element component. Specified as a space-separated list of X, Y, Z, and W values. If not specified, `0 0 0 1` is used. |
| `asset` | A string that should match the `id` of a `pc-asset` tag that has a type of `font`. |
| `auto-width` | Valueless attribute. If present, the element component automatically adjusts its width. |
| `color` | The color of the element component. Can be a space-separated list of R, G, B, and A values or a hex color code. If not specified, `1 1 1 1` is used. |
| `font-size` | The font size of the element component. If not specified, `16` is used. |
| `line-height` | The line height of the element component. If not specified, `1.2` is used. |
| `pivot` | The pivot of the element component. Specified as a space-separated list of X and Y values. If not specified, `0.5 0.5` is used. |
| `text` | The text of the element component. |
| `type` | The type of element component. Can be `group`, `image` or `text`. If not specified, `group` is used. |
| `width` | The width of the element component. If not specified, `0` is used. |
| `wrap-lines` | Valueless attribute. If present, the element component wraps lines. |

### pc-entity

The `pc-entity` tag is used to define an entity. It must be a direct child of `pc-scene` or another `pc-entity`.

| Attribute | Description |
| --- | --- |
| `enabled` | Enabled state of the entity. If not specified, `true` is used. |
| `name` | The name of the entity. |
| `position` | The position of the entity. Specified as a space-separated list of X, Y, and Z values. If not specified, `0 0 0` is used. |
| `rotation` | The rotation of the entity. Specified as a space-separated list of X, Y, and Z Euler angles in degrees. If not specified, `0 0 0` is used. |
| `scale` | The scale of the entity. Specified as a space-separated list of X, Y, and Z values. If not specified, `1 1 1` is used. |
| `tags` | A space-separated list of tags for the entity. |

### pc-light

The `pc-light` tag is used to define a light component. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `color` | The color of the light. Can be a space-separated list of R, G, B values or a hex color code. If not specified, `1 1 1` is used. |
| `cast-shadows` | Valueless attribute. If present, the light casts shadows. |
| `inner-cone-angle` | The angle of the light's inner cone. If not specified, `40` is used. |
| `intensity` | The intensity of the light. If not specified, `1` is used. |
| `normal-offset-bias` | The bias of the light's normal offset. If not specified, `0.05` is used. |
| `outer-cone-angle` | The angle of the light's outer cone. If not specified, `45` is used. |
| `range` | The range of the light. If not specified, `10` is used. |
| `shadow-bias` | The bias of the light's shadows. If not specified, `0.2` is used. |
| `shadow-distance` | The distance at which the light's shadows are no longer rendered. If not specified, `16` is used. |
| `type` | The type of light. Can be `directional`, `point` or `omni`. |

### pc-listener

The `pc-listener` tag is used to define a listener component. It must be a direct child of a `pc-entity`. It has no attributes.

### pc-module

The `pc-module` tag is used to define a WASM module. It must be a direct child of `pc-app`.

| Attribute | Description |
| --- | --- |
| `name` | The name of the module. This is used to reference the module in scripts. |
| `glue` | The path to the glue code for the module. |
| `wasm` | The path to the WASM file for the module. |
| `fallback` | The path to the fallback (asm.js) code for the module. |

### pc-render

The `pc-render` tag is used to define a render component that render a 3D primitive. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `type` | The type of render component. Can be `box`, `capsule`, `cone`, `cylinder`, `plane` or `sphere`. |
| `cast-shadows` | Valueless attribute. If present, the render component casts shadows. |
| `receive-shadows` | Valueless attribute. If present, the render component receives shadows. |

### pc-rigidbody

The `pc-rigidbody` tag is used to define a rigidbody component. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `angular-damping` | The angular damping of the rigidbody. If not specified, `0` is used. |
| `angular-factor` | The angular factor of the rigidbody. Specified as a space-separated list of X, Y, and Z values. If not specified, `1 1 1` is used. |
| `friction` | The friction of the rigidbody. If not specified, `0.5` is used. |
| `linear-damping` | The linear damping of the rigidbody. If not specified, `0` is used. |
| `linear-factor` | The linear factor of the rigidbody. Specified as a space-separated list of X, Y, and Z values. If not specified, `1 1 1` is used. |
| `mass` | The mass of the rigidbody. If not specified, `1` is used. |
| `restitution` | The restitution of the rigidbody. If not specified, `0` is used. |
| `rolling-friction` | The rolling friction of the rigidbody. If not specified, `0` is used. |
| `type` | The type of rigidbody component. Can be `static`, `kinematic` or `dynamic`. |

### pc-scene

The `pc-scene` tag is used to define the scene. It must be a direct child of `pc-app`.

| Attribute | Description |
| --- | --- |
| `fog` | The type of fog to use. Can be `linear`, `exp`, or `exp2`. |
| `fog-color` | The color of the fog. Can be a CSS color string or a hex color code. |
| `fog-start` | The start distance of the fog. |
| `fog-end` | The end distance of the fog. |
| `fog-density` | The density of the fog. |

### pc-screen

The `pc-screen` tag is used to define a screen component. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `blend` | Valueless attribute. If present, the screen component blends. |
| `priority` | The priority of the screen component. Must be an integer between `0` and `255`. If not specified, `0` is used. |
| `reference-resolution` | The reference resolution of the screen component. Specified as a space-separated list of Width and Height values. If not specified, `640 320` is used. |
| `resolution` | The resolution of the screen component. Specified as a space-separated list of Width and Height values. If not specified, `640 320` is used. |
| `scale-blend` | The scale blend of the screen component. Must be a number between `0` and `1`. If not specified, `0.5` is used. |
| `screen-space` | Valueless attribute. If present, the screen component is in screen space. |


### pc-script

The `pc-script` tag is used to define a script. It must be a direct child of a `pc-scripts` component.

| Attribute | Description |
| --- | --- |
| `attributes` | A JSON string of attributes for the script. |
| `enabled` | Enabled state of the script. If not specified, `true` is used. |
| `name` | The name of the script. |

### pc-scripts

The `pc-scripts` tag is used to define a scripts component. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `enabled` | Enabled state of the scripts component. If not specified, `true` is used. |

### pc-sky

The `pc-sky` tag is used to define a sky component. It must be a direct child of a `pc-scene`.

| Attribute | Description |
| --- | --- |
| `asset` | A string that should match the `id` of a `pc-asset` tag that has a type of `texture`. |
| `center` | The center of the sky. Specified as a space-separated list of X, Y, and Z values in the range 0 to 1. If not specified, `0 0.01 0` is used. |
| `intensity` | The intensity of the sky. If not specified, `1` is used. |
| `level` | The mipmap level used to render the sky. If not specified, `0` is used (base mip level). |
| `rotation` | The rotation of the sky. Specified as a space-separated list of X, Y, and Z values. If not specified, `0 0 0` is used. |
| `scale` | The scale of the sky. Specified as a space-separated list of X, Y, and Z values. If not specified, `100 100 100` is used. |
| `type` | The type of sky component. Can be `box`, `dome`, `infinite` or `none`. |

### pc-sound

The `pc-sound` tag is used to define a sound. It must be a direct child of a `pc-sounds`.

| Attribute | Description |
| --- | --- |
| `asset` | A string that should match the `id` of a `pc-asset` tag that has a type of `audio`. |
| `auto-play` | Valueless attribute. If present, the sound slot plays automatically. |
| `duration` | The duration of the sound slot. |
| `loop` | Valueless attribute. If present, the sound slot loops. |
| `name` | The name of the sound slot. |
| `overlap` | Valueless attribute. If present, the sound slot overlaps. |
| `pitch` | The pitch of the sound slot. If not specified, `1` is used. |
| `start-time` | The start time of the sound slot. If not specified, `0` is used. |
| `volume` | The volume of the sound slot. If not specified, `1` is used. |

### pc-sounds

The `pc-sounds` tag is used to define a sound component. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `distance-model` | The distance model of the sound. Can be `exponential`, `inverse` or `linear`. If not specified, `linear` is used. |
| `pitch` | The pitch of the sound. If not specified, `1` is used. |
| `max-distance` | The maximum distance from the listener at which audio falloff stops. If not specified, `10000` is used. |
| `positional` | Valueless attribute. If present, the sound is positional. |
| `ref-distance` | The distance from the listener at which the volume will be at full volume. If not specified, `1` is used. |
| `roll-off-factor` | The factor used in the falloff equation. If not specified, `1` is used. |
| `volume` | The volume of the sound. If not specified, `1` is used. |

### pc-splat

The `pc-splat` tag is used to define a splat component. It must be a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `asset` | A string that should match the `id` of a `pc-asset` tag that has a type of `gsplat`. |
| `enabled` | Enabled state of the splat component. If not specified, `true` is used. |
