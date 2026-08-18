import React from "react";

export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

/** Forwards Enter/Space to a native click, reusing whatever onClick is
 * already attached to the element instead of duplicating its logic.
 * Stops propagation so activating a control doesn't also trigger unrelated
 * global keyboard shortcuts (e.g. the grid's own Enter/Space handling). */
export function activateOnEnterOrSpace<T extends HTMLElement = HTMLElement>(
  e: React.KeyboardEvent<T>
): void {
  if (!isActivationKey(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  e.currentTarget.click();
}

export function onActivationKeyDown<T extends HTMLElement = HTMLElement>(
  disabled?: boolean
): (e: React.KeyboardEvent<T>) => void {
  return (e) => {
    if (disabled) return;
    activateOnEnterOrSpace(e);
  };
}
