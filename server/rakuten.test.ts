import { describe, expect, it } from "vitest";
import {
  parseProductSearchXml,
  parseRakutenCredentials,
  scoreRakutenProducts,
} from "./rakuten";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<result>
  <TotalMatches>2</TotalMatches>
  <TotalPages>1</TotalPages>
  <PageNumber>1</PageNumber>
  <item>
    <mid>44589</mid>
    <merchantname>Newegg Inc.</merchantname>
    <linkid>1000012</linkid>
    <createdon>2025-03-01/12:00:00</createdon>
    <sku>N82E16814137885</sku>
    <productname>ASUS Dual GeForce RTX 4060</productname>
    <category>
      <primary>Electronics</primary>
      <secondary>Computer Components</secondary>
    </category>
    <price currency="USD">299.99</price>
    <description>
      <short>Graphics card</short>
      <long>ASUS Dual GeForce RTX 4060 OC Edition 8GB GDDR6 for gaming builds.</long>
    </description>
    <keywords>gpu~~graphics~~rtx~~gaming</keywords>
    <linkurl>https://click.linksynergy.com/fs-bin/click?id=example&amp;offerid=1.1</linkurl>
    <imageurl>https://example.com/gpu.jpg</imageurl>
  </item>
  <item>
    <mid>123</mid>
    <merchantname>KitchenPro</merchantname>
    <createdon>2018-01-01/00:00:00</createdon>
    <sku>BLEND-1</sku>
    <productname>Portable Blender</productname>
    <category>
      <primary>Home</primary>
      <secondary>Kitchen</secondary>
    </category>
    <price currency="USD">49.95</price>
    <saleprice currency="USD">39.95</saleprice>
    <description>
      <short>Blender</short>
      <long></long>
    </description>
    <keywords>blender</keywords>
    <linkurl>https://click.linksynergy.com/fs-bin/click?id=example2</linkurl>
  </item>
</result>`;

describe("Rakuten credentials and Product Search mapping", () => {
  it("parses clientId:clientSecret:siteId including secrets with colons", () => {
    const creds = parseRakutenCredentials("abc:sec:ret:4733638");
    expect(creds.clientId).toBe("abc");
    expect(creds.clientSecret).toBe("sec:ret");
    expect(creds.siteId).toBe("4733638");
  });

  it("rejects incomplete credentials", () => {
    expect(() => parseRakutenCredentials("only-two:parts")).toThrow(/clientId:clientSecret:siteId/i);
  });

  it("maps Product Search XML items to signals", () => {
    const signals = parseProductSearchXml(SAMPLE_XML);
    expect(signals).toHaveLength(2);
    expect(signals[0].platformProductId).toBe("rakuten:44589:N82E16814137885");
    expect(signals[0].vendor).toBe("Newegg Inc.");
    expect(signals[0].category).toBe("Electronics");
    expect(signals[0].price).toBeCloseTo(299.99, 2);
    expect(signals[0].affiliateLink).toContain("click.linksynergy.com");
    expect(signals[1].price).toBeCloseTo(39.95, 2);
  });

  it("scores richer recent products higher", () => {
    const signals = parseProductSearchXml(SAMPLE_XML);
    const processed = scoreRakutenProducts(signals);
    expect(processed).toHaveLength(2);
    expect(processed[0].hiddenGemScore).toBeGreaterThan(processed[1].hiddenGemScore);
    expect(processed[0].commissionType).toBe("rakuten-product-search-1.0");
    expect(processed[0].scoreComponents.quality).toBeGreaterThanOrEqual(10);
  });
});
