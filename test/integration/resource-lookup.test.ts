import type { ParticleSystemComponent, StandardMaterial } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { AppElement } from '../../src/app';
import { AssetElement } from '../../src/asset';
import type { ComponentElement } from '../../src/components/component';
import type { RenderComponentElement } from '../../src/components/render-component';
import { MaterialElement } from '../../src/material';
import { settle } from '../helpers/app';
import { mount } from '../helpers/dom';
import { useGuard } from '../helpers/guard';
import { readyWithin } from '../helpers/ready';

/**
 * Where an element looks for the `<pc-asset>` or `<pc-material>` an id names: in its own
 * `<pc-app>` first, then in the tree it is in - the document, or a shadow root.
 *
 * Both lookups were once the document's alone. That left an application inside a shadow root
 * unable to resolve anything, because the document cannot see into one, and it gave the second of
 * two applications that used the same id the first one's material and asset.
 */

const jsonSrc = (config: Record<string, unknown>) =>
    `data:application/json,${encodeURIComponent(JSON.stringify(config))}`;

/**
 * An application whose render names a material and whose particle system names a config asset.
 *
 * @param resources - The assets and materials it declares.
 * @param ids - The ids its render and its particle system name.
 * @param ids.material - The material id.
 * @param ids.asset - The asset id.
 * @returns The markup.
 */
const app = (resources: string, ids = { material: 'paint', asset: 'config' }) => `
    <pc-app backend="null">
        ${resources}
        <pc-entity name="box">
            <pc-render type="box" material="${ids.material}"></pc-render>
        </pc-entity>
        <pc-entity name="emitter">
            <pc-particle-system asset="${ids.asset}"></pc-particle-system>
        </pc-entity>
    </pc-app>`;

const RED = '<pc-material id="paint" diffuse="1 0 0"></pc-material>';
const GREEN = '<pc-material id="paint" diffuse="0 1 0"></pc-material>';
const SEVEN = `<pc-asset id="config" type="json" src="${jsonSrc({ numParticles: 7 })}"></pc-asset>`;
const NINE = `<pc-asset id="config" type="json" src="${jsonSrc({ numParticles: 9 })}"></pc-asset>`;

/** The diffuse color of the material on an application's box, as `r g b`. */
const paintOf = (appElement: Element) => {
    const render = appElement.querySelector('pc-render') as RenderComponentElement;
    const material = render.component?.meshInstances[0]?.material as StandardMaterial | undefined;
    return material ? `${material.diffuse.r} ${material.diffuse.g} ${material.diffuse.b}` : 'no material';
};

/** The particle count an application's emitter was configured with. */
const particlesOf = (appElement: Element) => {
    const particles = appElement.querySelector('pc-particle-system') as ComponentElement<ParticleSystemComponent>;
    return particles.component?.numParticles;
};

/**
 * Waits for every application under a root, and everything in them, to be ready.
 *
 * @param root - The document fragment or element the applications are in.
 * @returns The application elements, in tree order.
 */
const ready = async (root: ParentNode) => {
    const apps = Array.from(root.querySelectorAll<AppElement>('pc-app'));
    for (const appElement of apps) {
        await readyWithin(appElement);
    }
    await settle(root);
    return apps;
};

