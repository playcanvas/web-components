# PlayDOM

Unleash the power of PlayCanvas in your HTML. PlayDOM allows you to write PlayCanvas scenes using only HTML, enabling a clear and concise structure, and making it easier than ever to integrate with other web technologies. Just add tags for entities, components, and assets, and watch your 3D scene come to life!

## Usage 🚧

Using NPM:

```bash
npm install @playcanvas/playdom --save=dev
```

Or, include it directly in your HTML file from a CDN:

```html
<script type="module" src="https://unpkg.com/playdom"></script>
```

## Example 📖

Below is a basic example of how to use PlayDOM to create a simple 3D scene:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PlayDOM Example</title>
    <script type="module" src="path/to/playdom.mjs"></script>
    <style>
        body {
            margin: 0;
            overflow: hidden;
        }
    </style>
</head>
<body>
    <pc-app>
        <pc-scene>
            <pc-entity name="camera" position="0,0,5">
                <pc-camera></pc-camera>
            </pc-entity>
            <pc-entity name="sphere">
                <pc-render type="sphere"></pc-render>
            </pc-entity>
        </pc-scene>
    </pc-app>
</body>
</html>
```
