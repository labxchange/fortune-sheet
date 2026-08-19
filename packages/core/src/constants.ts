/**
 * Class name of the grid root element, rendered by react's `SheetOverlay`.
 *
 * Core's keyboard scoping decides whether a key belongs to the grid by looking
 * for this class on the event target's ancestors, so it is shared rather than
 * repeated: renaming it on the react side alone would switch the grid's whole
 * keyboard handling off silently, with no thrown error and no failing lookup.
 */
export const GRID_ROOT_CLASS = "fortune-sheet-overlay";
