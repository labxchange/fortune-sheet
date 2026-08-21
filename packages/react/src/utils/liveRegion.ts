/**
 * A live region is spoken when its text *changes*, so writing the same phrase
 * into it twice running is silent. That is a problem whenever a repeat is
 * meaningful: re-applying "check all" after a manual edit, inverting an evenly
 * split column, or leaving a filtered region and coming back to it all produce
 * the phrase that is already sitting in the region.
 *
 * A trailing zero-width space makes the text node differ without changing what
 * is spoken. It is preferred over the alternatives:
 *
 * - a trailing period is read out as "period" by users running punctuation
 *   verbosity at "all", and flipping it depends on knowing the string's
 *   terminator, which is wrong for a translation ending in `。` or `।`;
 * - a visible nonce ("... (2)") changes what is spoken;
 * - a `key` remount or a clear-then-set timer is unreliable across screen
 *   readers, and the timer needs cleanup on unmount.
 */
export const ZERO_WIDTH_SPACE = "\u200B";

/**
 * Same words, a different text node. Callers decide *when* a write is a repeat;
 * this only marks it as one.
 */
export const markAsRepeat = (message: string) =>
  `${message}${ZERO_WIDTH_SPACE}`;
