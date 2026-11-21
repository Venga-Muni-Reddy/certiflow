import { useState, useEffect, useRef } from 'react';

export interface SSEEventData {
  type: string;
  payload: any;
  timestamp: string;
}

export function useSSE(token: string | null, onEvent?: (event: SSEEventData) => void) {
  const [connected, setConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<SSEEventData | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    const sseUrl = `/api/v1/events/stream?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (e) => {
      try {
        const data: SSEEventData = JSON.parse(e.data);
        setLastEvent(data);
        if (onEventRef.current) {
          onEventRef.current(data);
        }
      } catch (err) {
        console.warn('Failed to parse SSE payload:', e.data);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects natively
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [token]);

  return { connected, lastEvent };
}
