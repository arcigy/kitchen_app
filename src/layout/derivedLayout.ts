import type { AppState } from "./appState";
const synchronizers=new WeakMap<AppState,()=>void>();
/** Derived geometry is captured in the same history transaction as its source edit. */
export function registerDerivedLayout(state:AppState,sync:()=>void){synchronizers.set(state,sync);}
export function synchronizeDerivedLayout(state:AppState){synchronizers.get(state)?.();}
