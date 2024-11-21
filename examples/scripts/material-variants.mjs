document.addEventListener('DOMContentLoaded', async () => {
    const entityElement = await document.querySelector('pc-entity[name="shoe"]').ready();
    const assetElement = document.querySelector('pc-asset#shoe');

    if (entityElement && assetElement) {
        const resource = assetElement.asset.resource;
        const variants = resource.getMaterialVariants();

        // create container for buttons
        const buttonContainer = document.createElement('div');
        Object.assign(buttonContainer.style, {
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            right: 'max(16px, env(safe-area-inset-right))',
            display: 'flex',
            gap: '8px'
        });

        // create a button for each variant
        variants.forEach(variant => {
            const button = document.createElement('button');
            button.textContent = variant.split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            
            Object.assign(button.style, {
                display: 'flex',
                position: 'relative',
                height: '40px',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid #ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 16px',
                margin: '0',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'background-color 0.2s',
                color: '#2c3e50',
                fontFamily: 'sans-serif'
            });

            button.onmouseenter = () => button.style.background = 'rgba(255, 255, 255, 1)';
            button.onmouseleave = () => button.style.background = 'rgba(255, 255, 255, 0.9)';
            
            button.addEventListener('click', () => {
                resource.applyMaterialVariant(entityElement.entity, variant);
            });
            
            buttonContainer.appendChild(button);
        });

        document.body.appendChild(buttonContainer);
    }
});
