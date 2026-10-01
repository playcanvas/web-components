import { AssetRegistry, SoundSlot } from 'playcanvas';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssetElement } from '../../../src/asset';
import type { SoundSlotElement } from '../../../src/components/sound-slot';
import type { EntityElement } from '../../../src/entity';
import { bootApp } from '../../helpers/app';
import { useGuard } from '../../helpers/guard';

/** A lazy audio asset, so the boot does not wait on a load jsdom cannot complete. */
const ASSET = '<pc-asset id="clip" src="clip.mp3" lazy></pc-asset>';

const scene = (entityAttributes = '', slotAttributes = '') =>
    `${ASSET}<pc-scene><pc-entity name="speaker" ${entityAttributes}><pc-sound>` +
    `<pc-sound-slot name="music" asset="clip" ${slotAttributes}></pc-sound-slot>` +
    '</pc-sound></pc-entity></pc-scene>';

describe('<pc-sound-slot>', () => {
    useGuard();

    /**
     * The asset each play found on its slot. jsdom has no AudioContext, so the plays are recorded
     * rather than made, and the audio asset is never loaded.
     */
    let plays: (number | null)[];

    beforeEach(() => {
        plays = [];
        vi.spyOn(SoundSlot.prototype, 'play').mockImplementation(function (this: SoundSlot) {
            plays.push(this.asset);
            return undefined as never;
        });
        vi.spyOn(AssetRegistry.prototype, 'load').mockReturnValue(undefined);
    });

    describe('[auto-play]', () => {
        it('plays once, with its asset, when the slot is created', async () => {
            const { get } = await bootApp(scene('', 'auto-play'));
            const asset = get<AssetElement>('pc-asset').asset!;

            // The engine's autoPlay used to fire before the element assigned the asset - a play
            // with nothing to play, which the element followed with a second play of its own
            expect(plays).toEqual([asset.id]);
        });

        it('waits for its entity to be enabled before playing', async () => {
            const { get } = await bootApp(scene('enabled="false"', 'auto-play'));
            const asset = get<AssetElement>('pc-asset').asset!;

            expect(plays, 'nothing plays on a disabled entity').toEqual([]);

            get<EntityElement>('pc-entity').removeAttribute('enabled');
            expect(plays, 'enabling the entity starts it').toEqual([asset.id]);
        });

        it('assigns the asset without playing when off', async () => {
            const { get } = await bootApp(scene());
            const asset = get<AssetElement>('pc-asset').asset!;

            expect(plays).toEqual([]);
            expect(get<SoundSlotElement>('pc-sound-slot').soundSlot?.asset).toBe(asset.id);
        });
    });
});
