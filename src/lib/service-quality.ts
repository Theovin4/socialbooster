export type ServiceQualityInput = {
  name: string;
  category: string;
  min: number;
  max: number;
  rateMinor: bigint;
  providerFunded: boolean;
};

export type ServiceQuality = {
  publicEligible: boolean;
  normalizedCategory: string;
  hiddenReasons: string[];
};

function titleCase(value: string) {
  return value.toLocaleLowerCase("en").replace(/(^|[\s/|()[\]-])\p{L}/gu, (match) => match.toLocaleUpperCase("en"));
}

export function normalizeServiceCategory(value: string) {
  let category = value
    .replace(/\bserivces\b/gi, "services")
    .replace(/^[\s\-_=*~|.:]+|[\s\-_=*~|.:]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const categoryWithoutKnownWords = category.replace(/services?/gi, "");
  if (categoryWithoutKnownWords === categoryWithoutKnownWords.toLocaleUpperCase("en")) category = titleCase(category);
  if ((category.match(/\p{L}/gu) || []).length < 3) category = "Other services";
  return category.slice(0, 120);
}

export function evaluateServiceQuality(input: ServiceQualityInput): ServiceQuality {
  const name = input.name.replace(/\s{2,}/g, " ").trim();
  const hiddenReasons: string[] = [];
  const letters = (name.match(/\p{L}/gu) || []).length;
  const semanticName = name.replace(/^[^\p{L}\p{N}]+/u, "");
  const instructionOnly = /^(?:please\s+read|read\s+before|try\s+(?:a\s+)?low|important\s+(?:notice|note)|warning)\b/i.test(semanticName);

  if (!input.providerFunded) hiddenReasons.push("provider_unfunded");
  if (name.length < 4 || letters < 3 || /^\d+(?:[.,]\d+)?$/.test(name)) hiddenReasons.push("invalid_service_name");
  if (instructionOnly) hiddenReasons.push("instruction_row");
  if (!Number.isInteger(input.min) || !Number.isInteger(input.max) || input.min < 1 || input.max < input.min) hiddenReasons.push("invalid_order_limits");
  if (input.rateMinor <= 0n) hiddenReasons.push("invalid_provider_rate");

  return {
    publicEligible: hiddenReasons.length === 0,
    normalizedCategory: normalizeServiceCategory(input.category),
    hiddenReasons,
  };
}
