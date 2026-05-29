"use client";
import React, { useState } from "react";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Dropdown } from "primereact/dropdown";
import { MultiSelect } from "primereact/multiselect";
import DistInput from "./DistInput";
import { Divider } from "primereact/divider";

import type { IDist } from "@/lib/distSchema";
export type { IDist } from "@/lib/distSchema";

type FieldKind = "scalar" | "dist" | "boolean" | "dropdown" | "csv" | "multiselect";

export interface VisibleWhen {
  field: string;
  in?: string[];
  notIn?: string[];
}

export interface FieldConfig<TForm> {
  key: keyof TForm;
  kind: FieldKind;
  label?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  visibleWhen?: VisibleWhen;
}

export interface FormConfig<TForm> {
  fields: FieldConfig<TForm>[];
}

interface IConfigFormProps<TForm extends Record<string, any>> {
  toastRef?: React.RefObject<any>;
  setShowDialog?: React.Dispatch<React.SetStateAction<boolean>>;
  editData?: { id: string; content: TForm };
  config: FormConfig<TForm>;
  initialData: TForm;
  createUrl: string;
  updateUrl?: string;
  resourceLabel?: string;
  onSuccess?: () => void | Promise<void>;
}

export default function ConfigForm<TForm extends Record<string, any>>({
  toastRef,
  setShowDialog,
  editData,
  config,
  initialData,
  createUrl,
  updateUrl,
  resourceLabel = "Resource",
  onSuccess,
}: IConfigFormProps<TForm>) {
  const [activeField, setActiveField] = useState<string | null>(null);
  const [formData, setFormData] = useState<TForm>(
    editData?.content ?? initialData,
  );
  const originalDataRef = React.useRef<TForm | null>(
    editData?.content ? structuredClone(editData.content) : null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customParams, setCustomParams] = useState<string>(
    editData?.content?.["customParams"] ?? "",
  );
  const originalCustomParamsRef = React.useRef<string>(
    editData?.content?.["customParams"] ?? "",
  );
  const isEditMode = !!editData?.content;

  const isFieldVisible = (field: FieldConfig<TForm>): boolean => {
    if (!field.visibleWhen) return true;
    const {
      field: depField,
      in: inValues,
      notIn: notInValues,
    } = field.visibleWhen;
    const depValue = String(formData[depField as keyof TForm] ?? "");
    if (inValues) return inValues.includes(depValue);
    if (notInValues) return !notInValues.includes(depValue);
    return true;
  };

  const validateDistribution = (dist: IDist): Record<string, string> | null => {
    const d = dist as Record<string, string>;
    const { type } = dist;
    const errors: Record<string, string> = {};

    const has = (v?: string) => v !== undefined && v !== "";
    const num = (v: string) => Number(v);

    if (has(d.min) && has(d.max)) {
      const _min = num(d.min);
      const _max = num(d.max);

      if (_min >= _max) {
        errors["min"] = `Min (${_min}) must be smaller than Max (${_max}).`;
        errors["max"] = `Max (${_max}) must be greater than Min (${_min}).`;
      }

      if ((type === "normal" || type === "poisson") && has(d.mean)) {
        const _mean = num(d.mean);
        if (_mean < _min || _mean > _max) {
          errors["mean"] =
            `Mean (${_mean}) must be between Min (${_min}) and Max (${_max}).`;
        }
      }

      if (type === "pareto" && num(d.min) <= 0) {
        errors["min"] = "Min must be > 0 for pareto distribution.";
      }
    }

    if (type === "normal" && has(d.stdev)) {
      if (num(d.stdev) <= 0) {
        errors["stdev"] = "Stdev must be greater than 0.";
      }
    }

    if (type === "pareto" && has(d.alpha)) {
      if (num(d.alpha) <= 0) {
        errors["alpha"] = "Alpha must be greater than 0.";
      }
    }

    return Object.keys(errors).length > 0 ? errors : null;
  };

  const handleFormData = (
    e: { target: { name: string; value: any } },
    distKey?: keyof TForm,
  ) => {
    const { name, value } = e.target;

    if (distKey) {
      const prevDist = formData[distKey] as unknown as IDist;
      const updatedDist: IDist =
        typeof value === "object" ? value : { ...(prevDist as Record<string, string>), [name]: value } as IDist;

      const distErrors = validateDistribution(updatedDist);

      setErrors((prev) => {
        const copy = { ...prev };
        const base = `${String(distKey)}.`;

        Object.keys(copy)
          .filter((key) => key.startsWith(base))
          .forEach((key) => delete copy[key]);

        if (distErrors) {
          for (const [field, msg] of Object.entries(distErrors)) {
            copy[`${String(distKey)}.${field}`] = msg;
          }
        }

        return copy;
      });

      setFormData((prev) => ({ ...prev, [distKey]: updatedDist }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const url = isEditMode
      ? `${updateUrl ?? createUrl}/${editData?.id}`
      : createUrl;

    const method = isEditMode ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formData: { ...formData, customParams: customParams || undefined },
        config: true,
        id: editData?.id ?? null,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const msg = errBody?.error || `Server error: ${res.status}`;
      toastRef?.current?.show({
        severity: "error",
        summary: "Save failed",
        detail: msg,
        life: 5000,
      });
      return;
    }

    toastRef?.current?.show({
      severity: "success",
      summary: isEditMode
        ? `${resourceLabel} updated`
        : `${resourceLabel} created`,
      detail: `${resourceLabel} configuration saved successfully`,
    });
    await onSuccess?.();
    setShowDialog?.(false);
  };

  const isDirty = (): boolean => {
    if (!originalDataRef.current) return true;
    if (customParams !== originalCustomParamsRef.current) return true;
    return JSON.stringify(formData) !== JSON.stringify(originalDataRef.current);
  };

  const isFormValid = (): boolean => {
    for (const field of config.fields) {
      if (!isFieldVisible(field)) continue;

      const key = field.key;
      const value = formData[key];

      if (field.kind === "scalar" || field.kind === "boolean" || field.kind === "csv") {
        if (field.required) {
          if (
            value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === "")
          ) {
            return false;
          }
        }
        continue;
      }

      if (field.kind === "dropdown") {
        if (field.required) {
          if (
            value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === "")
          ) {
            return false;
          }
        }
        continue;
      }

      if (field.kind === "multiselect") {
        if (field.required) {
          if (!Array.isArray(value) || value.length === 0) {
            return false;
          }
        }
        continue;
      }

      // kind === "dist"
      const dist = value as IDist;

      if (field.required) {
        if (!dist?.type || dist.type.trim() === "") return false;

        for (const [k, v] of Object.entries(dist)) {
          if (k === "type") continue;
          if (v === undefined || v === null || v === "") return false;
        }
      }

      // also ensure no validation errors exist for this dist
      const base = `${String(key)}.`;
      const hasErrors = Object.keys(errors).some((errKey) =>
        errKey.startsWith(base),
      );
      if (hasErrors) return false;
    }

    if (customParams.trim()) {
      const entries = customParams
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const entry of entries) {
        if (!/^\s*\S+\s*:\s*\S+/.test(entry)) return false;
      }
    }

    return true;
  };

  const convertKeyToLabel = (key: string) => {
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  return (
    <div className="config-form-wrapper flex w-full h-[80vh] items-stretch overflow-auto">
      <style>{`
        .config-form-wrapper input::placeholder,
        .config-form-wrapper textarea::placeholder,
        .config-form-wrapper .p-placeholder {
          color: #d1d5db !important;
          opacity: 1 !important;
        }
      `}</style>
      <form onSubmit={handleSubmit} className="w-full p-4 pb-8">
        <div className="flex flex-col mb-4">
          <label htmlFor="configName" className="font-bold mb-1">
            Configuration name
          </label>
          <InputText
            id="configName"
            value={formData["configName"] || ""}
            placeholder="Enter configuration name"
            onChange={handleFormData}
            name="configName"
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {config.fields.map((field) => {
            if (!isFieldVisible(field)) return null;

            const key = field.key;
            const value = formData[key];

            if (field.kind === "dist") {
              return (
                <div
                  className="col-span-2 flex flex-col gap-2"
                  key={String(key)}
                >
                  <p className="font-bold">
                    {field.label ?? convertKeyToLabel(String(key))}
                  </p>
                  <DistInput
                    inputs={Object.keys(value as IDist)}
                    handleFormData={handleFormData as any}
                    labelFor={key as any}
                    setActiveField={setActiveField}
                    formData={formData as any}
                    errors={errors}
                  />
                </div>
              );
            }

            if (field.kind === "boolean") {
              return (
                <div className="flex flex-col gap-1" key={String(key)}>
                  <label htmlFor={String(key)} className="font-bold">
                    {field.label ?? convertKeyToLabel(String(key))}
                  </label>
                  <Dropdown
                    id={String(key)}
                    value={(value ?? "") as string}
                    options={[
                      { label: "True", value: "True" },
                      { label: "False", value: "False" },
                    ]}
                    onChange={(e) =>
                      handleFormData({
                        target: { name: String(key), value: e.value },
                      })
                    }
                    placeholder="Select"
                    className="w-full"
                    appendTo="self"
                  />
                </div>
              );
            }

            if (field.kind === "dropdown") {
              const ddOptions = (field.options ?? []).map((o) => ({
                label: o,
                value: o,
              }));
              return (
                <div className="flex flex-col gap-1" key={String(key)}>
                  <label htmlFor={String(key)} className="font-bold">
                    {field.label ?? convertKeyToLabel(String(key))}
                  </label>
                  <Dropdown
                    id={String(key)}
                    value={(value ?? "") as string}
                    options={ddOptions}
                    onChange={(e) =>
                      handleFormData({
                        target: { name: String(key), value: e.value },
                      })
                    }
                    placeholder="Select"
                    className="w-full"
                    appendTo="self"
                  />
                </div>
              );
            }

            if (field.kind === "csv") {
              return (
                <div className="flex flex-col gap-1" key={String(key)}>
                  <label htmlFor={String(key)} className="font-bold">
                    {field.label ?? convertKeyToLabel(String(key))}
                  </label>
                  <small className="text-gray-500">
                    Comma-separated values (e.g. value1, value2, value3)
                  </small>
                  <InputText
                    id={String(key)}
                    name={String(key)}
                    value={(value ?? "") as string}
                    onChange={handleFormData}
                    placeholder={field.placeholder ?? ""}
                    className="p-inputtext-sm w-full"
                  />
                </div>
              );
            }

            if (field.kind === "multiselect") {
              const msOptions = (field.options ?? []).map((o) => ({
                label: o,
                value: o,
              }));
              const currentValue = Array.isArray(value) ? value : [];
              return (
                <div className="flex flex-col gap-1" key={String(key)}>
                  <label htmlFor={String(key)} className="font-bold">
                    {field.label ?? convertKeyToLabel(String(key))}
                  </label>
                  <MultiSelect
                    id={String(key)}
                    value={currentValue}
                    options={msOptions}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        [String(key)]: e.value,
                      }))
                    }
                    placeholder="Select options"
                    className="w-full"
                    display="chip"
                    appendTo="self"
                  />
                </div>
              );
            }

            return (
              <div className="flex flex-col gap-1" key={String(key)}>
                <label htmlFor={String(key)} className="font-bold">
                  {field.label ?? convertKeyToLabel(String(key))}
                </label>
                <InputText
                  id={String(key)}
                  name={String(key)}
                  value={(value ?? "") as string}
                  onChange={handleFormData}
                  onFocus={() => setActiveField(String(key))}
                  onBlur={() => setActiveField(null)}
                  className="p-inputtext-sm w-full"
                />
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-1 mt-6">
          <label htmlFor="customParams" className="font-bold">
            Custom Parameters
          </label>
          <small className="text-gray-500">
            Format: propertyName: value (separated by commas or new lines)
          </small>
          <InputTextarea
            id="customParams"
            value={customParams}
            onChange={(e) => setCustomParams(e.target.value)}
            rows={4}
            className="w-full font-mono text-sm"
            placeholder={"my_param: 42, another_param: hello\nthird_param: 100"}
          />
        </div>

        <div className="flex justify-center mt-6">
          <button
            type="submit"
            disabled={!isFormValid() || !isDirty()}
            className={`p-2 rounded text-white transition-colors mb-20 hover:cursor-pointer w-48
              ${
                !isFormValid() || !isDirty()
                  ? "bg-gray-400 cursor-not-allowed opacity-60"
                  : "bg-blue-500 hover:bg-blue-600"
              }
            `}
          >
            {isEditMode ? "Save Changes" : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
