import { Script } from 'playcanvas';

const jointIds = [
    'wrist',
    'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
    'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
    'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
    'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
    'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'
];

export default class Vr extends Script {
    controllers = new Map();

    initialize() {
        this.app.on('vr:start', (space) => {
            this.entity.camera.startXr('immersive-vr', space);
        });

        this.app.on('vr:end', () => {
            this.entity.camera.endXr();
        });

        this.app.xr.input.on('add', async (inputSource) => {
            if (!inputSource.profiles?.length) {
                console.warn('No profiles available for input source');
                return;
            }

            // Try each profile in order until one works
            const basePath = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets/dist/profiles';
            
            for (const profileId of inputSource.profiles) {
                const profileUrl = `${basePath}/${profileId}/profile.json`;

                try {
                    // Fetch the profile
                    const response = await fetch(profileUrl);
                    if (!response.ok) {
                        console.warn(`Profile ${profileId} not found, trying next...`);
                        continue;
                    }
                    
                    const profile = await response.json();
                    const layoutPath = profile.layouts[inputSource.handedness]?.assetPath || '';
                    const assetPath = `${basePath}/${profile.profileId}/${inputSource.handedness}${layoutPath.replace(/^\/?(left|right)/, '')}`;

                    // Try to load the model
                    try {
                        const asset = await new Promise((resolve, reject) => {
                            this.app.assets.loadFromUrl(assetPath, 'container', (err, asset) => {
                                if (err) reject(err);
                                else resolve(asset);
                            });
                        });

                        const container = asset.resource;
                        const entity = container.instantiateRenderEntity();
                        this.app.root.addChild(entity);

                        const jointMap = new Map();
                        if (inputSource.hand) {
                            for (const jointId of jointIds) {
                                const joint = inputSource.hand.getJointById(jointId);
                                const jointEntity = entity.findByName(jointId);
                                if (joint && jointEntity) {
                                    jointMap.set(joint, jointEntity);
                                } else {
                                    console.warn(`Missing ${jointEntity ? 'joint' : 'entity'} for ${jointId}`);
                                }
                            }
                        }

                        this.controllers.set(inputSource, { entity, jointMap });
                        return;

                    } catch (error) {
                        console.warn(`Failed to load model for profile ${profileId}, trying next...`);
                        continue;
                    }

                } catch (error) {
                    console.warn(`Failed to fetch profile ${profileId}, trying next...`);
                    continue;
                }
            }

            // If we get here, none of the profiles worked
            console.warn('No compatible profiles found');
        });

        this.app.xr.input.on('remove', (inputSource) => {
            const controller = this.controllers.get(inputSource);
            if (controller) {
                controller.entity.destroy();
                this.controllers.delete(inputSource);
            }
        });
    }

    update(dt) {
        if (this.app.xr.active) {
            for (const [inputSource, { entity, jointMap }] of this.controllers) {
                if (inputSource.hand) {
                    for (const [joint, jointEntity] of jointMap) {
                        jointEntity.setPosition(joint.getPosition());
                        jointEntity.setRotation(joint.getRotation());
                    }
                } else {
                    entity.setPosition(inputSource.getPosition());
                    entity.setRotation(inputSource.getRotation());
                }
            }
        }
    }
}
