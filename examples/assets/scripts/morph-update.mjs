import { Script } from 'playcanvas';

export class MorphUpdate extends Script {
    initialize() {
        this.app.on('face:blendshapes', (categories) => {
            const renders = this.entity.findComponents('render');
            for (const render of renders) {
                for (const meshInstance of render.meshInstances) {
                    if (meshInstance.morphInstance) {
                        for (const category of categories) {
                            meshInstance.morphInstance.setWeight(category.categoryName, category.score);
                        }
                    }
                }
            }
        });
    }
}
