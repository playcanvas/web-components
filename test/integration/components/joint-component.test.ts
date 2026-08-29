import type { JointComponent } from 'playcanvas';
import { Vec2, Vec3 } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { JointComponentElement } from '../../../src/components/joint-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/**
 * Two rigid bodies for the joint to reference. Without Ammo the bodies never simulate and the
 * joint never creates a constraint, but every property still round-trips through the engine
 * component - which is exactly the surface these tests pin.
 */
const BODIES = `
    <pc-entity id="anchor-id" name="anchor"><pc-rigid-body></pc-rigid-body></pc-entity>
    <pc-entity id="bob-id" name="bob">
        <pc-collision></pc-collision>
        <pc-rigid-body type="dynamic"></pc-rigid-body>
    </pc-entity>
`;

const scene = (jointAttributes = '') =>
    `${BODIES}<pc-entity name="frame"><pc-joint ${jointAttributes}></pc-joint></pc-entity>`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: JointComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per attribute (the entity references have their own suite): the attribute, the engine
 * property behind it, a non-default value, what the engine must report for it, and the engine
 * default that removal must restore. Ordered by `observedAttributes` - the source of truth.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['angular-damping', 'angularDamping', '0.1 0.2 0.3', new Vec3(0.1, 0.2, 0.3), new Vec3(1, 1, 1)],
    ['angular-equilibrium', 'angularEquilibrium', '1 2 3', new Vec3(1, 2, 3), new Vec3()],
    ['angular-limits-x', 'angularLimitsX', '-10 10', new Vec2(-10, 10), new Vec2()],
    ['angular-limits-y', 'angularLimitsY', '-20 20', new Vec2(-20, 20), new Vec2()],
    ['angular-limits-z', 'angularLimitsZ', '-30 30', new Vec2(-30, 30), new Vec2()],
    ['angular-motion-x', 'angularMotionX', 'free', 'free', 'locked'],
    ['angular-motion-y', 'angularMotionY', 'limited', 'limited', 'locked'],
    ['angular-motion-z', 'angularMotionZ', 'free', 'free', 'locked'],
    ['angular-stiffness', 'angularStiffness', '4 5 6', new Vec3(4, 5, 6), new Vec3()],
    ['break-impulse', 'breakImpulse', '8', 8, Infinity],
    ['enable-collision', 'enableCollision', '', true, false],
    ['enable-limits', 'enableLimits', '', true, false],
    ['limits', 'limits', '0 110', new Vec2(0, 110), new Vec2(-45, 45)],
    ['linear-damping', 'linearDamping', '0.4 0.5 0.6', new Vec3(0.4, 0.5, 0.6), new Vec3(1, 1, 1)],
    ['linear-equilibrium', 'linearEquilibrium', '7 8 9', new Vec3(7, 8, 9), new Vec3()],
    ['linear-limits-x', 'linearLimitsX', '-1 1', new Vec2(-1, 1), new Vec2()],
    ['linear-limits-y', 'linearLimitsY', '-2 2', new Vec2(-2, 2), new Vec2()],
    ['linear-limits-z', 'linearLimitsZ', '-3 3', new Vec2(-3, 3), new Vec2()],
    ['linear-motion-x', 'linearMotionX', 'limited', 'limited', 'locked'],
    ['linear-motion-y', 'linearMotionY', 'free', 'free', 'locked'],
    ['linear-motion-z', 'linearMotionZ', 'limited', 'limited', 'locked'],
    ['linear-stiffness', 'linearStiffness', '10 20 30', new Vec3(10, 20, 30), new Vec3()],
    ['max-motor-force', 'maxMotorForce', '50', 50, 0],
    ['motor-speed', 'motorSpeed', '90', 90, 0],
    ['swing-limit-y', 'swingLimitY', '35', 35, 45],
    ['swing-limit-z', 'swingLimitZ', '25', 25, 45],
    ['twist-limit', 'twistLimit', '10', 10, 20],
    ['type', 'type', 'hinge', 'hinge', 'fixed']
];

