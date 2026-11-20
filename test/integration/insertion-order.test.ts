import type { AppBase } from 'playcanvas';
import { Entity, Script } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { AssetElement } from '../../src/asset';
import type { ComponentElement } from '../../src/components/component';
import type { ScriptComponentElement } from '../../src/components/script-component';
import type { ScriptInstanceElement } from '../../src/components/script-instance';
import { EntityElement } from '../../src/entity';
import type { ModelElement } from '../../src/model';
import type { NodeElement } from '../../src/node';
import { bootApp, settle } from '../helpers/app';
import { census, containerSrc, mountApp, probeClass, started, stateOf } from '../helpers/build-order';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * The order a subtree is built in when it is added to an application that is already running.
 * The root of the subtree builds all of it before its entity joins the scene - the entities, the
 * content of the models whose container has loaded, and every component with its scripts - and
 * the engine then enables the whole hierarchy at once, as it does for one handed to addChild():
 * every script runs initialize(), and then every script runs postInitialize(), all before the
 * insertion returns.
 *
 * One operation can insert several roots side by side. The first to connect builds them all
 * before any of them joins the scene, so that one can refer to another, and then adds each in
 * turn - which to the engine is as many hierarchies, each handed to addChild() on its own.
 *
 * Each way of inserting is covered, because they differ in what the root finds below and beside
 * it when it connects. A subtree built with createElement, or imported from a template, is
 * already made of custom elements, none of which has connected yet. One parsed from a string, or
 * cloned from a template's content, is made of plain elements that upgrade in tree order, the
 * root first.
 */

/**
 * Parses markup into a template, whose content lives in a document of its own where no custom
 * element is ever defined.
 *
 * @param html - The markup.
 * @returns The template.
 */
const parse = (html: string) => {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template;
};

/**
 * Builds markup the way a page's own code does, an element at a time with createElement, so
 * that every element is a custom element before any of them connects.
 *
 * @param html - The markup to build.
 * @returns The detached root elements.
 */
const create = (html: string): Element[] => {
    const copy = (source: Element): Element => {
        const element = document.createElement(source.localName);
        for (const { name, value } of Array.from(source.attributes)) {
            element.setAttribute(name, value);
        }
        for (const child of Array.from(source.children)) {
            element.appendChild(copy(child));
        }
        return element;
    };
    return Array.from(parse(html).content.children).map(copy);
};

/** Inserts markup under a connected element, in one operation. */
type Way = (parent: Element, html: string) => void;

const created: Way = (parent, html) => parent.append(...create(html));

const cloned: Way = (parent, html) => parent.appendChild(parse(html).content.cloneNode(true));

/** Every way of inserting a subtree, by what the operation is. */
const WAYS: [string, Way][] = [
    ['a subtree built with createElement', created],
    ['insertAdjacentHTML', (parent, html) => parent.insertAdjacentHTML('beforeend', html)],
    ['innerHTML', (parent, html) => (parent.innerHTML = html)],
    ["a clone of a template's content", cloned],
    [
        "importNode of a template's content",
        (parent, html) => parent.appendChild(document.importNode(parse(html).content, true))
    ]
];

/** One way that delivers custom elements, and one that delivers plain elements to upgrade. */
const TWO_WAYS: [string, Way][] = [WAYS[0], WAYS[3]];

/** A script on an entity, looking at another entity. */
const probe = (other = '') =>
    `<pc-script><pc-script-instance name="probe"${other ? ` other="${other}"` : ''}></pc-script-instance></pc-script>`;

/** Two entities, each with a component and a script that looks at the other entity. */
const TWO_ENTITIES = `
    <pc-entity name="a"><pc-camera></pc-camera>${probe('b')}</pc-entity>
    <pc-entity name="b"><pc-render></pc-render>${probe('a')}</pc-entity>
`;

/** The two entities under one root: a hierarchy. */
const GROUP = `<pc-entity name="group">${TWO_ENTITIES}</pc-entity>`;

/** What the hierarchy's scripts log in the engine's order. */
const GROUP_SCRIPTS_LOG = [
    'a.initialize - b has render, script, and its script exists',
    'b.initialize - a has camera, script, and its script has initialized',
    'a.postInitialize - b has render, script, and its script has initialized',
    'b.postInitialize - a has camera, script, and its script has post-initialized'
];

/** The whole log of inserting the hierarchy: its scripts have run when the insertion returns. */
const GROUP_LOG = [...GROUP_SCRIPTS_LOG, 'inserted - 1 camera, 1 render, 2 script'];

/** An entity with a probe script, built through the engine's own API. */
const probedEntity = (app: AppBase, name: string, component: string, other: string) => {
    const entity = new Entity(name, app);
    entity.addComponent(component);
    entity.addComponent('script');
    entity.script!.create('probe', { properties: { other } });
    return entity;
};

