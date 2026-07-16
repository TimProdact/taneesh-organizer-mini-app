import { useCallback, useState } from 'react';

export function useNavStack(initial = { id: 'hub', params: {} }) {
  const [stack, setStack] = useState([initial]);

  const current = stack[stack.length - 1];
  const depth = stack.length;

  const push = useCallback((id, params = {}) => {
    setStack(s => [...s, { id, params }]);
  }, []);

  const pop = useCallback(() => {
    setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const reset = useCallback((id = 'hub', params = {}) => {
    setStack([{ id, params }]);
  }, []);

  return { stack, current, depth, push, pop, reset };
}
