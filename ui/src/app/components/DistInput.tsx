"use client";
import { InputText } from "primereact/inputtext";
import React, { useEffect, useState } from "react";
import { Dropdown, DropdownChangeEvent } from "primereact/dropdown";
import { fetchDistSchema, distTemplate, type DistFieldMap } from "@/lib/distSchema";

interface IDistInputProps {
  inputs: string[];
  handleFormData: (
    e: { target: { name: string; value: any } },
    distInput?: string,
  ) => void;
  labelFor: string;
  setActiveField: React.Dispatch<React.SetStateAction<string | null>>;
  formData: Record<string, any>;
  errors: Record<string, string>;
}

export default function DistInput({
  inputs,
  handleFormData,
  labelFor,
  setActiveField,
  formData,
  errors,
}: IDistInputProps) {
  const [distFields, setDistFields] = useState<DistFieldMap | null>(null);

  useEffect(() => {
    fetchDistSchema().then(setDistFields);
  }, []);

  const capitalize = (str: string) =>
    str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

  const dist = formData[labelFor] as Record<string, string>;

  const distOptions = distFields
    ? Object.keys(distFields).map((t) => ({ label: capitalize(t), value: t }))
    : [];

  const handleDropdownData = (e: DropdownChangeEvent) => {
    const selectedType = e.value as string;
    const template = distTemplate(selectedType, distFields ?? undefined);

    handleFormData(
      {
        target: {
          name: "type",
          value: template,
        },
      },
      labelFor
    );
  };

  return (
    <div className="flex gap-5 flex-wrap">
      {inputs.map((item, index) =>
        item === "type" ? (
          <div className="flex flex-col gap-2" key={index}>
            <label htmlFor={labelFor}>{capitalize(item)}</label>
            <Dropdown
              value={dist.type || ""}
              onChange={handleDropdownData}
              options={distOptions}
              optionLabel="label"
              optionValue="value"
              placeholder="Choose dist"
              className="w-full md:w-14rem"
              name={item}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2" key={index}>
            <label htmlFor={labelFor}>{capitalize(item)}</label>
            <InputText
              id={item}
              className="p-inputtext-sm"
              size={8}
              name={item}
              value={dist[item] ?? ""}
              onChange={(e) => handleFormData(e, labelFor)}
              onFocus={() =>
                setActiveField(`${labelFor}.${item.toLowerCase()}`)
              }
            />
            {errors?.[`${labelFor}.${item}`] && (
              <span className="text-red-600 text-xs">
                {errors[`${labelFor}.${item}`]}
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
}
