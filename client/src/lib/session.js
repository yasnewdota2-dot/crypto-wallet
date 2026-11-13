// Hands the unlocked wallet from onboarding to the wallet page without touching
// storage. Lives in memory only and is cleared on read, lock, or page reload.
let held = null;
export const stash = (v) => { held = v; };
export const take = () => { const v = held; held = null; return v; };
