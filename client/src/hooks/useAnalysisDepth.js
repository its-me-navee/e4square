import { useCallback, useState } from 'react';
import { getStoredAnalysisDepth, storeAnalysisDepth } from '../utils/stockfish';

export function useAnalysisDepth() {
  const [depth, setDepthState] = useState(getStoredAnalysisDepth);

  const setDepth = useCallback((value) => {
    setDepthState(storeAnalysisDepth(value));
  }, []);

  return [depth, setDepth];
}
