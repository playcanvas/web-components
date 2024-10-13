# PlayCanvas Web Components

Unleash the power of PlayCanvas in your HTML. PlayCanvas Web Components allows you to write PlayCanvas scenes using only HTML, enabling a clear and concise structure, and making it easier than ever to integrate with other web technologies. Just add tags for entities, components, and assets, and watch your 3D scene come to life!

## Usage 🚧

Using NPM:

```bash
npm install @playcanvas/web-components --save-dev
```

Or, include it directly in your HTML file from a CDN:

```html
<script type="module" src="https://unpkg.com/@playcanvas/web-components"></script>
```

## Example 📖

Below is a basic example of how to use PlayDOM to create a simple 3D scene:

```html
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PlayDOM - Spinning Cube</title>
        <script type="importmap">
            {
                "imports": {
                    "playcanvas": "https://esm.run/playcanvas@2.1.0"
                }
            }
        </script>
        <script type="module" src="https://esm.run/@playcanvas/web-components@1.0.0"></script>
        <link rel="stylesheet" href="styles.css">
    </head>
    <body>
        <pc-app>
            <pc-scene>
                <pc-entity name="camera" position="0,0,3">
                    <pc-camera clear-color="#8099e6"></pc-camera>
                </pc-entity>
                <pc-entity name="light" rotation="45,0,0">
                    <pc-light></pc-light>
                </pc-entity>
                <pc-entity name="cube">
                    <pc-render type="box"></pc-render>
                    <pc-script src="/examples/rotate.mjs"></pc-script>
                </pc-entity>
            </pc-scene>
        </pc-app>
    </body>
</html>
```
