import { Script } from 'playcanvas';

/**
 * Drifts an entity upward at a constant rate, for a Star Wars style title crawl. Unrelated to
 * `scrollView`, which is the UI element that scrolls its content within a viewport.
 */
export class TextCrawl extends Script {
    static scriptName = 'textCrawl';

    update(dt) {
        this.entity.translateLocal(0, dt * 0.5, 0);
    }
}
