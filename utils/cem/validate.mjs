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

import { COMPONENT_TAGS, ENTITY_TAGS, READY_TAGS, TAGS } from './tags.mjs';

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

/**
 * Each element's summary, as the manifest carries it. The editor integrations open an element's
 * tooltip with it, so the checks on their generated files compare against this.
 *
 * @type {Map<string, string>}
 */
const summaries = new Map();

if (manifest) {
    check(Boolean(manifest.schemaVersion), 'manifest is missing schemaVersion');
    check((manifest.modules ?? []).length > 0, 'manifest has no modules');

    /** @type {Map<string, object>} */
    const elements = new Map();
    for (const module of manifest.modules ?? []) {
        for (const declaration of module.declarations ?? []) {
            if (declaration.tagName) {
                elements.set(declaration.tagName, declaration);
                summaries.set(declaration.tagName, declaration.summary ?? '');
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
    expectAttribute('pc-entity', 'position', { default: '0 0 0', fieldName: 'position' });
    expectAttribute('pc-entity', 'scale', { default: '1 1 1' });
    expectAttribute('pc-model', 'position', { default: '0 0 0', fieldName: 'position' });
    expectAttribute('pc-model', 'scale', { default: '1 1 1' });

    // The entity-owning accessors live on a shared base class, but the attributes plugin can only
    // read a same-module member's JSDoc - these descriptions exist solely because the leaf classes
    // re-declare them as @attribute tags, so their loss is pinned here.
    check(Boolean(attribute('pc-entity', 'position')?.description), 'pc-entity[position] has no description');
    check(Boolean(attribute('pc-model', 'position')?.description), 'pc-model[position] has no description');
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

    // Because they resolve to gloss, the aliases would inherit gloss's description - which reads
    // inverted ("The glossiness of the material"). They carry an @attribute tag instead, and that
    // only survives because moduleLinkPhase leaves an existing description alone. Pin both ends.
    for (const name of ['roughness', 'roughness-map']) {
        const description = attribute('pc-material', name)?.description ?? '';
        check(/roughness/i.test(description) && !/^The gloss/i.test(description),
            `pc-material[${name}] fell back to the gloss description: ${JSON.stringify(description)}`);
    }

    // Attributes that do nothing on their own must say so, or the tooltip promises an effect the
    // defaults prevent. Only the first sentence of an accessor's JSDoc reaches the manifest, so
    // the caveat has to be in it.
    for (const [name, caveat] of [
        ['opacity', 'blend-type'],
        ['specular', 'use-metalness-specular-color'],
        ['specularity-factor', 'use-metalness-specular-color']
    ]) {
        const description = attribute('pc-material', name)?.description ?? '';
        check(description.includes(caveat),
            `pc-material[${name}] does not mention '${caveat}': ${JSON.stringify(description)}`);
    }

    // A texture slot names a pc-asset, so it has no meaningful default to publish
    check(attribute('pc-material', 'diffuse-map')?.default === undefined,
        'pc-material[diffuse-map] should have no default');

    // Enums resolved from an inline array, and from a module-scope Map
    expectEnum('pc-render', 'type', 6, 'box');
    expectEnum('pc-light', 'type', 3, 'directional');
    expectEnum('pc-camera', 'tonemap', 7, 'none');
    expectEnum('pc-light', 'shadow-type', 9, 'pcf3-32f');
    expectEnum('pc-scroll-view', 'horizontal-scrollbar-visibility', 2, 'when-required');

    // Two-value enums that replaced booleans. Both are named for the engine property they drive, so
    // the description has to survive as well - the old names ('blend', 'orthographic') are what made
    // pc-screen[blend] publish a description claiming it enabled alpha blending.
    expectEnum('pc-screen', 'scale-mode', 2, 'none');
    expectEnum('pc-camera', 'projection', 2, 'perspective');
    for (const [tag, name, pattern] of [
        ['pc-screen', 'scale-mode', /^How the screen scales/],
        ['pc-camera', 'projection', /^The projection of the camera/]
    ]) {
        check(pattern.test(attribute(tag, name)?.description ?? ''),
            `${tag}[${name}] lost its description: ${JSON.stringify(attribute(tag, name)?.description)}`);
    }

    // The description comes from the getter's "Gets whether ..." JSDoc, so it exercises
    // toAttributeDescription's rewrite as well as the boolean default. Pinned because the terse
    // "The x flag." accessor style would make a useless tooltip for a behaviour switch.
    expectAttribute('pc-app', 'loading-bar', { type: 'boolean', default: 'true', fieldName: 'loadingBar' });
    check(/^Whether .* built-in loading bar/.test(attribute('pc-app', 'loading-bar')?.description ?? ''),
        `pc-app[loading-bar] lost its descriptive tooltip: ${JSON.stringify(attribute('pc-app', 'loading-bar')?.description)}`);

    // pc-app's frame buffer options. Named for the buffer each one allocates, matching pc-camera's
    // clear-depth-buffer / clear-stencil-buffer, so the pairing is pinned at both ends.
    expectAttribute('pc-app', 'depth-buffer', { type: 'boolean', default: 'true', fieldName: 'depthBuffer' });
    expectAttribute('pc-app', 'stencil-buffer', { type: 'boolean', default: 'true', fieldName: 'stencilBuffer' });
    for (const name of ['clear-depth-buffer', 'clear-stencil-buffer']) {
        check(Boolean(attribute('pc-camera', name)), `pc-camera is missing the '${name}' attribute`);
    }

    // The two defaults in the library that are not values a user would ever type: Infinity means
    // "no cap" / "unbreakable", which renderDefault has a dedicated branch for.
    expectAttribute('pc-app', 'max-pixel-ratio', { type: 'number', default: 'Infinity', fieldName: 'maxPixelRatio' });
    expectAttribute('pc-joint', 'break-impulse', { type: 'number', default: 'Infinity', fieldName: 'breakImpulse' });

    // pc-joint's remaining shapes: enums from inline arrays, a Vec2 default with negative
    // components, and string entity references
    expectEnum('pc-joint', 'type', 5, 'fixed');
    expectEnum('pc-joint', 'linear-motion-y', 3, 'locked');
    expectAttribute('pc-joint', 'limits', { type: 'string', default: '-45 45', fieldName: 'limits' });
    expectAttribute('pc-joint', 'entity-a', { type: 'string', fieldName: 'entityA' });

    // Attributes read with getAttribute, so declared with @attribute
    for (const name of ['name', 'glue', 'wasm', 'fallback']) {
        expectAttribute('pc-wasm', name, { type: 'string' });
    }

    // The one engine property that is a pure label rather than shader state; pinned so the
    // accessor keeps backing it
    expectAttribute('pc-material', 'name', { type: 'string', fieldName: 'name' });
    for (const name of ['id', 'src', 'type', 'data', 'atlas', 'frame-keys', 'pixels-per-unit', 'render-mode']) {
        check(Boolean(attribute('pc-asset', name)), `pc-asset is missing the '${name}' attribute`);
    }
    expectAttribute('pc-asset', 'lazy', { type: 'boolean', default: 'false' });

    // The texture options, derived from attributeChangedCallback - one of each shape. The
    // defaults double as the invalid-value fallbacks and are deliberately the engine's own.
    expectEnum('pc-asset', 'address-u', 3, 'repeat');
    expectEnum('pc-asset', 'min-filter', 6, 'linear-mip-linear');
    expectEnum('pc-asset', 'mag-filter', 2, 'linear');
    expectAttribute('pc-asset', 'anisotropy', { type: 'number', default: '1', fieldName: 'anisotropy' });
    expectAttribute('pc-asset', 'srgb', { type: 'boolean', default: 'false', fieldName: 'srgb' });
    expectAttribute('pc-asset', 'mipmaps', { type: 'boolean', default: 'true', fieldName: 'mipmaps' });

    // Inherited from ComponentElement - pc-audio-listener and pc-script declare no attributes of their
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
        check(events('pc-script-instance').includes(name), `pc-script-instance is missing the '${name}' event`);
    }

    check(events('pc-joint').includes('break'), "pc-joint is missing the 'break' event");

    const pointerEvents = ['pointerenter', 'pointerleave', 'pointermove', 'pointerdown', 'pointerup'];
    for (const tag of ENTITY_TAGS) {
        for (const name of pointerEvents) {
            check(events(tag).includes(name), `${tag} is missing the '${name}' event`);
        }
    }
    const strayPointerEvents = pointerEvents.filter(name => events('pc-app').includes(name));
    check(strayPointerEvents.length === 0,
        `pc-app should not declare pointer events: ${strayPointerEvents.join(', ')}`);

    // Loading events are leaf-declared (ProgressEvent/ErrorEvent dispatches, not CustomEvent), so
    // they exercise the analyzer's non-CustomEvent detection - and must not leak onto other tags
    // through the inheritance step
    check(events('pc-app').includes('progress'), "pc-app is missing the 'progress' event");
    check(events('pc-app').includes('error'), "pc-app is missing the 'error' event");
    for (const name of ['load', 'error']) {
        check(events('pc-asset').includes(name), `pc-asset is missing the '${name}' event`);
    }
    check(!events('pc-entity').includes('progress'), 'pc-entity should not have a progress event');
    // pc-app declares its own 'error' event, so 'load' is what remains of the leak canary
    check(!events('pc-app').includes('load'), "pc-app should not declare pc-asset's 'load' event");

    // ---- Members: the manifest's public API surface ----
    //
    // cleanup-plugin.mjs drops every member that is not public API (private and protected
    // members, plus underscore-prefixed internals). That filter has two failure modes, and each
    // direction is pinned here: under-filtering ships an internal member as API, and
    // over-filtering silently drops a real public member - which no other check would notice.

    // Under-filtering: nothing non-public survives, in any class of any module (the base
    // classes have no tag, so the per-element map below never sees them)
    for (const module of manifest.modules ?? []) {
        for (const declaration of module.declarations ?? []) {
            if (declaration.kind !== 'class') {
                continue;
            }
            for (const member of declaration.members ?? []) {
                check(Boolean(member.name) && !member.name.startsWith('_'),
                    `${declaration.name}.${member.name} is underscore-internal but ships in the manifest`);
                check((member.privacy ?? 'public') === 'public',
                    `${declaration.name}.${member.name} is ${member.privacy} but ships in the manifest`);
            }
        }
    }

    // Over-filtering, part 1: every attribute's backing accessor is still a member. pc-entity's
    // onpointer* attributes are exempt - they are handled by a dispatch helper rather than by
    // accessors, so the fieldName the attributes plugin falls back to names a member that has
    // never existed.
    const PHANTOM_FIELDS = new Set(pointerEvents.map(name => `on${name}`));
    for (const [tag, declaration] of elements) {
        const members = new Set((declaration.members ?? []).map(member => member.name));
        for (const item of declaration.attributes ?? []) {
            if (!item.fieldName || PHANTOM_FIELDS.has(item.name)) {
                continue;
            }
            check(members.has(item.fieldName),
                `${tag}[${item.name}] is backed by '${item.fieldName}', which is missing from the members`);
        }
    }

    // Over-filtering, part 2: the members that do not back an attribute are pinned exactly, per
    // element, so dropping one (or leaking a new public-looking internal) fails the build. A
    // genuinely new public member belongs in this list.
    const ASYNC_MEMBERS = ['closestApp', 'closestEntity', 'ready'];
    const EXTRA_MEMBERS = new Map([
        ['pc-anim', ['clips', 'component', 'pause', 'play', 'transition', ...ASYNC_MEMBERS]],
        ['pc-app', ['app', 'elementFromEntity', 'loadProgress', ...ASYNC_MEMBERS]],
        ['pc-asset', ['asset', 'get', ...ASYNC_MEMBERS]],
        ['pc-camera', ['component', 'endXr', 'isXrAvailable', 'startXr', 'xrAvailable', ...ASYNC_MEMBERS]],
        ['pc-entity', ['addEventListener', 'entity', 'removeEventListener', ...ASYNC_MEMBERS]],
        // roughness and roughnessMap are the alias accessors: their attributes resolve to the
        // gloss fields, so no attribute claims them as its backing member
        ['pc-material', ['get', 'material', 'roughness', 'roughnessMap']],
        ['pc-model', ['addEventListener', 'contentEntity', 'entity', 'hierarchy', 'removeEventListener', ...ASYNC_MEMBERS]],
        ['pc-wasm', [...ASYNC_MEMBERS]],
        ['pc-node', ['addEventListener', 'entity', 'path', 'removeEventListener', 'state', ...ASYNC_MEMBERS]],
        ['pc-particle-system', ['component', 'pause', 'play', 'reset', 'stop', ...ASYNC_MEMBERS]],
        ['pc-scene', ['scene', ...ASYNC_MEMBERS]],
        ['pc-script-instance', ['script', ...ASYNC_MEMBERS]],
        ['pc-sound-slot', ['soundSlot', ...ASYNC_MEMBERS]]
    ]);
    for (const tag of COMPONENT_TAGS) {
        if (!EXTRA_MEMBERS.has(tag)) {
            EXTRA_MEMBERS.set(tag, ['component', ...ASYNC_MEMBERS]);
        }
    }
    for (const tag of TAGS) {
        if (!EXTRA_MEMBERS.has(tag)) {
            EXTRA_MEMBERS.set(tag, ASYNC_MEMBERS);
        }
    }
    for (const [tag, declaration] of elements) {
        const backing = new Set((declaration.attributes ?? []).map(item => item.fieldName));
        const extras = (declaration.members ?? [])
            .map(member => member.name)
            .filter(name => !backing.has(name))
            .sort();
        const expected = [...EXTRA_MEMBERS.get(tag)].sort();
        check(extras.join() === expected.join(),
            `${tag} non-attribute members are [${extras.join(', ')}], expected [${expected.join(', ')}]`);
    }

    // The base classes and whenReady sit outside the per-tag map, but their surface is
    // inherited by (or waits on) every element, so losing it would break all of them at once
    const classes = new Map();
    for (const module of manifest.modules ?? []) {
        for (const declaration of module.declarations ?? []) {
            if (declaration.kind === 'class') {
                classes.set(declaration.name, declaration);
            }
        }
    }
    for (const [name, expected] of [
        ['AsyncElement', ASYNC_MEMBERS],
        ['ComponentElement', ['component', 'enabled', ...ASYNC_MEMBERS]]
    ]) {
        const actual = (classes.get(name)?.members ?? []).map(member => member.name).sort();
        check(actual.join() === [...expected].sort().join(),
            `${name} members are [${actual.join(', ')}], expected [${expected.join(', ')}]`);
    }
    check((manifest.modules ?? []).some(module => (module.declarations ?? [])
        .some(declaration => declaration.kind === 'function' && declaration.name === 'whenReady')),
    "the manifest lost the 'whenReady' function declaration");

    // Global invariants
    for (const [tag, declaration] of elements) {
        // Every element needs a summary, because that is what the editor integrations describe a
        // tag with. Without one they fall back to the description, which is the class reference
        // ("The XElement interface provides properties and methods for manipulating ...") - true
        // of the JavaScript class, and not what an author hovering a tag in HTML is asking about.
        // The opening is pinned to the voice the browsers' own HTML data uses ("The h1 element
        // represents a section heading"), which is the register the tooltip sits in.
        check((declaration.summary ?? '').startsWith(`The \`<${tag}>\` element`),
            `${tag} has no element-voice @elementSummary, so its tooltip would describe the class: ${JSON.stringify((declaration.summary ?? '').slice(0, 120))}`);

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

    const tooltip = tag => (typeof tag.description === 'string' ? tag.description : tag.description?.value ?? '');

    // A `---` directly below a paragraph is markdown for "make that paragraph a heading", which
    // would render the last paragraph of the tooltip at heading size
    const setext = (vsCode.tags ?? []).filter(tag => /[^\n]\n---/.test(tooltip(tag))).map(tag => tag.name);
    check(setext.length === 0,
        `${setext.length} VS Code tooltip(s) would render a paragraph as a heading: ${setext.join(', ')}`);

    // The tooltip an author sees while writing HTML opens with the element's summary, links to the
    // element's page, and leaves the JavaScript surface to the API reference. Each of the three is
    // one plugin option away from regressing, and all three regress silently - the file is still
    // valid, it just answers a question nobody asked.
    for (const tag of vsCode.tags ?? []) {
        const text = tooltip(tag);
        const summary = summaries.get(tag.name);
        check(Boolean(summary) && text.startsWith(summary),
            `the VS Code tooltip for ${tag.name} does not open with its summary: ${JSON.stringify(text.slice(0, 120))}`);
        check(!text.includes('Methods:'),
            `the VS Code tooltip for ${tag.name} lists methods, which belong to the API reference`);
        const url = tag.references?.[0]?.url;
        check(url === `https://developer.playcanvas.com/user-manual/web-components/tags/${tag.name}/`,
            `the VS Code tooltip for ${tag.name} does not reference its User Manual page: ${JSON.stringify(url)}`);
    }
}

const webTypes = readJson('web-types.json');
if (webTypes) {
    const elements = webTypes.contributions?.html?.elements ?? [];
    check(elements.length === TAGS.length, `web-types has ${elements.length} elements, expected ${TAGS.length}`);

    // The same three properties as the VS Code tooltip above, in the shape JetBrains IDEs read
    for (const element of elements) {
        const text = element.description ?? '';
        const summary = summaries.get(element.name);
        check(Boolean(summary) && text.startsWith(summary),
            `the web-types description for ${element.name} does not open with its summary: ${JSON.stringify(text.slice(0, 120))}`);
        check(!text.includes('Methods:'),
            `the web-types description for ${element.name} lists methods, which belong to the API reference`);
        check(element['doc-url'] === `https://developer.playcanvas.com/user-manual/web-components/tags/${element.name}/`,
            `the web-types entry for ${element.name} does not link its User Manual page: ${JSON.stringify(element['doc-url'])}`);
    }
}

if (failures.length > 0) {
    console.error(`Custom Elements Manifest validation failed (${failures.length} problem(s)):`);
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    process.exit(1);
}

console.log(`Custom Elements Manifest validated: ${TAGS.length} elements.`);
