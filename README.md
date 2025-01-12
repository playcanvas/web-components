# PlayCanvas Web Components

[![NPM Version](https://img.shields.io/npm/v/@playcanvas/web-components.svg)](https://www.npmjs.com/package/@playcanvas/web-components)
[![NPM Downloads](https://img.shields.io/npm/dw/@playcanvas/web-components)](https://npmtrends.com/@playcanvas/web-components)
[![License](https://img.shields.io/npm/l/@playcanvas/web-components.svg)](https://github.com/playcanvas/web-components/blob/main/LICENSE)
[![GitHub Actions Build Status](https://github.com/playcanvas/web-components/actions/workflows/deploy.yml/badge.svg)](https://github.com/playcanvas/web-components/actions/workflows/deploy.yml)

| [User Guide](https://developer.playcanvas.com/user-manual/engine/web-components) | [API Reference](https://api.playcanvas.com/modules/EngineWebComponents.html) | [Examples](https://playcanvas.github.io/web-components/examples) | [Forum](https://forum.playcanvas.com/) | [Discord](https://discord.gg/RSaMRzg) |

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

