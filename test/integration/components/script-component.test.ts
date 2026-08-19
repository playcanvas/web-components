import { Script } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { ScriptElement } from '../../../src/components/script';
import type { ScriptComponentElement } from '../../../src/components/script-component';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';
import { readyWithin } from '../../helpers/ready';

/**
 * The smallest valid glTF with one named node, per name, from a data: URI - no I/O.
 *
 * @param nodeName - The name of the glTF's single node.
 * @returns The data: URI.
 */
const containerSrc = (nodeName: string) => `data:application/json,${encodeURIComponent(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: nodeName }]
}))}`;

const ASSETS = `
    <pc-asset id="m" type="container" src="${containerSrc('content-root')}"></pc-asset>
    <pc-asset id="m2" type="container" src="${containerSrc('content-root-b')}"></pc-asset>
`;

/** A script with two declared-state channels: an attributes-JSON number and a per-property string. */
class Probe extends Script {
    static scriptName = 'probe';

    speed = 1;

    label = '';
}

/**
 * Boots an app with the two containers, registers the probe script, and inserts a pc-model
 * hosting a pc-scripts/pc-script pair at runtime - scripts must be registered before the script
 * element creates its instance.
 *
 * @returns The booted handle plus the model, scripts, script elements and the instance.
 */
const bootProbe = async () => {
    const handle = await bootApp(ASSETS);
    handle.app.scripts.add(Probe);

    const model = document.createElement('pc-model');
    model.setAttribute('asset', 'm');
    model.innerHTML = `
        <pc-scripts>
            <pc-script name="probe" attributes='{"speed": 5}' label="hi"></pc-script>
        </pc-scripts>
    `;
    handle.appElement.appendChild(model);

    const scriptsElement = model.querySelector<ScriptComponentElement>('pc-scripts')!;
    const scriptElement = model.querySelector<ScriptElement>('pc-script')!;
    await readyWithin(scriptElement);

    const script = scriptElement.script as Probe;
    return { ...handle, model, scriptsElement, scriptElement, script };
};

/**
 * A `pc-scripts` inside a `pc-model` attaches to the model's stable host entity, so a model
 * asset change cycles the element's readiness against a component - and script instances - that
 * survived it. The cycle must re-assert each element's declared state on the surviving instance
 * rather than re-create it (the engine rejects a duplicate create by returning null, silently in
 * production builds, which used to skip attribute application entirely).
 */
describe('<pc-scripts>', () => {
    const { uncaught, warnings } = useGuard();

    it('creates the script with both declared-state channels applied', async () => {
        const { model, script } = await bootProbe();

        expect(script, 'the instance exists').toBeTruthy();
        expect(script.entity, 'on the model host').toBe(model.entity);
        expect(script.speed, 'the attributes JSON applied').toBe(5);
        expect(script.label, 'the per-property attribute applied').toBe('hi');
        expect(script.enabled).toBe(true);
        expect(uncaught.seen).toEqual([]);
    });

    it('keeps the same instance across a model asset change', async () => {
        const { model, scriptElement, script } = await bootProbe();

        model.setAttribute('asset', 'm2');
        await readyWithin(model);

        expect(scriptElement.script, 'the instance survived the swap').toBe(script);
        expect(script.enabled, 'still enabled').toBe(true);
        expect(warnings.seen, 'and nothing warned about a duplicate create').toEqual([]);
    });

    it('re-asserts the declared state on the surviving instance', async () => {
        const { model, script } = await bootProbe();

        // A runtime mutation of a declared property is deliberately snapped back on the cycle:
        // the recreation path (a pc-node rebind) already yields exactly the declared state, so
        // the two cycle outcomes must not diverge.
        script.speed = 99;
        script.label = 'mutated';

        model.setAttribute('asset', 'm2');
        await readyWithin(model);

        expect(script.speed, 'the attributes JSON re-applied').toBe(5);
        expect(script.label, 'the per-property attribute re-applied').toBe('hi');
    });

    it('re-fires ready on pc-scripts but not on pc-script across the cycle', async () => {
        const { model, scriptsElement, scriptElement } = await bootProbe();

        let scriptsReady = 0;
        let scriptReady = 0;
        scriptsElement.addEventListener('ready', (event) => {
            if (event.target === scriptsElement) scriptsReady += 1;
            if (event.target === scriptElement) scriptReady += 1;
        });

        model.setAttribute('asset', 'm2');
        await readyWithin(model);

        // The pc-scripts element announces the cycle; the pc-script's instance survived, so its
        // own readiness - "an instance exists for this element" - never lapsed.
        expect(scriptsReady, 'pc-scripts re-announced').toBe(1);
        expect(scriptReady, 'pc-script did not').toBe(0);
        expect(uncaught.seen).toEqual([]);
    });
});
