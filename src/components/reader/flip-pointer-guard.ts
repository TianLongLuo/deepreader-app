/** Keyboard selection is handled separately; pointer clicks are not selections. */
export function canFlipPointer(doc:Document){const selection=doc.defaultView?.getSelection();return !selection?.rangeCount||selection.isCollapsed;}
