# PlayCanvas Web Components

[![NPM Version][npm-version-badge]][npm-url]
[![NPM Downloads][npm-downloads-badge]][npm-trends-url]
[![License][license-badge]][license-url]
[![GitHub Actions Build Status][build-status-badge]][workflow-url]
[![Github Issue Resolve Time][issue-resolve-badge]][isitmaintained-url]
[![Github Open Issues][open-issues-badge]][isitmaintained-url]

| [User Manual][manual-url] | [API Reference][api-url] | [Examples][examples-url] | [Blog][blog-url] | [Forum][forum-url] | [Discord][discord-url] | [Reddit][reddit-url] | [Twitter][twitter-url] |

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

[npm-version-badge]: https://img.shields.io/npm/v/@playcanvas/web-components
[npm-downloads-badge]: https://img.shields.io/npm/dw/@playcanvas/web-components
[license-badge]: https://img.shields.io/npm/l/@playcanvas/web-components
[build-status-badge]: https://github.com/playcanvas/web-components/actions/workflows/ci.yml/badge.svg
[issue-resolve-badge]: https://isitmaintained.com/badge/resolution/playcanvas/web-components.svg
[open-issues-badge]: https://isitmaintained.com/badge/open/playcanvas/web-components.svg

[npm-url]: https://www.npmjs.com/package/@playcanvas/web-components
[npm-trends-url]: https://npmtrends.com/@playcanvas/web-components
[license-url]: https://github.com/playcanvas/web-components/blob/main/LICENSE
[workflow-url]: https://github.com/playcanvas/web-components/actions/workflows/ci.yml
[isitmaintained-url]: https://isitmaintained.com/project/playcanvas/web-components

[manual-url]: https://developer.playcanvas.com
[api-url]: https://api.playcanvas.com/web-components
[examples-url]: https://playcanvas.github.io/web-components/examples
[blog-url]: https://blog.playcanvas.com
[forum-url]: https://forum.playcanvas.com
[discord-url]: https://discord.gg/RSaMRzg
[reddit-url]: https://www.reddit.com/r/PlayCanvas/
[twitter-url]: https://twitter.com/intent/follow?screen_name=playcanvas
