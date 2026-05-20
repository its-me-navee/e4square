import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

export const useGameNavigationBlocker = (when, onBlocked) => {
  const blockedKeyRef = useRef(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!when) return false;

    return (
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search ||
      currentLocation.hash !== nextLocation.hash
    );
  });

  useEffect(() => {
    if (blocker.state === 'blocked') {
      const key = blocker.location?.key || `${blocker.location?.pathname}${blocker.location?.search}${blocker.location?.hash}`;
      if (blockedKeyRef.current === key) return;
      blockedKeyRef.current = key;
      onBlocked(blocker);
      return;
    }

    blockedKeyRef.current = null;
  }, [blocker, onBlocked]);

  return blocker;
};
