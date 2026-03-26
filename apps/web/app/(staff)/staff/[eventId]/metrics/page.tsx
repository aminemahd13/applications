"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  MetricsFieldType,
  MetricsFilterOperator,
  MetricsTimelineGranularity,
  type EventMetricsFieldsResponse,
  type EventMetricsQueryDto,
  type EventMetricsQueryResponse,
  type MetricsFieldGroup,
  type MetricsResponseFilter,
  type RecipientFilter,
} from "@event-platform/shared";
import { PageHeader } from "@/components/shared";
import { AudienceBuilder } from "@/components/shared/audience-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BarChart3, Filter, Loader2, RefreshCw, Trash2 } from "lucide-react";

type ResponseFilterDraft = {
  id: string;
  stepId?: string;
  fieldKey?: string;
  operator?: MetricsFilterOperator;
  value?: string;
  valuesText?: string;
  min?: string;
  max?: string;
};

const DEFAULT_TIMELINE = {
  granularity: MetricsTimelineGranularity.WEEK,
  periods: 12,
} as const;

function unwrapData<T>(payload: { data?: T } | T): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    const maybeData = (payload as { data?: T }).data;
    if (maybeData !== undefined) return maybeData;
  }
  return payload as T;
}

function parseValueByFieldType(
  rawValue: string | undefined,
  fieldType: MetricsFieldType,
): unknown | undefined {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed) return undefined;

  switch (fieldType) {
    case MetricsFieldType.NUMBER: {
      const numberValue = Number(trimmed);
      return Number.isFinite(numberValue) ? numberValue : undefined;
    }
    case MetricsFieldType.CHECKBOX: {
      if (trimmed.toLowerCase() === "true") return true;
      if (trimmed.toLowerCase() === "false") return false;
      return undefined;
    }
    case MetricsFieldType.DATE:
      return trimmed;
    default:
      return trimmed;
  }
}

function formatStepLabel(stepTitle: string, stepIndex: number) {
  return `${stepIndex + 1}. ${stepTitle}`;
}

