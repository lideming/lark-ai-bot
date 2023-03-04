export function withTimeout<T>(base: Promise<T>, ms: number) {
  return new Promise<{ result: T | undefined; timedout: boolean }>(
    (resolve, reject) => {
      base.then((x) => resolve({ result: x, timedout: false }), reject);
      setTimeout(() => resolve({ result: undefined, timedout: true }), ms);
    },
  );
}
