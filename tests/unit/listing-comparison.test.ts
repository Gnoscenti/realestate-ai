import { describe, expect, it } from "vitest";
import { generateCmaReport } from "@/lib/ai";
import type { Property } from "@/data/seed";
const subject:Property={id:"subject",title:"Synthetic property",address:"Synthetic address",city:"Test City",neighborhood:"Test",
  price:500000,beds:3,baths:2,sqft:2000,yearBuilt:2000,type:"house",status:"active",daysOnMarket:0,features:[],
  description:"Synthetic fixture",lat:0,lng:0,pricePerSqft:250,estimatedValue:0,accent:"",pattern:0};
describe("local listing comparison",()=>{
  it("abstains from list-price and condition claims, and excludes missing/other-market records",()=>{
    const report=generateCmaReport(subject,[
      subject,{...subject,id:"valid",price:900000,sqft:2100},
      {...subject,id:"no-area",sqft:0},{...subject,id:"no-price",price:0},
      {...subject,id:"different-city",city:"Other"},{...subject,id:"different-type",type:"condo"},
    ]);
    expect(report.comps).toHaveLength(1);
    expect(report.comps[0]?.ppsf).toBe(429);
    expect(report.comps[0]?.adj).toContain("not verified");
    expect(report).not.toHaveProperty("suggestedList");
    expect(report.strategy.join(" ")).toContain("not verified comparable sales");
    expect(generateCmaReport({...subject,city:""},[subject]).comps).toEqual([]);
  });
  it("preserves an empty reference set without falling back to an invented value",()=>{
    const report=generateCmaReport({...subject,price:0,sqft:0},[]);
    expect(report.comps).toEqual([]);
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
  });
});