describe('asset and material ids', () => {
    useGuard();

    describe('in one application', () => {
        it('resolve as they always have', async () => {
            const { container } = mount(app(RED + SEVEN));
            const [only] = await ready(container);

            expect(paintOf(only)).toBe('1 0 0');
            expect(particlesOf(only)).toBe(7);
        });
    });

    describe('in an application inside a shadow root', () => {
        const mountInShadowRoot = (html: string) => {
            const { container } = mount('<div></div>');
            const shadow = (container.firstElementChild as HTMLElement).attachShadow({ mode: 'open' });
            shadow.innerHTML = html;
            return shadow;
        };

        it('resolve, though the document cannot see them', async () => {
            const shadow = mountInShadowRoot(app(RED + SEVEN));
            const [inside] = await ready(shadow);

            expect(document.getElementById('paint'), 'the document should not see into the shadow root').toBeNull();
            expect(paintOf(inside)).toBe('1 0 0');
            expect(particlesOf(inside)).toBe(7);
        });

        it('resolve to another application’s in the same shadow root when its own declares none', async () => {
            // The test above never leaves the application, whose own children have the ids. Here
            // the second application has none, so they are looked for in the tree it is in, and
            // that has to be the shadow root: looking in the document would find nothing
            const shadow = mountInShadowRoot(app(RED + SEVEN) + app(''));
            const [first, second] = await ready(shadow);

            expect(document.getElementById('paint'), 'the document should not see into the shadow root').toBeNull();
            expect(paintOf(second)).toBe('1 0 0');
            expect(particlesOf(second)).toBe(7);

            const from = second.querySelector('pc-render') as Element;
            expect(MaterialElement.get('paint', from)).toBe(
                (first.querySelector('pc-material') as MaterialElement).material
            );
            expect(AssetElement.get('config', from)).toBe((first.querySelector('pc-asset') as AssetElement).asset);
        });
    });

    describe('in two applications that use the same ones', () => {
        it('resolve to each application’s own material and asset', async () => {
            const { container } = mount(app(RED + SEVEN) + app(GREEN + NINE));
            const [first, second] = await ready(container);

            expect(paintOf(first)).toBe('1 0 0');
            expect(particlesOf(first)).toBe(7);

            // Both were the first application's: a material and an asset of another application,
            // which has a graphics device and an asset registry of its own
            expect(paintOf(second)).toBe('0 1 0');
            expect(particlesOf(second)).toBe(9);
        });

        it('still resolve to another application’s when its own declares none', async () => {
            // What two applications in one document could already do, and can still: an id is
            // looked for in the rest of the document once the element's own application lacks it
            const { container } = mount(app(RED + SEVEN) + app(''));
            const [, second] = await ready(container);

            expect(paintOf(second)).toBe('1 0 0');
            expect(particlesOf(second)).toBe(7);
        });
    });

    describe('that another kind of element has as well', () => {
        it('resolve to the material and the asset, not to whichever element has the id first', async () => {
            const { container } = mount(`<p id="paint"></p><p id="config"></p>${app('')}${app(RED + SEVEN)}`);
            const [first] = await ready(container);

            expect(paintOf(first)).toBe('1 0 0');
            expect(particlesOf(first)).toBe(7);
        });
    });

    describe('looked up through the static get methods', () => {
        it('are found in the document when no element is given', async () => {
            const { container } = mount(app(RED + SEVEN) + app(GREEN + NINE));
            const [first] = await ready(container);

            expect(MaterialElement.get('paint')).toBe((first.querySelector('pc-material') as MaterialElement).material);
            expect(AssetElement.get('config')).toBe((first.querySelector('pc-asset') as AssetElement).asset);
        });

        it('are found in the application of the element given', async () => {
            const { container } = mount(app(RED + SEVEN) + app(GREEN + NINE));
            const [, second] = await ready(container);
            const from = second.querySelector('pc-render') as Element;

            expect(MaterialElement.get('paint', from)).toBe(
                (second.querySelector('pc-material') as MaterialElement).material
            );
            expect(AssetElement.get('config', from)).toBe((second.querySelector('pc-asset') as AssetElement).asset);
        });

        it('are not found when nothing has the id', async () => {
            const { container } = mount(app(RED + SEVEN));
            const [only] = await ready(container);

            expect(MaterialElement.get('varnish', only)).toBeUndefined();
            expect(AssetElement.get('varnish', only)).toBeUndefined();
            expect(MaterialElement.get('')).toBeUndefined();
        });

        it('take an id that is not a valid selector in their stride', async () => {
            const { container } = mount(app(RED + SEVEN));
            await ready(container);

            // The material lookup built a selector from the id, which a quote made a syntax error
            expect(MaterialElement.get('say "paint"')).toBeUndefined();
        });
    });
});