/** A script whose `target` attribute names another entity. */
const follower = (target = 'b') =>
    `<pc-script><pc-script-instance name="follower" target="entity:${target}"></pc-script-instance></pc-script>`;

/**
 * Registers the script {@link follower} names, which records what its `target` attribute holds
 * when it initializes.
 *
 * @param app - The application to register the script with.
 * @returns What each instance saw, in order.
 */
const follow = (app: AppBase) => {
    const seen: unknown[] = [];

    class Follower extends Script {
        static scriptName = 'follower';

        target: Entity | string | null = null;

        initialize() {
            seen.push(this.target);
        }
    }

    app.scripts.add(Follower);
    return seen;
};

/** A script that is handed another entity by reference. */
const peer = (name: string) =>
    `<pc-script><pc-script-instance name="peer" peer="entity:${name}"></pc-script-instance></pc-script>`;

/**
 * Registers the script {@link peer} names. It records its own lifecycle under its entity's name,
 * and what it sees of the entity it was handed each time: its components, its script, and
 * whether the scene graph holds it, which is where `findByName()` looks.
 *
 * @param app - The application to register the script with.
 * @param log - Where to record.
 */
const peers = (app: AppBase, log: string[]) => {
    class Peer extends Script {
        static scriptName = 'peer';

        peer: Entity | string | null = null;

        private see() {
            const { peer } = this;
            if (!(peer instanceof Entity)) {
                return `${peer} did not resolve`;
            }
            const components = Object.keys(peer.c).sort().join(', ') || 'no components';
            const found = this.app.root.findByName(peer.name) === peer;
            return (
                `${peer.name} has ${components}, its script ${stateOf(peer.script?.scripts[0])}, ` +
                `and it is ${found ? 'in' : 'not in'} the scene`
            );
        }

        initialize() {
            log.push(`${this.entity.name}.initialize - ${this.see()}`);
        }

        postInitialize() {
            log.push(`${this.entity.name}.postInitialize - ${this.see()}`);
        }
    }

    app.scripts.add(Peer);
};

/** Two entities side by side, each with a component and a script that is handed the other. */
const TWO_ROOTS = `
    <pc-entity name="a"><pc-camera></pc-camera>${peer('b')}</pc-entity>
    <pc-entity name="b"><pc-render></pc-render>${peer('a')}</pc-entity>
`;

/**
 * What the two log. Both are built before either joins the scene, so the first is handed the
 * second complete - but it joins the scene first, on its own, and its scripts have run before
 * the second joins.
 */
const TWO_ROOTS_SCRIPTS_LOG = [
    'a.initialize - b has render, script, its script exists, and it is not in the scene',
    'a.postInitialize - b has render, script, its script exists, and it is not in the scene',
    'b.initialize - a has camera, script, its script has post-initialized, and it is in the scene',
    'b.postInitialize - a has camera, script, its script has post-initialized, and it is in the scene'
];

const TWO_ROOTS_LOG = [...TWO_ROOTS_SCRIPTS_LOG, 'inserted - 1 camera, 1 render, 2 script'];