export default function EventMetricsPage() {
  const params = useParams();
  const { csrfToken } = useAuth();
  const eventId = params.eventId as string;

  const [fieldSteps, setFieldSteps] = useState<MetricsFieldGroup[]>([]);
  const [metrics, setMetrics] = useState<EventMetricsQueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftRecipientFilter, setDraftRecipientFilter] = useState<RecipientFilter>({});
  const [draftResponseFilters, setDraftResponseFilters] = useState<ResponseFilterDraft[]>([]);
  const [breakdownStepId, setBreakdownStepId] = useState<string | undefined>(undefined);
  const [breakdownFieldKey, setBreakdownFieldKey] = useState<string | undefined>(undefined);

  const fieldsByStepId = useMemo(
    () =>
      new Map(
        fieldSteps.map((step) => [step.stepId, step.fields]),
      ),
    [fieldSteps],
  );

  const chartableFieldsByStepId = useMemo(
    () =>
      new Map(
        fieldSteps.map((step) => [step.stepId, step.fields.filter((field) => field.chartable)]),
      ),
    [fieldSteps],
  );

  const runQuery = useCallback(
    async (payload: EventMetricsQueryDto, initialLoad = false) => {
      if (!csrfToken) return;

      if (initialLoad) {
        setIsLoading(true);
      } else {
        setIsApplying(true);
      }
      setError(null);

      try {
        const response = await apiClient<{ data?: EventMetricsQueryResponse } | EventMetricsQueryResponse>(
          `/events/${eventId}/metrics/query`,
          {
            method: "POST",
            body: payload,
            csrfToken: csrfToken ?? undefined,
          },
        );
        setMetrics(unwrapData(response));
      } catch {
        setError("Unable to load event metrics.");
      } finally {
        if (initialLoad) {
          setIsLoading(false);
        } else {
          setIsApplying(false);
        }
      }
    },
    [csrfToken, eventId],
  );

  const buildRequestPayload = useCallback((): EventMetricsQueryDto => {
    const parsedResponseFilters: MetricsResponseFilter[] = [];

    for (const row of draftResponseFilters) {
      if (!row.stepId || !row.fieldKey || !row.operator) continue;

      const field = fieldsByStepId
        .get(row.stepId)
        ?.find((candidate) => candidate.fieldKey === row.fieldKey);
      if (!field) continue;

      if (row.operator === MetricsFilterOperator.EQ) {
        const value = parseValueByFieldType(row.value, field.fieldType);
        if (value === undefined) continue;
        parsedResponseFilters.push({
          stepId: row.stepId,
          fieldKey: row.fieldKey,
          operator: row.operator,
          value,
        });
        continue;
      }

      if (row.operator === MetricsFilterOperator.IN) {
        const values = (row.valuesText ?? "")
          .split(",")
          .map((entry) => parseValueByFieldType(entry, field.fieldType))
          .filter((entry): entry is unknown => entry !== undefined);
        if (values.length === 0) continue;
        parsedResponseFilters.push({
          stepId: row.stepId,
          fieldKey: row.fieldKey,
          operator: row.operator,
          values,
        });
        continue;
      }

      const min = parseValueByFieldType(row.min, field.fieldType);
      const max = parseValueByFieldType(row.max, field.fieldType);
      if (min === undefined && max === undefined) continue;
      parsedResponseFilters.push({
        stepId: row.stepId,
        fieldKey: row.fieldKey,
        operator: row.operator,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      });
    }

    return {
      recipientFilter: draftRecipientFilter,
      responseFilters: parsedResponseFilters,
      ...(breakdownStepId && breakdownFieldKey
        ? { breakdownField: { stepId: breakdownStepId, fieldKey: breakdownFieldKey } }
        : {}),
      timeline: DEFAULT_TIMELINE,
    };
  }, [breakdownFieldKey, breakdownStepId, draftRecipientFilter, draftResponseFilters, fieldsByStepId]);

  useEffect(() => {
    if (!csrfToken) return;
    let mounted = true;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient<{ data?: EventMetricsFieldsResponse } | EventMetricsFieldsResponse>(
          `/events/${eventId}/metrics/fields`,
        );
        if (!mounted) return;
        const data = unwrapData(response);
        setFieldSteps(data.steps ?? []);
      } catch {
        if (!mounted) return;
        setError("Unable to load metrics field catalog.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [csrfToken, eventId]);

  useEffect(() => {
    if (!csrfToken) return;
    void runQuery(
      {
        recipientFilter: {},
        responseFilters: [],
        timeline: DEFAULT_TIMELINE,
      },
      true,
    );
  }, [csrfToken, runQuery]);

  function addResponseFilterRow() {
    setDraftResponseFilters((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
      },
    ]);
  }

  function updateResponseFilterRow(
    rowId: string,
    partial: Partial<ResponseFilterDraft>,
  ) {
    setDraftResponseFilters((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        return { ...row, ...partial };
      }),
    );
  }

  function removeResponseFilterRow(rowId: string) {
    setDraftResponseFilters((current) => current.filter((row) => row.id !== rowId));
  }

  async function handleApplyFilters() {
    const payload = buildRequestPayload();
    await runQuery(payload);
  }

  async function handleResetFilters() {
    setDraftRecipientFilter({});
    setDraftResponseFilters([]);
    setBreakdownStepId(undefined);
    setBreakdownFieldKey(undefined);
    await runQuery({
      recipientFilter: {},
      responseFilters: [],
      timeline: DEFAULT_TIMELINE,
    });
  }

  const loading = isLoading && !metrics;
  const maxDecisionCount = Math.max(
    1,
    ...(metrics?.decisionBreakdown.map((item) => item.count) ?? [0]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Metrics" description="Analyze event performance with reusable cohort and response filters.">
        <Button variant="outline" onClick={handleResetFilters} disabled={isApplying}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Reset
        </Button>
        <Button onClick={handleApplyFilters} disabled={isApplying || !csrfToken}>
          {isApplying ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Filter className="mr-1.5 h-4 w-4" />
          )}
          Apply filters
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cohort Filters</CardTitle>
          <CardDescription>
            Base audience filters mirror announcement targeting semantics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AudienceBuilder
            eventId={eventId}
            filter={draftRecipientFilter}
            onChange={setDraftRecipientFilter}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Response Filters</CardTitle>
          <CardDescription>
            Add step-scoped field predicates using exact match, in-list, or inclusive ranges.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {draftResponseFilters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No response filters added yet.
            </p>
          ) : (
            <div className="space-y-3">
              {draftResponseFilters.map((row) => {
                const availableFields = row.stepId
                  ? fieldsByStepId.get(row.stepId) ?? []
                  : [];
                const selectedField = availableFields.find(
                  (field) => field.fieldKey === row.fieldKey,
                );
                const availableOperators = selectedField?.operators ?? [];
                const selectedOperator = row.operator ?? selectedField?.operators[0];

                return (
                  <div key={row.id} className="rounded-md border p-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Step</Label>
                        <Select
                          value={row.stepId ?? "__none__"}
                          onValueChange={(value) =>
                            updateResponseFilterRow(row.id, {
                              stepId: value === "__none__" ? undefined : value,
                              fieldKey: undefined,
                              operator: undefined,
                              value: "",
                              valuesText: "",
                              min: "",
                              max: "",
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select step" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select step</SelectItem>
                            {fieldSteps.map((step) => (
                              <SelectItem key={step.stepId} value={step.stepId}>
                                {formatStepLabel(step.stepTitle, step.stepIndex)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Field</Label>
                        <Select
                          value={row.fieldKey ?? "__none__"}
                          onValueChange={(value) => {
                            const nextFieldKey = value === "__none__" ? undefined : value;
                            const field = availableFields.find(
                              (candidate) => candidate.fieldKey === nextFieldKey,
                            );
                            updateResponseFilterRow(row.id, {
                              fieldKey: nextFieldKey,
                              operator: field?.operators[0],
                              value: "",
                              valuesText: "",
                              min: "",
                              max: "",
                            });
                          }}
                          disabled={!row.stepId}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select field</SelectItem>
                            {availableFields.map((field) => (
                              <SelectItem key={field.fieldKey} value={field.fieldKey}>
                                {field.fieldLabel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={selectedOperator ?? "__none__"}
                          onValueChange={(value) =>
                            updateResponseFilterRow(row.id, {
                              operator:
                                value === "__none__"
                                  ? undefined
                                  : (value as MetricsFilterOperator),
                              value: "",
                              valuesText: "",
                              min: "",
                              max: "",
                            })
                          }
                          disabled={!selectedField}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select operator" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select operator</SelectItem>
                            {availableOperators.map((operator) => (
                              <SelectItem key={operator} value={operator}>
                                {operator}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Value</Label>
                        {selectedOperator === MetricsFilterOperator.RANGE ? (
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              className="h-8 text-xs"
                              placeholder="Min"
                              type={
                                selectedField?.fieldType === MetricsFieldType.DATE
                                  ? "date"
                                  : selectedField?.fieldType === MetricsFieldType.NUMBER
                                    ? "number"
                                    : "text"
                              }
                              value={row.min ?? ""}
                              onChange={(event) =>
                                updateResponseFilterRow(row.id, { min: event.target.value })
                              }
                            />
                            <Input
                              className="h-8 text-xs"
                              placeholder="Max"
                              type={
                                selectedField?.fieldType === MetricsFieldType.DATE
                                  ? "date"
                                  : selectedField?.fieldType === MetricsFieldType.NUMBER
                                    ? "number"
                                    : "text"
                              }
                              value={row.max ?? ""}
                              onChange={(event) =>
                                updateResponseFilterRow(row.id, { max: event.target.value })
                              }
                            />
                          </div>
                        ) : selectedOperator === MetricsFilterOperator.IN ? (
                          <Input
                            className="h-8 text-xs"
                            placeholder="Comma-separated values"
                            value={row.valuesText ?? ""}
                            onChange={(event) =>
                              updateResponseFilterRow(row.id, { valuesText: event.target.value })
                            }
                          />
                        ) : selectedField?.fieldType === MetricsFieldType.CHECKBOX ? (
                          <Select
                            value={(row.value ?? "__none__").toLowerCase()}
                            onValueChange={(value) =>
                              updateResponseFilterRow(row.id, {
                                value: value === "__none__" ? "" : value,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select value" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select value</SelectItem>
                              <SelectItem value="true">true</SelectItem>
                              <SelectItem value="false">false</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : selectedField?.options && selectedField.options.length > 0 ? (
                          <Select
                            value={row.value ?? "__none__"}
                            onValueChange={(value) =>
                              updateResponseFilterRow(row.id, {
                                value: value === "__none__" ? "" : value,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select value" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select value</SelectItem>
                              {selectedField.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="h-8 text-xs"
                            placeholder="Value"
                            type={
                              selectedField?.fieldType === MetricsFieldType.DATE
                                ? "date"
                                : selectedField?.fieldType === MetricsFieldType.NUMBER
                                  ? "number"
                                  : "text"
                            }
                            value={row.value ?? ""}
                            onChange={(event) =>
                              updateResponseFilterRow(row.id, { value: event.target.value })
                            }
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeResponseFilterRow(row.id)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button variant="outline" onClick={addResponseFilterRow}>
            Add response filter
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Break Down By Field</CardTitle>
          <CardDescription>
            Choose a chartable step field for value distribution.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Step</Label>
            <Select
              value={breakdownStepId ?? "__none__"}
              onValueChange={(value) => {
                const nextStepId = value === "__none__" ? undefined : value;
                setBreakdownStepId(nextStepId);
                setBreakdownFieldKey(undefined);
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="No breakdown" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No breakdown</SelectItem>
                {fieldSteps
                  .filter((step) => (chartableFieldsByStepId.get(step.stepId) ?? []).length > 0)
                  .map((step) => (
                    <SelectItem key={step.stepId} value={step.stepId}>
                      {formatStepLabel(step.stepTitle, step.stepIndex)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Field</Label>
            <Select
              value={breakdownFieldKey ?? "__none__"}
              onValueChange={(value) =>
                setBreakdownFieldKey(value === "__none__" ? undefined : value)
              }
              disabled={!breakdownStepId}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select field</SelectItem>
                {(breakdownStepId
                  ? chartableFieldsByStepId.get(breakdownStepId) ?? []
                  : []
                ).map((field) => (
                  <SelectItem key={field.fieldKey} value={field.fieldKey}>
                    {field.fieldLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-10 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading metrics...
          </CardContent>
        </Card>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Matched", value: metrics.totals.matchedApplications },
              { label: "Submitted", value: metrics.totals.submitted },
              { label: "In review", value: metrics.totals.inReview },
              { label: "Accepted", value: metrics.totals.accepted },
              { label: "Waitlisted", value: metrics.totals.waitlisted },
              { label: "Rejected", value: metrics.totals.rejected },
              { label: "Confirmed", value: metrics.totals.confirmed },
              { label: "Checked in", value: metrics.totals.checkedIn },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-2xl font-semibold">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Decision Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {metrics.decisionBreakdown.map((item) => {
                  const pct = Math.round((item.count / maxDecisionCount) * 100);
                  return (
                    <div key={item.key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{item.label}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                      <div className="h-2 rounded bg-muted">
                        <div
                          className="h-2 rounded bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current Step Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {metrics.currentStepBreakdown.length === 0 ? (
                  <p className="text-muted-foreground">No data.</p>
                ) : (
                  metrics.currentStepBreakdown.map((item) => (
                    <div key={item.stepId ?? "completed"} className="flex items-center justify-between">
                      <span>
                        {item.stepId && item.stepIndex !== null
                          ? `${item.stepIndex + 1}. ${item.stepTitle}`
                          : item.stepTitle}
                      </span>
                      <Badge variant="outline">{item.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step Funnel</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-left">Step</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Submitted</th>
                    <th className="py-2 text-right">Approved</th>
                    <th className="py-2 text-right">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.stepFunnel.map((row) => (
                    <tr key={row.stepId} className="border-b last:border-b-0">
                      <td className="py-2">{formatStepLabel(row.stepTitle, row.stepIndex)}</td>
                      <td className="py-2 text-right">{row.total}</td>
                      <td className="py-2 text-right">{row.submitted}</td>
                      <td className="py-2 text-right">{row.approved}</td>
                      <td className="py-2 text-right">{row.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Countries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {metrics.geo.countries.length === 0 ? (
                  <p className="text-muted-foreground">No data.</p>
                ) : (
                  metrics.geo.countries.map((item) => (
                    <div key={item.country} className="flex items-center justify-between">
                      <span>{item.country}</span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Cities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {metrics.geo.cities.length === 0 ? (
                  <p className="text-muted-foreground">No data.</p>
                ) : (
                  metrics.geo.cities.map((item) => (
                    <div
                      key={`${item.city}:${item.country ?? "none"}`}
                      className="flex items-center justify-between"
                    >
                      <span>{item.country ? `${item.city}, ${item.country}` : item.city}</span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Age Buckets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {metrics.ageBuckets.map((bucket) => (
                  <div key={bucket.key} className="flex items-center justify-between">
                    <span>{bucket.label}</span>
                    <Badge variant="secondary">{bucket.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Field Breakdown</CardTitle>
              <CardDescription>
                {metrics.fieldBreakdown ? (
                  <>
                    {formatStepLabel(
                      metrics.fieldBreakdown.stepTitle,
                      metrics.fieldBreakdown.stepIndex,
                    )}{" "}
                    / {metrics.fieldBreakdown.fieldLabel}
                  </>
                ) : (
                  "No chartable field selected."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {metrics.fieldBreakdown ? (
                metrics.fieldBreakdown.values.length > 0 ? (
                  metrics.fieldBreakdown.values.map((entry) => (
                    <div key={entry.value} className="flex items-center justify-between">
                      <span>{entry.value}</span>
                      <Badge variant="secondary">{entry.count}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No values in selected cohort.</p>
                )
              ) : (
                <div className="flex items-center text-muted-foreground">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Text fields are filterable but not chartable.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly Timeline (Last 12 Weeks)</CardTitle>
              <CardDescription>
                Applications started, submissions, decisions published, and check-ins.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-left">Week Start</th>
                    <th className="py-2 text-right">Started</th>
                    <th className="py-2 text-right">Submissions</th>
                    <th className="py-2 text-right">Decisions</th>
                    <th className="py-2 text-right">Check-ins</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.timeline.map((row) => (
                    <tr key={row.periodStart} className="border-b last:border-b-0">
                      <td className="py-2">
                        {new Date(row.periodStart).toLocaleDateString("en-GB")}
                      </td>
                      <td className="py-2 text-right">{row.applicationsStarted}</td>
                      <td className="py-2 text-right">{row.submissions}</td>
                      <td className="py-2 text-right">{row.decisionsPublished}</td>
                      <td className="py-2 text-right">{row.checkedIn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No metrics data yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
