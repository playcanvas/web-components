/**
 * Validates the generated Custom Elements Manifest and the editor integration files derived from
 * it. Run as part of `npm run cem`, so a build fails loudly if the manifest regresses.
 *
 * The checks are deliberately concrete: the full set of tag names, and spot checks on attributes
 * whose metadata exercises each part of the generation pipeline (enums resolved from an inline
 * array and from a `Map`, defaults rendered from math constructors and constants, attributes and
 * events inherited from a base class). A silent regression in the analyzer or in
 * `attributes-plugin.mjs` would otherwise ship an empty-looking manifest unnoticed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPONENT_TAGS, READY_TAGS, TAGS } from './tags.mjs';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

const failures = [];

const check = (condition, message) => {
    if (!condition) {
        failures.push(message);
    }
};

const readJson = (name) => {
    try {
        return JSON.parse(readFileSync(join(dist, name), 'utf8'));
    } catch (error) {
        failures.push(`dist/${name} could not be read or parsed: ${error.message}`);
        return null;
    }
};

const manifest = readJson('custom-elements.json');

if (manifest) {
    check(Boolean(manifest.schemaVersion), 'manifest is missing schemaVersion');
    check((manifest.modules ?? []).length > 0, 'manifest has no modules');

    /** @type {Map<string, object>} */
    const elements = new Map();
    for (const module of manifest.modules ?? []) {
        for (const declaration of module.declarations ?? []) {
            if (declaration.tagName) {
                elements.set(declaration.tagName, declaration);
            }
        }
    }

    const missing = TAGS.filter(tag => !elements.has(tag));
    const unexpected = [...elements.keys()].filter(tag => !TAGS.includes(tag));
    check(missing.length === 0, `manifest is missing tags: ${missing.join(', ')}`);
    check(unexpected.length === 0, `manifest has unexpected tags: ${unexpected.join(', ')}`);

    const attribute = (tag, name) => elements.get(tag)?.attributes?.find(item => item.name === name);

    const expectAttribute = (tag, name, expected) => {
        const item = attribute(tag, name);
        if (!item) {
            failures.push(`${tag} is missing the '${name}' attribute`);
            return;
        }
        for (const [key, value] of Object.entries(expected)) {
            const actual = key === 'type' ? item.type?.text : item[key];
            check(actual === value, `${tag}[${name}].${key} is ${JSON.stringify(actual)}, expected ${JSON.stringify(value)}`);
        }
    };

    const expectEnum = (tag, name, count, defaultValue) => {
        const item = attribute(tag, name);
        if (!item) {
            failures.push(`${tag} is missing the '${name}' attribute`);
            return;
        }
        const values = (item.type?.text ?? '').split('|').map(value => value.trim());
        check(values.length === count && values.every(value => /^'[^']+'$/.test(value)),
            `${tag}[${name}] is not an enum of ${count} values: ${item.type?.text}`);
        check(item.default === defaultValue,
            `${tag}[${name}].default is ${JSON.stringify(item.default)}, expected ${JSON.stringify(defaultValue)}`);
    };

    // Numbers, booleans and descriptions copied from the property's JSDoc
    expectAttribute('pc-camera', 'fov', { type: 'number', default: '45', fieldName: 'fov' });
    check(Boolean(attribute('pc-camera', 'fov')?.description), 'pc-camera[fov] has no description');
    expectAttribute('pc-camera', 'frustum-culling', { type: 'boolean', default: 'true', fieldName: 'frustumCulling' });

    // Defaults rendered from math constructors and from engine constants
    expectAttribute('pc-camera', 'clear-color', { default: '0.75 0.75 0.75 1' });
    expectAttribute('pc-camera', 'rect', { default: '0 0 1 1' });
    expectAttribute('pc-scene', 'gravity', { default: '0 -9.81 0' });
    expectAttribute('pc-entity', 'position', { default: '0 0 0' });
    expectAttribute('pc-entity', 'scale', { default: '1 1 1' });
    expectAttribute('pc-button', 'hit-padding', { default: '0 0 0 0' });
    expectAttribute('pc-button', 'hover-tint', { default: '1 1 1' });
    expectAttribute('pc-collision', 'angular-offset', { default: '0 0 0' });

    // A `null` default means "leave the engine value alone", so it is omitted
    check(attribute('pc-element', 'margin')?.default === undefined,
        'pc-element[margin] should have no default');

    // pc-material carries by far the largest attribute surface, and it is the one element whose
    // attributes are mostly mechanical repetitions of a handful of shapes - so a regression in any
    // one shape would be easy to miss by eye.
    const materialAttributes = elements.get('pc-material')?.attributes ?? [];
    check(materialAttributes.length > 80,
        `pc-material has ${materialAttributes.length} attributes, expected more than 80`);
    expectAttribute('pc-material', 'diffuse-map-tiling',
        { type: 'string', default: '1 1', fieldName: 'diffuseMapTiling' });
    expectAttribute('pc-material', 'diffuse-map-offset', { default: '0 0' });
    expectAttribute('pc-material', 'gloss', { type: 'number', default: '0.25', fieldName: 'gloss' });
    expectAttribute('pc-material', 'diffuse', { type: 'string', default: '1 1 1' });
    expectAttribute('pc-material', 'emissive', { default: '0 0 0' });
    expectEnum('pc-material', 'cull', 4, 'back');
    expectEnum('pc-material', 'diffuse-map-channel', 5, 'rgb');
    expectEnum('pc-material', 'opacity-dither', 4, 'none');

    // The element enables the metalness workflow, unlike a bare StandardMaterial, so the default
    // published to editors has to say so
    expectAttribute('pc-material', 'use-metalness', { type: 'boolean', default: 'true' });

    // roughness-* are aliases: they resolve to the gloss properties rather than to themselves
    expectAttribute('pc-material', 'roughness', { fieldName: 'gloss' });
    expectAttribute('pc-material', 'roughness-map', { type: 'string', fieldName: 'glossMap' });

    // A texture slot names a pc-asset, so it has no meaningful default to publish
    check(attribute('pc-material', 'diffuse-map')?.default === undefined,
        'pc-material[diffuse-map] should have no default');

    // Enums resolved from an inline array, and from a module-scope Map
    expectEnum('pc-render', 'type', 6, 'box');
    expectEnum('pc-light', 'type', 3, 'directional');
    expectEnum('pc-camera', 'tonemap', 7, 'none');
    expectEnum('pc-light', 'shadow-type', 9, 'pcf3-32f');
    expectEnum('pc-scrollview', 'horizontal-scrollbar-visibility', 2, 'when-required');

    // Attributes read with getAttribute, so declared with @attribute
    for (const name of ['name', 'glue', 'wasm', 'fallback']) {
        expectAttribute('pc-module', name, { type: 'string' });
    }
    for (const name of ['id', 'src', 'type', 'data', 'atlas', 'frame-keys', 'pixels-per-unit', 'render-mode']) {
        check(Boolean(attribute('pc-asset', name)), `pc-asset is missing the '${name}' attribute`);
    }
    expectAttribute('pc-asset', 'lazy', { type: 'boolean', default: 'false' });

    // Inherited from ComponentElement - pc-listener and pc-scripts declare no attributes of their
    // own, so they prove the inheritance step rather than merely surviving it
    for (const tag of COMPONENT_TAGS) {
        const enabled = attribute(tag, 'enabled');
        if (!enabled) {
            failures.push(`${tag} is missing the inherited 'enabled' attribute`);
            continue;
        }
        check(enabled.type?.text === 'boolean' && enabled.default === 'true',
            `${tag}[enabled] is not a boolean defaulting to true`);
        check(enabled.inheritedFrom?.name === 'ComponentElement',
            `${tag}[enabled] is not marked as inherited from ComponentElement`);
    }

    const events = tag => (elements.get(tag)?.events ?? []).map(event => event.name);

    for (const tag of READY_TAGS) {
        check(events(tag).includes('ready'), `${tag} is missing the 'ready' event`);
    }
    check(!events('pc-material').includes('ready'), 'pc-material should not have a ready event');

    for (const name of ['scriptattributeschange', 'scriptenablechange', 'scriptnamechange']) {
        check(events('pc-script').includes(name), `pc-script is missing the '${name}' event`);
    }

    const pointerEvents = ['pointerenter', 'pointerleave', 'pointermove', 'pointerdown', 'pointerup'];
    for (const name of pointerEvents) {
        check(events('pc-entity').includes(name), `pc-entity is missing the '${name}' event`);
    }
    const strayPointerEvents = pointerEvents.filter(name => events('pc-app').includes(name));
    check(strayPointerEvents.length === 0,
        `pc-app should not declare pointer events: ${strayPointerEvents.join(', ')}`);

    // Global invariants
    for (const [tag, declaration] of elements) {
        for (const item of declaration.attributes ?? []) {
            check(Boolean(item.type?.text), `${tag}[${item.name}] has no type`);

            // An attribute description is read as a tooltip, so it must not still be in the
            // accessor voice ("Gets how the material is blended..."). A leading word that
            // toAttributeDescription does not know about is how these slip through.
            check(!/^(?:Sets|Gets)\b/.test(item.description ?? ''),
                `${tag}[${item.name}] kept the accessor voice: ${JSON.stringify(item.description)}`);
        }
        for (const event of declaration.events ?? []) {
            check(Boolean(event.name) && !/[`$:]/.test(event.name),
                `${tag} has an unresolved event name: ${JSON.stringify(event.name)}`);
        }
    }

    // Descriptions are rendered as markdown by manifest consumers, so no TSDoc link syntax - in
    // either its original or its brace-stripped form - should survive into the manifest
    const descriptions = [];
    const collect = (node) => {
        if (Array.isArray(node)) {
            node.forEach(collect);
        } else if (node !== null && typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                if ((key === 'description' || key === 'summary') && typeof value === 'string') {
                    descriptions.push(value);
                } else {
                    collect(value);
                }
            }
        }
    };
    collect(manifest);

    check(descriptions.length > 0, 'manifest has no descriptions');
    const unrendered = descriptions.filter(text => text.includes('{@link') ||
        /https?:\/\/[^\s|]+\s*\|/.test(text));
    check(unrendered.length === 0,
        `${unrendered.length} description(s) still contain unrendered link syntax, e.g. ${JSON.stringify(unrendered[0]?.slice(0, 120))}`);
}

const vsCode = readJson('vscode.html-custom-data.json');
if (vsCode) {
    const tags = (vsCode.tags ?? []).map(tag => tag.name).sort();
    check(tags.length === TAGS.length, `VS Code custom data has ${tags.length} tags, expected ${TAGS.length}`);

    const tonemap = vsCode.tags
        ?.find(tag => tag.name === 'pc-camera')?.attributes
        ?.find(item => item.name === 'tonemap');
    check(tonemap?.values?.length === 7,
        `VS Code custom data should offer 7 values for pc-camera[tonemap], found ${tonemap?.values?.length}`);

    // A `---` directly below a paragraph is markdown for "make that paragraph a heading", which
    // would render the last paragraph of the tooltip at heading size
    const setext = (vsCode.tags ?? [])
        .filter(tag => /[^\n]\n---/.test(typeof tag.description === 'string' ? tag.description : tag.description?.value ?? ''))
        .map(tag => tag.name);
    check(setext.length === 0,
        `${setext.length} VS Code tooltip(s) would render a paragraph as a heading: ${setext.join(', ')}`);
}

const webTypes = readJson('web-types.json');
if (webTypes) {
    const elements = webTypes.contributions?.html?.elements ?? [];
    check(elements.length === TAGS.length, `web-types has ${elements.length} elements, expected ${TAGS.length}`);
}

if (failures.length > 0) {
    console.error(`Custom Elements Manifest validation failed (${failures.length} problem(s)):`);
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    process.exit(1);
}

console.log(`Custom Elements Manifest validated: ${TAGS.length} elements.`);
