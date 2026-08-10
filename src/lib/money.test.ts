import{describe,expect,it}from"vitest";import{sellingPriceMinor,serviceCostMinor}from"./money";
describe("money",()=>{it("produces a true 40% margin",()=>{expect(sellingPriceMinor(1000n)).toBe(1667n)});it("prices quantity without floats",()=>{expect(serviceCostMinor(1000n,1500n)).toBe(1500n)});it("rejects invalid margin",()=>{expect(()=>sellingPriceMinor(100n,10000n)).toThrow()})});
