import { Material, Script, Vec2, Vec3, Vec4, Color, Quat } from 'playcanvas';
import { Tween, Easing } from '@tweenjs/tween.js';

/** @enum {enum} */
const EasingTypes = {
    In: 'In',
    Out: 'Out',
    InOut: 'InOut'
};

/** @enum {enum} */
const EasingFunctions = {
    Linear: 'Linear',
    Quadratic: 'Quadratic',
    Cubic: 'Cubic',
    Quartic: 'Quartic',
    Quintic: 'Quintic',
    Sinusoidal: 'Sinusoidal',
    Exponential: 'Exponential',
    Circular: 'Circular',
    Elastic: 'Elastic',
    Back: 'Back',
    Bounce: 'Bounce'
};

/** @interface */
class TweenDescriptor {
    /**
     * Path to the property to tween
     * @type {string}
     * @attribute
     */
    path;

    /**
     * Start value for the tween
     * @type {Vec4}
     * @attribute
     */
    start;

    /**
     * End value for the tween
     * @type {Vec4}
     * @attribute
     */
    end;

    /**
     * Duration of the tween in milliseconds
     * @type {number}
     * @attribute
     */
    duration;

    /**
     * Delay before starting the tween in milliseconds
     * @type {number}
     * @attribute
     */
    delay;

    /**
     * Number of times to repeat the tween
     * @type {number}
     * @attribute
     */
    repeat;

    /**
     * Delay between repeats in milliseconds
     * @type {number}
     * @attribute
     */
    repeatDelay;

    /**
     * Whether to reverse the tween on repeat
     * @type {boolean}
     * @attribute
     */
    yoyo;

    /**
     * Index of the easing function to use
     * @type {EasingFunctions}
     * @attribute
     */
    easingFunction = EasingFunctions.Linear;

    /**
     * Index of the easing type to use
     * @type {EasingTypes}
     * @attribute
     */
    easingType = EasingTypes.InOut;

    /**
     * Event to fire when tween starts
     * @type {string}
     * @attribute
     */
    startEvent;

    /**
     * Event to fire when tween stops
     * @type {string}
     * @attributes
     */
    stopEvent;

    /**
     * Event to fire when tween updates
     * @type {string}
     * @attribute
     */
    updateEvent;

    /**
     * Event to fire when tween completes
     * @type {string}
     * @attribute
     */
    completeEvent;

    /**
     * Event to fire when tween repeats
     * @type {string}
     * @attribute
     */
    repeatEvent;
}

export class Tweener extends Script {
    /**
     * Array of tween configurations
     * @type {TweenDescriptor[]}
     * @attribute
     */
    tweens = [];

    /**
     * Array of active tween instances
     * @type {Tween[]}
     */
    tweenInstances = [];

    getEasingFunction(tween) {
        if (tween.easingFunction === 'Linear') {
            return Easing.Linear.None;
        }
        return Easing[tween.easingFunction][tween.easingType];
    }

    createStartEndValues(property, start, end) {
        if (typeof property === 'number') {
            return [{ x: start.x }, { x: end.x }];
        }

        if (property instanceof Vec2) {
            return [new Vec2(start.x, start.y), new Vec2(end.x, end.y)];
        }

        if (property instanceof Vec3) {
            return [new Vec3(start.x, start.y, start.z), new Vec3(end.x, end.y, end.z)];
        }

        if (property instanceof Vec4) {
            return [start.clone(), end.clone()];
        }

        if (property instanceof Color) {
            return [
                new Color(start.x, start.y, start.z, start.w),
                new Color(end.x, end.y, end.z, end.w)
            ];
        }

        console.error('ERROR: tween - specified property must be a number, vec2, vec3, vec4 or color');
        return [null, null];
    }

    handleSpecialProperties(propertyName, propertyOwner, value) {
        switch (propertyName) {
            case 'localPosition':
                propertyOwner.setLocalPosition(value);
                break;
            case 'localEulerAngles':
                propertyOwner.setLocalEulerAngles(value);
                break;
            case 'localScale':
                propertyOwner.setLocalScale(value);
                break;
            case 'position':
                propertyOwner.setPosition(value);
                break;
            case 'eulerAngles':
                propertyOwner.setEulerAngles(value);
                break;
        }
        return null;
    }

    play(idx) {
        const tween = this.tweens[idx];
        if (!tween) return;

        // Stop any tweens that are animating the same property
        this.tweenInstances.forEach((existingTween, i) => {
            if (existingTween && this.tweens[i].path === tween.path) {
                this.stop(i);
            }
        });

        // Get property owner and name from path
        const pathSegments = tween.path.split('.');
        let propertyOwner = this.entity;
        for (let i = 0; i < pathSegments.length - 1; i++) {
            propertyOwner = propertyOwner[pathSegments[i]];
        }

        const propertyName = pathSegments[pathSegments.length - 1];
        const property = propertyOwner[propertyName];
        const isNumber = typeof property === 'number';

        // Create start and end values
        let [startValue, endValue] = this.createStartEndValues(property, tween.start, tween.end);
        if (!startValue) return;

        // Set initial value
        propertyOwner[propertyName] = isNumber ? startValue.x : startValue;

        // Handle special properties
        const specialValues = this.handleSpecialProperties(propertyName, propertyOwner, startValue);
        if (specialValues) {
            [startValue, endValue] = specialValues;
        }

        // Update material if needed
        if (propertyOwner instanceof Material) {
            propertyOwner.update();
        }

        // Create and start the tween
        this.tweenInstances[idx] = new Tween(startValue)
            .to(endValue, tween.duration)
            .easing(this.getEasingFunction(tween))
            .onStart(() => {
                if (tween.startEvent) {
                    this.app.fire(tween.startEvent);
                }
            })
            .onStop(() => {
                if (tween.stopEvent) {
                    this.app.fire(tween.stopEvent);
                }
                this.tweenInstances[idx] = null;
            })
            .onUpdate((obj) => {
                propertyOwner[propertyName] = isNumber ? obj.x : obj;
                this.handleSpecialProperties(propertyName, propertyOwner, obj);

                if (propertyOwner instanceof Material) {
                    propertyOwner.update();
                }

                if (tween.updateEvent) {
                    this.app.fire(tween.updateEvent);
                }
            })
            .onComplete(() => {
                if (tween.completeEvent) {
                    this.app.fire(tween.completeEvent);
                }
                this.tweenInstances[idx] = null;
            })
            .onRepeat(() => {
                if (tween.repeatEvent) {
                    this.app.fire(tween.repeatEvent);
                }
            })
            .repeat(tween.repeat)
            .repeatDelay(tween.repeatDelay)
            .yoyo(tween.yoyo)
            .delay(tween.delay)
            .start();
    }

    stop(idx) {
        this.tweenInstances[idx]?.stop();
        this.tweenInstances[idx] = null;
    }

    update(dt) {
        this.tweenInstances.forEach(tween => {
            tween?.update();
        });
    }
}