import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  StorageUploadError,
  UPLOAD_CANCELLED_MESSAGE,
  UPLOAD_NETWORK_ERROR_MESSAGE,
  UPLOAD_NO_RESPONSE_MESSAGE,
  UPLOAD_STALLED_MESSAGE,
  describeFailedUploads,
  fileTooLargeMessage,
  formatUploadLimitMB,
  isFileTooLarge,
  isRetryableCommitError,
  isRetryableStorageStatus,
  isRetryableStorageUploadError,
  mergeUploadedFiles,
  putFileToStorage,
  resolveStorageResponseTimeoutMs,
  resolveUploadSizeLimit,
  runWithRetries,
  sleepUnlessAborted,
  uploadOneFile,
} from "./file-upload-policy";

const MIB = 1024 * 1024;

describe("upload size limit", () => {
  it("defaults to 10 MiB", () => {
    expect(MAX_UPLOAD_FILE_SIZE_BYTES).toBe(10 * MIB);
    expect(resolveUploadSizeLimit(undefined)).toEqual({ maxBytes: 10 * MIB, maxMB: 10 });
    expect(resolveUploadSizeLimit(null)).toEqual({ maxBytes: 10 * MIB, maxMB: 10 });
  });

  it("lets a smaller field max win", () => {
    expect(resolveUploadSizeLimit(5)).toEqual({ maxBytes: 5 * MIB, maxMB: 5 });
    expect(resolveUploadSizeLimit(2.5)).toEqual({
      maxBytes: Math.floor(2.5 * MIB),
      maxMB: 2.5,
    });
  });

  it("caps a larger (or equal) field max at 10 MiB", () => {
    expect(resolveUploadSizeLimit(50)).toEqual({ maxBytes: 10 * MIB, maxMB: 10 });
    expect(resolveUploadSizeLimit(10)).toEqual({ maxBytes: 10 * MIB, maxMB: 10 });
  });

  it("ignores invalid field maxima", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveUploadSizeLimit(value)).toEqual({ maxBytes: 10 * MIB, maxMB: 10 });
    }
  });

  it("flags files strictly over the limit", () => {
    const limit = resolveUploadSizeLimit(undefined);
    expect(isFileTooLarge(10 * MIB, limit)).toBe(false);
    expect(isFileTooLarge(10 * MIB + 1, limit)).toBe(true);
    expect(isFileTooLarge(12 * MIB, limit)).toBe(true);
  });

  it("words the message with the limit that applies", () => {
    expect(fileTooLargeMessage(resolveUploadSizeLimit(undefined))).toBe(
      "File too large (max 10 MB).",
    );
    expect(fileTooLargeMessage(resolveUploadSizeLimit(5))).toBe(
      "File too large (max 5 MB).",
    );
    expect(fileTooLargeMessage(resolveUploadSizeLimit(2.5))).toBe(
      "File too large (max 2.5 MB).",
    );
    expect(formatUploadLimitMB(resolveUploadSizeLimit(1 / 3))).toBe("0.33");
  });
});

