import { Script } from 'playcanvas';
import { describe, expect, it } from 'vitest';

import type { ScriptComponentElement } from '../../../src/components/script-component';
import type { ScriptInstanceElement } from '../../../src/components/script-instance';
import type { EntityElement } from '../../../src/entity';
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

/**
 * A script with two declared-state channels - an attributes-JSON number and a per-property
 * string - plus an untyped target for reference conversions (a per-property string takes its
 * value verbatim, so `entity:` references arrive through the attributes JSON).
 */
class Probe extends Script {
    static scriptName = 'probe';

    speed = 1;

    label = '';

    target: unknown = null;
}

/**
 * Boots an app with the two containers, registers the probe script, and inserts a pc-model
 * hosting a pc-script/pc-script-instance pair at runtime - scripts must be registered before the script
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
        <pc-script>
            <pc-script-instance name="probe" attributes='{"speed": 5}' label="hi"></pc-script-instance>
        </pc-script>
    `;
    handle.appElement.appendChild(model);

    const scriptsElement = model.querySelector<ScriptComponentElement>('pc-script')!;
    const scriptElement = model.querySelector<ScriptInstanceElement>('pc-script-instance')!;
    await readyWithin(scriptElement);

    const script = scriptElement.script as Probe;
    return { ...handle, model, scriptsElement, scriptElement, script };
};

/**
 * A `pc-script` inside a `pc-model` attaches to the model's stable host entity, so a model
 * asset change cycles the element's readiness against a component - and script instances - that
 * survived it. The cycle must re-assert each element's declared state on the surviving instance
 * rather than re-create it (the engine rejects a duplicate create by returning null, silently in
 * production builds, which used to skip attribute application entirely).
 */
describe('<pc-script>', () => {
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

    it('re-fires ready on pc-script but not on pc-script-instance across the cycle', async () => {
        const { model, scriptsElement, scriptElement } = await bootProbe();

        let scriptsReady = 0;
        let scriptReady = 0;
        scriptsElement.addEventListener('ready', (event) => {
            if (event.target === scriptsElement) scriptsReady += 1;
            if (event.target === scriptElement) scriptReady += 1;
        });

        model.setAttribute('asset', 'm2');
        await readyWithin(model);

        // The pc-script element announces the cycle; the pc-script-instance's instance survived, so its
        // own readiness - "an instance exists for this element" - never lapsed.
        expect(scriptsReady, 'pc-script re-announced').toBe(1);
        expect(scriptReady, 'pc-script-instance did not').toBe(0);
        expect(uncaught.seen).toEqual([]);
    });

    describe('entity: references', () => {
        /**
         * Boots an app with the probe registered and its target carrying an `entity:` reference
         * through the attributes JSON, plus any extra markup the reference may target. Inserted
         * at runtime like bootProbe, because the probe must be registered before the script
         * element creates its instance.
         *
         * @param reference - The `entity:`-prefixed target value.
         * @param extra - Markup for the reference to target.
         * @returns The booted handle plus the script instance.
         */
        const bootReference = async (reference: string, extra = '') => {
            const handle = await bootApp(extra);
            handle.app.scripts.add(Probe);

            const host = document.createElement('pc-entity');
            host.innerHTML = `<pc-script><pc-script-instance name="probe" attributes='{"target": "${reference}"}'></pc-script-instance></pc-script>`;
            handle.appElement.appendChild(host);

            const scriptElement = host.querySelector<ScriptInstanceElement>('pc-script-instance')!;
            await readyWithin(scriptElement);
            return { ...handle, script: scriptElement.script as Probe };
        };

        it('resolves an entity: reference to the live entity', async () => {
            const { app, script } = await bootReference(
                'entity:target-id',
                '<pc-entity id="target-id" name="target"></pc-entity>'
            );

            expect(script.target).toBe(app.root.findByName('target'));
        });

        it('resolves an entity: reference against the enclosing scope first', async () => {
            // A same-named decoy earlier in the document: the reference must resolve to the
            // host's own child, the rule that lets a cloned template's script attributes point at
            // sibling entities. Bespoke setup, because the host subtree carries the target.
            const handle = await bootApp('<pc-entity name="target"></pc-entity>');
            handle.app.scripts.add(Probe);
            const decoy = handle.get<EntityElement>('pc-entity[name="target"]');

            const host = document.createElement('pc-entity');
            host.innerHTML = `
                <pc-entity name="target"></pc-entity>
                <pc-script>
                    <pc-script-instance name="probe" attributes='{"target": "entity:target"}'></pc-script-instance>
                </pc-script>
            `;
            handle.appElement.appendChild(host);

            const scriptElement = host.querySelector<ScriptInstanceElement>('pc-script-instance')!;
            await readyWithin(scriptElement);
            const script = scriptElement.script as Probe;

            expect(script.target).toBe(host.querySelector<EntityElement>('pc-entity')!.entity);
            expect(script.target).not.toBe(decoy.entity);
        });

        it('warns and keeps the raw value when nothing matches the reference', async () => {
            const { script } = await bootReference('entity:#nope');

            warnings.expect("Unable to resolve 'entity:#nope' in script attributes - nothing in the document matches it");
            expect(script.target).toBe('entity:#nope');
        });

        it('warns with the wrong-target cause when the match cannot back an entity', async () => {
            const { script } = await bootReference('entity:#plain', '<div id="plain"></div>');

            warnings.expect(
                "Unable to resolve 'entity:#plain' in script attributes - <div> matches it but cannot back an entity."
            );
            expect(script.target).toBe('entity:#plain');
        });
    });
});
