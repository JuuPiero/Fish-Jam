/** Minimal 'cc' for node tests of the runtime hooks (only what they touch). */
export const director: any = {
    root: null,
    scene: null,
    getScene() {
        return this.scene;
    },
};
export class Node {}
