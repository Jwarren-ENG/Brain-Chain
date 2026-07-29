// The assistant's customer-visible name. Branding is undecided ("Jarvis" is
// shorthand, not ownable) — every surface must read the name from here so the
// eventual rename is a one-line change.
export const ASSISTANT_NAME = "the brain";
export const PRODUCT_NAME = "BrainChain";
export const ASSISTANT_NAME_CAPITALIZED =
  ASSISTANT_NAME.length > 0 ? ASSISTANT_NAME[0].toUpperCase() + ASSISTANT_NAME.slice(1) : "";
