export type ParsedMassOrder = { serviceId: string; link: string; quantity: number };

export function parseMassOrderLines(value: string, maximum = 10): ParsedMassOrder[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > maximum) throw new Error(`Enter between 1 and ${maximum} orders`);
  return lines.map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length !== 3) throw new Error(`Line ${index + 1} must contain service, target URL and quantity`);
    const [serviceId, link, quantityText] = parts;
    const quantity = Number(quantityText);
    if (!serviceId || serviceId.length > 160 || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error(`Line ${index + 1} has invalid service or quantity`);
    let target: URL;
    try { target = new URL(link); } catch { throw new Error(`Line ${index + 1} has an invalid target URL`); }
    if (!['http:', 'https:'].includes(target.protocol) || link.length > 2_000) throw new Error(`Line ${index + 1} has an invalid target URL`);
    return { serviceId, link, quantity };
  });
}
