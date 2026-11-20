import type { AppBase, Entity } from 'playcanvas';
import { Script } from 'playcanvas';

import type { AppElement } from '../../src/app';

import { settle } from './app';
import { mount } from './dom';
import { readyWithin } from './ready';

/**
 * What the build-order suites record: the components an application holds, and what a script can
 * see of another entity as it initializes. Shared by the suite for the order `<pc-app>` boots in
 * and the one for the order an inserted subtree builds in, so that both read the same log.
 */

/**
 * The smallest valid glTF: no meshes, one named node. Each test names its own node, because the
 * engine's loader caches by URL and a second asset with the same source would arrive loaded.
 *
 * @param nodeName - The name of the glTF's single node.
 * @returns The data: URI.
 */
export const containerSrc = (nodeName: string) =>
    `data:application/json,${encodeURIComponent(
        JSON.stringify({
            asset: { version: '2.0' },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ name: nodeName }]
        })
    )}`;

/**
 * Counts the components in an application's hierarchy, by type.
 *
 * @param app - The application.
 * @returns The counts, as `2 camera, 1 script`.
 */
export const census = (app: AppBase) => {
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

/**
 * The lifecycle state of a script on another entity, as a script sees it.
 *
 * @param script - The script, if there is one.
 * @returns The state, as it reads in a log line.
 */
export const stateOf = (script: Script | null | undefined) => {
    if (!script) {
        return 'does not exist';
    }
    const { _initialized, _postInitialized } = script as unknown as {
        _initialized: boolean;
        _postInitialized: boolean;
    };
    return _postInitialized ? 'has post-initialized' : _initialized ? 'has initialized' : 'exists';
};

/**
 * A script that records its own lifecycle under its entity's name, and what it can see of the
 * entity named by `other` when each method runs.
 *
 * @param log - Where to record.
 * @param scriptName - The name to register the class under.
 * @returns The class.
 */
export const probeClass = (log: string[], scriptName = 'probe'): typeof Script => {
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
export const mountApp = (html: string, prepare: (app: AppBase) => void) => {
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
export const started = async ({ appElement, container }: { appElement: AppElement; container: HTMLElement }) => {
    await readyWithin(appElement);
    await settle(container);
    const app = appElement.app!;
    app.autoRender = false;
    return app;
};
