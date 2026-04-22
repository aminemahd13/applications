import { apiClient } from "@/lib/api";
import {
  createFieldFileExportJob,
  getFieldFileExportJobDownloadUrl,
  pollFieldFileExportJobUntilTerminal,
} from "./field-file-export-jobs";

jest.mock("@/lib/api", () => ({
  apiClient: jest.fn(),
}));

describe("field-file-export-jobs", () => {
  const apiClientMock = apiClient as jest.MockedFunction<typeof apiClient>;

  beforeEach(() => {
    apiClientMock.mockReset();
  });

  it("creates export jobs with POST body payload", async () => {
    apiClientMock.mockResolvedValue({
      data: {
        id: "job-1",
        status: "PENDING",
      },
    } as never);

    const response = await createFieldFileExportJob(
      "event-1",
      {
        stepId: "11111111-1111-4111-8111-111111111111",
        fieldId: "resume",
        applicationIds: ["22222222-2222-4222-8222-222222222222"],
      },
      "csrf-token",
    );

    expect(apiClientMock).toHaveBeenCalledWith("/events/event-1/files/export-jobs", {
      method: "POST",
      body: {
        stepId: "11111111-1111-4111-8111-111111111111",
        fieldId: "resume",
        applicationIds: ["22222222-2222-4222-8222-222222222222"],
      },
      csrfToken: "csrf-token",
    });
    expect(response).toEqual(
      expect.objectContaining({
        id: "job-1",
        status: "PENDING",
      }),
    );
  });

  it("polls status until done", async () => {
    const statuses = ["PENDING", "PROCESSING", "DONE"];
    const fetchStatus = jest.fn(async () => ({
      id: "job-1",
      status: statuses.shift(),
    }));
    const observed: string[] = [];

    const result = await pollFieldFileExportJobUntilTerminal({
      eventId: "event-1",
      jobId: "job-1",
      intervalMs: 0,
      timeoutMs: 1000,
      fetchStatus: fetchStatus as any,
      onTick: (job) => observed.push(String(job.status)),
    });

    expect(result.status).toBe("DONE");
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(observed).toEqual(["PENDING", "PROCESSING", "DONE"]);
  });

  it("returns failed terminal status for caller handling", async () => {
    const fetchStatus = jest.fn(async () => ({
      id: "job-1",
      status: "FAILED",
      errorMessage: "Export failed",
    }));

    const result = await pollFieldFileExportJobUntilTerminal({
      eventId: "event-1",
      jobId: "job-1",
      intervalMs: 0,
      timeoutMs: 1000,
      fetchStatus: fetchStatus as any,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "FAILED",
        errorMessage: "Export failed",
      }),
    );
  });

  it("throws when polling exceeds timeout", async () => {
    const fetchStatus = jest.fn(async () => ({
      id: "job-1",
      status: "PENDING",
    }));

    await expect(
      pollFieldFileExportJobUntilTerminal({
        eventId: "event-1",
        jobId: "job-1",
        intervalMs: 0,
        timeoutMs: 1,
        fetchStatus: fetchStatus as any,
      }),
    ).rejects.toThrow("Field file export timed out");
  });

  it("fetches download URL for completed jobs", async () => {
    apiClientMock.mockResolvedValue({
      data: {
        url: "https://storage.example.com/export.zip",
        expiresAt: "2026-04-22T12:00:00.000Z",
        filename: "event-1__step-1__resume.zip",
      },
    } as never);

    const response = await getFieldFileExportJobDownloadUrl("event-1", "job-1");

    expect(apiClientMock).toHaveBeenCalledWith(
      "/events/event-1/files/export-jobs/job-1/download-url",
    );
    expect(response).toEqual(
      expect.objectContaining({
        url: "https://storage.example.com/export.zip",
        filename: "event-1__step-1__resume.zip",
      }),
    );
  });
});
