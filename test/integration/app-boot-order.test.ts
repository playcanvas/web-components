import type { AppBase, Entity } from 'playcanvas';
import { createScript, Script, Vec3 } from 'playcanvas';
import { describe, expect, it, vi } from 'vitest';

import type { AppElement } from '../../src/app';
import type { AssetElement } from '../../src/asset';
import type { ComponentElement } from '../../src/components/component';
import type { ScriptComponentElement } from '../../src/components/script-component';
import type { ScriptInstanceElement } from '../../src/components/script-instance';
import type { EntityElement } from '../../src/entity';
import type { ModelElement } from '../../src/model';
import { settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { expectNeverReady, readyWithin } from '../helpers/ready';

/**
 * The order <pc-app> boots in. Everything the document declares is built before the application
 * starts - entities, then, once the assets have preloaded, the content of preloaded models and
 * every component - so that app.start() runs every script's initialize() and then every
 * postInitialize(), with every component in place, as it does for a scene the engine loaded.
 *
 * A script class has to be registered by the time the components are built to take part. The
 * suite's other tests register theirs once the application is ready, which is the late path;
 * here they are registered where a page registers them: before preload, or during it.
 */

/**
 * The smallest valid glTF: no meshes, one named node. Each test names its own node, because the
 * engine's loader caches by URL and a second asset with the same source would arrive loaded.
 *
 * @param nodeName - The name of the glTF's single node.
 * @returns The data: URI.
 */
const containerSrc = (nodeName: string) =>
    `data:application/json,${encodeURIComponent(
        JSON.stringify({
            asset: { version: '2.0' },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ name: nodeName }]
        })
    )}`;

/**
 * Mounts an application and runs `prepare` once for each application the element creates, as
 * soon as it exists: on the progress event that announces its preload, which the element
 * dispatches before it has added a single component. That is where a page's own module registers
 * a script class it does not load as an asset.
 *
 * @param html - The markup inside the `<pc-app>`.
 * @param prepare - Called with each application the element creates.
 * @returns The mount handle and the application element.
 */
const mountApp = (html: string, prepare: (app: AppBase) => void) => {
    const handle = mount(`<pc-app backend="null">${html}</pc-app>`);
    const appElement = handle.get<AppElement>('pc-app');

    const prepared = new WeakSet<AppBase>();
    appElement.addEventListener('progress', () => {
        const app = appElement.app;
        if (app && !prepared.has(app)) {
            prepared.add(app);
            prepare(app);
        }
    });

    return { ...handle, appElement };
};

/**
 * Waits for an application to start and for everything under it to be ready, then stops it
 * rendering on its own, so that no frame of one test runs into the next.
 *
 * @param handle - What {@link mountApp} returned.
 * @param handle.appElement - The application element.
 * @param handle.container - The container it was mounted in.
 * @returns The application.
 */
const started = async ({ appElement, container }: { appElement: AppElement; container: HTMLElement }) => {
    await readyWithin(appElement);
    await settle(container);
    const app = appElement.app!;
    app.autoRender = false;
    return app;
};

/**
 * Counts the components in an application's hierarchy, by type.
 *
 * @param app - The application.
 * @returns The counts, as `2 camera, 1 script`.
 */
const census = (app: AppBase) => {
    const counts = new Map<string, number>();
    const visit = (entity: Entity) => {
        for (const type of Object.keys(entity.c ?? {})) {
            counts.set(type, (counts.get(type) ?? 0) + 1);
        }
        entity.children.forEach((child) => visit(child as Entity));
    };
    visit(app.root);
    return (
        Array.from(counts.keys())
            .sort()
            .map((type) => `${counts.get(type)} ${type}`)
            .join(', ') || 'no components'
    );
};

/** The lifecycle state of a script on another entity, as a script sees it. */
const stateOf = (script: Script | null | undefined) => {
    if (!script) {
        return 'does not exist';
    }
    const { _initialized, _postInitialized } = script as unknown as {
        _initialized: boolean;
        _postInitialized: boolean;
    };
    return _postInitialized ? 'has post-initialized' : _initialized ? 'has initialized' : 'exists';
};

describe('<pc-app> boot order', () => {
    const { uncaught, warnings } = useGuard();

    /**
     * A script that records its own lifecycle under its entity's name, and what it can see of
     * the entity named by `other` when each method runs.
     *
     * @param log - Where to record.
     * @param scriptName - The name to register the class under.
     * @returns The class.
     */
    const probeClass = (log: string[], scriptName = 'probe') => {
        class Probe extends Script {
            static scriptName = scriptName;

            other = '';

            private see() {
                if (!this.other) {
                    return '';
                }
                const other = this.app.root.findByName(this.other) as Entity | null;
                if (!other) {
                    return ` - ${this.other} does not exist`;
                }
                const components = Object.keys(other.c).sort().join(', ') || 'no components';
                return ` - ${this.other} has ${components}, and its script ${stateOf(other.script?.scripts[0])}`;
            }

            initialize() {
                log.push(`${this.entity.name}.initialize${this.see()}`);
            }

            postInitialize() {
                log.push(`${this.entity.name}.postInitialize${this.see()}`);
            }
        }
        return Probe;
    };

    /** Two entities, each with a component and a script that looks at the other entity. */
    const TWO_ENTITIES = `
        <pc-entity name="a">
            <pc-camera></pc-camera>
            <pc-script><pc-script-instance name="probe" other="b"></pc-script-instance></pc-script>
        </pc-entity>
        <pc-entity name="b">
            <pc-render></pc-render>
            <pc-script><pc-script-instance name="probe" other="a"></pc-script-instance></pc-script>
        </pc-entity>
    `;

    /** What the two entities log when they boot in the engine's order. */
    const TWO_ENTITIES_LOG = [
        "app 'start' event - 1 camera, 1 render, 2 script",
        'a.initialize - b has render, script, and its script exists',
        'b.initialize - a has camera, script, and its script has initialized',
        'a.postInitialize - b has render, script, and its script has initialized',
        'b.postInitialize - a has camera, script, and its script has post-initialized',
        'pc-app ready'
    ];

    /**
     * Mounts markup with the probe script registered before preload, logging the application's
     * start event and the element's ready event around what the scripts log.
     *
     * @param html - The markup inside the `<pc-app>`.
     * @param log - Where to record.
     * @returns The mount handle and the application element.
     */
    const mountProbed = (html: string, log: string[]) => {
        const Probe = probeClass(log);
        const handle = mountApp(html, (app) => {
            app.scripts.add(Probe);
            app.once('start', () => log.push(`app 'start' event - ${census(app)}`));
        });
        handle.appElement.addEventListener('ready', (event) => {
            if (event.target === handle.appElement) {
                log.push('pc-app ready');
            }
        });
        return handle;
    };

    describe('scripts', () => {
        it('initialize together and then post-initialize together, with every component in place', async () => {
            const log: string[] = [];
            await started(mountProbed(TWO_ENTITIES, log));

            // The engine's log for the same scene built through its API before app.start(). Booted
            // from markup, the application used to start with no components at all, and each
            // script then ran initialize() and postInitialize() back to back on its own, before
            // the entity after it had its script.
            expect(log).toEqual(TWO_ENTITIES_LOG);
            expect(uncaught.seen).toEqual([]);
        });

        it('have their attributes in place when they initialize, parsed against their defaults', async () => {
            const seen: Record<string, unknown> = {};

            class Typed extends Script {
                static scriptName = 'typed';

                speed = 1;

                offset = new Vec3();

                label = '';

                initialize() {
                    seen.typed = { speed: this.speed, offset: this.offset.clone(), label: this.label };
                }
            }

            const handle = mountApp(
                `
                <pc-entity name="modern">
                    <pc-script>
                        <pc-script-instance name="typed" speed="5" offset="1 2 3" attributes='{"label": "hi"}'></pc-script-instance>
                    </pc-script>
                </pc-entity>
                <pc-entity name="classic">
                    <pc-script>
                        <pc-script-instance name="legacy" speed="7" offset="4 5 6"></pc-script-instance>
                    </pc-script>
                </pc-entity>
                `,
                (app) => {
                    app.scripts.add(Typed);

                    // The engine's older script form declares its attributes in a schema, and gives
                    // an instance its defaults in a pass of its own. An instance created before the
                    // application starts is left to app.start() for that pass, so the element has
                    // to run it before it can parse '7' as the number the default says it is.
                    const Legacy = createScript('legacy', app)!;
                    Legacy.attributes.add('speed', { type: 'number', default: 1 });
                    Legacy.attributes.add('offset', { type: 'vec3', default: [0, 0, 0] });
                    Legacy.attributes.add('untouched', { type: 'number', default: 9 });
                    Legacy.prototype.initialize = function (this: Record<string, unknown>) {
                        seen.legacy = {
                            speed: this.speed,
                            offset: (this.offset as Vec3).clone(),
                            untouched: this.untouched
                        };
                    };
                }
            );
            await started(handle);

            expect(seen.typed).toEqual({ speed: 5, offset: new Vec3(1, 2, 3), label: 'hi' });
            expect(seen.legacy).toEqual({ speed: 7, offset: new Vec3(4, 5, 6), untouched: 9 });
            expect(warnings.seen, 'no attribute fell back to a raw string').toEqual([]);
        });

        it('stay uninitialized while their entity, their component or they themselves are disabled', async () => {
            const log: string[] = [];
            const instance = '<pc-script-instance name="probe"></pc-script-instance>';
            const handle = mountProbed(
                `
                <pc-entity name="entity-off" enabled="false">
                    <pc-script>${instance}</pc-script>
                </pc-entity>
                <pc-entity name="component-off">
                    <pc-script enabled="false">${instance}</pc-script>
                </pc-entity>
                <pc-entity name="instance-off">
                    <pc-script><pc-script-instance name="probe" enabled="false"></pc-script-instance></pc-script>
                </pc-entity>
                <pc-entity name="on">
                    <pc-script>${instance}</pc-script>
                </pc-entity>
                `,
                log
            );
            await started(handle);

            // All four instances exist, as they would in an engine scene: only the enabled one ran
            const instances = handle.all<ScriptInstanceElement>('pc-script-instance');
            expect(instances.map((element) => stateOf(element.script))).toEqual([
                'exists',
                'exists',
                'exists',
                'has post-initialized'
            ]);
            expect(log).toEqual(["app 'start' event - 4 script", 'on.initialize', 'on.postInitialize', 'pc-app ready']);

            // Each initializes when what held it back is enabled, as the engine has it
            log.length = 0;
            handle.get<EntityElement>('pc-entity[name="entity-off"]').enabled = true;
            expect(log).toEqual(['entity-off.initialize', 'entity-off.postInitialize']);

            log.length = 0;
            handle.get<ScriptComponentElement>('pc-entity[name="component-off"] > pc-script').enabled = true;
            expect(log).toEqual(['component-off.initialize', 'component-off.postInitialize']);

            log.length = 0;
            instances[2].enabled = true;
            expect(log).toEqual(['instance-off.initialize', 'instance-off.postInitialize']);
        });
    });

    describe('a script class', () => {
        /** A preloaded asset, whose load event stands in for a script file arriving. */
        const DATA_ASSET = '<pc-asset id="data" type="json" src="data:application/json,{}"></pc-asset>';

        it('that registers while assets preload initializes with the scripts registered before', async () => {
            const log: string[] = [];
            const During = probeClass(log, 'during');
            const handle = mountProbed(
                `
                ${DATA_ASSET}
                <pc-entity name="a">
                    <pc-script><pc-script-instance name="during" other="b"></pc-script-instance></pc-script>
                </pc-entity>
                <pc-entity name="b">
                    <pc-script><pc-script-instance name="probe" other="a"></pc-script-instance></pc-script>
                </pc-entity>
                `,
                log
            );

            // A script asset registers its classes as it loads, which is during preload. The
            // event does not bubble, so the listener is on the asset element itself.
            const assetElement = handle.get<AssetElement>('pc-asset');
            assetElement.addEventListener('load', () => handle.appElement.app!.scripts.add(During));

            await started(handle);

            expect(assetElement.asset!.loaded).toBe(true);
            expect(log).toEqual([
                "app 'start' event - 2 script",
                'a.initialize - b has script, and its script exists',
                'b.initialize - a has script, and its script has initialized',
                'a.postInitialize - b has script, and its script has initialized',
                'b.postInitialize - a has script, and its script has post-initialized',
                'pc-app ready'
            ]);
        });

        it('that registers after the application has started is created when it arrives', async () => {
            const log: string[] = [];
            const Late = probeClass(log, 'late');
            const handle = mountProbed(
                `
                <pc-entity name="a">
                    <pc-script><pc-script-instance name="late" other="b"></pc-script-instance></pc-script>
                </pc-entity>
                <pc-entity name="b">
                    <pc-script><pc-script-instance name="probe" other="a"></pc-script-instance></pc-script>
                </pc-entity>
                `,
                log
            );
            const { appElement } = handle;
            const lateElement = handle.get<ScriptInstanceElement>('pc-script-instance[name="late"]');

            // The application does not wait for a class that may never come
            await readyWithin(appElement);
            appElement.app!.autoRender = false;
            expect(lateElement.script, 'no instance without a class').toBeNull();
            expect(log).toEqual([
                "app 'start' event - 2 script",
                'b.initialize - a has script, and its script does not exist',
                'b.postInitialize - a has script, and its script does not exist',
                'pc-app ready'
            ]);

            // It initializes on its own when it arrives, into a scene that is already running
            log.length = 0;
            appElement.app!.scripts.add(Late);
            await readyWithin(lateElement);
            await settle(handle.container);

            expect(log).toEqual([
                'a.initialize - b has script, and its script has post-initialized',
                'a.postInitialize - b has script, and its script has post-initialized'
            ]);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('readiness', () => {
        it('is reported by a component when it is built, and by pc-app when the application has started', async () => {
            const log: string[] = [];
            const handle = mountProbed(
                `
                <pc-entity name="a">
                    <pc-camera></pc-camera>
                    <pc-script><pc-script-instance name="probe"></pc-script-instance></pc-script>
                </pc-entity>
                `,
                log
            );
            const { appElement } = handle;

            // Every element's ready event bubbles to the application element. What the engine
            // object behind each one is at that moment is recorded with it.
            appElement.addEventListener('ready', (event) => {
                const target = event.target as Element;
                if (target === appElement) {
                    return;
                }
                const { component, entity, script } = target as unknown as {
                    component?: unknown;
                    entity?: unknown;
                    script?: Script | null;
                };
                const object =
                    script !== undefined
                        ? `script ${stateOf(script)}`
                        : component
                          ? 'component'
                          : entity
                            ? 'entity'
                            : 'nothing';
                log.push(`${target.localName} ready - ${object}`);
            });

            await started(handle);

            expect(log).toEqual([
                'pc-entity ready - entity',
                'pc-camera ready - component',
                'pc-script-instance ready - script exists',
                'pc-script ready - component',
                "app 'start' event - 1 camera, 1 script",
                'a.initialize',
                'a.postInitialize',
                'pc-app ready'
            ]);
        });
    });

    describe('physics', () => {
        it('has the physics system create its world before the first component is added', async () => {
            // app.start() is what creates the physics world, and a collision or rigid body
            // component added before the world exists gets no shape and no body. There is no Ammo
            // in this tier to make a world from, so what is pinned is the order: the system is
            // asked for its world before the first component is built.
            const log: string[] = [];
            const handle = mountApp('<pc-entity name="body"><pc-collision></pc-collision></pc-entity>', (app) => {
                const { rigidbody } = app.systems;
                const onLibraryLoaded = rigidbody!.onLibraryLoaded.bind(rigidbody);
                vi.spyOn(rigidbody!, 'onLibraryLoaded').mockImplementation(() => {
                    log.push('physics world requested');
                    onLibraryLoaded();
                });
                app.once('start', () => log.push('start'));
            });
            handle.appElement.addEventListener('ready', (event) => {
                if ((event.target as Element).localName === 'pc-collision') {
                    log.push('collision component added');
                }
            });

            await started(handle);

            // The second request is the one app.start() makes itself, which finds the world made
            expect(log).toEqual([
                'physics world requested',
                'collision component added',
                'start',
                'physics world requested'
            ]);
        });
    });

    describe('what arrives late', () => {
        it('is built before the application starts when it arrives while assets preload', async () => {
            const log: string[] = [];
            const handle = mountProbed(
                `
                <pc-asset id="data" type="json" src="data:application/json,{}"></pc-asset>
                <pc-entity name="a">
                    <pc-script><pc-script-instance name="probe" other="b"></pc-script-instance></pc-script>
                </pc-entity>
                `,
                log
            );
            const { appElement } = handle;

            // The parser can deliver the rest of a document after the application has begun to
            // boot. The first progress event is dispatched once the entities present have been
            // built, with the assets still to load.
            appElement.addEventListener(
                'progress',
                () => {
                    const late = document.createElement('pc-entity');
                    late.setAttribute('name', 'b');
                    late.innerHTML = `
                        <pc-render></pc-render>
                        <pc-script><pc-script-instance name="probe" other="a"></pc-script-instance></pc-script>
                    `;
                    appElement.appendChild(late);
                },
                { once: true }
            );

            await started(handle);

            expect(log).toEqual([
                "app 'start' event - 1 render, 2 script",
                'a.initialize - b has render, script, and its script exists',
                'b.initialize - a has script, and its script has initialized',
                'a.postInitialize - b has render, script, and its script has initialized',
                'b.postInitialize - a has script, and its script has post-initialized',
                'pc-app ready'
            ]);
        });

        it('builds itself when it arrives after the application has started', async () => {
            const log: string[] = [];
            const handle = mountProbed(
                `
                <pc-entity name="a">
                    <pc-script><pc-script-instance name="probe"></pc-script-instance></pc-script>
                </pc-entity>
                `,
                log
            );
            const app = await started(handle);
            log.length = 0;

            const late = document.createElement('pc-entity') as EntityElement;
            late.setAttribute('name', 'b');
            late.innerHTML = `
                <pc-render></pc-render>
                <pc-script><pc-script-instance name="probe" other="a"></pc-script-instance></pc-script>
            `;
            handle.appElement.appendChild(late);
            await settle(handle.container);

            expect(late.entity!.parent, 'the entity joined the scene').toBe(app.root);
            expect(late.querySelector<ComponentElement>('pc-render')!.component, 'with its component').toBe(
                late.entity!.render
            );
            expect(log).toEqual([
                'b.initialize - a has script, and its script has post-initialized',
                'b.postInitialize - a has script, and its script has post-initialized'
            ]);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('<pc-model>', () => {
        /**
         * A script that records, when it initializes, what the model named `host` holds: its
         * content, the components on the node `content` names and on the entity attached to it,
         * and the scripts on all three.
         *
         * @param log - Where to record.
         * @returns The class.
         */
        const modelProbeClass = (log: string[]) => {
            class ModelProbe extends Script {
                static scriptName = 'modelProbe';

                content = '';

                initialize() {
                    const host = this.app.root.findByName('host') as Entity;
                    const node = host.findByName(this.content) as Entity | null;
                    const attached = host.findByName('attached') as Entity | null;
                    const describe = (entity: Entity | null) =>
                        entity
                            ? `${Object.keys(entity.c).sort().join(', ') || 'no components'} (script ${stateOf(entity.script?.scripts[0])})`
                            : 'missing';
                    log.push(
                        `${this.entity.name}.initialize - host: ${describe(host)}; node: ${describe(node)}; attached: ${describe(attached)}`
                    );
                }
            }
            return ModelProbe;
        };

        /**
         * A model with a script on its host, on a node of its content and on an entity attached
         * to that node, which also has a light.
         *
         * @param nodeName - The name of the node in the container.
         * @param assetAttributes - Extra attributes for the container's `<pc-asset>`.
         * @returns The markup.
         */
        const modelScene = (nodeName: string, assetAttributes = '') => {
            const instance = `<pc-script><pc-script-instance name="modelProbe" content="${nodeName}"></pc-script-instance></pc-script>`;
            return `
                <pc-asset id="m" type="container" src="${containerSrc(nodeName)}" ${assetAttributes}></pc-asset>
                <pc-model name="host" asset="m">
                    ${instance}
                    <pc-node name="${nodeName}">
                        <pc-render></pc-render>
                        ${instance}
                        <pc-entity name="attached">
                            <pc-light></pc-light>
                            ${instance}
                        </pc-entity>
                    </pc-node>
                </pc-model>
            `;
        };

        /** What each of the three scripts sees once all of the model has been built. */
        const built = (nodeName: string, states: [string, string, string][]) =>
            ['host', nodeName, 'attached'].map(
                (name, index) =>
                    `${name}.initialize - host: script (script ${states[index][0]}); ` +
                    `node: render, script (script ${states[index][1]}); ` +
                    `attached: light, script (script ${states[index][2]})`
            );

        it('has its content, and what is declared inside it, when scripts initialize - if its container preloaded', async () => {
            const log: string[] = [];
            const ModelProbe = modelProbeClass(log);
            const handle = mountApp(modelScene('preloaded-root'), (app) => {
                app.scripts.add(ModelProbe);
                app.once('start', () => log.push(`app 'start' event - ${census(app)}`));
            });
            const model = handle.get<ModelElement>('pc-model');
            model.addEventListener('load', () => log.push('pc-model load'));

            await started(handle);

            // The content is instantiated on the way to starting, and the scripts inside the
            // model initialize in the engine's pass with every other script
            expect(model.contentEntity!.name).toBe('preloaded-root');
            expect(log).toEqual([
                'pc-model load',
                "app 'start' event - 1 light, 1 render, 3 script",
                // A script counts as initialized from the moment its own initialize() is called
                ...built('preloaded-root', [
                    ['has initialized', 'exists', 'exists'],
                    ['has initialized', 'has initialized', 'exists'],
                    ['has initialized', 'has initialized', 'has initialized']
                ])
            ]);
            expect(uncaught.seen).toEqual([]);
        });

        it('builds what is declared inside it when its content arrives - if its container is lazy', async () => {
            const log: string[] = [];
            const ModelProbe = modelProbeClass(log);
            const handle = mountApp(modelScene('lazy-root', 'lazy'), (app) => {
                app.scripts.add(ModelProbe);
                app.once('start', () => log.push(`app 'start' event - ${census(app)}`));
            });
            const { appElement } = handle;
            const model = handle.get<ModelElement>('pc-model');
            model.addEventListener('load', () => log.push('pc-model load'));

            // The application starts without the model's content: nothing declared inside the
            // model can be built on it yet, and nothing waits for it
            await readyWithin(appElement);
            appElement.app!.autoRender = false;
            expect(handle.get<AssetElement>('pc-asset').asset!.loaded, 'the container really is lazy').toBe(false);
            expect(model.contentEntity).toBeNull();
            expect(log).toEqual(["app 'start' event - no components"]);

            // The model asks for its container once the application has started. What is inside
            // the model is built when the content arrives, and its scripts initialize then.
            log.length = 0;
            await readyWithin(model);
            await settle(handle.container);

            expect(model.contentEntity!.name).toBe('lazy-root');
            expect(log[0]).toBe('pc-model load');

            // Every component is in place for every script. The scripts themselves still run one
            // at a time here, each initializing as it is created: giving a subtree that arrives
            // late the engine's order is a separate change, so their states are left out.
            const components = 'host: script; node: render, script; attached: light, script';
            expect(log.slice(1).map((line) => line.replace(/ \(script [^)]*\)/g, ''))).toEqual([
                `host.initialize - ${components}`,
                `lazy-root.initialize - ${components}`,
                `attached.initialize - ${components}`
            ]);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('when pc-app is removed and re-inserted', () => {
        it('while it boots, builds the scene once and runs its scripts once', async () => {
            const log: string[] = [];
            const handle = mountProbed(TWO_ENTITIES, log);
            const { appElement } = handle;

            // The first boot is parked at its first await, with no application yet
            appElement.remove();
            handle.container.appendChild(appElement);

            const app = await started(handle);

            expect(log).toEqual(TWO_ENTITIES_LOG);
            expect(census(app)).toBe('1 camera, 1 render, 2 script');
            expect(uncaught.seen).toEqual([]);
        });

        it('while its assets preload, abandons that boot and runs its scripts once in the next', async () => {
            const log: string[] = [];
            const handle = mountProbed(
                `<pc-asset id="data" type="json" src="data:application/json,{}"></pc-asset>${TWO_ENTITIES}`,
                log
            );
            const { appElement } = handle;

            // The first progress event announces the preload, with the entities built. The
            // listener is added after mountProbed's own, so the first application was prepared.
            const first = new Promise<AppBase>((resolve) => {
                appElement.addEventListener(
                    'progress',
                    () => {
                        resolve(appElement.app!);
                        appElement.remove();
                        handle.container.appendChild(appElement);
                    },
                    { once: true }
                );
            });

            const app = await started(handle);

            expect(app, 'a second application booted').not.toBe(await first);
            expect(log).toEqual(TWO_ENTITIES_LOG);
            expect(census(app)).toBe('1 camera, 1 render, 2 script');
            expect(uncaught.seen).toEqual([]);
        });

        it('by a listener as the components are built, does not start the application', async () => {
            const log: string[] = [];
            const handle = mountProbed(TWO_ENTITIES, log);
            const { appElement } = handle;
            // Grabbed before the listener fires - the removal takes the subtree out of the container
            const components = handle.all<ComponentElement>('pc-camera, pc-render, pc-script');

            // A component's ready event is dispatched as it is built, between preload and start.
            // The camera is the first of the four, so the other three are still to be built.
            let removed = false;
            appElement.addEventListener('ready', (event) => {
                if (!removed && (event.target as Element).localName === 'pc-camera') {
                    removed = true;
                    appElement.remove();
                }
            });

            await expectNeverReady(appElement);

            expect(appElement.app, 'the application is destroyed').toBeNull();
            expect(log, 'and never started').toEqual([]);
            expect(components.map((element) => element.component)).toEqual([null, null, null, null]);
            expect(uncaught.seen).toEqual([]);

            // And the element recovers: re-inserting it boots afresh, in order
            handle.container.appendChild(appElement);
            const app = await started(handle);

            expect(log).toEqual(TWO_ENTITIES_LOG);
            expect(census(app)).toBe('1 camera, 1 render, 2 script');
            expect(uncaught.seen).toEqual([]);
        });

        it('by a script as it initializes, destroys the application once it has finished starting', async () => {
            const log: string[] = [];
            let remove = true;

            class Remover extends Script {
                static scriptName = 'remover';

                initialize() {
                    log.push(`${this.entity.name}.initialize`);
                    if (remove && this.entity.name === 'a') {
                        remove = false;
                        (document.querySelector('pc-app') as AppElement).remove();
                    }
                }

                postInitialize() {
                    log.push(`${this.entity.name}.postInitialize`);
                }
            }

            const instance = '<pc-script><pc-script-instance name="remover"></pc-script-instance></pc-script>';
            const handle = mountApp(
                `<pc-entity name="a">${instance}</pc-entity><pc-entity name="b">${instance}</pc-entity>`,
                (app) => app.scripts.add(Remover)
            );
            const { appElement } = handle;
            const first = new Promise<AppBase>((resolve) => {
                appElement.addEventListener('progress', () => resolve(appElement.app!), { once: true });
            });

            // initialize() runs inside app.start(), and the engine cannot be destroyed under its
            // own start: it would go on to post-initialize through systems that are gone, and
            // throw. The entities go at once, with the elements that own them, so the second
            // script never runs; the application goes when start returns.
            await expectNeverReady(appElement);

            expect(log).toEqual(['a.initialize']);
            expect(appElement.app).toBeNull();
            expect((await first).root, 'the application was destroyed').toBeNull();
            expect(uncaught.seen).toEqual([]);

            // And the element recovers: re-inserting it boots afresh
            log.length = 0;
            handle.container.appendChild(appElement);
            await started(handle);

            expect(log).toEqual(['a.initialize', 'b.initialize', 'a.postInitialize', 'b.postInitialize']);
            expect(uncaught.seen).toEqual([]);
        });

        it('after it has started, builds the scene again and runs its scripts again', async () => {
            const log: string[] = [];
            const handle = mountProbed(TWO_ENTITIES, log);
            const { appElement } = handle;

            const first = await started(handle);
            const camera = handle.get<ComponentElement>('pc-camera');
            const firstCamera = camera.component;
            expect(log).toEqual(TWO_ENTITIES_LOG);

            log.length = 0;
            appElement.remove();
            expect(camera.component, 'the component went with the application').toBeNull();
            handle.container.appendChild(appElement);

            const second = await started(handle);

            expect(second).not.toBe(first);
            expect(camera.component, 'a new component, in the new application').not.toBe(firstCamera);
            expect(camera.component!.system.app).toBe(second);
            expect(log).toEqual(TWO_ENTITIES_LOG);
            expect(uncaught.seen).toEqual([]);
        });
    });
});
