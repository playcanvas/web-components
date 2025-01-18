import { Script } from 'playcanvas';

export class StaticBody extends Script {
    initialize() {
        this.entity.findComponents('render').forEach((render) => {
            const entity = render.entity;
            entity.addComponent('rigidbody', {
                type: 'static'
            });
            entity.addComponent('collision', {
                type: 'mesh',
                renderAsset: render.asset
            });
        });
    }
}
