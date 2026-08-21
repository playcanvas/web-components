// Hand-written declarations so the TypeScript test suite can import the golden lists that
// validate.mjs uses. `allowJs` is deliberately off in tsconfig.test.json: enabling it alongside
// the inherited `declaration: true` raises TS5053.
export declare const TAGS: string[];
export declare const ENTITY_TAGS: string[];
export declare const COMPONENT_TAGS: string[];
export declare const READY_TAGS: string[];
export declare const componentTagId: (tag: string) => string;
