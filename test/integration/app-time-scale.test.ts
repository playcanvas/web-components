import type { AppBase } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import { bootApp, settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * <pc-app>'s time scales against the engine. They control how fast the whole application runs -
 * its own time scale and its rigid body system's - rather than describing a scene, so the element
 * applies them while it boots, before anything can read them.
 */
describe('<pc-app> time scale attributes', () => {
    const { warnings } = useGuard();

    /**
     * One row per attribute: the attribute, how to read the engine value it drives, a non-default
     * value, what the engine must report for it, and the engine default that omitting or removing
     * it leaves in place.
     */
    const cases: [
        attribute: string,
        read: (app: AppBase) => unknown,
        value: string,
        expected: unknown,
        restored: unknown
    ][] = [
        ['time-scale', (app) => app.timeScale, '0.5', 0.5, 1],
        ['physics-time-scale', (app) => app.systems.rigidbody!.timeScale, '0.25', 0.25, 1]
    ];

    const markup = cases.map(([attribute, , value]) => `${attribute}="${value}"`).join(' ');

    it('leaves the engine defaults in place when omitted', async () => {
        const { app } = await bootApp();

        for (const [attribute, read, , , restored] of cases) {
            expect.soft(read(app), attribute).toEqual(restored);
        }
    });

    it('applies every attribute when the application boots', async () => {
        const { app } = await bootApp('', { appAttributes: markup });

        for (const [attribute, read, , expected] of cases) {
            expect.soft(read(app), attribute).toEqual(expected);
        }
    });

    it('applies them before scripts initialize', async () => {
        // A script reads these in initialize(), which the application runs inside app.start(). The
        // physics time scale used to live on <pc-scene>, which only applied it once the application
        // was ready - after that - so initialize() saw the engine default instead.
        const handle = mount(`<pc-app backend="null" ${markup}></pc-app>`);
        const appElement = handle.get<AppElement>('pc-app');

        // The first progress event fires once the application exists, before it starts
        const seen = new Map<string, unknown>();
        appElement.addEventListener(
            'progress',
            () => {
                const app = appElement.app!;
                app.once('initialize', () => {
                    for (const [attribute, read] of cases) {
                        seen.set(attribute, read(app));
                    }
                });
            },
            { once: true }
        );

        await readyWithin(appElement);
        await settle(handle.container);

        for (const [attribute, , , expected] of cases) {
            expect.soft(seen.get(attribute), attribute).toEqual(expected);
        }
    });

    it('writes changes through and restores the engine default on removal', async () => {
        const { app, appElement } = await bootApp();

        for (const [attribute, read, value, expected, restored] of cases) {
            appElement.setAttribute(attribute, value);
            expect.soft(read(app), attribute).toEqual(expected);
            appElement.removeAttribute(attribute);
            expect.soft(read(app), `${attribute} removed`).toEqual(restored);
        }
    });

    it('applies them again when a re-inserted element boots a new application', async () => {
        const { appElement, container } = await bootApp('', { appAttributes: markup });

        appElement.remove();
        container.appendChild(appElement);
        await readyWithin(appElement);
        await settle(container);

        const app = appElement.app!;
        app.autoRender = false;
        for (const [attribute, read, , expected] of cases) {
            expect.soft(read(app), attribute).toEqual(expected);
        }
    });

    it('reports its own settings before the application boots', () => {
        const element = document.createElement('pc-app') as AppElement;

        expect(element.timeScale).toBe(1);
        expect(element.physicsTimeScale).toBe(1);

        element.setAttribute('time-scale', '0');
        element.setAttribute('physics-time-scale', '2');

        expect(element.timeScale).toBe(0);
        expect(element.physicsTimeScale).toBe(2);
    });

    it('falls back to the engine default and warns for invalid values', async () => {
        const { app } = await bootApp('', { appAttributes: 'time-scale="fast"' });

        warnings.expect("Invalid value 'fast' for attribute 'time-scale'. Expected a finite number. Using '1'.");
        expect(app.timeScale).toBe(1);
    });
});
