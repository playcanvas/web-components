import { Color, Script, Texture, PIXELFORMAT_R8_G8_B8, FILTER_LINEAR_MIPMAP_LINEAR, FILTER_LINEAR, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';

export class VideoTexture extends Script {
    /**
     * URL to use if there is no video asset selected.
     * @type {string}
     * @attribute
     */
    url;

    /**
     * Material name to apply the video texture to.
     * @type {string}
     * @attribute
     */
    materialName;

    /**
     * The video element.
     * @type {HTMLVideoElement}
     */
    video;

    initialize() {
        // Create HTML Video Element to play the video
        const video = document.createElement('video');
        video.loop = true;

        // muted attribute is required for videos to autoplay
        video.muted = true;

        // critical for iOS or the video won't initially play, and will go fullscreen when playing
        video.playsInline = true;

        // needed because the video is being hosted on a different server url
        video.crossOrigin = "anonymous";

        // autoplay the video
        video.autoplay = true;

        // iOS video texture playback requires that you add the video to the DOMParser
        // with at least 1x1 as the video's dimensions
        const style = video.style;
        style.width = '1px';
        style.height = '1px';
        style.position = 'absolute';
        style.opacity = '0';
        style.zIndex = '-1000';
        style.pointerEvents = 'none';

        document.body.appendChild(video);

        // Create a texture to hold the video frame data            
        this.videoTexture = new Texture(this.app.graphicsDevice, {
            format: PIXELFORMAT_R8_G8_B8,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            mipmaps: true
        });

        video.addEventListener('canplaythrough', () => {
            const renderComponents = this.entity.findComponents('render');
            renderComponents.forEach(renderComponent => {
                renderComponent.meshInstances.forEach(meshInstance => {
                    const material = meshInstance.material;
                    if (material.name === this.materialName) {
                        material.emissiveMap = this.videoTexture;
                        material.emissive = Color.WHITE;
                        material.update();
                    }
                });
            });

            this.videoTexture.setSource(video);
            video.play();
        });

        // set video source
        video.src = this.url;
        video.load();

        this.video = video;
    }

    destroy() {
        this.videoTexture.destroy();
        this.video.remove();
    }

    update() {
        // Transfer the latest video frame to the video texture
        this.videoTexture.upload();
    }
}
