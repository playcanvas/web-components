/**
 * The base class of every element in the library: the DOM's `HTMLElement`, or `Object` where there
 * is no DOM. Importing the library outside a browser - while a page is rendered on a server, say -
 * must not throw, and a class can only be defined there if its base class exists. The stand-in is
 * never constructed: each element registers itself with `globalThis.customElements?.define`, which
 * does nothing where there is no `customElements` registry, so no element is ever created there.
 *
 * Named `HTMLElement` so that the element classes still read, and are still typed and documented,
 * as extending the DOM's `HTMLElement`.
 */
const HTMLElement: typeof globalThis.HTMLElement =
    globalThis.HTMLElement ?? (Object as unknown as typeof globalThis.HTMLElement);

export { HTMLElement };
