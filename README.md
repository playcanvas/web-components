# PlayCanvas Web Components

Unleash the power of PlayCanvas in your HTML. PlayCanvas Web Components allows you to write PlayCanvas scenes using only HTML, enabling a clear and concise structure, and making it easier than ever to integrate with other web technologies. Just add tags for entities, components, and assets, and watch your 3D scene come to life!

## Usage 🚧

If you are using a bundler (e.g. Rollup), you can install PlayCanvas Web Components and the PlayCanvas Engine using NPM:

```bash
npm install playcanvas @playcanvas/web-components --save-dev
```

Or you can include it directly in your HTML file from a CDN.

ES Modules:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@playcanvas/web-components@0.1.0/dist/pwc.mjs"></script>
```

UMD:

```html
<script src="https://cdn.jsdelivr.net/npm/@playcanvas/web-components@0.1.0"></script>
```

## Tag Reference 📖

### pc-app

The `pc-app` tag is the root element for your PlayCanvas application. It is used to initialize the PlayCanvas application and provide a container for your scene.

| Attribute | Description |
| --- | --- |
| `high-resolution` | Valueless attribute. If present, enables high-resolution mode. |

### pc-asset

The `pc-asset` tag is used to define an asset. It is a direct child of `pc-app`.

| Attribute | Description |
| --- | --- |
| `id` | The ID of the asset. This is used to reference the asset in scripts. |
| `src` | The path to the asset. |
| `preload` | Valueless attribute. If present, the asset is loaded immediately. |

### pc-camera

The `pc-camera` tag is used to define a camera component. It is a direct child of an `pc-entity`.

| Attribute | Description |
| --- | --- |
| `clear-color` | The background color of the camera. Can be a comma-separated list of R, G, B, and A values or a hex color code. If not specified, `1,1,1,1` is used. |
| `far-clip` | The far clipping plane of the camera. If not specified, `1000` is used. |
| `fov` | The field of view of the camera. If not specified, `45` is used. |
| `near-clip` | The near clipping plane of the camera. If not specified, `0.1` is used. |
| `orthographic` | Valueless attribute. If present, the camera uses an orthographic projection. |
| `ortho-height` | The height of the orthographic projection. If not specified, `10` is used. |

### pc-collision

The `pc-collision` tag is used to define a collision component. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `axis` | The axis of the collision component. If not specified, `1` is used (Y-axis). |
| `convex-hull` | Valueless attribute. If present, the collision component uses a convex hull. |
| `enabled` | Enabled state of the collision component. If not specified, `true` is used. |
| `half-extents` | The half-extents of the collision component. Specified as a comma-separated list of X, Y, and Z values. If not specified, `0.5,0.5,0.5` is used. |
| `height` | The height of the collision component. If not specified, `2` is used. |
| `radius` | The radius of the collision component. If not specified, `0.5` is used. |
| `type` | The type of collision component. Can be `box`, `capsule`, `cone`, `cylinder` or `sphere`. |

### pc-element

The `pc-element` tag is used to define an element component. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `anchor` | The anchor of the element component. Specified as a comma-separated list of X, Y, Z, and W values. If not specified, `0,0,0,1` is used. |
| `asset` | A string that should match the `id` of a `pc-asset` tag that has a type of `gtext`. |
| `auto-width` | Valueless attribute. If present, the element component automatically adjusts its width. |
| `color` | The color of the element component. Can be a comma-separated list of R, G, B, and A values or a hex color code. If not specified, `1,1,1,1` is used. |
| `font-size` | The font size of the element component. If not specified, `16` is used. |
| `line-height` | The line height of the element component. If not specified, `1.2` is used. |
| `pivot` | The pivot of the element component. Specified as a comma-separated list of X and Y values. If not specified, `0.5,0.5` is used. |
| `text` | The text of the element component. |
| `type` | The type of element component. Can be `group`, `image` or `text`. |
| `width` | The width of the element component. If not specified, `0` is used. |
| `wrap-lines` | Valueless attribute. If present, the element component wraps lines. |

### pc-entity

The `pc-entity` tag is used to define an entity. It is a direct child of `pc-scene`. They can also be children of other entities.

| Attribute | Description |
| --- | --- |
| `enabled` | Enabled state of the entity. If not specified, `true` is used. |
| `name` | The name of the entity. |
| `position` | The position of the entity. Specified as a comma-separated list of X, Y, and Z values. If not specified, "0,0,0" is used. |
| `rotation` | The rotation of the entity. Specified as a comma-separated list of X, Y, and Z Euler angles in degrees. If not specified, "0,0,0" is used. |
| `scale` | The scale of the entity. Specified as a comma-separated list of X, Y, and Z values. If not specified, "1,1,1" is used. |
| `tags` | A comma-separated list of tags for the entity. |

### pc-light

The `pc-light` tag is used to define a light component. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `color` | The color of the light. Can be a comma-separated list of R, G, B values or a hex color code. If not specified, `1,1,1` is used. |
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

The `pc-listener` tag is used to define a listener component. It is a direct child of a `pc-entity`. It has no attributes.

### pc-module

The `pc-module` tag is used to define a WASM module. It is a direct child of `pc-app`.

| Attribute | Description |
| --- | --- |
| `name` | The name of the module. This is used to reference the module in scripts. |
| `glue` | The path to the glue code for the module. |
| `wasm` | The path to the WASM file for the module. |
| `fallback` | The path to the fallback (asm.js) code for the module. |

### pc-render

The `pc-render` tag is used to define a render component that render a 3D primitive. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `type` | The type of render component. Can be `box`, `capsule`, `cone`, `cylinder`, `plane` or `sphere`. |
| `cast-shadows` | Valueless attribute. If present, the render component casts shadows. |
| `receive-shadows` | Valueless attribute. If present, the render component receives shadows. |

### pc-rigidbody

The `pc-rigidbody` tag is used to define a rigidbody component. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `angular-damping` | The angular damping of the rigidbody. If not specified, `0` is used. |
| `angular-factor` | The angular factor of the rigidbody. Specified as a comma-separated list of X, Y, and Z values. If not specified, `1,1,1` is used. |
| `friction` | The friction of the rigidbody. If not specified, `0.5` is used. |
| `linear-damping` | The linear damping of the rigidbody. If not specified, `0` is used. |
| `linear-factor` | The linear factor of the rigidbody. Specified as a comma-separated list of X, Y, and Z values. If not specified, `1,1,1` is used. |
| `mass` | The mass of the rigidbody. If not specified, `1` is used. |
| `restitution` | The restitution of the rigidbody. If not specified, `0` is used. |
| `rolling-friction` | The rolling friction of the rigidbody. If not specified, `0` is used. |
| `type` | The type of rigidbody component. Can be `static`, `kinematic` or `dynamic`. |

### pc-scene

The `pc-scene` tag is used to define the scene. It is a direct child of `pc-app`.

| Attribute | Description |
| --- | --- |
| `fog` | The type of fog to use. Can be `linear`, `exp`, or `exp2`. |
| `fog-color` | The color of the fog. Can be a CSS color string or a hex color code. |
| `fog-start` | The start distance of the fog. |
| `fog-end` | The end distance of the fog. |
| `fog-density` | The density of the fog. |

### pc-script

The `pc-script` tag is used to define a script. It is a direct child of a `pc-scripts` component.

| Attribute | Description |
| --- | --- |
| `attributes` | A JSON string of attributes for the script. |
| `enabled` | Enabled state of the script. If not specified, `true` is used. |
| `name` | The name of the script. |

### pc-scripts

The `pc-scripts` tag is used to define a scripts component. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `enabled` | Enabled state of the scripts component. If not specified, `true` is used. |

### pc-sound

The `pc-sound` tag is used to define a sound component. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `pitch` | The pitch of the sound. If not specified, `1` is used. |
| `positional` | Valueless attribute. If present, the sound is positional. |
| `volume` | The volume of the sound. If not specified, `1` is used. |

### pc-sound-slot

The `pc-sound-slot` tag is used to define a sound slot. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `asset` | A string that should match the `id` of a `pc-asset` tag that has a type of `gsound`. |
| `auto-play` | Valueless attribute. If present, the sound slot plays automatically. |
| `duration` | The duration of the sound slot. |
| `loop` | Valueless attribute. If present, the sound slot loops. |
| `name` | The name of the sound slot. |
| `overlap` | Valueless attribute. If present, the sound slot overlaps. |
| `pitch` | The pitch of the sound slot. If not specified, `1` is used. |
| `start-time` | The start time of the sound slot. If not specified, `0` is used. |
| `volume` | The volume of the sound slot. If not specified, `1` is used. |

### pc-splat

The `pc-splat` tag is used to define a splat component. It is a direct child of a `pc-entity`.

| Attribute | Description |
| --- | --- |
| `asset` | A string that should match the `id` of a `pc-asset` tag that has a type of `gsplat`. |
| `enabled` | Enabled state of the splat component. If not specified, `true` is used. |

## Example 

Below is a basic example of how to use PlayCanvas Web Components to create a simple 3D scene (a spinning cube):

```html
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PlayCanvas Web Components - Spinning Cube</title>
        <script type="importmap">
            {
                "imports": {
                    "playcanvas": "https://esm.run/playcanvas@2.1.0"
                }
            }
        </script>
        <script type="module" src="https://cdn.jsdelivr.net/npm/@playcanvas/web-components@0.1.0/dist/pwc.mjs"></script>
        <link rel="stylesheet" href="styles.css">
    </head>
    <body>
        <pc-app>
            <script type="module">
                import { registerScript, Script } from 'playcanvas';

                class Rotate extends Script {
                    update(dt) {
                        this.entity.rotate(10 * dt, 20 * dt, 30 * dt);
                    }
                }

                registerScript(Rotate, 'rotate');
            </script>
            <pc-scene>
                <!-- Camera -->
                <pc-entity name="camera" position="0,0,3">
                    <pc-camera clear-color="#8099e6"></pc-camera>
                </pc-entity>
                <!-- Light -->
                <pc-entity name="light" rotation="45,0,0">
                    <pc-light></pc-light>
                </pc-entity>
                <!-- Cube -->
                <pc-entity name="cube">
                    <pc-render type="box"></pc-render>
                    <pc-scripts>
                        <pc-script name="rotate"></pc-script>
                    </pc-scripts>
                </pc-entity>
            </pc-scene>
        </pc-app>
    </body>
</html>
```
