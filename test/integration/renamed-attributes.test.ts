import { PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE, SCALEMODE_BLEND, SCALEMODE_NONE } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import { bootApp } from '../helpers/app';
import { useGuard } from '../helpers/guard';

/**
 * That the two renamed enums reach the engine constants they name.
 *
 * The element tier can only see the string the accessor stores, so a Map wired to the wrong constant
 * - or a `getInitialComponentData` that still reads the old field - passes there and fails here.
 * Both paths into the component are covered: the value present at creation, and a later write.
 */
describe('renamed enum attributes', () => {
    useGuard();

    it('maps pc-camera[projection] onto the engine projection', async () => {
        const { get } = await bootApp(`
            <pc-entity name="camera">
                <pc-camera projection="orthographic" ortho-height="4"></pc-camera>
            </pc-entity>
        `);

        const camera = get<HTMLElement & { component: { projection: number; orthoHeight: number } }>('pc-camera');

        expect(camera.component.projection).toBe(PROJECTION_ORTHOGRAPHIC);
        expect(camera.component.orthoHeight, 'ortho-height still reaches the component').toBe(4);
    });

    it('maps pc-screen[scale-mode] onto the engine scale mode', async () => {
        // screen-space is load bearing, not decoration: the engine forces scaleMode to NONE on a
        // world-space screen, which does not support scaling at all.
        const { get } = await bootApp(`
            <pc-entity name="screen">
                <pc-screen screen-space scale-mode="blend" scale-blend="1"></pc-screen>
            </pc-entity>
        `);

        const screen = get<HTMLElement & { component: { scaleMode: string; scaleBlend: number } }>('pc-screen');

        expect(screen.component.scaleMode).toBe(SCALEMODE_BLEND);
        expect(screen.component.scaleBlend, 'scale-blend is what scale-mode="blend" weights').toBe(1);
    });

    it('defaults both enums to the engine default when the attribute is absent', async () => {
        const { get } = await bootApp(`
            <pc-entity name="both">
                <pc-camera></pc-camera>
                <pc-screen screen-space></pc-screen>
            </pc-entity>
        `);

        const camera = get<HTMLElement & { component: { projection: number } }>('pc-camera');
        const screen = get<HTMLElement & { component: { scaleMode: string } }>('pc-screen');

        expect(camera.component.projection).toBe(PROJECTION_PERSPECTIVE);
        expect(screen.component.scaleMode).toBe(SCALEMODE_NONE);
    });

    it('applies a change written after the component exists', async () => {
        const { get } = await bootApp(`
            <pc-entity name="both">
                <pc-camera></pc-camera>
                <pc-screen screen-space></pc-screen>
            </pc-entity>
        `);

        const camera = get<HTMLElement & { component: { projection: number } }>('pc-camera');
        const screen = get<HTMLElement & { component: { scaleMode: string } }>('pc-screen');

        camera.setAttribute('projection', 'orthographic');
        screen.setAttribute('scale-mode', 'blend');

        expect(camera.component.projection).toBe(PROJECTION_ORTHOGRAPHIC);
        expect(screen.component.scaleMode).toBe(SCALEMODE_BLEND);
    });

    it('survives an out-of-union value assigned before the component exists', async () => {
        // Assigned as a property rather than an attribute because parseEnum can never yield a
        // non-member, so untyped JS is the only way in. Camera is the component that punishes it:
        // its system applies a key that is present but undefined, and its projection setter does
        // not validate, so a bare map lookup reaches the engine as undefined.
        const camera = document.createElement('pc-camera') as HTMLElement & {
            projection: string;
            component: { projection: number };
        };
        (camera as unknown as Record<string, string>).projection = 'isometric';

        const { get } = await bootApp('<pc-entity name="camera"></pc-entity>');
        get('pc-entity').appendChild(camera);
        await (camera as unknown as { ready(): Promise<unknown> }).ready();

        expect(camera.component.projection).toBe(PROJECTION_PERSPECTIVE);
    });

    it('carries pc-sky[mip-level] through a real boot', async () => {
        const { get } = await bootApp('<pc-scene><pc-sky mip-level="3"></pc-sky></pc-scene>');

        // Only the element half is assertable here. <pc-sky> caches its scene inside _loadSkybox,
        // which returns early when no asset resolves, so a skybox-less sky never holds a scene to
        // write skyboxMip to. Staging one would mean loading a real texture and generating a cubemap
        // on the null device; the attribute itself is covered in the element tier.
        expect(get<HTMLElement & { mipLevel: number }>('pc-sky').mipLevel).toBe(3);
    });
});
