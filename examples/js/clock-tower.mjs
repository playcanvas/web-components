/**
 * Page glue for clock-tower.html: the panel that sets the clock.
 *
 * The slider is the time of day on the dial, in minutes. Dragging it hands the time to the
 * towerClock script, which turns the hands there - and since towerDaylight lights the room for the
 * time the hands show, the sun moves with them. The slider shows the time the hands are headed
 * for, so it stays where it was put while they get there; the readout shows the time they show,
 * and runs through the hours on the way.
 */
import { whenReady } from '@playcanvas/web-components';

const readout = document.getElementById('time-readout');
const status = document.getElementById('time-status');
const slider = document.getElementById('time-slider');
const localTime = document.getElementById('local-time');
const soundToggle = document.getElementById('sound-toggle');

// The clock's time is seconds since midnight: format it as a UTC date so no timezone shifts it,
// in the reader's own style - 12 or 24 hour, with the day period where their locale puts it
const format = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: 'UTC' });

for (const label of document.querySelectorAll('.time-scale span')) {
    label.textContent = hourFormat.format(Number(label.dataset.hour) * 3600000);
}

/**
 * Shows a time of day in the readout, its day period (AM or PM) in a smaller span of its own.
 *
 * @param {number} minute - Minutes since midnight.
 */
const showTime = (minute) => {
    const parts = format.formatToParts(minute * 60000)
    .filter(part => part.type !== 'literal' || part.value.trim() !== '')
    .map((part) => {
        if (part.type !== 'dayPeriod') {
            return part.value;
        }
        const period = document.createElement('span');
        period.className = 'time-period';
        period.textContent = part.value;
        return period;
    });
    readout.replaceChildren(...parts);
};

const { app } = await whenReady('pc-app');
const { script: clock } = await whenReady('pc-script-instance[name="towerClock"]');

let dragging = false;

slider.addEventListener('input', () => {
    dragging = true;
    // straight along the day, the way the track reads, not the shorter way round the dial
    clock.setTime(slider.valueAsNumber * 60, false);
});
slider.addEventListener('change', () => {
    dragging = false;
});

localTime.addEventListener('click', () => clock.keepLocalTime());

soundToggle.addEventListener('click', () => {
    const on = soundToggle.getAttribute('aria-pressed') !== 'true';
    soundToggle.setAttribute('aria-pressed', String(on));
    app.systems.sound.volume = on ? 1 : 0;
});

let shownMinute = -1;
let targetMinute = -1;
let keepingLocalTime = null;
app.on('update', () => {
    const minute = Math.floor(clock.time / 60);
    if (minute !== shownMinute) {
        shownMinute = minute;
        showTime(minute);
    }
    // Where the hands are going, not where they are on the way. Left alone while a drag is under
    // way, so the thumb never moves under the pointer.
    const target = Math.floor(clock.targetTime / 60);
    if (target !== targetMinute && !dragging) {
        targetMinute = target;
        slider.value = String(target);
        slider.setAttribute('aria-valuetext', format.format(target * 60000));
    }
    if (clock.keepingLocalTime !== keepingLocalTime) {
        keepingLocalTime = clock.keepingLocalTime;
        localTime.disabled = keepingLocalTime;
        status.textContent = keepingLocalTime ? 'Local time' : 'Set by hand';
        status.classList.toggle('set', !keepingLocalTime);
    }
});
