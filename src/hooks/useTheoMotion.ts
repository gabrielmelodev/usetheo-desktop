import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTheoReaction,
  type TheoEvent,
  type TheoMotion,
  type TheoReaction,
} from "../components/theo-motion-engine";
import { TheoState } from "src/components/TheoState";

interface TheoMotionState {
  state: TheoState;
  motion: TheoMotion;
  reacting: boolean;
}

export function useTheoMotion(initialState: TheoState = "idle") {
  const [motionState, setMotionState] = useState<TheoMotionState>({
    state: initialState,
    motion: "idle",
    reacting: false,
  });

  const timerRef = useRef<number | null>(null);

  const react = useCallback((event: TheoEvent) => {
    const reaction: TheoReaction = getTheoReaction(event);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    setMotionState({
      state: reaction.state,
      motion: reaction.motion,
      reacting: true,
    });

    timerRef.current = window.setTimeout(() => {
      setMotionState((current) => ({
        ...current,
        reacting: false,
        motion: "idle",
      }));

      timerRef.current = null;
    }, reaction.duration);
  }, []);

  const setState = useCallback((state: TheoState) => {
    setMotionState((current) => ({
      ...current,
      state,
    }));
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    ...motionState,
    react,
    setState,
  };
}
