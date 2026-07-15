const CJ_GRAPHQL_ENDPOINT = "https://ads.api.cj.com/query";

const DEFAULT_KEYWORDS = [
  "home",
  "kitchen",
  "fitness",
  "beauty",
  "fashion",
  "outdoor",
  "pets",
  "electronics",
];

type ScoreComponents = {
  recency: number;
  growth: number;
  competition: number;
  quality: number;
};

interface ProcessedProduct {
  platformProductId: string;
  name: string;
  vendor: string;
  category: string;
  keywords: string[];
  description: string;
  saleCount: number;
  aggregateSales: string;
  refundCount: number;
  commissionRate?: number;
  commissionType?: string;
  affiliateLink: string;
  platformCreatedAt: Date;
  hiddenGemScore: number;
  scoreComponents: ScoreComponents;
}

type IntrospectionTypeRef = {
  kind?: string;
  name?: string | null;
  ofType?: IntrospectionTypeRef | null;
};

type IntrospectionField = {
  name: string;
  type: IntrospectionTypeRef;
  args?: Array<{
    name: string;
    type: IntrospectionTypeRef;
  }>;
};

type QueryPlan = {
  rootField: string;
  argDefs: Array<{ name: string; type: string }>;
  argAssignments: Array<{ argName: string; variableName: string }>;
  resultListField: string;
  scalarItemFields: string[];
  offsetMode: "offset" | "page";
};

type CjProductSignal = {
  item: Record<string, unknown>;
  platformProductId: string;
  name: string;
  vendor: string;
  category: string;
  keywords: string[];
  description: string;
  affiliateLink: string;
  price: number;
  commissionRate: number;
  createdAt: Date;
};

function unwrapType(typeRef: IntrospectionTypeRef | null | undefined): string | null {
  let current = typeRef;
  while (current && (current.kind === "NON_NULL" || current.kind === "LIST")) {
    current = current.ofType ?? null;
  }
  return current?.name ?? null;
}

function renderGraphQlType(typeRef: IntrospectionTypeRef | null | undefined): string {
  if (!typeRef) return "String";
  if (typeRef.kind === "NON_NULL") {
    return `${renderGraphQlType(typeRef.ofType)}!`;
  }
  if (typeRef.kind === "LIST") {
    return `[${renderGraphQlType(typeRef.ofType)}]`;
  }
  return typeRef.name || "String";
}

function isScalarOrEnum(typeRef: IntrospectionTypeRef | null | undefined): boolean {
  if (!typeRef) return false;
  if (typeRef.kind === "NON_NULL" || typeRef.kind === "LIST") {
    return isScalarOrEnum(typeRef.ofType);
  }
  return typeRef.kind === "SCALAR" || typeRef.kind === "ENUM";
}

function parseNumber(value: unknown): number {
  const cleaned = String(value ?? "")
    .replace(/[$,%]/g, "")
    .replace(/,/g, "")
    .trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseDate(value: unknown): Date {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

function getField<T>(item: Record<string, unknown>, keys: string[], fallback: T): T {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
      return item[key] as T;
    }
  }
  return fallback;
}

function toKeywords(...parts: string[]): string[] {
  const tokens = parts
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 3);
  return Array.from(new Set(tokens)).slice(0, 14);
}

