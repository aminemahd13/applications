"use client";

import * as React from "react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { COUNTRY_CODES, type CountryCodeEntry } from "@/lib/country-codes";

interface ParsedPhoneValue {
  countryCode: string;
  localNumber: string;
}

export interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const DEFAULT_COUNTRY_CODE = "US";

const COUNTRIES_WITH_DIAL = COUNTRY_CODES.filter(
  (country) => country.dialCode.length > 0,
);

const DIAL_MATCH_CANDIDATES = [...COUNTRIES_WITH_DIAL].sort(
  (a, b) => b.dialCode.length - a.dialCode.length || a.name.localeCompare(b.name),
);

const COUNTRY_OPTION_LABEL = (country: CountryCodeEntry): string =>
  `${country.flag} ${country.name} (${country.dialCode})`;

function getDefaultCountry(): CountryCodeEntry {
  return (
    COUNTRIES_WITH_DIAL.find((country) => country.code === DEFAULT_COUNTRY_CODE) ??
    COUNTRIES_WITH_DIAL[0]
  );
}

function buildPhoneValue(dialCode: string, localNumber: string): string {
  const trimmedLocal = localNumber.trim();
  if (trimmedLocal.length === 0) return "";
  const trimmedDial = dialCode.trim();
  if (trimmedDial.length === 0) return trimmedLocal;
  return `${trimmedDial} ${trimmedLocal}`;
}

function parsePhoneValue(raw: string | undefined): ParsedPhoneValue {
  const normalized = String(raw ?? "").trim();
  const defaultCountry = getDefaultCountry();
  if (normalized.length === 0) {
    return {
      countryCode: defaultCountry.code,
      localNumber: "",
    };
  }

  for (const candidate of DIAL_MATCH_CANDIDATES) {
    if (!normalized.startsWith(candidate.dialCode)) continue;
    const remainder = normalized.slice(candidate.dialCode.length).trim();
    return {
      countryCode: candidate.code,
      localNumber: remainder,
    };
  }

  return {
    countryCode: defaultCountry.code,
    localNumber: normalized,
  };
}

export function PhoneInput({
  value,
  onChange,
  disabled,
  placeholder = "Phone number",
}: PhoneInputProps) {
  const parsed = React.useMemo(() => parsePhoneValue(value), [value]);
  const [selectedCountryCode, setSelectedCountryCode] = React.useState(
    parsed.countryCode,
  );
  const [localNumber, setLocalNumber] = React.useState(parsed.localNumber);

  React.useEffect(() => {
    setSelectedCountryCode(parsed.countryCode);
    setLocalNumber(parsed.localNumber);
  }, [parsed.countryCode, parsed.localNumber]);

  const selectedCountry =
    COUNTRY_CODES.find((country) => country.code === selectedCountryCode) ??
    getDefaultCountry();

  const comboboxOptions = React.useMemo(
    () =>
      COUNTRIES_WITH_DIAL.map((country) => ({
        value: country.code,
        label: COUNTRY_OPTION_LABEL(country),
      })),
    [],
  );

  return (
    <div className="flex gap-2">
      <Combobox
        options={comboboxOptions}
        value={selectedCountry.code}
        onValueChange={(countryCode) => {
          const nextCountry =
            COUNTRY_CODES.find((country) => country.code === countryCode) ??
            getDefaultCountry();
          setSelectedCountryCode(nextCountry.code);
          onChange?.(buildPhoneValue(nextCountry.dialCode, localNumber));
        }}
        disabled={disabled}
        placeholder="Code"
        searchPlaceholder="Search country or code..."
        className="w-[42%] min-w-[7.5rem] sm:w-[46%] sm:min-w-[14rem]"
      />
      <Input
        className="flex-1"
        value={localNumber}
        onChange={(event) => {
          const nextLocalNumber = event.target.value;
          setLocalNumber(nextLocalNumber);
          onChange?.(buildPhoneValue(selectedCountry.dialCode, nextLocalNumber));
        }}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}