describe("retry classification", () => {
  it("retries only transient storage statuses", () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504, 599]) {
      expect(isRetryableStorageStatus(status)).toBe(true);
    }
    for (const status of [200, 400, 403, 404, 411, 413]) {
      expect(isRetryableStorageStatus(status)).toBe(false);
    }
  });

  it("retries network, stall, response timeout and transient HTTP failures", () => {
    expect(isRetryableStorageUploadError(new StorageUploadError("network", "x"))).toBe(true);
    expect(isRetryableStorageUploadError(new StorageUploadError("stall", "x"))).toBe(true);
    expect(
      isRetryableStorageUploadError(new StorageUploadError("response-timeout", "x")),
    ).toBe(true);
    expect(isRetryableStorageUploadError(new StorageUploadError("http", "x", 503))).toBe(true);
    expect(isRetryableStorageUploadError(new StorageUploadError("http", "x", 429))).toBe(true);
  });

  it("does not retry other 4xx, cancellation or unknown errors", () => {
    expect(isRetryableStorageUploadError(new StorageUploadError("http", "x", 403))).toBe(false);
    expect(isRetryableStorageUploadError(new StorageUploadError("http", "x", 413))).toBe(false);
    expect(isRetryableStorageUploadError(new StorageUploadError("cancelled", "x"))).toBe(false);
    expect(isRetryableStorageUploadError(new Error("boom"))).toBe(false);
    expect(isRetryableStorageUploadError(undefined)).toBe(false);
  });

  it("retries a commit on a network TypeError or a 5xx only", () => {
    expect(isRetryableCommitError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableCommitError(Object.assign(new Error("x"), { status: 502 }))).toBe(true);
    expect(isRetryableCommitError(Object.assign(new Error("x"), { status: 500 }))).toBe(true);
    expect(isRetryableCommitError(Object.assign(new Error("x"), { status: 400 }))).toBe(false);
    expect(isRetryableCommitError(Object.assign(new Error("x"), { status: 403 }))).toBe(false);
    expect(isRetryableCommitError(new Error("x"))).toBe(false);
    const abort = new Error("The operation was aborted.");
    abort.name = "AbortError";
    expect(isRetryableCommitError(abort)).toBe(false);
  });

  it("gives storage at least 60 s to answer, more for large files", () => {
    expect(resolveStorageResponseTimeoutMs(700 * 1024)).toBe(60_000);
    expect(resolveStorageResponseTimeoutMs(0)).toBe(60_000);
    expect(resolveStorageResponseTimeoutMs(Number.NaN)).toBe(60_000);
    expect(resolveStorageResponseTimeoutMs(10 * MIB)).toBe(204_800);
  });
});

