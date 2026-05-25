'use client';

import React from 'react';
import { useForm, useWatch, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  FormDefinition,
  FieldType,
  generateFormSchema,
  isFieldRequired,
  isFieldVisible,
  normalizeFormDefinition,
} from '@event-platform/schemas';
import { FileUpload, type FileUploadValue } from './FileUpload';
import { FormMarkdown } from './form-markdown';
import { Button } from '../ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Combobox } from '../ui/combobox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { PhoneInput } from '../ui/phone-input';
import { Textarea } from '../ui/textarea';

type FormValues = Record<string, unknown>;

interface FormRendererProps {
  definition: FormDefinition | Record<string, unknown>;
  eventId: string;
  applicationId?: string;
  stepId?: string;
  initialData?: FormValues;
  onSubmit: (data: FormValues) => void;
  readOnly?: boolean;
  showSubmit?: boolean;
  liveValidation?: boolean;
  disableFileUploads?: boolean;
}

export function FormRenderer({
  definition,
  eventId,
  applicationId,
  stepId,
  initialData,
  onSubmit,
  readOnly,
  showSubmit,
  liveValidation,
  disableFileUploads,
}: FormRendererProps) {
  const normalizedDefinition = React.useMemo(
    () => normalizeFormDefinition(definition),
    [definition],
  );
  const schema = React.useMemo(
    () => generateFormSchema(normalizedDefinition),
    [normalizedDefinition],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    control,
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: initialData ?? {},
    mode: liveValidation ? 'onChange' : 'onSubmit',
    reValidateMode: liveValidation ? 'onChange' : 'onChange',
  });

  const values = (useWatch({ control }) ?? {}) as FormValues;
  const shouldShowSubmit = showSubmit ?? !readOnly;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {normalizedDefinition.sections.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-xl">{section.title}</CardTitle>
            {section.description && (
              <CardDescription>
                <FormMarkdown
                  content={section.description}
                  className="[&_p]:my-0"
                />
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="grid gap-4">
            {section.fields.map((field) => {
              if (!isFieldVisible(field, values)) {
                return null;
              }

              if (field.type === FieldType.INFO_TEXT) {
                return (
                  <div
                    key={field.id}
                    className="prose prose-sm max-w-none text-muted-foreground"
                  >
                    <FormMarkdown content={field.ui?.description || field.label} />
                  </div>
                );
              }

              const fieldKey = field.key || field.id;
              const fieldError = errors[fieldKey];
              const error =
                fieldError && typeof fieldError.message === 'string'
                  ? fieldError.message
                  : undefined;
              const isRequired = isFieldRequired(field, values);
              const hasDescription = Boolean(field.ui?.description);
              const descId = hasDescription ? `${fieldKey}-desc` : undefined;
              const errorId = error ? `${fieldKey}-error` : undefined;
              const describedBy =
                [descId, errorId].filter(Boolean).join(' ') || undefined;

              const isInlineControl =
                field.type === FieldType.CHECKBOX;

              return (
                <div key={field.id} className="grid gap-2">
                  {!isInlineControl && (
                    <Label htmlFor={fieldKey}>
                      {field.label}
                      {isRequired && (
                        <span aria-hidden="true" className="text-destructive">
                          *
                        </span>
                      )}
                    </Label>
                  )}

                  {hasDescription && !isInlineControl && (
                    <div
                      id={descId}
                      className="text-sm text-muted-foreground"
                    >
                      <FormMarkdown
                        content={field.ui!.description!}
                        className="[&_p]:my-0"
                      />
                    </div>
                  )}

                  {field.type === FieldType.TEXTAREA ? (
                    <Textarea
                      {...register(fieldKey)}
                      id={fieldKey}
                      disabled={readOnly}
                      placeholder={field.ui?.placeholder}
                      aria-invalid={!!error}
                      aria-required={isRequired}
                      aria-describedby={describedBy}
                    />
                  ) : field.type === FieldType.SELECT ? (
                    <Controller
                      control={control}
                      name={fieldKey}
                      render={({ field: controllerField }) => (
                        <Combobox
                          options={field.ui?.options ?? []}
                          value={(controllerField.value as string) ?? ''}
                          onValueChange={controllerField.onChange}
                          disabled={readOnly}
                          placeholder={field.ui?.placeholder || 'Select...'}
                          searchPlaceholder="Search options..."
                        />
                      )}
                    />
                  ) : field.type === FieldType.PHONE ? (
                    <Controller
                      control={control}
                      name={fieldKey}
                      render={({ field: controllerField }) => (
                        <PhoneInput
                          value={(controllerField.value as string) ?? ''}
                          onChange={controllerField.onChange}
                          disabled={readOnly}
                          placeholder={field.ui?.placeholder || 'Phone number'}
                        />
                      )}
                    />
                  ) : field.type === FieldType.MULTISELECT ? (
                    <Controller
                      control={control}
                      name={fieldKey}
                      render={({ field: controllerField }) => {
                        const selected = Array.isArray(controllerField.value)
                          ? (controllerField.value as string[])
                          : [];
                        const toggleValue = (value: string, checked: boolean) => {
                          const next = checked
                            ? Array.from(new Set([...selected, value]))
                            : selected.filter((v) => v !== value);
                          controllerField.onChange(next);
                        };

                        if (!field.ui?.options?.length) {
                          return (
                            <p className="text-xs text-muted-foreground">
                              No options configured.
                            </p>
                          );
                        }

                        return (
                          <div
                            role="group"
                            aria-describedby={describedBy}
                            className="grid gap-2 rounded-md border border-input bg-transparent p-3"
                          >
                            {field.ui.options.map((opt) => {
                              const optId = `${fieldKey}-${opt.value}`;
                              return (
                                <div
                                  key={opt.value}
                                  className="flex items-center gap-2"
                                >
                                  <Checkbox
                                    id={optId}
                                    checked={selected.includes(opt.value)}
                                    onCheckedChange={(checked) =>
                                      toggleValue(opt.value, checked === true)
                                    }
                                    disabled={readOnly}
                                    aria-invalid={!!error}
                                  />
                                  <Label
                                    htmlFor={optId}
                                    className="text-sm font-normal"
                                  >
                                    {opt.label}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                    />
                  ) : field.type === FieldType.CHECKBOX ? (
                    <Controller
                      control={control}
                      name={fieldKey}
                      render={({ field: controllerField }) => (
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={fieldKey}
                            checked={controllerField.value === true}
                            onCheckedChange={(checked) =>
                              controllerField.onChange(checked === true)
                            }
                            disabled={readOnly}
                            aria-invalid={!!error}
                            aria-required={isRequired}
                            aria-describedby={describedBy}
                            className="mt-0.5"
                          />
                          <div className="grid gap-1">
                            <Label
                              htmlFor={fieldKey}
                              className="font-medium"
                            >
                              {field.label}
                              {isRequired && (
                                <span
                                  aria-hidden="true"
                                  className="text-destructive"
                                >
                                  *
                                </span>
                              )}
                            </Label>
                            {hasDescription && (
                              <div
                                id={descId}
                                className="text-sm text-muted-foreground"
                              >
                                <FormMarkdown
                                  content={field.ui!.description!}
                                  className="[&_p]:my-0"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    />
                  ) : field.type === FieldType.FILE_UPLOAD ? (
                    <div className="grid gap-2">
                      {disableFileUploads ? (
                        <div className="border-border bg-muted/40 rounded-md border border-dashed p-3 text-sm">
                          <p className="font-medium">
                            File upload disabled in preview
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            Configure limits below:
                            {` max ${typeof field.ui?.maxFileSizeMB === 'number' ? field.ui.maxFileSizeMB : 50} MB`}
                            {typeof field.ui?.maxFiles === 'number'
                              ? `, up to ${field.ui.maxFiles} file${field.ui.maxFiles === 1 ? '' : 's'}`
                              : ''}
                            {Array.isArray(field.ui?.allowedMimeTypes) &&
                            field.ui.allowedMimeTypes.length > 0
                              ? `, allowed ${field.ui.allowedMimeTypes.join(', ')}`
                              : Array.isArray(field.validation?.allowedTypes) &&
                                  field.validation.allowedTypes.length > 0
                                ? `, allowed ${field.validation.allowedTypes.join(', ')}`
                                : ''}
                            .
                          </p>
                        </div>
                      ) : (
                        <Controller
                          control={control}
                          name={fieldKey}
                          render={({ field: { onChange, value } }) => {
                            const uploadValue = Array.isArray(value)
                              ? (value as FileUploadValue[])
                              : value && typeof value === 'object'
                                ? (value as FileUploadValue)
                                : null;
                            const maxFiles = field.ui?.maxFiles;
                            const multiple =
                              typeof maxFiles === 'number' ? maxFiles > 1 : false;
                            return (
                              <FileUpload
                                value={uploadValue}
                                onChange={onChange}
                                eventId={eventId}
                                applicationId={applicationId}
                                stepId={stepId}
                                fieldId={fieldKey}
                                readOnly={readOnly}
                                accept={
                                  field.ui?.allowedMimeTypes?.join(',') ??
                                  field.validation?.allowedTypes?.join(',')
                                }
                                multiple={multiple}
                                maxFiles={
                                  typeof maxFiles === 'number' ? maxFiles : undefined
                                }
                                maxFileSizeMB={
                                  typeof field.ui?.maxFileSizeMB === 'number'
                                    ? field.ui.maxFileSizeMB
                                    : undefined
                                }
                              />
                            );
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <Input
                      type={field.type === FieldType.NUMBER ? 'number' : 'text'}
                      {...register(fieldKey)}
                      id={fieldKey}
                      disabled={readOnly}
                      placeholder={field.ui?.placeholder}
                      aria-invalid={!!error}
                      aria-required={isRequired}
                      aria-describedby={describedBy}
                    />
                  )}

                  {error && (
                    <p
                      id={errorId}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {shouldShowSubmit && (
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      )}
    </form>
  );
}
