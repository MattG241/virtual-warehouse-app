// In-process pub/sub for server-sent events. Single Node instance only (which
// is fine for Railway). For horizontal scaling we'd swap this for Redis pub/sub
// or Postgres LISTEN/NOTIFY.

const subscribers = new Set();

export function subscribe(res) {
  subscribers.add(res);
  res.on('close', () => subscribers.delete(res));
  return () => subscribers.delete(res);
}

export function publish(eventName, payload) {
  const data = JSON.stringify(payload || {});
  const message = `event: ${eventName}\ndata: ${data}\n\n`;
  for (const res of subscribers) {
    try {
      res.write(message);
    } catch (_) {
      subscribers.delete(res);
    }
  }
}

export function attachSseRoute(app) {
  app.get('/api/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(`event: connected\ndata: {"ok":true}\n\n`);

    const unsubscribe = subscribe(res);

    // Heartbeat every 25 s so proxies don't close the idle connection.
    const heartbeat = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${Date.now()}\n\n`);
      } catch (_) {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