describe('a subtree inserted into a running application', () => {
    const { uncaught, warnings } = useGuard();

    /**
     * Boots an application holding one entity to insert under, with the probe script registered.
     *
     * @param html - Further markup for the `<pc-app>`.
     * @returns The booted application, the log the probes write to, and the entity element.
     */
    const boot = async (html = '') => {
        const log: string[] = [];
        const booted = await bootApp(`${html}<pc-entity name="stage"></pc-entity>`);
        booted.app.scripts.add(probeClass(log));
        const stage = booted.get<EntityElement>('pc-entity[name="stage"]');
        return { ...booted, log, stage };
    };

    it('arrives as custom elements when built or imported, and as plain elements when cloned', () => {
        // What makes the ways differ. The template's own content is never upgraded, and a clone
        // of it is upgraded only once it is in the document.
        expect(create(GROUP)[0]).toBeInstanceOf(EntityElement);
        expect(document.importNode(parse(GROUP).content, true).firstElementChild).toBeInstanceOf(EntityElement);
        expect(parse(GROUP).content.cloneNode(true).firstChild).not.toBeInstanceOf(EntityElement);
    });

    describe('is built completely, and then its scripts initialize together', () => {
        it.each(WAYS)('%s', async (_name, insert) => {
            const { app, container, log, stage } = await boot();

            insert(stage, GROUP);
            log.push(`inserted - ${census(app)}`);

            // The insertion used to return with no components at all. Each component then added
            // itself from its own promise chain, so each script ran initialize() and
            // postInitialize() back to back, before the entity after it had its script.
            expect(log).toEqual(GROUP_LOG);

            // Every element is ready, and none of them has anything left to do
            const elements = Array.from(stage.querySelectorAll('*')) as EntityElement[];
            expect(elements.map((element) => element._isReady)).toEqual(elements.map(() => true));
            await settle(container);
            expect(log).toEqual(GROUP_LOG);
            expect(census(app)).toBe('1 camera, 1 render, 2 script');
            expect(uncaught.seen).toEqual([]);
        });

        it('as the engine does for the same hierarchy handed to addChild', async () => {
            const { app, log, stage } = await boot();

            const group = new Entity('group', app);
            group.addChild(probedEntity(app, 'a', 'camera', 'b'));
            group.addChild(probedEntity(app, 'b', 'render', 'a'));
            stage.entity!.addChild(group);
            log.push(`inserted - ${census(app)}`);

            expect(log).toEqual(GROUP_LOG);
        });

        it.each(TWO_WAYS)(
            'with an entity reference to an entity declared later in the subtree resolved - %s',
            async (_name, insert) => {
                const { app, stage } = await boot();
                const seen = follow(app);

                insert(
                    stage,
                    `<pc-entity name="group">
                        <pc-entity name="a">${follower()}</pc-entity>
                        <pc-entity name="b"></pc-entity>
                    </pc-entity>`
                );

                expect(seen).toEqual([stage.querySelector<EntityElement>('pc-entity[name="b"]')!.entity]);
                expect(warnings.seen, 'the reference resolved').toEqual([]);
            }
        );
    });

    describe('with several roots, inserted in one operation', () => {
        it.each(WAYS)(
            'has them all built before any joins the scene, and adds each in turn - %s',
            async (_name, insert) => {
                const { app, container, log, stage } = await boot();
                peers(app, log);

                insert(stage, TWO_ROOTS);
                log.push(`inserted - ${census(app)}`);

                // The roots used to be built one after the other, so the first could not be handed
                // the second: its entity did not exist yet
                expect(log).toEqual(TWO_ROOTS_LOG);
                expect(warnings.seen, 'both references resolved').toEqual([]);

                // In document order under their parent, and nothing left to do
                expect(stage.entity!.children.map((child) => child.name)).toEqual(['a', 'b']);
                const elements = Array.from(stage.querySelectorAll('*')) as EntityElement[];
                expect(elements.map((element) => element._isReady)).toEqual(elements.map(() => true));
                await settle(container);
                expect(log).toEqual(TWO_ROOTS_LOG);
                expect(uncaught.seen).toEqual([]);
            }
        );

        it('as the engine does for two hierarchies built before either is handed to addChild', async () => {
            const { app, log, stage } = await boot();
            peers(app, log);

            const a = new Entity('a', app);
            a.addComponent('camera');
            a.addComponent('script');
            const b = new Entity('b', app);
            b.addComponent('render');
            b.addComponent('script');
            a.script!.create('peer', { properties: { peer: b } });
            b.script!.create('peer', { properties: { peer: a } });

            stage.entity!.addChild(a);
            stage.entity!.addChild(b);
            log.push(`inserted - ${census(app)}`);

            expect(log).toEqual(TWO_ROOTS_LOG);
        });

        it.each(TWO_WAYS.map(([name, insert], index) => [name, insert, `shared-${index}`] as const))(
            'has the content of a loaded model in one root in place for a component of another - %s',
            async (_name, insert, id) => {
                const { app, get, stage } = await boot(
                    `<pc-asset id="${id}" type="container" src="${containerSrc(`${id}-root`)}"></pc-asset>`
                );
                const seen = follow(app);

                // The first root names a node of the model in the second, which is an entity
                // only once the model's content exists: models come before components across
                // the roots, as they do across the document at boot
                insert(
                    stage,
                    `<pc-entity name="a">${follower(`${id}-root`)}</pc-entity>
                    <pc-model name="b" asset="${id}"><pc-node name="${id}-root"></pc-node></pc-model>`
                );

                const content = get<ModelElement>('pc-model[name="b"]').contentEntity;
                expect(content!.name).toBe(`${id}-root`);
                expect(seen).toEqual([content]);
                expect(warnings.seen, 'the reference resolved').toEqual([]);
            }
        );

        it.each(TWO_WAYS)('are built together with other elements between them - %s', async (_name, insert) => {
            const { app, container, log, stage } = await boot();
            peers(app, log);

            // A component of the entity inserted under sits between the two. It is not theirs,
            // and adds itself to that entity as a component on its own always has.
            const [a, b] = TWO_ROOTS.trim().split('\n');
            insert(stage, `${a}<pc-light></pc-light>${b}`);
            log.push(`inserted - ${census(app)}`);

            expect(log).toEqual(TWO_ROOTS_LOG);

            await settle(container);
            expect(stage.entity!.light, 'the component between them').not.toBeUndefined();
            expect(warnings.seen).toEqual([]);
        });

        /** Ways of inserting before an element that is already in the document. */
        const BEFORE: [string, (reference: Element, html: string) => void][] = [
            ['a subtree built with createElement', (reference, html) => reference.before(...create(html))],
            ['insertAdjacentHTML', (reference, html) => reference.insertAdjacentHTML('beforebegin', html)],
            [
                "a clone of a template's content",
                (reference, html) => reference.before(parse(html).content.cloneNode(true))
            ]
        ];

        it.each(BEFORE)('leave alone the elements that were already there - %s', async (_name, insertBefore) => {
            const { app, get, log, stage } = await boot();
            peers(app, log);

            // Two entities follow the place the roots are inserted at. A script has destroyed
            // the entity of the first, which leaves its element in the document with nothing
            // behind it - as an element that has just arrived has nothing behind it yet.
            created(stage, '<pc-entity name="gone"></pc-entity><pc-entity name="kept"></pc-entity>');
            const gone = get<EntityElement>('pc-entity[name="gone"]');
            const kept = get<EntityElement>('pc-entity[name="kept"]');
            const keptEntity = kept.entity;
            gone.entity!.destroy();
            expect(gone.entity).toBeNull();

            insertBefore(gone, TWO_ROOTS);
            log.push(`inserted - ${census(app)}`);

            expect(log).toEqual(TWO_ROOTS_LOG);
            expect(gone.entity, 'not built again').toBeNull();
            expect(kept.entity, 'not built again').toBe(keptEntity);
            expect(stage.entity!.children.map((child) => child.name)).toEqual(['kept', 'a', 'b']);
            expect(uncaught.seen).toEqual([]);
        });

        it.each(TWO_WAYS)('do not include an element that arrives in a later operation - %s', async (_name, insert) => {
            const { app, stage } = await boot();
            const seen = follow(app);

            // The first is built, scripts and all, when it is inserted - before the second is
            // in the document. A subtree can refer to what arrives with it or was there before.
            insert(stage, `<pc-entity name="a">${follower()}</pc-entity>`);
            insert(stage, '<pc-entity name="b"></pc-entity>');

            expect(seen).toEqual(['entity:b']);
            warnings.expect("Unable to resolve 'entity:b' in script attributes");
        });

        it('all join the scene but one that a listener removes while they are built', async () => {
            const { app, container, log, stage } = await boot();

            // The first root's ready event is the first thing the build dispatches. A clone is
            // used because the elements of a built subtree have yet to connect at that point,
            // and the browser would go on to connect and disconnect each of them, removed.
            stage.addEventListener(
                'ready',
                (event) => {
                    (event.target as Element).remove();
                },
                { once: true }
            );
            const fragment = parse(
                `<pc-entity name="a">${probe()}</pc-entity><pc-entity name="b">${probe()}</pc-entity>`
            ).content.cloneNode(true) as DocumentFragment;
            const [a, b] = Array.from(fragment.children) as EntityElement[];
            stage.appendChild(fragment);
            log.push(`inserted - ${census(app)}`);
            await settle(container);

            expect(a.entity).toBeNull();
            expect(stage.entity!.children).toEqual([b.entity]);
            expect(log).toEqual(['b.initialize', 'b.postInitialize', 'inserted - 1 script']);
            expect(uncaught.seen).toEqual([]);
        });

        it('are not added to the scene once a script of an earlier one has removed them', async () => {
            const { app, container, log, stage } = await boot();

            class Remover extends Script {
                static scriptName = 'remover';

                initialize() {
                    log.push(`${this.entity.name}.initialize`);
                    document.querySelector('pc-entity[name="b"]')!.remove();
                }
            }
            app.scripts.add(Remover);

            // The second root is built by the time the first joins the scene and its script
            // runs. Removing it then destroys its entity, which never joins.
            const fragment = parse(
                `<pc-entity name="a"><pc-script><pc-script-instance name="remover"></pc-script-instance></pc-script></pc-entity>
                <pc-entity name="b">${probe()}</pc-entity>`
            ).content.cloneNode(true) as DocumentFragment;
            const [a, b] = Array.from(fragment.children) as EntityElement[];
            stage.appendChild(fragment);
            log.push(`inserted - ${census(app)}`);
            await settle(container);

            expect(b.entity).toBeNull();
            expect(stage.entity!.children).toEqual([a.entity]);
            expect(log).toEqual(['a.initialize', 'inserted - 1 script']);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('that is a component, added to an entity already in the scene', () => {
        // Not covered by the change: the unit is an entity. A component element on its own still
        // waits for its host from its own connectedCallback, and adds itself a moment after the
        // insertion has returned.
        it.each(WAYS)('is added once the insertion has returned, as before - %s', async (_name, insert) => {
            const { app, container, log, stage } = await boot();

            insert(stage, `<pc-render></pc-render>${probe()}`);
            log.push(`inserted - ${census(app)}`);
            await settle(container);
            log.push(`settled - ${census(app)}`);

            expect(log).toEqual([
                'inserted - no components',
                'stage.initialize',
                'stage.postInitialize',
                'settled - 1 render, 1 script'
            ]);
        });
    });

    describe('scripts', () => {
        it.each(TWO_WAYS)(
            'stay uninitialized while their entity, their component or they themselves are disabled - %s',
            async (_name, insert) => {
                const { log, stage } = await boot();

                insert(
                    stage,
                    `<pc-entity name="group">
                        <pc-entity name="entity-off" enabled="false">${probe()}</pc-entity>
                        <pc-entity name="component-off">
                            <pc-script enabled="false"><pc-script-instance name="probe"></pc-script-instance></pc-script>
                        </pc-entity>
                        <pc-entity name="instance-off">
                            <pc-script><pc-script-instance name="probe" enabled="false"></pc-script-instance></pc-script>
                        </pc-entity>
                        <pc-entity name="on">${probe()}</pc-entity>
                    </pc-entity>`
                );

                // All four instances exist, as they would in an engine hierarchy: only the enabled
                // one ran
                const instances = Array.from(stage.querySelectorAll<ScriptInstanceElement>('pc-script-instance'));
                expect(instances.map((element) => stateOf(element.script))).toEqual([
                    'exists',
                    'exists',
                    'exists',
                    'has post-initialized'
                ]);
                expect(log).toEqual(['on.initialize', 'on.postInitialize']);

                // Each initializes when what held it back is enabled, as the engine has it
                log.length = 0;
                stage.querySelector<EntityElement>('pc-entity[name="entity-off"]')!.enabled = true;
                expect(log).toEqual(['entity-off.initialize', 'entity-off.postInitialize']);

                log.length = 0;
                stage.querySelector<ScriptComponentElement>('pc-entity[name="component-off"] > pc-script')!.enabled =
                    true;
                expect(log).toEqual(['component-off.initialize', 'component-off.postInitialize']);

                log.length = 0;
                instances[2].enabled = true;
                expect(log).toEqual(['instance-off.initialize', 'instance-off.postInitialize']);
            }
        );

        it.each(TWO_WAYS)('initialize together when a disabled root is enabled - %s', async (_name, insert) => {
            const { app, log, stage } = await boot();

            insert(stage, GROUP.replace('name="group"', 'name="group" enabled="false"'));
            log.push(`inserted - ${census(app)}`);
            expect(log).toEqual(['inserted - 1 camera, 1 render, 2 script']);

            log.length = 0;
            stage.querySelector<EntityElement>('pc-entity[name="group"]')!.enabled = true;
            expect(log).toEqual(GROUP_SCRIPTS_LOG);
        });

        it('whose class registers later are created when it arrives, as before', async () => {
            const { app, container, log, stage } = await boot();
            const Late = probeClass(log, 'late');

            created(
                stage,
                `<pc-entity name="group">
                    <pc-entity name="a">
                        <pc-script><pc-script-instance name="late" other="b"></pc-script-instance></pc-script>
                    </pc-entity>
                    <pc-entity name="b">${probe('a')}</pc-entity>
                </pc-entity>`
            );
            const lateElement = stage.querySelector<ScriptInstanceElement>('pc-script-instance[name="late"]')!;

            // The subtree does not wait for a class that may never come
            expect(lateElement.script, 'no instance without a class').toBeNull();
            expect(log).toEqual([
                'b.initialize - a has script, and its script does not exist',
                'b.postInitialize - a has script, and its script does not exist'
            ]);

            // It initializes on its own when it arrives, into a scene that is already running
            log.length = 0;
            app.scripts.add(Late);
            await readyWithin(lateElement);
            await settle(container);

            expect(log).toEqual([
                'a.initialize - b has script, and its script has post-initialized',
                'a.postInitialize - b has script, and its script has post-initialized'
            ]);
            expect(uncaught.seen).toEqual([]);
        });

        it.each(TWO_WAYS)(
            'have an attribute they set on their own element as they initialize applied - %s',
            async (_name, insert) => {
                class Tuner extends Script {
                    static scriptName = 'tuner';

                    speed = 1;

                    initialize() {
                        document.querySelector('pc-script-instance[name="tuner"]')!.setAttribute('speed', '9');
                    }
                }

                const { app, stage } = await boot();
                app.scripts.add(Tuner);

                // The scripts of a subtree built with createElement initialize before any element
                // below the root has connected, so the script component has to be watching its
                // children by then
                insert(
                    stage,
                    '<pc-entity name="group"><pc-script><pc-script-instance name="tuner"></pc-script-instance></pc-script></pc-entity>'
                );
                await Promise.resolve();

                const { script } = stage.querySelector<ScriptInstanceElement>('pc-script-instance')!;
                expect((script as Tuner).speed).toBe(9);
            }
        );
    });

    describe('readiness', () => {
        it.each(TWO_WAYS)(
            'is reported by each element as it is built, before the subtree joins the scene - %s',
            async (_name, insert) => {
                const { app, log, stage } = await boot();

                // Every element's ready event bubbles to the entity inserted under. What the
                // engine object behind each one is at that moment is recorded with it, and
                // whether the subtree's root entity has a parent yet.
                stage.addEventListener('ready', (event) => {
                    const target = event.target as Element;
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
                    const root = stage.querySelector<EntityElement>('pc-entity[name="group"]')!.entity;
                    log.push(`${target.localName} ready - ${object}, ${root?.parent ? 'in' : 'not in'} the scene`);
                });

                insert(stage, `<pc-entity name="group"><pc-camera></pc-camera>${probe()}</pc-entity>`);
                log.push(`inserted - ${census(app)}`);

                expect(log).toEqual([
                    'pc-entity ready - entity, not in the scene',
                    'pc-camera ready - component, not in the scene',
                    'pc-script-instance ready - script exists, not in the scene',
                    'pc-script ready - component, not in the scene',
                    'group.initialize',
                    'group.postInitialize',
                    'inserted - 1 camera, 1 script'
                ]);
            }
        );

        it('leaves the scene untouched when a listener removes the subtree while it is being built', async () => {
            const { app, container, log, stage } = await boot();
            const children = app.root.children.length;

            // The root's ready event is the first thing the build dispatches. A clone is used
            // because the elements of a built subtree have yet to connect at that point, and the
            // browser would go on to connect and disconnect each of them in the removed subtree.
            stage.addEventListener(
                'ready',
                (event) => {
                    (event.target as Element).remove();
                },
                { once: true }
            );
            const fragment = parse(GROUP).content.cloneNode(true) as DocumentFragment;
            const elements = Array.from(fragment.querySelectorAll('pc-entity')) as EntityElement[];
            stage.appendChild(fragment);
            await settle(container);

            expect(stage.childElementCount).toBe(0);
            expect(elements.map((element) => element.entity)).toEqual([null, null, null]);
            expect(stage.entity!.children).toEqual([]);
            expect(app.root.children.length).toBe(children);
            expect(census(app)).toBe('no components');
            expect(log).toEqual([]);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('containing models', () => {
        /**
         * A hierarchy holding a model whose container has loaded and one whose container is
         * `lazy`, each with an entity attached to a node of its content, and an entity after
         * them. Every script looks at an entity the engine reaches later than its own.
         *
         * @param id - What makes this hierarchy's container nodes unique.
         * @returns The markup.
         */
        const models = (id: string) => `
            <pc-entity name="group">
                <pc-model name="model" asset="loaded-${id}">
                    ${probe('attached')}
                    <pc-node name="loaded-root-${id}">
                        <pc-render></pc-render>
                        ${probe('after')}
                        <pc-entity name="attached"><pc-light></pc-light>${probe('model')}</pc-entity>
                    </pc-node>
                </pc-model>
                <pc-model name="lazy-model" asset="lazy-${id}">
                    <pc-node name="lazy-root-${id}">
                        <pc-entity name="lazy-attached"><pc-light></pc-light>${probe('model')}</pc-entity>
                    </pc-node>
                </pc-model>
                <pc-entity name="after">${probe(`loaded-root-${id}`)}</pc-entity>
            </pc-entity>
        `;

        const assets = (id: string) => `
            <pc-asset id="loaded-${id}" type="container" src="${containerSrc(`loaded-root-${id}`)}"></pc-asset>
            <pc-asset id="lazy-${id}" type="container" src="${containerSrc(`lazy-root-${id}`)}" lazy></pc-asset>
        `;

        it.each(TWO_WAYS.map(([name, insert], index) => [name, insert, `${index}`] as const))(
            'has the content of a loaded model, and what is declared inside it, when its scripts initialize - %s',
            async (_name, insert, id) => {
                const { app, container, get, log, stage } = await boot(assets(id));
                expect(get<AssetElement>(`#loaded-${id}`).asset!.loaded, 'preloaded at boot').toBe(true);
                expect(get<AssetElement>(`#lazy-${id}`).asset!.loaded, 'really lazy').toBe(false);

                insert(stage, models(id));
                log.push(`inserted - ${census(app)}`);

                // The loaded model's content is instantiated as the subtree is built, which binds
                // the node and builds what is declared on it - so its scripts take their place
                // in the one pass, in the order the engine walks the hierarchy
                const root = `loaded-root-${id}`;
                const model = get<ModelElement>('pc-model[name="model"]');
                expect(model.contentEntity!.name).toBe(root);
                expect(get<NodeElement>(`pc-node[name="${root}"]`).state).toBe('bound');
                expect(log).toEqual([
                    'model.initialize - attached has light, script, and its script exists',
                    `${root}.initialize - after has script, and its script exists`,
                    'attached.initialize - model has script, and its script has initialized',
                    `after.initialize - ${root} has render, script, and its script has initialized`,
                    'model.postInitialize - attached has light, script, and its script has initialized',
                    `${root}.postInitialize - after has script, and its script has initialized`,
                    'attached.postInitialize - model has script, and its script has post-initialized',
                    `after.postInitialize - ${root} has render, script, and its script has post-initialized`,
                    'inserted - 1 light, 1 render, 4 script'
                ]);

                // The lazy model asks for its container, and nothing waits for it. What is inside
                // it is built when the content arrives, and its script initializes then.
                const lazy = get<ModelElement>('pc-model[name="lazy-model"]');
                expect(lazy.contentEntity).toBeNull();

                log.length = 0;
                await readyWithin(lazy);
                await settle(container);

                expect(lazy.contentEntity!.name).toBe(`lazy-root-${id}`);
                expect(log).toEqual([
                    'lazy-attached.initialize - model has script, and its script has post-initialized',
                    'lazy-attached.postInitialize - model has script, and its script has post-initialized'
                ]);
                expect(census(app)).toBe('2 light, 1 render, 5 script');
                expect(uncaught.seen).toEqual([]);
            }
        );

        it.each(TWO_WAYS.map(([name, insert], index) => [name, insert, `listened-${index}`] as const))(
            'has a component that a listener adds as a model loads built with the rest - %s',
            async (_name, insert, id) => {
                const { app, log, stage } = await boot(
                    `<pc-asset id="${id}" type="container" src="${containerSrc(`${id}-root`)}"></pc-asset>`
                );

                // A loaded model fires load as the subtree is built, before its components are.
                // The event does not bubble, so the listener meets it on its way down.
                stage.addEventListener(
                    'load',
                    () => stage.querySelector('pc-entity[name="a"]')!.appendChild(document.createElement('pc-camera')),
                    { capture: true, once: true }
                );

                insert(
                    stage,
                    `<pc-entity name="group">
                        <pc-model name="model" asset="${id}"></pc-model>
                        <pc-entity name="a"></pc-entity>
                        <pc-entity name="b">${probe('a')}</pc-entity>
                    </pc-entity>`
                );
                log.push(`inserted - ${census(app)}`);

                expect(log).toEqual([
                    'b.initialize - a has camera, and its script does not exist',
                    'b.postInitialize - a has camera, and its script does not exist',
                    'inserted - 1 camera, 1 script'
                ]);
                expect(uncaught.seen).toEqual([]);
            }
        );
    });

    describe('under a disabled entity', () => {
        it.each(TWO_WAYS)(
            'is built, and initializes together when the entity is enabled - %s',
            async (_name, insert) => {
                const { app, get, log } = await boot('<pc-entity name="off" enabled="false"></pc-entity>');
                const off = get<EntityElement>('pc-entity[name="off"]');

                insert(off, GROUP);
                log.push(`inserted - ${census(app)}`);

                // Everything exists, and nothing has run
                const instances = Array.from(off.querySelectorAll<ScriptInstanceElement>('pc-script-instance'));
                expect(instances.map((element) => stateOf(element.script))).toEqual(['exists', 'exists']);
                expect(log).toEqual(['inserted - 1 camera, 1 render, 2 script']);

                log.length = 0;
                off.enabled = true;
                expect(log).toEqual(GROUP_SCRIPTS_LOG);
            }
        );
    });

    describe('removed and inserted again', () => {
        it.each(TWO_WAYS)('is built again, and runs its scripts again - %s', async (_name, insert) => {
            const { app, container, log, stage } = await boot();

            insert(stage, GROUP);
            const group = stage.querySelector<EntityElement>('pc-entity[name="group"]')!;
            const camera = group.querySelector<ComponentElement>('pc-camera')!;
            const first = { entity: group.entity, camera: camera.component };
            expect(log).toEqual(GROUP_SCRIPTS_LOG);

            // The elements keep nothing of the entities they fronted
            group.remove();
            expect(group.entity).toBeNull();
            expect(camera.component).toBeNull();
            expect(census(app)).toBe('no components');

            // What goes back in is a subtree of custom elements, whichever way it first arrived
            log.length = 0;
            stage.appendChild(group);
            log.push(`inserted - ${census(app)}`);

            expect(log).toEqual(GROUP_LOG);
            expect(group.entity).not.toBe(first.entity);
            expect(camera.component).not.toBe(first.camera);
            expect(camera.component).toBe((group.entity!.findByName('a') as Entity).camera);

            await settle(container);
            expect(log).toEqual(GROUP_LOG);
            expect(uncaught.seen).toEqual([]);
        });
    });

    describe('removed and inserted again, as several roots', () => {
        it.each(TWO_WAYS)('are built together again - %s', async (_name, insert) => {
            const { app, log, stage } = await boot();
            peers(app, log);

            insert(stage, TWO_ROOTS);
            expect(log).toEqual(TWO_ROOTS_SCRIPTS_LOG);

            const [a, b] = Array.from(stage.children) as EntityElement[];
            a.remove();
            b.remove();
            expect([a.entity, b.entity]).toEqual([null, null]);

            log.length = 0;
            stage.append(a, b);
            log.push(`inserted - ${census(app)}`);

            expect(log).toEqual(TWO_ROOTS_LOG);
            expect(warnings.seen).toEqual([]);
        });
    });

    describe('delivered an element at a time', () => {
        it('is built an element at a time, as before', async () => {
            const { app, container, log, stage } = await boot();

            // What the parser does with a document that is still arriving once the application
            // has started: each element connects before it has any children
            const deliver = (parent: Element, source: Element) => {
                const element = document.createElement(source.localName);
                for (const { name, value } of Array.from(source.attributes)) {
                    element.setAttribute(name, value);
                }
                parent.appendChild(element);
                for (const child of Array.from(source.children)) {
                    deliver(element, child);
                }
            };
            deliver(stage, parse(GROUP).content.firstElementChild!);
            log.push(`inserted - ${census(app)}`);
            await settle(container);
            log.push(`settled - ${census(app)}`);

            // Each entity joined the scene as it arrived, and each component was added to an
            // entity already there, so each script initialized on its own
            expect(log).toEqual([
                'inserted - no components',
                'a.initialize - b has render, script, and its script does not exist',
                'a.postInitialize - b has render, script, and its script does not exist',
                'b.initialize - a has camera, script, and its script has post-initialized',
                'b.postInitialize - a has camera, script, and its script has post-initialized',
                'settled - 1 camera, 1 render, 2 script'
            ]);
            expect(uncaught.seen).toEqual([]);
        });
    });
});

describe('a subtree inserted while <pc-app> is booting', () => {
    const { uncaught } = useGuard();

    /** An entity the document declares, whose script looks at an entity of the inserted subtree. */
    const DECLARED = `<pc-entity name="declared">${probe('b')}</pc-entity>`;

    /** What the declared script and the subtree's two log when the application starts them. */
    const STARTED_LOG = [
        "app 'start' event - 1 camera, 1 render, 3 script",
        'declared.initialize - b has render, script, and its script exists',
        'a.initialize - b has render, script, and its script exists',
        'b.initialize - a has camera, script, and its script has initialized',
        'declared.postInitialize - b has render, script, and its script has initialized',
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

    it.each(TWO_WAYS)(
        'is built by the boot when it arrives before the application exists - %s',
        async (_name, insert) => {
            const log: string[] = [];
            const handle = mountProbed(DECLARED, log);

            // The boot is parked at its first await, with no application yet
            expect(handle.appElement.app).toBeNull();
            insert(handle.appElement, GROUP);
            log.push('inserted');

            await started(handle);

            expect(log).toEqual(['inserted', ...STARTED_LOG]);
            expect(uncaught.seen).toEqual([]);
        }
    );

    it.each(TWO_WAYS)(
        'has its entities built at once, and the rest by the boot, when it arrives while assets preload - %s',
        async (_name, insert) => {
            const log: string[] = [];
            const handle = mountProbed(
                `<pc-asset id="data" type="json" src="data:application/json,{}"></pc-asset>${DECLARED}`,
                log
            );
            const { appElement } = handle;

            // The first progress event announces the preload, with the hierarchy built. The
            // components are left to the boot, which builds every component once the assets have
            // loaded, so the subtree's scripts start with the document's.
            appElement.addEventListener(
                'progress',
                () => {
                    insert(appElement, GROUP);
                    const group = appElement.querySelector<EntityElement>('pc-entity[name="group"]')!;
                    log.push(`inserted - ${group.entity!.children.length} entities, ${census(appElement.app!)}`);
                },
                { once: true }
            );

            await started(handle);

            expect(log).toEqual(['inserted - 2 entities, no components', ...STARTED_LOG]);
            expect(uncaught.seen).toEqual([]);
        }
    );

    it.each(TWO_WAYS)(
        'is built and started where it is inserted, when a script inserts it as the application starts - %s',
        async (_name, insert) => {
            const log: string[] = [];

            class Spawner extends Script {
                static scriptName = 'spawner';

                initialize() {
                    log.push('spawner.initialize begins');
                    insert(document.querySelector('pc-app')!, GROUP);
                    log.push(`spawner.initialize ends - ${census(this.app)}`);
                }

                postInitialize() {
                    log.push('spawner.postInitialize');
                }
            }

            const Probe = probeClass(log);
            const handle = mountApp(
                '<pc-entity name="spawner"><pc-script><pc-script-instance name="spawner"></pc-script-instance></pc-script></pc-entity>',
                (app) => {
                    app.scripts.add(Probe);
                    app.scripts.add(Spawner);
                }
            );

            await started(handle);

            // What the engine does for a hierarchy a script hands to addChild() from initialize()
            expect(log).toEqual([
                'spawner.initialize begins',
                'a.initialize - b has render, script, and its script exists',
                'b.initialize - a has camera, script, and its script has initialized',
                'a.postInitialize - b has render, script, and its script has initialized',
                'b.postInitialize - a has camera, script, and its script has post-initialized',
                'spawner.initialize ends - 1 camera, 1 render, 3 script',
                'spawner.postInitialize'
            ]);
            expect(uncaught.seen).toEqual([]);
        }
    );
});
