# PlayCanvas Web Components

[![NPM Version](https://img.shields.io/npm/v/@playcanvas/web-components)](https://www.npmjs.com/package/@playcanvas/web-components)
[![NPM Downloads](https://img.shields.io/npm/dw/@playcanvas/web-components)](https://npmtrends.com/@playcanvas/web-components)
[![License](https://img.shields.io/npm/l/@playcanvas/web-components)](https://github.com/playcanvas/web-components/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white&color=black)](https://discord.gg/RSaMRzg)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=flat&logo=reddit&logoColor=white&color=black)](https://www.reddit.com/r/PlayCanvas)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white&color=black)](https://x.com/intent/follow?screen_name=playcanvas)

| [User Manual](https://developer.playcanvas.com//user-manual/web-components) | [API Reference](https://api.playcanvas.com/web-components) | [Examples](https://playcanvas.github.io/web-components/examples) | [Blog](https://blog.playcanvas.com) | [Forum](https://forum.playcanvas.com) |

PlayCanvas Web Components are a set of custom HTML elements for building 3D interactive web apps. Using the declarative nature of HTML makes it both easy and fun to incorporate 3D into your website. Check out this simple example:

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

[![image](https://github.com/user-attachments/assets/25ac8dd3-abc9-4d65-8950-3d72ed1f7152)](https://playcanvas.github.io/web-components/examples)

See PlayCanvas Web Components in action here: https://playcanvas.github.io/web-components/examples

## Usage

Please see the [Getting Started Guide](https://developer.playcanvas.com/user-manual/web-components/getting-started/) for installation and usage instructions.

## Loading

While `<pc-app>` boots and preloads its assets, it shows a slim built-in loading bar along the top of the window — no JavaScript required. Disable it if you are building your own loading UI:

```html
<pc-app loading-bar="false">
```

Theme it with CSS custom properties, from `pc-app` or `:root`:

| Custom property | Default | Purpose |
| --- | --- | --- |
| `--pc-loading-bar-color` | `#f60` | The fill color |
| `--pc-loading-bar-background` | `rgba(0, 0, 0, 0.1)` | The track color |
| `--pc-loading-bar-height` | `3px` | The bar height |

To drive your own loading UI, listen for `progress` on `<pc-app>`. It fires at least once per boot with `loaded` and `total` as asset counts (an asset that fails still counts as loaded), and the final event always has `loaded` equal to `total`. The `loadProgress` property holds the current fraction for listeners that attach late:

```js
const appElement = document.querySelector('pc-app');
appElement.addEventListener('progress', ({ loaded, total }) => {
    myBar.style.width = `${total ? (100 * loaded) / total : 100}%`;
});
```

Each `<pc-asset>` fires `load` when it finishes loading and `error` (an `ErrorEvent` with the engine's message) when it fails. Like `<img>`, neither event bubbles — listen on the element, or observe every asset with a capture-phase listener on an ancestor:

```js
appElement.addEventListener('error', (event) => {
    console.warn(`Failed to load ${event.target.getAttribute('src')}: ${event.message}`);
}, true);
```

## Editor Support

The package ships a [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest), which editors use to offer tag and attribute completions, valid attribute values and hover documentation when authoring HTML.

**VS Code** — add the following to your workspace `.vscode/settings.json`:

```json
{
  "html.customData": [
    "./node_modules/@playcanvas/web-components/dist/vscode.html-custom-data.json"
  ]
}
```

**JetBrains IDEs** (WebStorm, IntelliJ IDEA) — no setup required. The IDE discovers the bundled `web-types.json` automatically.

**Other tooling** — the manifest itself is at `@playcanvas/web-components/dist/custom-elements.json` and is declared in the package's `customElements` field, which is how tools such as `lit-analyzer` and Storybook locate it.

## Development 

### Setting Up Local Development

1. Clone the repository:

   ```bash
   git clone https://github.com/playcanvas/web-components.git
   cd web-components
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the library in watch mode and start the development server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000/examples/ in your browser to see the examples.

### Building

To build the library:

```bash
npm run build
```

The built files will be available in the `dist` directory.

### API Documentation

To generate API documentation:

```bash
npm run docs
```

The documentation will be generated in the `docs` directory.
