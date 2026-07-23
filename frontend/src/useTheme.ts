import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

const KEY = "branch.theme";

function stamp(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

function readPref(): ThemePref {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * Theme preference with an explicit override on top of the OS setting.
 *
 * The stamp goes on <html data-theme>, which the CSS scopes so an explicit
 * choice beats the media query in both directions. Applied synchronously on
 * first render so the app never flashes the wrong theme.
 */
export function useTheme(): {
  pref: ThemePref;
  isDark: boolean;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
} {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const p = readPref();
    stamp(p);
    return p;
  });

  const [isDark, setIsDark] = useState(
    () =>
      readPref() === "dark" ||
      (readPref() === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches),
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () =>
      setIsDark(pref === "dark" || (pref === "system" && mq.matches));
    resolve();
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    stamp(p);
    if (p === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
    setPrefState(p);
  }, []);

  const toggle = useCallback(
    () => setPref(isDark ? "light" : "dark"),
    [isDark, setPref],
  );

  return { pref, isDark, setPref, toggle };
}
