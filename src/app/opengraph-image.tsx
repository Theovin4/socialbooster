import { ImageResponse } from "next/og";

export const alt = "Social Booster — clear pricing and controlled delivery";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px", color: "#eef5ff", background: "radial-gradient(circle at 85% 10%, #4338ca 0, #111c38 34%, #07101f 72%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "22px", fontSize: 34, fontWeight: 800 }}><div style={{ width: 62, height: 62, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#38bdf8,#7c3aed)", fontSize: 29 }}>SB</div>Social Booster</div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}><div style={{ color: "#67e8f9", fontSize: 24, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>Clear pricing · controlled delivery</div><div style={{ marginTop: 22, fontSize: 72, lineHeight: 1.04, letterSpacing: -3, fontWeight: 800 }}>Social marketing services, without the guesswork.</div></div>
      <div style={{ display: "flex", fontSize: 25, color: "#aab9d4" }}>Secure wallet · Transparent limits · Trackable orders</div>
    </div>,
    size,
  );
}
