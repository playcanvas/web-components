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

## Example 📖

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
