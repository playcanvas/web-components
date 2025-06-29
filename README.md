# PlayCanvas Web Components

[![NPM Version](https://img.shields.io/npm/v/@playcanvas/web-components.svg)](https://www.npmjs.com/package/@playcanvas/web-components)
[![NPM Downloads](https://img.shields.io/npm/dw/@playcanvas/web-components)](https://npmtrends.com/@playcanvas/web-components)
[![License](https://img.shields.io/npm/l/@playcanvas/web-components.svg)](https://github.com/playcanvas/web-components/blob/main/LICENSE)
[![GitHub Actions Build Status](https://github.com/playcanvas/web-components/actions/workflows/deploy.yml/badge.svg)](https://github.com/playcanvas/web-components/actions/workflows/deploy.yml)

| [User Guide](https://developer.playcanvas.com/user-manual/web-components) | [API Reference](https://api.playcanvas.com/web-components/) | [Examples](https://playcanvas.github.io/web-components/examples) | [Blog](https://blog.playcanvas.com/) | [Forum](https://forum.playcanvas.com/) | [Discord](https://discord.gg/RSaMRzg) |

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
