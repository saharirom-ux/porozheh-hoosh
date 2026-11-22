// A small stack navigator.
//
// The app deliberately avoids react-navigation: it would pull in
// react-native-screens and safe-area-context, which need a native rebuild.
// This is a plain React stack — push, pop, replace — which is all the
// screens actually use.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

const NavContext = createContext(null);

export const useNav = () => useContext(NavContext);

export function NavProvider({ initial, screens, children }) {
  const [stack, setStack] = useState([initial]);

  const nav = useMemo(
    () => ({
      push: (route) => setStack((s) => [...s, route]),
      replace: (route) => setStack((s) => [...s.slice(0, -1), route]),
      pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      reset: (route) => setStack([route]),
    }),
    [],
  );

  // The Android hardware back button pops the stack, but only while there is
  // something to pop — at the root it must fall through to the OS.
  const depth = stack.length;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (depth <= 1) return false;
      nav.pop();
      return true;
    });
    return () => sub.remove();
  }, [depth, nav]);

  const route = stack[stack.length - 1];
  const Screen = screens[route.name];

  const value = useMemo(() => ({ nav, stack, route }), [nav, stack, route]);

  return (
    <NavContext.Provider value={value}>
      {Screen ? <Screen {...route} nav={nav} /> : null}
      {children}
    </NavContext.Provider>
  );
}

/** Convenience hook for screens that only need to push a new route. */
export function usePush() {
  const { nav } = useNav();
  return useCallback((route) => nav.push(route), [nav]);
}