async function cjGraphQlRequest(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(CJ_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    throw new Error(`CJ API request failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  }

  if (payload.errors?.length) {
    const message = payload.errors
      .map(error => error.message || "Unknown CJ GraphQL error")
      .join(" | ");
    throw new Error(message);
  }

  return payload.data || {};
}

async function getQueryFieldMetadata(accessToken: string, fieldName: string): Promise<IntrospectionField | null> {
  const query = `
    query QueryFields {
      __type(name: "Query") {
        fields {
          name
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
          args {
            name
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await cjGraphQlRequest(accessToken, query, {});
  const fields = ((data.__type as { fields?: IntrospectionField[] } | undefined)?.fields ?? []) as IntrospectionField[];
  return fields.find(field => field.name === fieldName) || null;
}

async function getTypeFields(accessToken: string, typeName: string): Promise<IntrospectionField[]> {
  const query = `
    query TypeFields($typeName: String!) {
      __type(name: $typeName) {
        fields {
          name
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await cjGraphQlRequest(accessToken, query, { typeName });
  const typeInfo = data.__type as { fields?: IntrospectionField[] } | undefined;
  return typeInfo?.fields ?? [];
}

function pickArgName(args: Array<{ name: string; type: IntrospectionTypeRef }>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const arg = args.find(entry => entry.name === candidate);
    if (arg) return arg.name;
  }
  return null;
}

function buildVariables(
  keyword: string,
  companyId: string,
  limit: number,
  cursor: number,
  offsetMode: "offset" | "page",
  argAssignments: Array<{ argName: string; variableName: string }>
): Record<string, unknown> {
  const variables: Record<string, unknown> = {};
  for (const assignment of argAssignments) {
    const argName = assignment.argName.toLowerCase();
    if (argName.includes("publisher") || argName.includes("company") || argName === "cid") {
      variables[assignment.variableName] = companyId;
      continue;
    }
    if (argName.includes("keyword")) {
      variables[assignment.variableName] = argName === "keyword" ? keyword : [keyword];
      continue;
    }
    if (argName.includes("max") || argName.includes("limit") || argName.includes("records") || argName.includes("size") || argName.includes("count")) {
      variables[assignment.variableName] = limit;
      continue;
    }
    if (argName.includes("offset") || argName.includes("start")) {
      variables[assignment.variableName] = cursor;
      continue;
    }
    if (argName.includes("page")) {
      variables[assignment.variableName] = offsetMode === "page" ? cursor : Math.floor(cursor / limit) + 1;
      continue;
    }
  }
  return variables;
}

async function buildQueryPlan(accessToken: string): Promise<QueryPlan | null> {
  const rootCandidates = ["shoppingProducts", "products"];
  for (const rootField of rootCandidates) {
    let rootMeta: IntrospectionField | null = null;
    try {
      rootMeta = await getQueryFieldMetadata(accessToken, rootField);
    } catch {
      rootMeta = null;
    }

    if (!rootMeta) continue;

    const args = rootMeta.args ?? [];
    const companyArg = pickArgName(args, ["publisherId", "companyId", "companyID", "publisherID", "cid"]);
    if (!companyArg) continue;

    const keywordArg = pickArgName(args, ["keywords", "keyword", "query", "search"]);
    const limitArg = pickArgName(args, ["maxResults", "recordsRequested", "limit", "pageSize", "count"]);
    const offsetArg = pickArgName(args, ["offset", "start", "page", "pageNumber"]);

    const requiredArgs = args.filter(arg => renderGraphQlType(arg.type).endsWith("!"));
    const mappedArgs = new Set([companyArg, keywordArg, limitArg, offsetArg].filter(Boolean));
    if (requiredArgs.some(arg => !mappedArgs.has(arg.name))) {
      continue;
    }

    const rootTypeName = unwrapType(rootMeta.type);
    if (!rootTypeName) continue;
    const rootTypeFields = await getTypeFields(accessToken, rootTypeName);
    const listFieldCandidates = ["resultList", "items", "results", "records", "data"];
    const resultListFieldMeta =
      rootTypeFields.find(field => listFieldCandidates.includes(field.name)) ||
      rootTypeFields.find(field => {
        const kind = field.type.kind === "NON_NULL" ? field.type.ofType?.kind : field.type.kind;
        return kind === "LIST";
      });
    if (!resultListFieldMeta) continue;

    const itemTypeName = unwrapType(resultListFieldMeta.type);
    if (!itemTypeName) continue;
    const itemFields = await getTypeFields(accessToken, itemTypeName);
    const scalarFields = itemFields
      .filter(field => isScalarOrEnum(field.type))
      .map(field => field.name);
    if (scalarFields.length === 0) continue;

    const preferredFields = [
      "id",
      "productId",
      "sku",
      "upc",
      "title",
      "name",
      "description",
      "advertiserId",
      "advertiserName",
      "merchantName",
      "category",
      "price",
      "salePrice",
      "currency",
      "buyUrl",
      "url",
      "linkUrl",
      "imageUrl",
      "lastUpdated",
      "updatedAt",
      "commissionRate",
    ];
    const selectedFields = preferredFields.filter(field => scalarFields.includes(field));
    if (selectedFields.length < 5) {
      selectedFields.push(...scalarFields.slice(0, 10).filter(field => !selectedFields.includes(field)));
    }

    const usedArgs = [companyArg, keywordArg, limitArg, offsetArg].filter(Boolean) as string[];
    const argDefs: Array<{ name: string; type: string }> = usedArgs.map(name => {
      const arg = args.find(entry => entry.name === name)!;
      return {
        name,
        type: renderGraphQlType(arg.type),
      };
    });

    const offsetMode = offsetArg && offsetArg.toLowerCase().includes("page") ? "page" : "offset";

    return {
      rootField,
      argDefs,
      argAssignments: usedArgs.map(name => ({ argName: name, variableName: name })),
      resultListField: resultListFieldMeta.name,
      scalarItemFields: selectedFields,
      offsetMode,
    };
  }

  return null;
}

function buildSearchQuery(plan: QueryPlan): string {
  const varDefs = plan.argDefs.map(def => `$${def.name}: ${def.type}`).join(", ");
  const argAssignment = plan.argAssignments
    .map(entry => `${entry.argName}: $${entry.variableName}`)
    .join(", ");
  const fields = plan.scalarItemFields.join("\n          ");

  return `
    query SearchProducts(${varDefs}) {
      ${plan.rootField}(${argAssignment}) {
        ${plan.resultListField} {
          ${fields}
        }
      }
    }
  `;
}

function normalizeCjProduct(rawItem: Record<string, unknown>): CjProductSignal | null {
  const idCandidate = String(getField(rawItem, ["id", "productId", "sku", "upc"], "")).trim();
  const name = String(getField(rawItem, ["title", "name"], "")).trim();
  if (!idCandidate || !name) return null;

  const vendor = String(getField(rawItem, ["advertiserName", "merchantName"], "CJ Advertiser")).trim();
  const category = String(getField(rawItem, ["category"], "Retail")).trim() || "Retail";
  const description = String(getField(rawItem, ["description"], "")).trim();
  const affiliateLink = String(getField(rawItem, ["buyUrl", "url", "linkUrl"], "")).trim();
  const price = parseNumber(getField(rawItem, ["salePrice", "price"], 0));
  const commissionRate = parseNumber(getField(rawItem, ["commissionRate"], 0));
  const createdAt = parseDate(getField(rawItem, ["lastUpdated", "updatedAt"], new Date().toISOString()));

  return {
    item: rawItem,
    platformProductId: `cj:${idCandidate}`,
    name,
    vendor,
    category,
    keywords: toKeywords(name, vendor, category),
    description,
    affiliateLink,
    price,
    commissionRate,
    createdAt,
  };
}

function scoreCjProducts(products: CjProductSignal[]): ProcessedProduct[] {
  const categoryCounts = new Map<string, number>();
  for (const product of products) {
    categoryCounts.set(product.category, (categoryCounts.get(product.category) || 0) + 1);
  }

  return products.map((product, index) => {
    const ageDays = (Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const recency =
      ageDays <= 7 ? 30 :
      ageDays <= 30 ? 22 :
      ageDays <= 90 ? 14 : 6;

    const growth =
      product.commissionRate >= 25 ? 30 :
      product.commissionRate >= 15 ? 24 :
      product.commissionRate >= 8 ? 18 :
      product.price >= 20 && product.price <= 250 ? 14 : 8;

    const categorySize = categoryCounts.get(product.category) || 1;
    const competition =
      categorySize <= 10 ? 25 :
      categorySize <= 30 ? 18 :
      categorySize <= 70 ? 10 : 5;

    const qualitySignals =
      (product.affiliateLink ? 1 : 0) +
      (product.description.length > 60 ? 1 : 0) +
      (product.price > 0 ? 1 : 0);
    const quality = qualitySignals === 3 ? 15 : qualitySignals === 2 ? 10 : qualitySignals === 1 ? 6 : 2;

    const scoreComponents: ScoreComponents = {
      recency,
      growth,
      competition,
      quality,
    };
    const hiddenGemScore = clamp(recency + growth + competition + quality, 0, 100);

    return {
      platformProductId: product.platformProductId,
      name: product.name,
      vendor: product.vendor,
      category: product.category,
      keywords: product.keywords,
      description: product.description,
      saleCount: 0,
      aggregateSales: product.price > 0 ? product.price.toFixed(2) : "0",
      refundCount: 0,
      commissionRate: product.commissionRate > 0 ? product.commissionRate : undefined,
      commissionType: "cj-graph-product-search",
      affiliateLink: product.affiliateLink,
      platformCreatedAt: product.createdAt,
      hiddenGemScore,
      scoreComponents,
    };
  });
}

export async function fetchAndProcessCjProducts(
  companyId: string,
  personalAccessToken: string,
  options?: { maxProducts?: number; keywords?: string[] }
): Promise<ProcessedProduct[]> {
  const maxProducts = clamp(options?.maxProducts ?? 600, 50, 1500);
  const keywords = (options?.keywords?.length ? options.keywords : DEFAULT_KEYWORDS)
    .map(keyword => keyword.trim())
    .filter(Boolean);

  const queryPlan = await buildQueryPlan(personalAccessToken);
  if (!queryPlan) {
    throw new Error("Unable to discover a supported CJ GraphQL products query shape for this account.");
  }

  const query = buildSearchQuery(queryPlan);
  const pageSize = 100;
  const collected = new Map<string, CjProductSignal>();

  for (const keyword of keywords) {
    let cursor = queryPlan.offsetMode === "page" ? 1 : 0;
    for (let page = 0; page < 8; page += 1) {
      const variables = buildVariables(
        keyword,
        companyId,
        pageSize,
        cursor,
        queryPlan.offsetMode,
        queryPlan.argAssignments
      );

      const data = await cjGraphQlRequest(personalAccessToken, query, variables);
      const root = data[queryPlan.rootField] as Record<string, unknown> | undefined;
      const rawItems = (root?.[queryPlan.resultListField] as Array<Record<string, unknown>> | undefined) || [];
      if (rawItems.length === 0) break;

      for (const item of rawItems) {
        const normalized = normalizeCjProduct(item);
        if (!normalized) continue;
        if (!collected.has(normalized.platformProductId)) {
          collected.set(normalized.platformProductId, normalized);
        }
      }

      if (collected.size >= maxProducts) break;
      if (rawItems.length < pageSize) break;

      cursor = queryPlan.offsetMode === "page" ? cursor + 1 : cursor + pageSize;
    }
    if (collected.size >= maxProducts) break;
  }

  if (collected.size === 0) {
    throw new Error("CJ returned no product rows for the configured account. Check joined advertisers and Product Search access.");
  }

  return scoreCjProducts(Array.from(collected.values()).slice(0, maxProducts));
}
