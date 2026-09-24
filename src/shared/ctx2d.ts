/**
 * The 2D context every drawing path in the app accepts: the editor's on-screen
 * canvas and the export's offscreen one. Kept in shared so a drawing module
 * (the brand pack, for one) does not have to import the renderer for a type.
 */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
