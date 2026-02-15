'use client';

import React from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  FormDefinition,
  FieldType,
  generateFormSchema,
  normalizeFormDefinition,
} from '@event-platform/schemas';
import { cn } from '../../lib/utils';
import { FileUpload, type FileUploadValue } from './FileUpload';

type FormValues = Record<string, unknown>;

interface FormRendererProps {
  definition: FormDefinition | Record<string, unknown>;
  eventId: string;
  applicationId?: string;
  stepId?: string;
  initialData?: FormValues;
  onSubmit: (data: FormValues) => void;
  readOnly?: boolean;
}

export function FormRenderer({
  definition,
  eventId,
  applicationId,
  stepId,
  initialData,
  onSubmit,
  readOnly,
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
    formState: { errors },
    control,
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: initialData ?? {},
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {normalizedDefinition.sections.map((section) => (
        <div key={section.id} className="space-y-4 border p-4 rounded-lg">
          <h3 className="text-xl font-semibold">{section.title}</h3>
          {section.description && <p className="text-gray-500">{section.description}</p>}
          
          <div className="grid gap-4">
            {section.fields.map((field) => {
              if (field.type === FieldType.INFO_TEXT) {
                  return (
                      <div key={field.id} className="prose">
                          {field.label}
                      </div>
                  );
              }

              const fieldKey = field.key || field.id;
              const fieldError = errors[fieldKey];
              const error =
                fieldError && typeof fieldError.message === 'string'
                  ? fieldError.message
                  : undefined;
              
              return (
                <div key={field.id} className="grid gap-2">
                  <label htmlFor={fieldKey} className="font-medium">
                    {field.label} {field.validation?.required && <span className="text-red-500">*</span>}
                  </label>
                  
                  {field.type === FieldType.TEXTAREA ? (
                    <textarea
                      {...register(fieldKey)}
                      id={fieldKey}
                      disabled={readOnly}
                      className={cn("border p-2 rounded", error && "border-red-500")}
                    />
                  ) : field.type === FieldType.SELECT ? (
                    <select {...register(fieldKey)} id={fieldKey} disabled={readOnly} className={cn("border p-2 rounded", error && "border-red-500")}>
                        <option value="">Select...</option>
                        {field.ui?.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                  ) : field.type === FieldType.MULTISELECT ? (
                    <Controller
                      control={control}
                      name={fieldKey}
                      render={({ field: controllerField }) => {
                        const selected = Array.isArray(controllerField.value)
                          ? controllerField.value
                          : [];
                        const toggleValue = (value: string, checked: boolean) => {
                          const next = checked
                            ? Array.from(new Set([...selected, value]))
                            : selected.filter((v) => v !== value);
                          controllerField.onChange(next);
                        };

                        return (
                          <div className="grid gap-2">
                            {field.ui?.options?.length ? (
                              field.ui.options.map((opt) => (
                                <label key={opt.value} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value)}
                                    onChange={(e) => toggleValue(opt.value, e.target.checked)}
                                    disabled={readOnly}
                                    className="w-4 h-4"
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                No options configured.
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                  ) : field.type === FieldType.CHECKBOX ? (
                    <input
                      type="checkbox"
                      {...register(fieldKey)}
                      id={fieldKey}
                      disabled={readOnly}
                      className="w-4 h-4"
                    />
                  ) : field.type === FieldType.FILE_UPLOAD ? (
                    <div className="grid gap-2">
                        <Controller
                            control={control}
                            name={fieldKey}
                            render={({ field: { onChange, value } }) => {
                                const uploadValue = Array.isArray(value)
                                  ? (value as FileUploadValue[])
                                  : value &&
                                    typeof value === 'object'
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
                                    maxFiles={typeof maxFiles === 'number' ? maxFiles : undefined}
                                    maxFileSizeMB={
                                      typeof field.ui?.maxFileSizeMB === 'number'
                                        ? field.ui.maxFileSizeMB
                                        : undefined
                                    }
                                />
                                );
                              }}
                        />
                    </div>
                  ) : (
                    <input
                      type={field.type === FieldType.NUMBER ? 'number' : 'text'}
                      {...register(fieldKey)}
                      id={fieldKey}
                      disabled={readOnly}
                      className={cn("border p-2 rounded", error && "border-red-500")}
                    />
                  )}

                  {field.ui?.description && <p className="text-sm text-gray-500">{field.ui.description}</p>}
                  {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      
      {!readOnly && (
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Submit
        </button>
      )}
    </form>
  );
}
