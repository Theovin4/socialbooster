import { ImageResponse } from "next/og";

export const alt = "Social Booster — social media services for Nigeria and Africa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px", color: "#eef5ff", background: "radial-gradient(circle at 85% 10%, #4338ca 0, #111c38 34%, #07101f 72%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: 34, fontWeight: 800 }}><div style={{ width: 66, height: 66, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#36d9ff,#806cff)", clipPath: "polygon(50% 0,94% 25%,94% 75%,50% 100%,6% 75%,6% 25%)", color: "white", fontSize: 38, fontWeight: 900, fontStyle: "italic" }}>S</div><span>SOCIAL <span style={{ color: "#66dfff" }}>BOOSTER</span></span></div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}><div style={{ color: "#67e8f9", fontSize: 24, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>Clear prices · Secure payments · Order tracking</div><div style={{ marginTop: 22, fontSize: 72, lineHeight: 1.04, letterSpacing: -3, fontWeight: 800 }}>Social media services without the guesswork.</div></div>
      <div style={{ display: "flex", fontSize: 25, color: "#aab9d4" }}>Built for creators, brands, agencies and resellers across Africa.</div>
    </div>,
    size,
  );
}
