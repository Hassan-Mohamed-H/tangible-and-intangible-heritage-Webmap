export function debounce(fn, wait = 220) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function scheduleFrame(fn) {
  let rafId = 0;
  return (...args) => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      fn(...args);
    });
  };
}

export function createBatchProcessor(batchSize = 250) {
  return function process(items, handler, onDone) {
    let index = 0;
    function step() {
      const end = Math.min(index + batchSize, items.length);
      for (let i = index; i < end; i += 1) handler(items[i], i);
      index = end;
      if (index < items.length) {
        window.requestAnimationFrame(step);
      } else if (typeof onDone === "function") {
        onDone();
      }
    }
    step();
  };
}
