import type { AppBase, CameraComponent } from 'playcanvas';
import {
    Color,
    Vec4,
    GAMMA_NONE,
    GAMMA_SRGB,
    PROJECTION_ORTHOGRAPHIC,
    PROJECTION_PERSPECTIVE,
    TONEMAP_ACES,
    TONEMAP_NONE,
    XRTYPE_AR,
    XRTYPE_VR
} from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { CameraComponentElement } from '../../../src/components/camera-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/**
 * Stubs the availability half of XrManager, which is device-driven and never true headlessly.
 * `supported` is a getter, hence defineProperty rather than assignment.
 *
 * @param app - The booted application.
 * @param available - The session types to report as available.
 * @returns The types the element asked about, in the order it asked.
 */
const stubXr = (app: AppBase, available: string[]) => {
    const xr = app.xr;
    if (xr === null) {
        throw new Error('expected an XrManager on the application');
    }

    const asked: string[] = [];
    Object.defineProperty(xr, 'supported', { value: true, configurable: true });
    xr.isAvailable = (type: string) => {
        asked.push(type);
        return available.includes(type);
    };

    return asked;
};

const scene = (cameraAttributes = '') =>
    `<pc-entity name="camera"><pc-camera ${cameraAttributes}></pc-camera></pc-entity>`;

/** Reads an engine component property named by a table row. */
const engineValue = (component: CameraComponent, property: string) =>
    (component as unknown as Record<string, unknown>)[property];

/**
 * One row per attribute: the attribute, the engine property behind it, a non-default value, what
 * the engine must report for it, and the default that removal must restore. Ordered by
 * `observedAttributes` - the source of truth.
 *
 * Every `restored` value is the engine's own default bar one, called out in its row: the element
 * and the engine agree on the camera's resting state, so a `<pc-camera>` carrying no attributes
 * renders what a bare engine camera renders.
 */
const cases: [attribute: string, property: string, value: string, expected: unknown, restored: unknown][] = [
    ['clear-color', 'clearColor', '1 0 0 1', new Color(1, 0, 0, 1), new Color(0.75, 0.75, 0.75, 1)],
    ['clear-color-buffer', 'clearColorBuffer', 'false', false, true],
    ['clear-depth', 'clearDepth', '0.5', 0.5, 1],
    ['clear-depth-buffer', 'clearDepthBuffer', 'false', false, true],
    ['clear-stencil-buffer', 'clearStencilBuffer', 'false', false, true],
    ['cull-faces', 'cullFaces', 'false', false, true],
    ['far-clip', 'farClip', '500', 500, 1000],
    ['flip-faces', 'flipFaces', '', true, false],
    ['fov', 'fov', '60', 60, 45],
    ['frustum-culling', 'frustumCulling', 'false', false, true],
    ['gamma', 'gammaCorrection', 'linear', GAMMA_NONE, GAMMA_SRGB],
    ['horizontal-fov', 'horizontalFov', '', true, false],
    ['near-clip', 'nearClip', '1', 1, 0.1],
    ['ortho-height', 'orthoHeight', '5', 5, 10],
    ['priority', 'priority', '2', 2, 0],
    ['projection', 'projection', 'orthographic', PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE],
    ['rect', 'rect', '0 0 0.5 1', new Vec4(0, 0, 0.5, 1), new Vec4(0, 0, 1, 1)],
    ['scissor-rect', 'scissorRect', '0 0 0.5 0.5', new Vec4(0, 0, 0.5, 0.5), new Vec4(0, 0, 1, 1)],
    // The one exception: the engine defaults toneMapping to TONEMAP_LINEAR and this element writes
    // TONEMAP_NONE. The two diverge only once Scene#exposure moves off 1, which no attribute
    // reaches, so the deviation is pinned here rather than changed under existing apps.
    ['tonemap', 'toneMapping', 'aces', TONEMAP_ACES, TONEMAP_NONE]
];

