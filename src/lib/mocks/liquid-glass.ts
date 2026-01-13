// Wrapper for tauri-plugin-liquid-glass-api
// Uses Function constructor to avoid Vite's static analysis of dynamic imports

type LiquidGlassModule = {
  setLiquidGlassEffect: (options: { cornerRadius?: number }) => Promise<void>;
  isGlassSupported: () => Promise<boolean>;
};

let realModule: LiquidGlassModule | null = null;
let loadAttempted = false;

async function loadRealModule(): Promise<LiquidGlassModule | null> {
  if (loadAttempted) return realModule;
  loadAttempted = true;

  if (typeof window === 'undefined') return null;

  try {
    // Use Function constructor to create dynamic import that Vite won't analyze
    const moduleName = 'tauri-plugin-liquid-glass-api';
    const importFn = new Function('m', 'return import(m)');
    realModule = await importFn(moduleName);
  } catch {
    realModule = null;
  }
  return realModule;
}

export async function setLiquidGlassEffect(options: { cornerRadius?: number }): Promise<void> {
  const mod = await loadRealModule();
  if (mod) {
    return mod.setLiquidGlassEffect(options);
  }
}

export async function isGlassSupported(): Promise<boolean> {
  const mod = await loadRealModule();
  if (mod) {
    return mod.isGlassSupported();
  }
  return false;
}
