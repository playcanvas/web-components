import type { RigidBodyComponent } from 'playcanvas';
import { Entity, Vec3 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { RigidBodyComponentElement } from '../../../src/components/rigid-body-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/**
 * Without Ammo the body is never created, but every property still round-trips through the engine
 * component - which is exactly the surface these tests pin.
 */
const scene = (bodyAttributes = '') => `<pc-entity name="body"><pc-rigid-body ${bodyAttributes}></pc-rigid-body></pc-entity>`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: RigidBodyComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per attribute: the attribute, the engine property behind it, a non-default value, what
 * the engine must report for it, and the engine default that removal must restore. Ordered by
 * `observedAttributes` - the source of truth.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['angular-damping', 'angularDamping', '0.1', 0.1, 0],
    ['angular-factor', 'angularFactor', '0 1 0', new Vec3(0, 1, 0), new Vec3(1, 1, 1)],
    ['friction', 'friction', '0.2', 0.2, 0.5],
    ['gravity-scale', 'gravityScale', '-0.2', -0.2, 1],
    ['linear-damping', 'linearDamping', '0.3', 0.3, 0],
    ['linear-factor', 'linearFactor', '1 0 1', new Vec3(1, 0, 1), new Vec3(1, 1, 1)],
    ['mass', 'mass', '5', 5, 1],
    ['restitution', 'restitution', '0.8', 0.8, 0],
    ['rolling-friction', 'rollingFriction', '0.4', 0.4, 0],
    ['type', 'type', 'dynamic', 'dynamic', 'static']
];

describe('<pc-rigid-body>', () => {
    useGuard();

    describe('#component', () => {
        it('creates the rigidbody component with the engine defaults', async () => {
            const { get } = await bootApp(scene());
            const component = get<RigidBodyComponentElement>('pc-rigid-body').component!;

            expect(component).toBeDefined();
            expect(component.enabled).toBe(true);

            for (const [attribute, property, , , restored] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(restored);
            }
        });

        it('matches a rigidbody the engine built itself', async () => {
            const { app, get } = await bootApp(scene());
            const element = get<RigidBodyComponentElement>('pc-rigid-body').component!;

            // Every property the element writes, compared against a component built from no data
            // at all, so a default drifting on either side fails here.
            const bare = new Entity('bare', app);
            app.root.addChild(bare);
            const engine = bare.addComponent('rigidbody')!;

            for (const [attribute, property] of cases) {
                expect
                    .soft(engineValue(element, property), `${attribute} vs a bare engine rigidbody`)
                    .toEqual(engineValue(engine, property));
            }
        });
    });

    describe('attributes', () => {
        it('applies every declarative attribute through the initial component data', async () => {
            const markup = cases.map(([attribute, , value]) => `${attribute}="${value}"`).join(' ');
            const { get } = await bootApp(scene(markup));
            const component = get<RigidBodyComponentElement>('pc-rigid-body').component!;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp(scene());
            const body = get<RigidBodyComponentElement>('pc-rigid-body');

            for (const [attribute, property, value, expected] of cases) {
                body.setAttribute(attribute, value);
                expect.soft(engineValue(body.component!, property), attribute).toEqual(expected);
            }
        });

        it('restores the engine default when an attribute is removed', async () => {
            const { get } = await bootApp(scene());
            const body = get<RigidBodyComponentElement>('pc-rigid-body');

            for (const [attribute, property, value, , restored] of cases) {
                body.setAttribute(attribute, value);
                body.removeAttribute(attribute);
                expect.soft(engineValue(body.component!, property), attribute).toEqual(restored);
            }
        });
    });
});