describe('<pc-camera>', () => {
    const { warnings } = useGuard();

    describe('#component', () => {
        it('creates the camera component with the engine defaults', async () => {
            const { get } = await bootApp(scene());
            const component = get<CameraComponentElement>('pc-camera').component;

            expect(component).toBeDefined();
            expect(component.enabled).toBe(true);

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
            const component = get<CameraComponentElement>('pc-camera').component;

            for (const [attribute, property, , expected] of cases) {
                expect.soft(engineValue(component, property), attribute).toEqual(expected);
            }
        });

        it('writes attribute changes through to the component', async () => {
            const { get } = await bootApp(scene());
            const camera = get<CameraComponentElement>('pc-camera');

            for (const [attribute, property, value, expected] of cases) {
                camera.setAttribute(attribute, value);
                expect.soft(engineValue(camera.component, property), attribute).toEqual(expected);
            }
        });

        it('restores the default when an attribute is removed', async () => {
            const { get } = await bootApp(scene());
            const camera = get<CameraComponentElement>('pc-camera');

            for (const [attribute, property, value, , restored] of cases) {
                camera.setAttribute(attribute, value);
                camera.removeAttribute(attribute);
                expect.soft(engineValue(camera.component, property), attribute).toEqual(restored);
            }
        });

        it('falls back to the default and warns once per invalid value', async () => {
            const { get } = await bootApp(
                scene('fov="wide" projection="isometric" tonemap="reinhard" rect="0 0" clear-depth="near"')
            );
            const component = get<CameraComponentElement>('pc-camera').component;

            warnings.expect("Invalid value 'wide' for attribute 'fov'. Expected a finite number. Using '45'.");
            warnings.expect(
                "Invalid value 'isometric' for attribute 'projection'. Valid values: perspective, orthographic. Using 'perspective'."
            );
            warnings.expect(
                "Invalid value 'reinhard' for attribute 'tonemap'. Valid values: none, linear, filmic, hejl, aces, aces2, neutral. Using 'none'."
            );
            warnings.expect(
                "Invalid value '0 0' for attribute 'rect'. Expected 4 space-separated numbers. Using '[0, 0, 1, 1]'."
            );
            warnings.expect("Invalid value 'near' for attribute 'clear-depth'. Expected a finite number. Using '1'.");

            expect(component.fov).toBe(45);
            expect(component.projection).toBe(PROJECTION_PERSPECTIVE);
            expect(component.toneMapping).toBe(TONEMAP_NONE);
            expect(component.rect).toEqual(new Vec4(0, 0, 1, 1));
            expect(component.clearDepth).toBe(1);
        });
    });

    describe('XR', () => {
        it('reports no XR headlessly', async () => {
            const { get } = await bootApp(scene());
            const camera = get<CameraComponentElement>('pc-camera');

            // The null device backs no XR session, so this is what every headless caller sees
            expect(camera.arAvailable).toBe(false);
            expect(camera.vrAvailable).toBe(false);

            // Nothing to end, and asking for either must not throw
            expect(() => camera.endXr()).not.toThrow();
            expect(() => camera.startXr('immersive-vr', 'local-floor')).not.toThrow();
        });

        it('reports each mode on its own', async () => {
            const { app, get } = await bootApp(scene());
            const camera = get<CameraComponentElement>('pc-camera');
            const asked = stubXr(app, [XRTYPE_AR]);

            // The split an AR-capable phone reports, and the reason there is a getter per mode
            expect(camera.arAvailable, 'the mode the device offers').toBe(true);
            expect(camera.vrAvailable, 'the mode it does not').toBe(false);
            expect(asked, 'each getter tests only its own mode').toEqual([XRTYPE_AR, XRTYPE_VR]);
        });

        it('reports neither mode when the device offers none', async () => {
            const { app, get } = await bootApp(scene());
            const camera = get<CameraComponentElement>('pc-camera');
            stubXr(app, []);

            // Distinct from the headless case above: XR is supported here, the modes are not
            expect(camera.arAvailable).toBe(false);
            expect(camera.vrAvailable).toBe(false);
        });

        it('tests availability for the mode it is asked to start', async () => {
            const { app, get } = await bootApp(scene());
            const camera = get<CameraComponentElement>('pc-camera');

            // AR available and VR not - the split an AR-capable phone reports
            const asked = stubXr(app, [XRTYPE_AR]);

            // Stubbed so the element's decision is what is measured, not a session the null device
            // could never open
            const started: string[] = [];
            const component = camera.component;
            component.startXr = ((type: string) => {
                started.push(type);
            }) as typeof component.startXr;

            camera.startXr('immersive-ar', 'local-floor');
            camera.startXr('immersive-vr', 'local-floor');

            expect(asked, 'each start tests its own mode').toEqual([XRTYPE_AR, XRTYPE_VR]);
            expect(started, 'the available mode starts, the unavailable one does not').toEqual([XRTYPE_AR]);
        });
    });
});