describe("runWithRetries", () => {
  function retryable(message = "transient") {
    return new StorageUploadError("network", message);
  }

  it("retries up to 3 attempts with a 1 s then 3 s backoff", async () => {
    const sleeps: number[] = [];
    const task = jest
      .fn<Promise<string>, [number]>()
      .mockRejectedValueOnce(retryable())
      .mockRejectedValueOnce(retryable())
      .mockResolvedValueOnce("ok");
    const onRetry = jest.fn();

    await expect(
      runWithRetries(task, {
        isRetryable: isRetryableStorageUploadError,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        onRetry,
      }),
    ).resolves.toBe("ok");
    expect(task.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2, 3]);
    expect(sleeps).toEqual([1000, 3000]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("gives up after the third attempt with the last error", async () => {
    const last = retryable("third");
    const task = jest
      .fn<Promise<void>, [number]>()
      .mockRejectedValueOnce(retryable())
      .mockRejectedValueOnce(retryable())
      .mockRejectedValueOnce(last);

    await expect(
      runWithRetries(task, {
        isRetryable: isRetryableStorageUploadError,
        sleep: async () => undefined,
      }),
    ).rejects.toBe(last);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error", async () => {
    const forbidden = new StorageUploadError("http", "Upload to storage failed (403).", 403);
    const task = jest.fn<Promise<void>, [number]>().mockRejectedValue(forbidden);
    const sleep = jest.fn(async () => undefined);

    await expect(
      runWithRetries(task, { isRetryable: isRetryableStorageUploadError, sleep }),
    ).rejects.toBe(forbidden);
    expect(task).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops retrying once cancelled, including during the backoff", async () => {
    jest.useFakeTimers();
    try {
      const controller = new AbortController();
      const task = jest.fn<Promise<void>, [number]>().mockRejectedValue(retryable());
      const run = runWithRetries(task, {
        isRetryable: isRetryableStorageUploadError,
        signal: controller.signal,
      });
      const settled = run.catch((error: unknown) => error);

      await Promise.resolve();
      await Promise.resolve();
      expect(task).toHaveBeenCalledTimes(1);
      controller.abort();
      jest.advanceTimersByTime(10_000);

      const error = await settled;
      expect(error).toBeInstanceOf(StorageUploadError);
      expect((error as StorageUploadError).failure).toBe("cancelled");
      expect(task).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not start when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const task = jest.fn<Promise<void>, [number]>();

    await expect(
      runWithRetries(task, {
        isRetryable: () => true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ failure: "cancelled" });
    expect(task).not.toHaveBeenCalled();
  });

  it("sleepUnlessAborted resolves after the delay", async () => {
    jest.useFakeTimers();
    try {
      const done = jest.fn();
      const sleeping = sleepUnlessAborted(1000).then(done);
      jest.advanceTimersByTime(999);
      await Promise.resolve();
      expect(done).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      await sleeping;
      expect(done).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

type Handler = (() => void) | null;

class FakeXhr {
  static instances: FakeXhr[] = [];
  upload: {
    onloadstart: Handler;
    onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
    onload: Handler;
  } = { onloadstart: null, onprogress: null, onload: null };
  onload: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  status = 0;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  sentBody: unknown = undefined;
  abortCalls = 0;

  constructor(private readonly fireUploadEvents = true) {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.sentBody = body;
    if (this.fireUploadEvents) this.upload.onloadstart?.();
  }

  abort() {
    this.abortCalls += 1;
    this.onabort?.();
  }

  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }

  bodySent() {
    this.upload.onload?.();
  }

  respond(status: number) {
    this.status = status;
    this.onload?.();
  }

  networkError() {
    this.onerror?.();
  }
}

describe("putFileToStorage", () => {
  const file = new Blob(["x".repeat(100)], { type: "application/pdf" });

  beforeEach(() => {
    FakeXhr.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function start(options: Parameters<typeof putFileToStorage>[3] = {}, fireUploadEvents = true) {
    const outcome: { value?: "resolved"; error?: unknown } = {};
    const promise = putFileToStorage("https://app.test/uploads/key?sig=1", file, "application/pdf", {
      createXhr: () => new FakeXhr(fireUploadEvents) as unknown as XMLHttpRequest,
      ...options,
    }).then(
      () => {
        outcome.value = "resolved";
      },
      (error: unknown) => {
        outcome.error = error;
      },
    );
    const xhr = FakeXhr.instances[FakeXhr.instances.length - 1];
    return { promise, outcome, xhr };
  }

  async function flush() {
    await Promise.resolve();
    await Promise.resolve();
  }

  it("PUTs the file with its type and reports progress", async () => {
    const onProgress = jest.fn();
    const { promise, outcome, xhr } = start({ onProgress });

    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe("https://app.test/uploads/key?sig=1");
    expect(xhr.headers["Content-Type"]).toBe("application/pdf");
    expect(xhr.sentBody).toBe(file);
    xhr.progress(50, 100);
    xhr.progress(100, 100);
    xhr.bodySent();
    xhr.respond(200);
    await promise;

    expect(outcome).toEqual({ value: "resolved" });
    expect(onProgress).toHaveBeenNthCalledWith(1, 50, 100);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100, 100);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("rejects an HTTP error with its status", async () => {
    const { promise, outcome, xhr } = start();
    xhr.bodySent();
    xhr.respond(403);
    await promise;

    expect(outcome.error).toBeInstanceOf(StorageUploadError);
    expect(outcome.error).toMatchObject({
      failure: "http",
      status: 403,
      message: "Upload to storage failed (403).",
    });
  });

  it("aborts a stalled transfer after 30 s without progress", async () => {
    const { promise, outcome, xhr } = start();
    xhr.progress(10, 100);
    jest.advanceTimersByTime(29_999);
    await flush();
    expect(outcome).toEqual({});

    jest.advanceTimersByTime(1);
    await promise;
    expect(outcome.error).toMatchObject({ failure: "stall", message: UPLOAD_STALLED_MESSAGE });
    expect(xhr.abortCalls).toBe(1);
  });

  it("aborts when the browser never fires an upload event", async () => {
    const { promise, outcome, xhr } = start({}, false);
    jest.advanceTimersByTime(30_000);
    await promise;
    expect(outcome.error).toMatchObject({ failure: "stall" });
    expect(xhr.abortCalls).toBe(1);
  });

  it("stops the stall watchdog once the body is sent", async () => {
    const { promise, outcome, xhr } = start();
    xhr.bodySent();
    jest.advanceTimersByTime(45_000);
    await flush();
    expect(outcome).toEqual({});

    xhr.respond(200);
    await promise;
    expect(outcome).toEqual({ value: "resolved" });
  });

  it("aborts after 60 s without a response once the body is sent", async () => {
    const { promise, outcome, xhr } = start();
    xhr.progress(100, 100);
    xhr.bodySent();
    jest.advanceTimersByTime(59_999);
    await flush();
    expect(outcome).toEqual({});

    jest.advanceTimersByTime(1);
    await promise;
    expect(outcome.error).toMatchObject({
      failure: "response-timeout",
      message: UPLOAD_NO_RESPONSE_MESSAGE,
    });
    expect(xhr.abortCalls).toBe(1);
  });

  it("honours a custom response timeout", async () => {
    const { promise, outcome, xhr } = start({ responseTimeoutMs: 200_000 });
    xhr.bodySent();
    jest.advanceTimersByTime(199_999);
    await flush();
    expect(outcome).toEqual({});
    jest.advanceTimersByTime(1);
    await promise;
    expect(outcome.error).toMatchObject({ failure: "response-timeout" });
  });

  it("rejects a network error", async () => {
    const { promise, outcome, xhr } = start();
    xhr.networkError();
    await promise;
    expect(outcome.error).toMatchObject({
      failure: "network",
      message: UPLOAD_NETWORK_ERROR_MESSAGE,
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("settles only once even if events keep coming", async () => {
    const { promise, outcome, xhr } = start();
    xhr.networkError();
    xhr.respond(200);
    xhr.abort();
    jest.advanceTimersByTime(120_000);
    await promise;
    expect(outcome.error).toMatchObject({ failure: "network" });
  });

  it("cancels the in-flight request when the signal aborts", async () => {
    const controller = new AbortController();
    const { promise, outcome, xhr } = start({ signal: controller.signal });
    xhr.progress(30, 100);
    controller.abort();
    await promise;

    expect(outcome.error).toMatchObject({
      failure: "cancelled",
      message: UPLOAD_CANCELLED_MESSAGE,
    });
    expect(xhr.abortCalls).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("does not start when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const { promise, outcome } = start({ signal: controller.signal });
    await promise;

    expect(FakeXhr.instances).toHaveLength(0);
    expect(outcome.error).toMatchObject({ failure: "cancelled" });
  });
});

describe("uploadOneFile", () => {
  const noSleep = async () => undefined;

  it("retries the PUT on the same URL without registering again", async () => {
    const register = jest.fn().mockResolvedValue({ id: "file-1", uploadUrl: "https://put" });
    const put = jest
      .fn<Promise<void>, [string]>()
      .mockRejectedValueOnce(new StorageUploadError("http", "x", 503))
      .mockRejectedValueOnce(new StorageUploadError("response-timeout", "x"))
      .mockResolvedValueOnce(undefined);
    const commit = jest.fn().mockResolvedValue({ status: "COMMITTED" });
    const onRetry = jest.fn();

    await expect(uploadOneFile({ register, put, commit, sleep: noSleep, onRetry })).resolves.toBe(
      "file-1",
    );
    expect(register).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(3);
    expect(put.mock.calls.every(([url]) => url === "https://put")).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("file-1");
    expect(onRetry.mock.calls.map(([stage]) => stage)).toEqual(["put", "put"]);
  });

  it("retries the commit after a network error or a 5xx", async () => {
    const register = jest.fn().mockResolvedValue({ id: "file-1", uploadUrl: "https://put" });
    const put = jest.fn().mockResolvedValue(undefined);
    const commit = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(Object.assign(new Error("Bad gateway"), { status: 502 }))
      .mockResolvedValueOnce({ status: "COMMITTED" });

    await expect(uploadOneFile({ register, put, commit, sleep: noSleep })).resolves.toBe("file-1");
    expect(register).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(3);
  });

  it("does not retry a commit rejected with a 4xx", async () => {
    const rejected = Object.assign(new Error("Step deadline has passed"), { status: 403 });
    const commit = jest.fn().mockRejectedValue(rejected);

    await expect(
      uploadOneFile({
        register: jest.fn().mockResolvedValue({ id: "file-1", uploadUrl: "https://put" }),
        put: jest.fn().mockResolvedValue(undefined),
        commit,
        sleep: noSleep,
      }),
    ).rejects.toBe(rejected);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("never commits when the PUT fails for good", async () => {
    const register = jest.fn().mockResolvedValue({ id: "file-1", uploadUrl: "https://put" });
    const forbidden = new StorageUploadError("http", "Upload to storage failed (403).", 403);
    const put = jest.fn().mockRejectedValue(forbidden);
    const commit = jest.fn();

    await expect(uploadOneFile({ register, put, commit, sleep: noSleep })).rejects.toBe(forbidden);
    expect(register).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("does not retry the registration itself", async () => {
    const register = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const put = jest.fn();

    await expect(
      uploadOneFile({ register, put, commit: jest.fn(), sleep: noSleep }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(register).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("multi-file batches", () => {
  it("keeps every committed file next to the existing ones", () => {
    expect(mergeUploadedFiles(["a"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeUploadedFiles([], ["b"], 3)).toEqual(["b"]);
  });

  it("respects maxFiles without dropping existing files", () => {
    expect(mergeUploadedFiles(["a"], ["b", "c", "d"], 3)).toEqual(["a", "b", "c"]);
    expect(mergeUploadedFiles(["a", "b", "c"], ["d"], 2)).toEqual(["a", "b", "c"]);
  });

  it("names the files that failed", () => {
    expect(describeFailedUploads([])).toBeNull();
    expect(
      describeFailedUploads([{ fileName: "cv.pdf", message: UPLOAD_NETWORK_ERROR_MESSAGE }]),
    ).toBe(`cv.pdf could not be uploaded. ${UPLOAD_NETWORK_ERROR_MESSAGE}`);
    expect(
      describeFailedUploads([{ fileName: "cv.pdf", message: "Step deadline has passed" }]),
    ).toBe("cv.pdf could not be uploaded. Step deadline has passed.");
    expect(describeFailedUploads([{ fileName: "cv.pdf" }])).toBe(
      "cv.pdf could not be uploaded. Please try again.",
    );
  });

  it("falls back to a generic reason when reasons differ", () => {
    expect(
      describeFailedUploads([
        { fileName: "a.pdf", message: "Upload to storage failed (403)." },
        { fileName: "b.pdf", message: UPLOAD_NETWORK_ERROR_MESSAGE },
      ]),
    ).toBe("a.pdf and b.pdf could not be uploaded. Please try again.");
    expect(
      describeFailedUploads([
        { fileName: "a.pdf", message: "Upload to storage failed (403)." },
        { fileName: "b.pdf" },
      ]),
    ).toBe("a.pdf and b.pdf could not be uploaded. Please try again.");
  });

  it("shortens long lists of names", () => {
    const failures = ["a", "b", "c", "d"].map((name) => ({
      fileName: `${name}.pdf`,
      message: "x",
    }));
    expect(describeFailedUploads(failures.slice(0, 3))).toBe(
      "a.pdf, b.pdf and c.pdf could not be uploaded. x.",
    );
    expect(describeFailedUploads(failures)).toBe(
      "a.pdf, b.pdf and 2 more files could not be uploaded. x.",
    );
  });
});
