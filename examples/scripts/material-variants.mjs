document.addEventListener('DOMContentLoaded', async () => {
    const entityElement = await document.querySelector('pc-entity[name="shoe"]').ready();
    const assetElement = document.querySelector('pc-asset#shoe');

    if (entityElement && assetElement) {
        const resource = assetElement.asset.resource;
        const variants = resource.getMaterialVariants();

        // create container for buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.position = 'absolute';
        buttonContainer.style.bottom = '20px';
        buttonContainer.style.left = '50%';
        buttonContainer.style.transform = 'translateX(-50%)';
        document.body.appendChild(buttonContainer);

        // create a button for each variant
        variants.forEach(variant => {
            const button = document.createElement('button');
            button.textContent = variant;
            button.addEventListener('click', () => {
                resource.applyMaterialVariant(entityElement.entity, variant);
            });
            buttonContainer.appendChild(button);
        });
    }
});
