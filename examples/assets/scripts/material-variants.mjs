import { whenReady } from '@playcanvas/web-components';

const [entityElement, assetElement] = await Promise.all([
    whenReady('pc-entity[name="shoe"]'),
    whenReady('pc-asset#shoe')
]);

const resource = assetElement.asset.resource;
const variants = resource.getMaterialVariants();

// create container for buttons
const buttonContainer = document.createElement('div');
buttonContainer.classList.add('example-button-container', 'top-right');

// create a button for each variant
variants.forEach((variant) => {
    const button = document.createElement('button');
    button.textContent = variant.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

    button.classList.add('example-button');

    button.onmouseenter = () => {
        button.style.background = 'rgba(255, 255, 255, 1)';
    };

    button.onmouseleave = () => {
        button.style.background = 'rgba(255, 255, 255, 0.9)';
    };

    button.addEventListener('click', () => {
        resource.applyMaterialVariant(entityElement.entity, variant);
    });

    buttonContainer.appendChild(button);
});

document.body.appendChild(buttonContainer);