describe('<pc-joint>', () => {
    const { warnings } = useGuard();

    describe('#component', () => {
        it('creates the joint component with the engine defaults', async () => {
            const { get } = await bootApp(scene());
            const component = get<JointComponentElement>('pc-joint').component;

            expect(component).toBeDefined();

            // No Ammo in this tier, so the constraint is never created - properties are all
            // that exists, which is what makes the joint testable headlessly
            expect(component.constraint).toBeNull();
            expect(component.isBroken).toBe(false);
            expect(component.entityA).toBeNull();
            expect(component.entityB).toBeNull();

            for (const [attribute, property, , , restored] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(restored);
            }
        });
    });

    describe('attributes', () => {
        it('applies every declarative attribute through the initial component data', async () => {
            const markup = cases
                .map(([attribute, , value]) => (value === '' ? attribute : `${attribute}="${value}"`))
                .join(' ');
            const { get } = await bootApp(scene(markup));
            const component = get<JointComponentElement>('pc-joint').component;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp(scene());
            const joint = get<JointComponentElement>('pc-joint');

            for (const [attribute, property, value, expected] of cases) {
                joint.setAttribute(attribute, value);
                expect.soft(engineValue(joint.component, property), attribute).toEqual(expected);
            }
        });

        it('restores the engine default when an attribute is removed', async () => {
            const { get } = await bootApp(scene());
            const joint = get<JointComponentElement>('pc-joint');

            for (const [attribute, property, value, , restored] of cases) {
                joint.setAttribute(attribute, value);
                joint.removeAttribute(attribute);
                expect.soft(engineValue(joint.component, property), attribute).toEqual(restored);
            }
        });

        it('falls back to the default and warns once per invalid value', async () => {
            const { get } = await bootApp(
                scene(
                    'type="banana" break-impulse="soft" limits="1" linear-stiffness="x y z" linear-motion-y="wobbly"'
                )
            );
            const component = get<JointComponentElement>('pc-joint').component;

            warnings.expect(
                "Invalid value 'banana' for attribute 'type'. Valid values: fixed, ball, hinge, slider, 6dof. Using 'fixed'."
            );
            warnings.expect(
                "Invalid value 'soft' for attribute 'break-impulse'. Expected a finite number. Using 'Infinity'."
            );
            warnings.expect(
                "Invalid value '1' for attribute 'limits'. Expected 2 space-separated numbers. Using '[-45, 45]'."
            );
            warnings.expect(
                "Invalid value 'x y z' for attribute 'linear-stiffness'. Expected 3 space-separated numbers. Using '[0, 0, 0]'."
            );
            warnings.expect(
                "Invalid value 'wobbly' for attribute 'linear-motion-y'. Valid values: locked, limited, free. Using 'locked'."
            );

            expect(component.type).toBe('fixed');
            expect(component.breakImpulse).toBe(Infinity);
            expect(component.limits).toEqual(new Vec2(-45, 45));
            expect(component.linearStiffness).toEqual(new Vec3());
            expect(component.linearMotionY).toBe('locked');
        });

        it('accepts 6dof as a runtime type change and restores fixed on removal', async () => {
            const { get } = await bootApp(scene('type="hinge"'));
            const joint = get<JointComponentElement>('pc-joint');

            expect(joint.component.type).toBe('hinge');

            joint.setAttribute('type', '6dof');
            expect(joint.component.type).toBe('6dof');

            joint.removeAttribute('type');
            expect(joint.component.type).toBe('fixed');
        });
    });

    describe('[entity-a] and [entity-b]', () => {
        it('resolves references by entity name and by CSS selector to live entities', async () => {
            const { app, get } = await bootApp(scene('entity-a="bob" entity-b="#anchor-id"'));
            const component = get<JointComponentElement>('pc-joint').component;

            expect(component.entityA).toBe(app.root.findByName('bob'));
            expect(component.entityB).toBe(app.root.findByName('anchor'));
        });

        it('resolves references to entities declared later in the document', async () => {
            const { app, get } = await bootApp(
                `<pc-entity name="frame"><pc-joint entity-a="bob" entity-b="anchor"></pc-joint></pc-entity>${BODIES}`
            );
            const component = get<JointComponentElement>('pc-joint').component;

            expect(component.entityA).toBe(app.root.findByName('bob'));
            expect(component.entityB).toBe(app.root.findByName('anchor'));
        });

        it('retargets a body when the attribute changes at runtime', async () => {
            const { app, get } = await bootApp(
                `${scene('entity-a="bob" entity-b="anchor"')}
                <pc-entity id="post-id" name="post"><pc-rigid-body></pc-rigid-body></pc-entity>`
            );
            const joint = get<JointComponentElement>('pc-joint');

            joint.setAttribute('entity-b', 'post-id');

            expect(joint.component.entityB).toBe(app.root.findByName('post'));
        });

        it('pins the first body to a world point when entity-b is removed', async () => {
            const { get } = await bootApp(scene('entity-a="bob" entity-b="anchor"'));
            const joint = get<JointComponentElement>('pc-joint');

            joint.removeAttribute('entity-b');

            expect(joint.entityB).toBe('');
            expect(joint.component.entityB).toBeNull();
        });

        it('detaches the first body when entity-a is removed', async () => {
            const { get } = await bootApp(scene('entity-a="bob" entity-b="anchor"'));
            const joint = get<JointComponentElement>('pc-joint');

            joint.removeAttribute('entity-a');

            expect(joint.entityA).toBe('');
            expect(joint.component.entityA).toBeNull();
        });

        it('warns when a reference matches nothing in the document', async () => {
            const { get } = await bootApp(scene('entity-a="#nope"'));
            const joint = get<JointComponentElement>('pc-joint');

            warnings.expect("pc-joint could not resolve entity-a '#nope' - nothing in the document matches it");
            expect(joint.entityA).toBe('#nope');
            expect(joint.component.entityA).toBeNull();
        });

        it('warns differently when a reference matches an element that cannot back an entity', async () => {
            // Pointing at the wrong element resolves to something, so it needs its own diagnosis -
            // and unlike the timing case, assigning again cannot fix it, so the advice differs too
            const { get } = await bootApp(`<div id="not-an-entity"></div>${scene('entity-a="#not-an-entity"')}`);
            const joint = get<JointComponentElement>('pc-joint');

            warnings.expect(
                '<div> matches it but cannot back an entity - constraint not created. ' +
                    'Point entity-a at a pc-entity instead.'
            );
            expect(joint.component.entityA).toBeNull();
        });

        it('warns again when a reference is reassigned and still does not resolve', async () => {
            const { get } = await bootApp(scene('entity-a="bob"'));
            const joint = get<JointComponentElement>('pc-joint');

            joint.setAttribute('entity-a', '#still-nope');

            warnings.expect("pc-joint could not resolve entity-a '#still-nope'");
            expect(joint.component.entityA).toBeNull();
        });

        it('stays silent for an empty reference, which is the world-space case', async () => {
            const { get } = await bootApp(scene('entity-a="bob"'));
            const joint = get<JointComponentElement>('pc-joint');

            // entity-b was never supplied, and is reassigned empty here. Neither warns: the guard
            // fails this test if either did.
            joint.setAttribute('entity-b', '');

            expect(joint.component.entityB).toBeNull();
        });
    });

    describe('break event', () => {
        it('forwards the engine break event as a bubbling DOM event', async () => {
            const { container, get } = await bootApp(scene('entity-a="bob" entity-b="anchor"'));
            const joint = get<JointComponentElement>('pc-joint');

            const events: Event[] = [];
            container.addEventListener('break', event => events.push(event));

            joint.component.fire('break');

            expect(events).toHaveLength(1);
            expect(events[0]).toBeInstanceOf(CustomEvent);
            expect(events[0].bubbles).toBe(true);
            expect(events[0].target).toBe(joint);
        });

        it('dispatches once per engine event', async () => {
            const { get } = await bootApp(scene());
            const joint = get<JointComponentElement>('pc-joint');

            const events: Event[] = [];
            joint.addEventListener('break', event => events.push(event));

            joint.component.fire('break');
            joint.component.fire('break');

            expect(events).toHaveLength(2);
        });
    });
});
